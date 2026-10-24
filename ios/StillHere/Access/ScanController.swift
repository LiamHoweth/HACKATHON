// Single-switch scanning. One timer; a reading pause on each new surface, then advance every interval.
// Press snapshot on key down, commit once on key up if the surface revision is unchanged. Auto-repeat is
// ignored, the highlight freezes while held, and a short cooldown follows each commit.
import Foundation
import Observation

@MainActor
@Observable
final class ScanController {
    struct Snapshot: Equatable { let targetID: String; let revision: Int; let cycleID: ID }

    static let cooldown: TimeInterval = 0.25

    private(set) var highlightedID: String?
    private(set) var isHeld = false
    @ObservationIgnored private var index = 0
    @ObservationIgnored private var lastRevision = -1
    @ObservationIgnored private var nextAdvanceAt: Date = .distantPast
    @ObservationIgnored private var cooldownUntil: Date = .distantPast
    @ObservationIgnored private var snapshot: Snapshot?
    @ObservationIgnored private var loop: Task<Void, Never>?

    // Inputs (injected so the logic is testable without a store).
    @ObservationIgnored var enabledTargetIDs: () -> [String] = { [] }
    @ObservationIgnored var revision: () -> Int = { 0 }
    @ObservationIgnored var interval: () -> TimeInterval = { 1.5 }
    @ObservationIgnored var readingPause: TimeInterval = AppSettings.readingPause
    @ObservationIgnored var commit: (Snapshot) -> Void = { _ in }
    @ObservationIgnored var now: () -> Date = Date.init

    var isRunning: Bool { loop != nil }

    func start() {
        guard loop == nil else { return }
        lastRevision = -1
        loop = Task { [weak self] in
            while !Task.isCancelled {
                self?.tick()
                try? await Task.sleep(for: .milliseconds(100))
            }
        }
    }

    func stop() {
        loop?.cancel()
        loop = nil
        highlightedID = nil
        snapshot = nil
        isHeld = false
    }

    /// Advances the highlight if due. Called by the loop; tests call it directly with an injected clock.
    func tick() {
        let t = now()
        let ids = enabledTargetIDs()
        let rev = revision()
        if rev != lastRevision {
            // New surface: start from the first target after a reading pause. Nothing is announced.
            lastRevision = rev
            index = 0
            nextAdvanceAt = t.addingTimeInterval(readingPause)
            if !isHeld { snapshot = nil }
        }
        guard !ids.isEmpty else { highlightedID = nil; return }
        if index >= ids.count { index = 0 }
        if !isHeld && t >= nextAdvanceAt {
            index = (index + 1) % ids.count
            nextAdvanceAt = t.addingTimeInterval(interval())
        }
        if highlightedID != ids[index] { highlightedID = ids[index] }
    }

    /// Switch pressed. `isRepeat` presses are ignored.
    func keyDown(isRepeat: Bool = false) {
        let t = now()
        guard !isRepeat, !isHeld, t >= cooldownUntil, let id = highlightedID else { return }
        isHeld = true
        snapshot = Snapshot(targetID: id, revision: revision(), cycleID: newID())
    }

    /// Press cancelled by the system: release without committing.
    func cancelPress() {
        isHeld = false
        snapshot = nil
    }

    /// Switch released: commit once if the surface did not change while held.
    func keyUp() {
        guard isHeld else { return }
        isHeld = false
        defer { snapshot = nil }
        guard let snap = snapshot, snap.revision == revision() else { return }
        cooldownUntil = now().addingTimeInterval(Self.cooldown)
        commit(snap)
    }
}
