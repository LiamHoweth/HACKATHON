// Surfaces, targets and commands. Every input source activates targets from `SessionStore.targets`.
import Foundation

enum ComposePurpose: String, Sendable, Hashable { case message, seed }

enum GuidePage: Sendable, Hashable { case root, direction, wording }

enum Surface: Sendable, Hashable {
    case board
    case guide(GuidePage)
    case quick(page: Int)
    case compose(ComposePurpose, group: Int?)
    case composeClear
    case initiate
    case tools
    case history
    case review
    case speaking
    case paused
    case settings
    case endConfirm

    var title: String {
        switch self {
        case .board: "Conversation"
        case .guide(.root): "Guide my response"
        case .guide(.direction): "Choose a direction"
        case .guide(.wording): "Change the wording"
        case .quick: "Quick phrases"
        case .compose(.message, _): "My words"
        case .compose(.seed, _): "Topic or keyword"
        case .composeClear: "Clear all text?"
        case .initiate: "Start a conversation"
        case .tools: "More tools"
        case .history: "History and waiting"
        case .review: "Review before speaking"
        case .speaking: "Speaking"
        case .paused: "Paused"
        case .settings: "Settings"
        case .endConfirm: "End session?"
        }
    }
}

enum Command: Sendable, Equatable {
    case selectCandidate(ID)
    case noneOfThese
    case open(Surface)
    case back
    case setIntent(Intent)
    case addWording(StyleSetting)
    case clearGuidance
    case retry
    case refresh
    case quickPhrase(ID)
    case quickPage(Int)
    case composeGroup(Int?)
    case composeKey(String)
    case composeSpace
    case composeDelete
    case composeClearConfirm
    case composeDone
    case reviewCancel
    case reviewSpeak
    case reviewEdit
    case stopSpeech
    case pause
    case resume
    case endSession
    case initiate(InitiationCategory)
    case historyAnswer(ID)
    case historyDismissStaged(ID)
    case historyReturn(ID)
    case historyDismissWorkspace(ID)
    case parkActive
    case scanSpeed(TimeInterval)
}

enum TargetRegion: Sendable { case candidates, primary, tools, menu, keys, review, safety }
enum TargetTone: Sendable { case normal, speak, cancel, quiet }

struct Target: Sendable, Equatable, Identifiable {
    let id: String
    let label: String
    var detail: String? = nil
    var enabled = true
    let command: Command
    var region: TargetRegion = .menu
    var requiresArming = false
    var tone: TargetTone = .normal
    var hint: String? = nil
}
