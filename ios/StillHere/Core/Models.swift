// Pure domain types for Still Here. Mirrors src/core/types.ts (simplified for the native client).
import Foundation

typealias ID = String

enum Limits {
    static let recentTurns = 10
    static let turnChars = 600
    static let partnerInputChars = 1000
    static let stagedQueue = 10
    static let composeChars = 500
    static let seedChars = 120
    static let rejectedBatches = 8 // ceil(24 / 3)
    static let consumedCycleMemory = 200
    static let confirmArmSeconds: TimeInterval = 0.6
    static let failedBatchesBeforeHelp = 2
    static let quickPageSize = 6
}

enum Delivery: String, Codable, Sendable {
    case queued, speaking, completed, interrupted, failed, uncertain

    var label: String {
        switch self {
        case .queued: "Queued"
        case .speaking: "Speaking"
        case .completed: "Spoken"
        case .interrupted: "Stopped"
        case .failed: "Speech failed"
        case .uncertain: "Uncertain"
        }
    }
}

enum AIMode: String, Codable, Sendable, CaseIterable, Identifiable {
    case live, fixture, localOnly = "local-only"
    var id: String { rawValue }
    var label: String {
        switch self {
        case .live: "Live AI"
        case .fixture: "Fixture demo"
        case .localOnly: "Local only"
        }
    }
}

enum InputMode: String, Codable, Sendable, CaseIterable, Identifiable {
    case touch, switchScanning = "switch"
    var id: String { rawValue }
    var label: String { self == .touch ? "Touch" : "Switch scanning" }
}

enum InputSource: String, Sendable { case touch, keyboard, switchScan }

enum Intent: String, Codable, Sendable, CaseIterable {
    case agree, disagree, askQuestion = "ask-question", suggestAlternative = "suggest-alternative"
    case expressNeed = "express-need", changeTopic = "change-topic", explain, other

    var label: String {
        switch self {
        case .agree: "Agree"
        case .disagree: "Disagree"
        case .askQuestion: "Ask a question"
        case .suggestAlternative: "Suggest an alternative"
        case .expressNeed: "Express a need"
        case .changeTopic: "Change the subject"
        case .explain: "Explain something"
        case .other: "Something else"
        }
    }
}

enum InitiationCategory: String, Codable, Sendable, CaseIterable {
    case askQuestion = "ask-question", tellSomething = "tell-something", shareThought = "share-thought"
    case makeRequest = "make-request", tellJoke = "tell-joke", approvedInterest = "approved-interest"
    case earlierTopic = "earlier-topic", expressFeeling = "express-feeling", original

    var label: String {
        switch self {
        case .askQuestion: "Ask someone a question"
        case .tellSomething: "Tell someone something"
        case .shareThought: "Share a thought"
        case .makeRequest: "Make a request"
        case .tellJoke: "Tell a joke"
        case .approvedInterest: "Talk about something I like"
        case .earlierTopic: "Return to an earlier topic"
        case .expressFeeling: "Express a feeling in my own words"
        case .original: "Write something original"
        }
    }
}

/// A style setting `{ key, value }`. Values are restricted by `StyleSetting.allowed`.
struct StyleSetting: Codable, Sendable, Hashable {
    let key: String
    let value: String

    static let humorLight = StyleSetting(key: "humor", value: "light")
    static let direct = StyleSetting(key: "directness", value: "direct")
    static let gentle = StyleSetting(key: "directness", value: "gentle")
    static let short = StyleSetting(key: "length", value: "short")
    static let detailed = StyleSetting(key: "length", value: "detailed")
}

enum LengthChoice: String, Codable, Sendable, CaseIterable, Identifiable {
    case short, balanced, detailed
    var id: String { rawValue }
    var policy: LengthPolicy {
        switch self {
        case .short: LengthPolicy(maxWords: 14, maxCharacters: 100)
        case .balanced: LengthPolicy(maxWords: 24, maxCharacters: 160)
        case .detailed: LengthPolicy(maxWords: 40, maxCharacters: 260)
        }
    }
    var label: String {
        switch self {
        case .short: "Short"
        case .balanced: "Balanced"
        case .detailed: "Detailed"
        }
    }
}

struct LengthPolicy: Codable, Sendable, Equatable {
    let maxWords: Int
    let maxCharacters: Int
}

struct CandidateMeaning: Codable, Sendable, Equatable {
    let act: String
    let summary: String
}

struct Candidate: Sendable, Equatable, Identifiable {
    let id: ID
    let text: String
    let meaning: CandidateMeaning
}

enum CandidateSource: String, Codable, Sendable {
    case liveModel = "live-model", demoFixture = "demo-fixture"
    var label: String { self == .liveModel ? "Live AI" : "Fixture demo" }
}

enum MessageSource: String, Sendable {
    case liveModel = "live-model", demoFixture = "demo-fixture", savedPhrase = "saved-phrase", userComposed = "user-composed"
    var label: String {
        switch self {
        case .liveModel: "AI suggestion (live)"
        case .demoFixture: "AI suggestion (fixture demo)"
        case .savedPhrase: "Quick phrase"
        case .userComposed: "My words"
        }
    }
}

