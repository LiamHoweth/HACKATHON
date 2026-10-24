// The person's communication surface. Renders `store.targets` in registry order for the visible surface.
import SwiftUI

struct CommunicationView: View {
    @Environment(SessionStore.self) private var store
    @Environment(\.horizontalSizeClass) private var hSize

    var body: some View {
        ScrollView {
            VStack(alignment: .leading, spacing: 16) {
                if let notice = store.notice { NoticeBanner(text: notice) }
                Text(store.surface.title)
                    .font(.largeTitle.bold())
                    .accessibilityAddTraits(.isHeader)
                surfaceContent
            }
            .padding(20)
            .frame(maxWidth: 900, alignment: .leading)
            .frame(maxWidth: .infinity, alignment: .leading)
        }
    }

    @ViewBuilder private var surfaceContent: some View {
        switch store.surface {
        case .board: BoardView()
        case .review: ReviewView()
        case .speaking: SpeakingView()
        case .paused:
            VStack(alignment: .leading, spacing: 16) {
                Text("Nothing will be spoken or recorded while paused.").font(.title3)
                TargetList(targets: store.targets)
            }
        case .compose(let purpose, let group): ComposeView(purpose: purpose, group: group)
        case .history: HistoryWaitingView()
        case .guide:
            VStack(alignment: .leading, spacing: 16) {
                if let ws = store.activeWorkspace { GuidanceSummary(guidance: ws.guidance) }
                TargetList(targets: store.targets, columns: hSize == .regular ? 2 : 1)
            }
        default:
            TargetList(targets: store.targets, columns: hSize == .regular ? 2 : 1)
        }
    }
}

struct NoticeBanner: View {
    @Environment(SessionStore.self) private var store
    let text: String
    var body: some View {
        HStack(alignment: .top) {
            Image(systemName: "info.circle")
            Text(text).fixedSize(horizontal: false, vertical: true)
            Spacer()
            Button("Dismiss") { store.dismissNotice() }
        }
        .font(.body)
        .padding(12)
        .background(Color.yellow.opacity(0.18), in: RoundedRectangle(cornerRadius: 12))
        .accessibilityElement(children: .combine)
    }
}

struct GuidanceSummary: View {
    let guidance: Guidance
    var body: some View {
        if !guidance.isEmpty {
            let parts = [guidance.intent?.label]
                + guidance.wording.map { "\($0.key): \($0.value)" }
                + [guidance.seed.map { "topic: \($0)" }]
            Text("Guidance: " + parts.compactMap { $0 }.joined(separator: " · "))
                .font(.callout).foregroundStyle(.secondary)
        }
    }
}

struct BoardView: View {
    @Environment(SessionStore.self) private var store
    @Environment(\.horizontalSizeClass) private var hSize

    var body: some View {
        let targets = store.targets
        VStack(alignment: .leading, spacing: 16) {
            if let ws = store.activeWorkspace, !ws.closed {
                anchorHeader(ws)
                GuidanceSummary(guidance: ws.guidance)
                statusView(ws)
            } else {
                Text("No question right now. Your partner can type or record what they said, or you can start a conversation.")
                    .font(.title3).foregroundStyle(.secondary)
                    .fixedSize(horizontal: false, vertical: true)
            }
            let cands = targets.filter { $0.region == .candidates }
            if !cands.isEmpty {
                VStack(spacing: 12) {
                    ForEach(cands) { TargetButton(target: $0, large: $0.id.hasPrefix("cand-")) }
                }
                .accessibilityElement(children: .contain)
                .accessibilityLabel("Possible words")
            }
            let primary = targets.filter { $0.region == .primary }
            if !primary.isEmpty { TargetList(targets: primary) }
            TargetList(targets: targets.filter { $0.region == .tools }, columns: hSize == .regular ? 3 : 2)
        }
    }

    private func anchorHeader(_ ws: Workspace) -> some View {
        VStack(alignment: .leading, spacing: 4) {
            Text({
                if case .reply = ws.anchor { return "Partner said" }
                return "Starting a conversation"
            }())
            .font(.headline).foregroundStyle(.secondary)
            Text(store.anchorLabel(ws))
                .font(.title2.weight(.medium))
                .fixedSize(horizontal: false, vertical: true)
        }
        .accessibilityElement(children: .combine)
    }

    @ViewBuilder private func statusView(_ ws: Workspace) -> some View {
        switch ws.status {
        case .generating:
            HStack(spacing: 12) {
                ProgressView()
                Text("Finding possible words (\(store.settings.aiMode.label))…").font(.title3)
            }
            .accessibilityElement(children: .combine)
        case .error:
            Label(ws.error?.userMessage ?? "Suggestions are unavailable.", systemImage: "exclamationmark.triangle")
                .font(.title3).foregroundStyle(.red)
                .fixedSize(horizontal: false, vertical: true)
        case .stale:
            Text("The partner message changed. Refresh to get new suggestions.").font(.title3)
        case .choosing:
            if let batch = ws.batch {
                Text("Possible words · \(batch.source.label). You decide what to say.")
                    .font(.callout).foregroundStyle(.secondary)
            }
        case .idle:
            if !store.aiAvailable {
                Text("Local only: use Quick phrases or My words.").font(.title3).foregroundStyle(.secondary)
            }
        }
    }
}

struct ReviewView: View {
    @Environment(SessionStore.self) private var store
    @State private var armed = false

    var body: some View {
        VStack(alignment: .leading, spacing: 20) {
            if let r = store.review {
                Text("This exact text will be spoken only if you choose Speak.")
                    .font(.callout).foregroundStyle(.secondary)
                Text(r.snapshot.exactText)
                    .font(.largeTitle.weight(.semibold))
                    .fixedSize(horizontal: false, vertical: true)
                    .padding(20)
                    .frame(maxWidth: .infinity, alignment: .leading)
                    .background(Color(.secondarySystemBackground), in: RoundedRectangle(cornerRadius: 18))
                    .accessibilityLabel("Ready to speak: \(r.snapshot.exactText)")
                Text("Source: \(r.snapshot.source.label)").font(.callout).foregroundStyle(.secondary)
            }
            ForEach(store.targets) { t in
                TargetButton(target: t, large: true, armed: t.requiresArming ? armed : true)
            }
        }
        .task(id: store.surfaceRevision) {
            armed = false
            try? await Task.sleep(for: .milliseconds(Int(Limits.confirmArmSeconds * 1000) + 50))
            armed = true
        }
    }
}

struct SpeakingView: View {
    @Environment(SessionStore.self) private var store
    var body: some View {
        VStack(alignment: .leading, spacing: 20) {
            if let sp = store.speech {
                Text(sp.utterance.exactText)
                    .font(.largeTitle.weight(.semibold))
                    .fixedSize(horizontal: false, vertical: true)
            }
            ForEach(store.targets) { TargetButton(target: $0, large: true) }
        }
    }
}

struct HistoryWaitingView: View {
    @Environment(SessionStore.self) private var store
    var body: some View {
        VStack(alignment: .leading, spacing: 16) {
            if store.waitingCount == 0 {
                Text("Nothing is waiting.").font(.title3).foregroundStyle(.secondary)
            }
            TargetList(targets: store.targets)
        }
    }
}
