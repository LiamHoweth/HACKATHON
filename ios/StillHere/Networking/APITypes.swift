// Wire types. ReplyRequest must match src/core/schemas.ts replyRequestSchema EXACTLY
// (strict objects: every key present, nullable keys encoded as explicit null, no extras).
import Foundation

struct ReplyRequest: Encodable, Sendable, Equatable {
    enum Mode: String, Encodable, Sendable { case live, fixture }

    enum ConversationItem: Encodable, Sendable, Equatable {
        case partner(text: String, source: PartnerTurnSource)
        case user(text: String, delivery: Delivery)

        enum K: String, CodingKey { case role, text, source, delivery }
        func encode(to encoder: Encoder) throws {
            var c = encoder.container(keyedBy: K.self)
            switch self {
            case .partner(let text, let source):
                try c.encode("partner", forKey: .role)
                try c.encode(text, forKey: .text)
                try c.encode(source, forKey: .source)
            case .user(let text, let delivery):
                try c.encode("user", forKey: .role)
                try c.encode(text, forKey: .text)
                try c.encode(delivery, forKey: .delivery)
            }
        }
    }

    struct WireGuidance: Encodable, Sendable, Equatable {
        let intent: String?
        let wording: [StyleSetting]
        let userTopicOrSeed: String?
        let scope: Scope
        enum K: String, CodingKey { case intent, wording, userTopicOrSeed, scope }
        func encode(to encoder: Encoder) throws {
            var c = encoder.container(keyedBy: K.self)
            try c.encode(intent, forKey: .intent)
            try c.encode(wording, forKey: .wording)
            try c.encode(userTopicOrSeed, forKey: .userTopicOrSeed)
            try c.encode(scope, forKey: .scope)
        }
    }

    struct ApprovedPreference: Encodable, Sendable, Equatable {
        let setting: StyleSetting
        let scope: Scope
    }

    struct RejectedEntry: Encodable, Sendable, Equatable {
        struct Item: Encodable, Sendable, Equatable { let text: String; let meaning: CandidateMeaning }
        let candidates: [Item]
        let feedback: String
    }

    struct RefineTarget: Encodable, Sendable, Equatable {
        let text: String
        let meaning: CandidateMeaning
        let mode: String
    }

    let identity: RequestIdentity
    let mode: Mode
    let anchor: Anchor
    let activePartnerText: String?
    let language: String
    let recentConversation: [ConversationItem]
    let approvedProfile: [String] // always empty in the native client (no approved profile yet)
    let guidance: WireGuidance
    let approvedPreferences: [ApprovedPreference]
    let sessionStyleHints: [StyleSetting]
    let rejected: [RejectedEntry]
    let refineTarget: RefineTarget?
    let lengthPolicy: LengthPolicy

    enum K: String, CodingKey {
        case identity, mode, anchor, activePartnerText, language, recentConversation, approvedProfile
        case guidance, approvedPreferences, sessionStyleHints, rejected, refineTarget, lengthPolicy
    }

    func encode(to encoder: Encoder) throws {
        var c = encoder.container(keyedBy: K.self)
        try c.encode(identity, forKey: .identity)
        try c.encode(mode, forKey: .mode)
        try c.encode(WireAnchor(anchor), forKey: .anchor)
        try c.encode(activePartnerText, forKey: .activePartnerText)
        try c.encode(language, forKey: .language)
        try c.encode(recentConversation, forKey: .recentConversation)
        try c.encode(approvedProfile, forKey: .approvedProfile)
        try c.encode(guidance, forKey: .guidance)
        try c.encode(approvedPreferences, forKey: .approvedPreferences)
        try c.encode(sessionStyleHints, forKey: .sessionStyleHints)
        try c.encode(rejected, forKey: .rejected)
        try c.encode(refineTarget, forKey: .refineTarget)
        try c.encode(lengthPolicy, forKey: .lengthPolicy)
    }
}

private struct WireAnchor: Encodable {
    let anchor: Anchor
    init(_ a: Anchor) { anchor = a }
    enum K: String, CodingKey { case mode, turnId, turnContentRevision, topicId, category, userTopicOrSeed }
    func encode(to encoder: Encoder) throws {
        var c = encoder.container(keyedBy: K.self)
        switch anchor {
        case .reply(let turnID, let rev):
            try c.encode("reply", forKey: .mode)
            try c.encode(turnID, forKey: .turnId)
            try c.encode(rev, forKey: .turnContentRevision)
        case .initiate(let topicID, let category, let seed):
            try c.encode("initiate", forKey: .mode)
            try c.encode(topicID, forKey: .topicId)
            try c.encode(category, forKey: .category)
            try c.encode(seed, forKey: .userTopicOrSeed)
        }
    }
}

struct ReplyResponseData: Decodable, Sendable, Equatable {
    struct Item: Decodable, Sendable, Equatable { let text: String; let meaning: CandidateMeaning }
    let candidates: [Item]
    let source: CandidateSource
    let model: String?
    let repaired: Bool?
}

struct TranscriptData: Decodable, Sendable, Equatable {
    let captureId: String
    let text: String
}

struct ServerStatus: Decodable, Sendable, Equatable {
    struct Replies: Decodable, Sendable, Equatable { let configured: Bool; let provider: String?; let model: String? }
    struct Transcription: Decodable, Sendable, Equatable { let configured: Bool; let provider: String? }
    let replies: Replies
    let transcription: Transcription
    let fixturesEnabled: Bool
    let accessRequired: Bool
    let accessCodeValid: Bool?
}

/// Decodes `{ ok: true, requestId, data } | { ok: false, requestId, error }`.
enum APIResult<T: Decodable & Sendable>: Decodable, Sendable {
    case success(requestID: String, data: T)
    case failure(requestID: String, error: APIErrorInfo)

    enum K: String, CodingKey { case ok, requestId, data, error }
    init(from decoder: Decoder) throws {
        let c = try decoder.container(keyedBy: K.self)
        let rid = (try? c.decode(String.self, forKey: .requestId)) ?? "unknown"
        if try c.decode(Bool.self, forKey: .ok) {
            self = .success(requestID: rid, data: try c.decode(T.self, forKey: .data))
        } else {
            self = .failure(requestID: rid, error: try c.decode(APIErrorInfo.self, forKey: .error))
        }
    }

    var result: Result<T, APIErrorInfo> {
        switch self {
        case .success(_, let d): .success(d)
        case .failure(_, let e): .failure(e)
        }
    }
}