enum PartnerTurnSource: String, Codable, Sendable {
    case typed = "partner-typed", transcribed = "partner-transcribed", edited = "partner-edited"
}

struct PartnerTurn: Sendable, Equatable, Identifiable {
    let id: ID
    let sequence: Int
    var contentRevision: Int
    var text: String
    let createdAt: Date
    var source: PartnerTurnSource
    var acceptedForContext: Bool
    var dismissed: Bool
}

struct UserTurn: Sendable, Equatable, Identifiable {
    let id: ID
    let sequence: Int
    let text: String
    let confirmedAt: Date
    var delivery: Delivery
    let utteranceID: ID
    let source: MessageSource
}

enum ConversationEntry: Sendable, Equatable, Identifiable {
    case partner(PartnerTurn)
    case user(UserTurn)
    var id: ID {
        switch self {
        case .partner(let p): p.id
        case .user(let u): u.id
        }
    }
}

enum Anchor: Sendable, Equatable {
    case reply(turnID: ID, contentRevision: Int)
    case initiate(topicID: ID, category: InitiationCategory, seed: String?)
}

struct Scope: Codable, Sendable, Equatable {
    var relationship: String?
    var setting: String?

    func encode(to encoder: Encoder) throws {
        var c = encoder.container(keyedBy: CodingKeys.self)
        try c.encode(relationship, forKey: .relationship) // explicit null
        try c.encode(setting, forKey: .setting)
    }
}

struct Guidance: Sendable, Equatable {
    var intent: Intent?
    var wording: [StyleSetting] = []
    var seed: String?
    var isEmpty: Bool { intent == nil && wording.isEmpty && (seed ?? "").isEmpty }
}

struct RequestIdentity: Codable, Sendable, Equatable {
    let sessionEpoch: ID
    let workspaceId: ID
    let requestId: ID
    let contextRevision: Int
    let preferenceRevision: Int
}

struct ChoiceBatch: Sendable, Equatable {
    let id: ID
    let identity: RequestIdentity
    let candidates: [Candidate]
    let source: CandidateSource
    let receivedAt: Date
}

struct RejectedBatch: Sendable, Equatable {
    let batchID: ID
    let candidates: [Candidate]
}

enum WorkspaceStatus: Sendable, Equatable { case idle, generating, choosing, error, stale }

struct Workspace: Sendable, Equatable, Identifiable {
    let id: ID
    var anchor: Anchor
    let createdAt: Date
    var guidance = Guidance()
    var batch: ChoiceBatch?
    var rejected: [RejectedBatch] = []
    var failedBatches = 0
    var status: WorkspaceStatus = .idle
    var error: APIErrorInfo?
    var pendingRequestID: ID?
    var parked = false
    var closed = false
}

struct ReviewSnapshot: Sendable, Equatable {
    let id: ID
    let sessionEpoch: ID
    let exactText: String
    let source: MessageSource
    let selectedByEventID: ID
    let selectedByCycleID: ID
    let openedAt: Date
}

enum ReviewOrigin: Sendable, Equatable {
    case candidate(workspaceID: ID, batchID: ID, candidateID: ID)
    case composed
    case phrase(ID)
}

struct ReviewState: Sendable, Equatable {
    let snapshot: ReviewSnapshot
    let origin: ReviewOrigin
    let cancelStack: [Surface]
    let afterStack: [Surface]
}

struct ConfirmedUtterance: Sendable, Equatable {
    let id: ID
    let reviewID: ID
    let exactText: String
    let selectionCycleID: ID
    let confirmationCycleID: ID
}

struct SpeechState: Sendable, Equatable {
    let utterance: ConfirmedUtterance
    let afterStack: [Surface]
}

enum APIErrorCode: String, Codable, Sendable {
    case notConfigured = "NOT_CONFIGURED", unauthorized = "UNAUTHORIZED", invalidInput = "INVALID_INPUT"
    case rateLimited = "RATE_LIMITED", timeout = "TIMEOUT", providerUnavailable = "PROVIDER_UNAVAILABLE"
    case providerRefusal = "PROVIDER_REFUSAL", invalidModelOutput = "INVALID_MODEL_OUTPUT"
    case transcriptionFailed = "TRANSCRIPTION_FAILED", network = "NETWORK"
}

struct APIErrorInfo: Codable, Sendable, Equatable, Error {
    let code: APIErrorCode
    let message: String
    let recoverable: Bool

    /// Plain, recoverable wording for the person and partner.
    var userMessage: String {
        switch code {
        case .unauthorized: "Access code needed. Enter the access code in Settings, or use Fixture demo, Quick phrases, or My words."
        case .network: "Can't reach the Still Here server. Quick phrases and My words still work."
        case .timeout: "Suggestions took too long. Try again, or use Quick phrases or My words."
        case .notConfigured: "\(message) Quick phrases and My words still work."
        default: message.isEmpty ? "Suggestions are unavailable right now." : message
        }
    }
}

struct SavedPhrase: Sendable, Equatable, Identifiable {
    let id: ID
    let text: String
}

func newID() -> ID { UUID().uuidString }
