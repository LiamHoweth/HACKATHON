// Non-secret settings, persisted in UserDefaults. The access code is NEVER stored here (see Keychain.swift).
import Foundation

struct AppSettings: Equatable, Sendable {
    var baseURL: String
    var aiMode: AIMode = .fixture
    var inputMode: InputMode = .touch
    var scanInterval: TimeInterval = 1.5
    var voiceIdentifier: String? = nil
    var cloudConsent = false
    /// P2: saved length preference (explicitly confirmed). nil = no saved preference.
    var savedLength: LengthChoice? = nil

    static let scanRange: ClosedRange<TimeInterval> = 0.7...5.0
    static let readingPause: TimeInterval = 2.0

    /// Default backend from Info.plist `STILL_HERE_API_BASE`, falling back to localhost for development.
    static var defaultBaseURL: String {
        let raw = (Bundle.main.object(forInfoDictionaryKey: "STILL_HERE_API_BASE") as? String)?
            .trimmingCharacters(in: .whitespacesAndNewlines) ?? ""
        return raw.isEmpty || raw.contains("$(") ? "http://localhost:3000" : raw
    }
}

enum SettingsStorage {
    private static let prefix = "stillhere."

    static func load(defaults: UserDefaults = .standard) -> AppSettings {
        var s = AppSettings(baseURL: defaults.string(forKey: prefix + "baseURL") ?? AppSettings.defaultBaseURL)
        if let m = defaults.string(forKey: prefix + "aiMode"), let mode = AIMode(rawValue: m) { s.aiMode = mode }
        if let m = defaults.string(forKey: prefix + "inputMode"), let mode = InputMode(rawValue: m) { s.inputMode = mode }
        let interval = defaults.double(forKey: prefix + "scanInterval")
        if interval > 0 { s.scanInterval = min(max(interval, AppSettings.scanRange.lowerBound), AppSettings.scanRange.upperBound) }
        s.voiceIdentifier = defaults.string(forKey: prefix + "voice")
        s.cloudConsent = defaults.bool(forKey: prefix + "cloudConsent")
        if let l = defaults.string(forKey: prefix + "savedLength") { s.savedLength = LengthChoice(rawValue: l) }
        return s
    }

    static func save(_ s: AppSettings, defaults: UserDefaults = .standard) {
        defaults.set(s.baseURL, forKey: prefix + "baseURL")
        defaults.set(s.aiMode.rawValue, forKey: prefix + "aiMode")
        defaults.set(s.inputMode.rawValue, forKey: prefix + "inputMode")
        defaults.set(s.scanInterval, forKey: prefix + "scanInterval")
        defaults.set(s.voiceIdentifier, forKey: prefix + "voice")
        defaults.set(s.cloudConsent, forKey: prefix + "cloudConsent")
        defaults.set(s.savedLength?.rawValue, forKey: prefix + "savedLength")
    }
}
