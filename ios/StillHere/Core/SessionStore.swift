// The single owner of all session decisions. Mirrors the safety semantics of src/core/reducer.ts.
// Views and input controllers only call `activate(...)`, `partnerSubmit(...)` and setters; side effects
// (network, speech, recording) go out through `SessionEffects` and come back via `receiveGeneration`
// and `speechEvent`.
import Foundation
import Observation

@MainActor
protocol SessionEffects: AnyObject {
    func generate(_ request: ReplyRequest)
    func abortGeneration(requestID: ID)
    func speak(text: String, utteranceID: ID)
    func stopSpeech(utteranceID: ID)
    func stopAllSpeech()
    /// Called before speaking or pausing: any partner recording must stop.
    func discardRecording()
}

enum SpeechEventKind: Sendable { case started, finished, interrupted, failed }

@MainActor
@Observable
final class SessionStore {
    // MARK: Dependencies
    @ObservationIgnored weak var effects: SessionEffects?
    @ObservationIgnored let now: () -> Date
    @ObservationIgnored var persistSettings: (AppSettings) -> Void = { _ in }

    // MARK: State
    var settings: AppSettings { didSet { if settings != oldValue { settingsChanged(from: oldValue) } } }
    private(set) var sessionEpoch: ID = newID()
    private(set) var conversation: [ConversationEntry] = []
    private(set) var nextSequence = 1
    private(set) var staged: [ID] = []
    private(set) var workspaces: [ID: Workspace] = [:]
    private(set) var activeWorkspaceID: ID?
    private(set) var stack: [Surface] = [.board]
    private(set) var surfaceRevision = 0
    private(set) var surfaceOpenedAt: Date
    private var consumedCycles: [ID] = []
    private(set) var drafts: [ComposePurpose: String] = [.message: "", .seed: ""]
    private(set) var review: ReviewState?
    private(set) var speech: SpeechState?
    private(set) var contextRevision = 0
    private(set) var preferenceRevision = 0
    private(set) var notice: String?
    private var spokenUtterances: Set<ID> = []
    let phrases: [SavedPhrase] = Phrases.builtIn

    init(settings: AppSettings, now: @escaping () -> Date = Date.init) {
        self.settings = settings
        self.now = now
        self.surfaceOpenedAt = now()
    }

    // MARK: Derived

    var surface: Surface { stack.last ?? .board }
    var activeWorkspace: Workspace? { activeWorkspaceID.flatMap { workspaces[$0] } }
    var parkedWorkspaces: [Workspace] {
        workspaces.values.filter { $0.parked && !$0.closed && $0.id != activeWorkspaceID }.sorted { $0.createdAt < $1.createdAt }
    }
    var waitingCount: Int { staged.count + parkedWorkspaces.count }
    var aiAvailable: Bool { settings.aiMode != .localOnly }

    func partnerText(_ turnID: ID) -> String {
        for case .partner(let p) in conversation where p.id == turnID { return p.text }
        return ""
    }

    func anchorLabel(_ ws: Workspace) -> String {
        switch ws.anchor {
        case .reply(let turnID, _): return "“\(partnerText(turnID))”"
        case .initiate(_, let category, let seed): return category.label + (seed.map { ": \($0)" } ?? "")
        }
    }

    /// Label for the source of what is on screen: the actual batch source when a batch is shown.
    var sourceLabel: String {
        if let batch = activeWorkspace?.batch { return batch.source.label }
        return settings.aiMode.label
    }

    func draft(_ purpose: ComposePurpose) -> String { drafts[purpose] ?? "" }

    func setDraft(_ purpose: ComposePurpose, _ text: String) {
        let limit = purpose == .message ? Limits.composeChars : Limits.seedChars
        drafts[purpose] = String(text.prefix(limit))
    }

    func dismissNotice() { notice = nil }

    // MARK: Targets (mirror src/core/targets.ts, simplified)

