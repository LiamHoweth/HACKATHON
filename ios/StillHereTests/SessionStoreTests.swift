import Foundation
import Testing
@testable import StillHere

@MainActor
final class MockEffects: SessionEffects {
    var requests: [ReplyRequest] = []
    var aborted: [ID] = []
    var spoken: [(String, ID)] = []
    var stopped: [ID] = []
    func generate(_ request: ReplyRequest) { requests.append(request) }
    func abortGeneration(requestID: ID) { aborted.append(requestID) }
    func speak(text: String, utteranceID: ID) { spoken.append((text, utteranceID)) }
    func stopSpeech(utteranceID: ID) { stopped.append(utteranceID) }
    func stopAllSpeech() {}
    func discardRecording() {}
}

@MainActor
final class Clock { var t = Date(timeIntervalSince1970: 1_000) ; func advance(_ s: TimeInterval) { t += s } }

@MainActor
struct Harness {
    let store: SessionStore
    let fx = MockEffects()
    let clock = Clock()
    init(mode: AIMode = .fixture) {
        var s = AppSettings(baseURL: "http://localhost:3000")
        s.aiMode = mode
        let c = clock
        store = SessionStore(settings: s, now: { c.t })
        store.effects = fx
    }

    @discardableResult
    func tap(_ id: String, cycle: ID = newID()) -> Bool {
        store.activate(targetID: id, cycleID: cycle, surfaceRevision: store.surfaceRevision, source: .touch)
    }

    func data(_ texts: [String]) -> ReplyResponseData {
        ReplyResponseData(candidates: texts.map { .init(text: $0, meaning: CandidateMeaning(act: "other", summary: "s")) },
                          source: .demoFixture, model: nil, repaired: false)
    }

    func deliverLast(_ texts: [String] = ["Yes, please.", "Maybe later.", "No thanks."]) {
        let r = fx.requests.last!
        store.receiveGeneration(identity: r.identity, result: .success(data(texts)))
    }
}

@MainActor
struct SessionStoreTests {
    @Test func selectingCandidateOpensReviewAndNeverSpeaks() {
        let h = Harness()
        h.store.partnerSubmit("Want tea?", source: .typed)
        h.deliverLast()
        #expect(h.tap("cand-0"))
        #expect(h.store.surface == .review)
        #expect(h.store.review?.snapshot.exactText == "Yes, please.")
        #expect(h.fx.spoken.isEmpty)
    }

    @Test func speakNeedsDifferentCycleAndArmingDelay() {
        let h = Harness()
        h.store.partnerSubmit("Want tea?", source: .typed)
        h.deliverLast()
        let cycle = newID()
        h.tap("cand-0", cycle: cycle)
        // Too soon.
        h.clock.advance(0.3)
        #expect(!h.tap("rv-speak"))
        // Same cycle as selection is rejected even after arming.
        h.clock.advance(0.5)
        #expect(!h.store.activate(targetID: "rv-speak", cycleID: cycle, surfaceRevision: h.store.surfaceRevision, source: .touch))
        #expect(h.fx.spoken.isEmpty)
        #expect(h.tap("rv-speak"))
        #expect(h.fx.spoken.count == 1)
        #expect(h.fx.spoken.first?.0 == "Yes, please.")
        #expect(h.store.surface == .speaking)
        #expect(h.store.targets.map(\.id) == ["sp-stop"])
    }

    @Test func staleRevisionIsIgnored() {
        let h = Harness()
        let rev = h.store.surfaceRevision
        #expect(h.tap("quick"))
        #expect(!h.store.activate(targetID: "back", cycleID: newID(), surfaceRevision: rev, source: .touch))
    }