    var targets: [Target] {
        switch surface {
        case .board: return boardTargets()
        case .guide(let page): return guideTargets(page)
        case .quick(let page): return quickTargets(page)
        case .compose(let purpose, let group): return composeTargets(purpose, group: group)
        case .composeClear:
            return [
                Target(id: "cc-keep", label: "Keep my text", command: .back, region: .review, tone: .cancel),
                Target(id: "cc-clear", label: "Clear all text", command: .composeClearConfirm, region: .review, requiresArming: true),
            ]
        case .initiate: return initiateTargets()
        case .tools: return toolsTargets()
        case .history: return historyTargets()
        case .review:
            return [
                Target(id: "rv-cancel", label: "Cancel", command: .reviewCancel, region: .review, tone: .cancel,
                       hint: "Goes back without speaking."),
                Target(id: "rv-speak", label: "Speak", enabled: review != nil, command: .reviewSpeak, region: .review,
                       requiresArming: true, tone: .speak, hint: "Speaks exactly the text shown."),
                Target(id: "rv-edit", label: "Edit", detail: "Change the text myself", enabled: review != nil,
                       command: .reviewEdit, region: .review),
            ]
        case .speaking:
            return [Target(id: "sp-stop", label: "Stop speaking", command: .stopSpeech, region: .safety, tone: .cancel)]
        case .paused:
            return [Target(id: "pa-resume", label: "Resume", command: .resume, region: .safety)]
        case .settings:
            return [Target(id: "set-done", label: "Done", command: .back, region: .menu, tone: .quiet)]
        case .endConfirm:
            return [
                Target(id: "end-cancel", label: "Keep this session", command: .back, region: .review, tone: .cancel),
                Target(id: "end-confirm", label: "End session and clear the conversation", command: .endSession,
                       region: .review, requiresArming: true),
            ]
        }
    }

    private func back(_ label: String = "Back") -> Target {
        Target(id: "back", label: label, command: .back, region: .menu, tone: .quiet)
    }

    private func boardTargets() -> [Target] {
        var t: [Target] = []
        if let ws = activeWorkspace, !ws.closed {
            if ws.status == .choosing, let batch = ws.batch {
                for (i, c) in batch.candidates.enumerated() {
                    t.append(Target(id: "cand-\(i)", label: c.text, command: .selectCandidate(c.id), region: .candidates,
                                    hint: "Opens a review. Nothing is spoken yet."))
                }
                t.append(Target(id: "none", label: "None of these — new suggestions", enabled: aiAvailable,
                                command: .noneOfThese, region: .candidates, tone: .quiet))
                if ws.failedBatches >= Limits.failedBatchesBeforeHelp {
                    t.append(Target(id: "help-own-words", label: "Write it myself",
                                    command: .open(.compose(.message, group: nil)), region: .primary))
                }
            } else if ws.status == .error || ws.status == .stale {
                t.append(Target(id: "retry", label: ws.status == .stale ? "Refresh suggestions" : "Try again",
                                enabled: aiAvailable, command: ws.status == .stale ? .refresh : .retry, region: .primary))
            } else if ws.status == .idle && aiAvailable {
                t.append(Target(id: "refresh", label: "Get suggestions", command: .refresh, region: .primary))
            }
            t.append(Target(id: "guide", label: "Guide my response", enabled: aiAvailable,
                            command: .open(.guide(.root)), region: .tools))
            t.append(Target(id: "quick", label: "Quick phrases", command: .open(.quick(page: 0)), region: .tools))
            t.append(Target(id: "my-words", label: "My words", command: .open(.compose(.message, group: nil)), region: .tools))
        } else {
            t.append(Target(id: "start", label: "Start a conversation", command: .open(.initiate), region: .primary))
            t.append(Target(id: "quick", label: "Quick phrases", command: .open(.quick(page: 0)), region: .tools))
            t.append(Target(id: "my-words", label: "My words", command: .open(.compose(.message, group: nil)), region: .tools))
        }
        if waitingCount > 0 {
            t.append(Target(id: "waiting", label: "Waiting: \(waitingCount)", command: .open(.history), region: .tools))
        }
        t.append(Target(id: "more", label: "More tools", command: .open(.tools), region: .tools, tone: .quiet))
        return t
    }

    private func guideTargets(_ page: GuidePage) -> [Target] {
        switch page {
        case .root:
            let has = !(activeWorkspace?.guidance.isEmpty ?? true)
            return [
                Target(id: "g-direction", label: "Choose a direction", detail: "Agree, disagree, ask, suggest…", command: .open(.guide(.direction))),
                Target(id: "g-wording", label: "Change the wording", detail: "Humor, direct, shorter…", command: .open(.guide(.wording))),
                Target(id: "g-seed", label: "Type a topic or keyword", command: .open(.compose(.seed, group: nil))),
                Target(id: "g-clear", label: "Clear guidance", enabled: has, command: .clearGuidance),
                back(),
            ]
        case .direction:
            return Intent.allCases.map { intent in
                intent == .other
                    ? Target(id: "i-other", label: intent.label, detail: "Type a topic or keyword", command: .open(.compose(.seed, group: nil)))
                    : Target(id: "i-\(intent.rawValue)", label: intent.label, command: .setIntent(intent))
            } + [back()]
        case .wording:
            return [
                Target(id: "w-humor", label: "Be humorous", command: .addWording(.humorLight)),
                Target(id: "w-direct", label: "Be direct", command: .addWording(.direct)),
                Target(id: "w-shorter", label: "Shorter", command: .addWording(.short)),
                Target(id: "w-detail", label: "More detail", command: .addWording(.detailed)),
                Target(id: "w-gentle", label: "Gentler", command: .addWording(.gentle)),
                back(),
            ]
        }
    }

    private func quickTargets(_ page: Int) -> [Target] {
        let size = Limits.quickPageSize
        let pages = max(1, Int((Double(phrases.count) / Double(size)).rounded(.up)))
        let p = min(page, pages - 1)
        var t = phrases.dropFirst(p * size).prefix(size).map {
            Target(id: "qp-\($0.id)", label: $0.text, command: .quickPhrase($0.id), hint: "Opens a review. Nothing is spoken yet.")
        }
        if pages > 1 {
            t.append(Target(id: "qp-more", label: p + 1 < pages ? "More phrases (\(p + 2) of \(pages))" : "First phrases",
                            command: .quickPage((p + 1) % pages), tone: .quiet))
        }
        t.append(back())
        return t
    }

    private func composeTargets(_ purpose: ComposePurpose, group: Int?) -> [Target] {
        let text = draft(purpose)
        if let g = group, Phrases.keyGroups.indices.contains(g) {
            return Phrases.keyGroups[g].keys.map {
                Target(id: "key-\($0)", label: $0, command: .composeKey($0), region: .keys)
            } + [Target(id: "key-back", label: "Back to groups", command: .composeGroup(nil), region: .keys, tone: .quiet)]
        }
        var t: [Target] = [
            Target(id: "c-done", label: purpose == .message ? "Review message" : "Use this topic",
                   enabled: !text.trimmingCharacters(in: .whitespaces).isEmpty, command: .composeDone, region: .keys, tone: .speak),
            Target(id: "c-space", label: "Space", command: .composeSpace, region: .keys),
        ]
        t += Phrases.keyGroups.enumerated().map { i, g in
            Target(id: "grp-\(i)", label: g.label, command: .composeGroup(i), region: .keys)
        }
        t.append(Target(id: "c-delete", label: "Delete", enabled: !text.isEmpty, command: .composeDelete, region: .keys))
        t.append(Target(id: "c-clear", label: "Clear…", enabled: !text.isEmpty, command: .open(.composeClear), region: .keys, tone: .quiet))
        t.append(back(purpose == .message ? "Back (keep draft)" : "Back"))
        return t
    }

    private func initiateTargets() -> [Target] {
        InitiationCategory.allCases.map { c in
            switch c {
            case .original, .expressFeeling:
                return Target(id: "init-\(c.rawValue)", label: c.label, command: .open(.compose(.message, group: nil)))
            default:
                return Target(id: "init-\(c.rawValue)", label: c.label, enabled: aiAvailable, command: .initiate(c))
            }
        } + [back()]
    }

    private func toolsTargets() -> [Target] {
        let ws = activeWorkspace
        return [
            Target(id: "t-start", label: "Start a conversation", command: .open(.initiate)),
            Target(id: "t-park", label: "Keep this question for later", enabled: ws != nil && ws?.closed == false, command: .parkActive),
            Target(id: "t-history", label: "History and waiting (\(waitingCount))", command: .open(.history)),
            Target(id: "t-pause", label: "Pause", command: .pause),
            Target(id: "t-slower", label: String(format: "Scan slower (now %.2fs)", settings.scanInterval),
                   enabled: settings.scanInterval < AppSettings.scanRange.upperBound, command: .scanSpeed(0.25)),
            Target(id: "t-faster", label: "Scan faster", enabled: settings.scanInterval > AppSettings.scanRange.lowerBound, command: .scanSpeed(-0.25)),
            Target(id: "t-settings", label: "Settings", command: .open(.settings)),
            Target(id: "t-end", label: "End session…", command: .open(.endConfirm), tone: .quiet),
            back(),
        ]
    }