    @Test func staleGenerationResultIsIgnored() {
        let h = Harness()
        h.store.partnerSubmit("First?", source: .typed)
        let first = h.fx.requests.last!
        h.tap("guide"); h.tap("g-wording"); h.tap("w-shorter") // supersedes with a new request
        h.store.receiveGeneration(identity: first.identity, result: .success(h.data(["old", "old2", "old3"])))
        #expect(h.store.activeWorkspace?.batch == nil)
        #expect(h.fx.requests.last!.lengthPolicy == LengthChoice.short.policy)
        h.deliverLast()
        #expect(h.store.activeWorkspace?.batch?.candidates.first?.text == "Yes, please.")
    }

    @Test func partnerInputIsStagedWhileQuestionActive() {
        let h = Harness()
        h.store.partnerSubmit("Question one?", source: .typed)
        let active = h.store.activeWorkspaceID
        h.store.partnerSubmit("Question two?", source: .typed)
        #expect(h.store.activeWorkspaceID == active)
        #expect(h.store.staged.count == 1)
        #expect(h.store.targets.contains { $0.label == "Waiting: 1" })
        for i in 0..<15 { h.store.partnerSubmit("More \(i)", source: .typed) }
        #expect(h.store.staged.count == Limits.stagedQueue)
    }

    @Test func noneOfTheseSendsRejectionsForSameQuestionOnly() {
        let h = Harness()
        h.store.partnerSubmit("Dinner?", source: .typed)
        h.deliverLast(["Pizza", "Soup", "Salad"])
        let turns = h.store.conversation.count
        #expect(h.tap("none"))
        let req = h.fx.requests.last!
        #expect(req.rejected.count == 1)
        #expect(req.rejected[0].candidates.map(\.text) == ["Pizza", "Soup", "Salad"])
        #expect(h.store.conversation.count == turns) // no user turn added
        // A different question starts with no rejections.
        h.tap("more"); h.tap("t-park")
        h.store.partnerSubmit("Movie?", source: .typed)
        #expect(h.fx.requests.last!.rejected.isEmpty)
    }

    @Test func ownWordsAndQuickPhrasesWorkLocalOnly() {
        let h = Harness(mode: .localOnly)
        h.store.partnerSubmit("Hi", source: .typed)
        #expect(h.fx.requests.isEmpty)
        h.tap("quick")
        h.tap("qp-qp-moment")
        #expect(h.store.review?.snapshot.exactText == "Please give me a moment.")
        h.clock.advance(1)
        #expect(h.tap("rv-speak"))
        #expect(h.fx.spoken.last?.0 == "Please give me a moment.")
        h.store.speechEvent(utteranceID: h.fx.spoken.last!.1, kind: .finished)
        h.tap("my-words")
        h.tap("grp-1"); h.tap("key-H"); h.tap("grp-1"); h.tap("key-I")
        #expect(h.store.draft(.message) == "Hi")
        h.tap("c-done")
        h.clock.advance(1)
        h.tap("rv-speak")
        #expect(h.fx.spoken.last?.0 == "Hi")
        #expect(h.fx.requests.isEmpty)
    }

    @Test func pausedOnlyAllowsResume() {
        let h = Harness()
        h.store.safetyPause()
        #expect(h.store.targets.map(\.id) == ["pa-resume"])
    }

    @Test func requestEncodesExplicitNullsAndAllKeys() throws {
        let h = Harness()
        h.store.partnerSubmit("Tea?", source: .typed)
        let json = try JSONSerialization.jsonObject(with: JSONEncoder().encode(h.fx.requests.last!)) as! [String: Any]
        let keys: Set<String> = ["identity", "mode", "anchor", "activePartnerText", "language", "recentConversation", "approvedProfile",
                                 "guidance", "approvedPreferences", "sessionStyleHints", "rejected", "refineTarget", "lengthPolicy"]
        #expect(Set(json.keys) == keys)
        #expect(json["refineTarget"] is NSNull)
        let guidance = json["guidance"] as! [String: Any]
        #expect(guidance["intent"] is NSNull)
        #expect((guidance["scope"] as! [String: Any])["relationship"] is NSNull)
    }
}