    private func historyTargets() -> [Target] {
        var t: [Target] = []
        for id in staged {
            let text = short(partnerText(id))
            t.append(Target(id: "h-answer-\(id)", label: "Answer: \(text)", command: .historyAnswer(id)))
            t.append(Target(id: "h-dismiss-\(id)", label: "Dismiss: \(text)", command: .historyDismissStaged(id), tone: .quiet))
        }
        for ws in parkedWorkspaces {
            let label = short(anchorLabel(ws))
            t.append(Target(id: "h-return-\(ws.id)", label: "Return to: \(label)", command: .historyReturn(ws.id)))
            t.append(Target(id: "h-drop-\(ws.id)", label: "Dismiss: \(label)", command: .historyDismissWorkspace(ws.id), tone: .quiet))
        }
        t.append(back())
        return t
    }

    private func short(_ s: String, _ n: Int = 60) -> String { s.count > n ? String(s.prefix(n - 1)) + "…" : s }

    // MARK: The single activation path (touch, keyboard, switch)

    /// Returns true when the activation was accepted.
    @discardableResult
    func activate(targetID: String, cycleID: ID, surfaceRevision revision: Int, source: InputSource, eventID: ID = newID()) -> Bool {
        guard revision == surfaceRevision else { return false } // gesture began on a different surface
        guard !consumedCycles.contains(cycleID), !consumedCycles.contains(eventID) else { return false }
        guard let target = targets.first(where: { $0.id == targetID }), target.enabled else { return false }
        let at = now()
        if target.requiresArming && at.timeIntervalSince(surfaceOpenedAt) < Limits.confirmArmSeconds { return false }
        consumedCycles = Array((consumedCycles + [cycleID, eventID]).suffix(Limits.consumedCycleMemory))
        let before = surfaceRevision
        apply(target.command, cycleID: cycleID, eventID: eventID, at: at)
        // Every accepted activation re-arms input: a held or repeated gesture cannot act twice.
        surfaceRevision = max(surfaceRevision, before + 1)
        surfaceOpenedAt = at
        return true
    }

    // MARK: Stack helpers

    private func setStack(_ s: [Surface], at: Date? = nil) {
        stack = s.isEmpty ? [.board] : s
        surfaceRevision += 1
        surfaceOpenedAt = at ?? now()
    }
    private func push(_ s: Surface) { setStack(stack + [s]) }
    private func pop() { setStack(Array(stack.dropLast())) }
    private func replaceTop(_ s: Surface) { setStack(Array(stack.dropLast()) + [s]) }
    private func toBoard() { setStack([.board]) }
    private func stackWithout(_ predicate: (Surface) -> Bool) -> [Surface] {
        var out = stack
        while out.count > 1, let last = out.last, predicate(last) { out.removeLast() }
        return out
    }

    // MARK: Commands

    private func apply(_ cmd: Command, cycleID: ID, eventID: ID, at: Date) {
        let ws = activeWorkspace
        switch cmd {
        case .selectCandidate(let cid):
            guard let ws, let batch = ws.batch, let c = batch.candidates.first(where: { $0.id == cid }) else { return }
            openReview(text: c.text, source: batch.source == .liveModel ? .liveModel : .demoFixture,
                       origin: .candidate(workspaceID: ws.id, batchID: batch.id, candidateID: c.id),
                       afterStack: [.board], cycleID: cycleID, eventID: eventID, at: at)
        case .noneOfThese:
            guard let ws, let batch = ws.batch else { return }
            // Turn-scoped: only this workspace's rejections, sent for this same question.
            var w = ws
            w.rejected = Array((w.rejected + [RejectedBatch(batchID: batch.id, candidates: batch.candidates)]).suffix(Limits.rejectedBatches))
            w.failedBatches += 1
            workspaces[ws.id] = w
            startGeneration(ws.id)
        case .open(let s): push(s)
        case .back: pop()
        case .setIntent(let intent):
            guard let ws else { return toBoard() }
            workspaces[ws.id]?.guidance.intent = intent
            contextRevision += 1
            startGeneration(ws.id)
            toBoard()
        case .addWording(let setting):
            guard let ws else { return toBoard() }
            var g = ws.guidance
            g.wording = g.wording.filter { $0.key != setting.key } + [setting]
            workspaces[ws.id]?.guidance = g
            contextRevision += 1
            startGeneration(ws.id)
            toBoard()
        case .clearGuidance:
            guard let ws else { return toBoard() }
            workspaces[ws.id]?.guidance = Guidance()
            contextRevision += 1
            startGeneration(ws.id)
            toBoard()
        case .retry, .refresh:
            guard let ws else { return }
            if case .reply(let turnID, let rev) = ws.anchor, let turn = partnerTurn(turnID), turn.contentRevision != rev {
                workspaces[ws.id]?.anchor = .reply(turnID: turnID, contentRevision: turn.contentRevision)
            }
            startGeneration(ws.id)
        case .quickPhrase(let pid):
            guard let ph = phrases.first(where: { $0.id == pid }) else { return }
            openReview(text: ph.text, source: .savedPhrase, origin: .phrase(ph.id),
                       afterStack: stackWithout { if case .quick = $0 { true } else { false } },
                       cycleID: cycleID, eventID: eventID, at: at)
        case .quickPage(let p): replaceTop(.quick(page: p))
        case .composeGroup(let g):
            guard case .compose(let purpose, _) = surface else { return }
            replaceTop(.compose(purpose, group: g))
        case .composeKey(let key):
            guard case .compose(let purpose, _) = surface else { return }
            let next = Self.insertKey(draft(purpose), key)
            let limit = purpose == .message ? Limits.composeChars : Limits.seedChars
            if next.count > limit { notice = "That is the \(limit)-character limit; the text was not changed."; return }
            drafts[purpose] = next
            replaceTop(.compose(purpose, group: nil)) // a selected letter returns to groups
        case .composeSpace:
            guard case .compose(let purpose, _) = surface else { return }
            let d = draft(purpose)
            if !d.hasSuffix(" ") { setDraft(purpose, d + " ") }
        case .composeDelete:
            guard case .compose(let purpose, _) = surface else { return }
            drafts[purpose] = String(draft(purpose).dropLast())
        case .composeClearConfirm:
            if stack.count >= 2, case .compose(let purpose, _) = stack[stack.count - 2] { drafts[purpose] = "" }
            pop()
        case .composeDone:
            guard case .compose(let purpose, _) = surface else { return }
            let text = draft(purpose).trimmingCharacters(in: .whitespacesAndNewlines)
            guard !text.isEmpty else { return }
            if purpose == .message {
                openReview(text: text, source: .userComposed, origin: .composed,
                           afterStack: stackWithout { if case .compose = $0 { true } else { false } },
                           cycleID: cycleID, eventID: eventID, at: at)
            } else {
                guard let ws else { return toBoard() }
                workspaces[ws.id]?.guidance.seed = text
                if workspaces[ws.id]?.guidance.intent == nil { workspaces[ws.id]?.guidance.intent = .other }
                drafts[.seed] = ""
                contextRevision += 1
                startGeneration(ws.id)
                toBoard()
            }
        case .reviewCancel:
            guard let r = review else { return pop() }
            review = nil
            setStack(r.cancelStack)
        case .reviewSpeak:
            confirmSpeak(cycleID: cycleID, eventID: eventID, at: at)
        case .reviewEdit:
            guard let r = review else { return }
            drafts[.message] = String(r.snapshot.exactText.prefix(Limits.composeChars))
            review = nil
            setStack([.board, .compose(.message, group: nil)])
        case .stopSpeech: stopSpeech()
        case .pause:
            effects?.discardRecording()
            push(.paused)
        case .resume: pop()
        case .endSession: endSession()
        case .initiate(let category):
            parkActive()
            let id = createWorkspace(.initiate(topicID: newID(), category: category, seed: nil))
            activeWorkspaceID = id
            startGeneration(id)
            toBoard()
        case .historyAnswer(let turnID):
            guard staged.contains(turnID) else { return }
            acceptPartnerTurn(turnID)
            toBoard()
        case .historyDismissStaged(let turnID):
            updatePartner(turnID) { $0.dismissed = true }
            staged.removeAll { $0 == turnID }
        case .historyReturn(let wid):
            guard let target = workspaces[wid], !target.closed else { return }
            parkActive()
            workspaces[wid]?.parked = false
            if case .reply(let turnID, let rev) = target.anchor, let turn = partnerTurn(turnID), turn.contentRevision != rev {
                workspaces[wid]?.status = .stale
                workspaces[wid]?.batch = nil
                workspaces[wid]?.rejected = []
            }
            activeWorkspaceID = wid
            toBoard()
        case .historyDismissWorkspace(let wid):
            guard var w = workspaces[wid] else { return }
            if let rid = w.pendingRequestID { effects?.abortGeneration(requestID: rid) }
            w.closed = true; w.parked = false; w.rejected = []; w.pendingRequestID = nil
            workspaces[wid] = w
        case .parkActive:
            parkActive()
            toBoard()
        case .scanSpeed(let delta):
            settings.scanInterval = min(max(settings.scanInterval + delta, AppSettings.scanRange.lowerBound), AppSettings.scanRange.upperBound)
        }
    }

    static func insertKey(_ draft: String, _ key: String) -> String {
        if key.count == 1, let ch = key.first, ch.isLetter, ch.isUppercase {
            let trimmed = draft.trimmingCharacters(in: .whitespaces)
            let sentenceStart = trimmed.isEmpty || (draft.hasSuffix(" ") && [".", "?", "!"].contains(trimmed.last.map(String.init) ?? ""))
            return draft + (sentenceStart ? key : key.lowercased())
        }
        return draft + key
    }

    // MARK: Review and speech (the only path to speech)

    private func openReview(text: String, source: MessageSource, origin: ReviewOrigin, afterStack: [Surface],
                            cycleID: ID, eventID: ID, at: Date) {
        let snap = ReviewSnapshot(id: newID(), sessionEpoch: sessionEpoch, exactText: text, source: source,
                                  selectedByEventID: eventID, selectedByCycleID: cycleID, openedAt: at)
        review = ReviewState(snapshot: snap, origin: origin, cancelStack: stack, afterStack: afterStack)
        setStack(stack + [.review], at: at)
    }

    /// Fresh, separate confirmation of the exact reviewed text.
    private func confirmSpeak(cycleID: ID, eventID: ID, at: Date) {
        guard let r = review else { return }
        let snap = r.snapshot
        guard snap.sessionEpoch == sessionEpoch else { return }
        guard cycleID != snap.selectedByCycleID, eventID != snap.selectedByEventID else { return }
        guard at.timeIntervalSince(snap.openedAt) >= Limits.confirmArmSeconds else { return }
        let utterance = ConfirmedUtterance(id: newID(), reviewID: snap.id, exactText: snap.exactText,
                                           selectionCycleID: snap.selectedByCycleID, confirmationCycleID: cycleID)
        let turn = UserTurn(id: newID(), sequence: nextSequence, text: snap.exactText, confirmedAt: at,
                            delivery: .queued, utteranceID: utterance.id, source: snap.source)
        conversation.append(.user(turn))
        nextSequence += 1
        contextRevision += 1
        review = nil
        speech = SpeechState(utterance: utterance, afterStack: r.afterStack)
        if case .candidate(let wid, _, _) = r.origin, var w = workspaces[wid] {
            // Turn feedback is cleared when the turn is completed.
            w.closed = true; w.parked = false; w.rejected = []
            workspaces[wid] = w
            if activeWorkspaceID == wid { activeWorkspaceID = nil }
        }
        if case .composed = r.origin { drafts[.message] = "" }
        effects?.discardRecording()
        setStack(r.afterStack + [.speaking], at: at)
        guard !spokenUtterances.contains(utterance.id) else { return }
        spokenUtterances.insert(utterance.id)
        effects?.speak(text: utterance.exactText, utteranceID: utterance.id)
    }

    private func setDelivery(_ utteranceID: ID, _ d: Delivery) {
        conversation = conversation.map {
            if case .user(var u) = $0, u.utteranceID == utteranceID { u.delivery = d; return .user(u) }
            return $0
        }
    }

    private func stopSpeech() {
        guard let sp = speech else {
            if surface == .speaking { pop() }
            return
        }
        setDelivery(sp.utterance.id, .interrupted)
        speech = nil
        effects?.stopSpeech(utteranceID: sp.utterance.id)
        setStack(sp.afterStack)
    }

    func speechEvent(utteranceID: ID, kind: SpeechEventKind) {
        guard let sp = speech, sp.utterance.id == utteranceID else { return }
        func leave() {
            speech = nil
            if surface == .speaking { setStack(sp.afterStack) }
        }
        switch kind {
        case .started: setDelivery(utteranceID, .speaking)
        case .finished: setDelivery(utteranceID, .completed); leave()
        case .interrupted: setDelivery(utteranceID, .interrupted); leave()
        case .failed:
            setDelivery(utteranceID, .failed); leave()
            notice = "Speech failed. Your message is shown on screen: “\(sp.utterance.exactText)”"
        }
    }

    /// Escape key / safety: stop speech, stop recording, show Paused.
    func safetyPause() {
        if surface == .paused { return }
        if speech != nil { stopSpeech() }
        effects?.discardRecording()
        push(.paused)
    }

    private func endSession() {
        for w in workspaces.values { if let rid = w.pendingRequestID { effects?.abortGeneration(requestID: rid) } }
        effects?.stopAllSpeech()
        effects?.discardRecording()
        sessionEpoch = newID()
        conversation = []; staged = []; workspaces = [:]; activeWorkspaceID = nil
        drafts = [.message: "", .seed: ""]; review = nil; speech = nil
        contextRevision = 0; notice = "Session ended. The conversation was cleared."
        setStack([.board])
    }

    // MARK: Partner input

    /// Partner input while a question is active is staged ("Waiting: N"), never substituted.
    func partnerSubmit(_ raw: String, source: PartnerTurnSource) {
        let text = String(raw.trimmingCharacters(in: .whitespacesAndNewlines).prefix(Limits.partnerInputChars))
        guard !text.isEmpty else { return }
        let busy = (activeWorkspace.map { !$0.closed } ?? false) || surface != .board || review != nil || speech != nil || !staged.isEmpty
        if busy && staged.count >= Limits.stagedQueue {
            notice = "The waiting list is full (\(Limits.stagedQueue)). Answer or dismiss waiting messages first."
            return
        }
        let turn = PartnerTurn(id: newID(), sequence: nextSequence, contentRevision: 0, text: text, createdAt: now(),
                               source: source, acceptedForContext: false, dismissed: false)
        conversation.append(.partner(turn))
        nextSequence += 1
        if busy {
            staged.append(turn.id)
            notice = "New partner message waiting. Your current work is unchanged."
            return
        }
        acceptPartnerTurn(turn.id)
        surfaceRevision += 1
        surfaceOpenedAt = now()
    }

    private func partnerTurn(_ id: ID) -> PartnerTurn? {
        for case .partner(let p) in conversation where p.id == id { return p }
        return nil
    }

    private func updatePartner(_ id: ID, _ change: (inout PartnerTurn) -> Void) {
        conversation = conversation.map {
            if case .partner(var p) = $0, p.id == id { change(&p); return .partner(p) }
            return $0
        }
    }

    private func acceptPartnerTurn(_ turnID: ID) {
        updatePartner(turnID) { $0.acceptedForContext = true }
        staged.removeAll { $0 == turnID }
        contextRevision += 1
        parkActive()
        let rev = partnerTurn(turnID)?.contentRevision ?? 0
        let id = createWorkspace(.reply(turnID: turnID, contentRevision: rev))
        activeWorkspaceID = id
        startGeneration(id)
    }

    private func createWorkspace(_ anchor: Anchor) -> ID {
        let id = newID()
        workspaces[id] = Workspace(id: id, anchor: anchor, createdAt: now())
        return id
    }

    private func parkActive() {
        if let ws = activeWorkspace, !ws.closed { workspaces[ws.id]?.parked = true }
        activeWorkspaceID = nil
    }

    // MARK: Generation

    private func startGeneration(_ wid: ID) {
        guard var ws = workspaces[wid] else { return }
        if settings.aiMode == .localOnly {
            ws.status = .idle; ws.pendingRequestID = nil
            workspaces[wid] = ws
            return
        }
        if let old = ws.pendingRequestID { effects?.abortGeneration(requestID: old) }
        if settings.aiMode == .live && !settings.cloudConsent {
            ws.pendingRequestID = nil; ws.status = .error
            ws.error = APIErrorInfo(code: .notConfigured, message: "Live AI needs cloud consent in Settings.", recoverable: true)
            workspaces[wid] = ws
            return
        }
        let requestID = newID()
        ws.pendingRequestID = requestID; ws.status = .generating; ws.error = nil
        workspaces[wid] = ws
        effects?.generate(buildRequest(for: ws, requestID: requestID))
    }

    func buildRequest(for ws: Workspace, requestID: ID) -> ReplyRequest {
        var activePartnerText: String?
        if case .reply(let turnID, _) = ws.anchor { activePartnerText = String(partnerText(turnID).prefix(Limits.partnerInputChars)) }
        let recent: [ReplyRequest.ConversationItem] = conversation.compactMap { entry -> ReplyRequest.ConversationItem? in
            switch entry {
            case .partner(let p):
                guard p.acceptedForContext, !p.dismissed else { return nil }
                return .partner(text: String(p.text.prefix(Limits.turnChars)), source: p.source)
            case .user(let u):
                return .user(text: String(u.text.prefix(Limits.turnChars)), delivery: u.delivery)
            }
        }.suffix(Limits.recentTurns).map { $0 }
        let rejected = ws.rejected.suffix(Limits.rejectedBatches).map { r in
            ReplyRequest.RejectedEntry(candidates: r.candidates.prefix(3).map { .init(text: $0.text, meaning: $0.meaning) },
                                       feedback: "none-fit")
        }
        // Length: explicit wording guidance wins; otherwise the saved (confirmed) preference; otherwise balanced.
        let wordingLength = ws.guidance.wording.last(where: { $0.key == "length" }).flatMap { LengthChoice(rawValue: $0.value) }
        let length = wordingLength ?? settings.savedLength ?? .balanced
        let approved: [ReplyRequest.ApprovedPreference] = settings.savedLength.map {
            [.init(setting: StyleSetting(key: "length", value: $0.rawValue), scope: Scope())]
        } ?? []
        let anchor: Anchor
        if case .initiate(let topic, let cat, let seed) = ws.anchor {
            anchor = .initiate(topicID: topic, category: cat, seed: seed.map { String($0.prefix(Limits.seedChars * 4)) })
        } else {
            anchor = ws.anchor
        }
        return ReplyRequest(
            identity: RequestIdentity(sessionEpoch: sessionEpoch, workspaceId: ws.id, requestId: requestID,
                                      contextRevision: contextRevision, preferenceRevision: preferenceRevision),
            mode: settings.aiMode == .live ? .live : .fixture,
            anchor: anchor,
            activePartnerText: activePartnerText,
            language: "en-US",
            recentConversation: recent,
            approvedProfile: [],
            guidance: .init(intent: ws.guidance.intent?.rawValue, wording: ws.guidance.wording,
                            userTopicOrSeed: ws.guidance.seed.map { String($0.prefix(Limits.seedChars)) }, scope: Scope()),
            approvedPreferences: approved,
            sessionStyleHints: [],
            rejected: Array(rejected),
            refineTarget: nil,
            lengthPolicy: length.policy
        )
    }

    /// Installs a generation result only if epoch, workspace, request and revisions still match.
    func receiveGeneration(identity: RequestIdentity, result: Result<ReplyResponseData, APIErrorInfo>) {
        guard identity.sessionEpoch == sessionEpoch, var ws = workspaces[identity.workspaceId],
              ws.pendingRequestID == identity.requestId else { return } // superseded
        var anchorStale = false
        if case .reply(let turnID, let rev) = ws.anchor { anchorStale = partnerTurn(turnID)?.contentRevision != rev }
        if identity.contextRevision != contextRevision || identity.preferenceRevision != preferenceRevision || anchorStale || ws.closed {
            ws.pendingRequestID = nil
            ws.status = ws.batch != nil && !anchorStale ? .choosing : .stale
            workspaces[ws.id] = ws
            return
        }
        ws.pendingRequestID = nil
        switch result {
        case .failure(let err):
            ws.status = .error; ws.error = err
            workspaces[ws.id] = ws
        case .success(let data):
            let cands = data.candidates.prefix(3).map { Candidate(id: newID(), text: $0.text, meaning: $0.meaning) }
            guard !cands.isEmpty else {
                ws.status = .error
                ws.error = APIErrorInfo(code: .invalidModelOutput, message: "No suggestions came back.", recoverable: true)
                workspaces[ws.id] = ws
                return
            }
            ws.status = .choosing; ws.error = nil
            ws.batch = ChoiceBatch(id: newID(), identity: identity, candidates: Array(cands), source: data.source, receivedAt: now())
            workspaces[ws.id] = ws
            if activeWorkspaceID == ws.id && surface == .board {
                surfaceRevision += 1
                surfaceOpenedAt = now()
            }
        }
    }

    // MARK: Settings

    /// Settings can be opened from the window chrome (caregiver affordance) except mid-review/speech/pause.
    var canOpenSettings: Bool { ![.review, .speaking, .paused, .settings].contains(surface) }

    func openSettings() {
        guard canOpenSettings else { return }
        push(.settings)
    }

    private func settingsChanged(from old: AppSettings) {
        if old.savedLength != settings.savedLength { preferenceRevision += 1 }
        persistSettings(settings)
    }
}
