// AVSpeechSynthesizer wrapper. Speaks each utterance ID at most once and reports delivery states.
import AVFoundation
import Foundation

@MainActor
final class SpeechController: NSObject {
    var onEvent: (ID, SpeechEventKind) -> Void = { _, _ in }
    var voiceIdentifier: String?

    private let synthesizer = AVSpeechSynthesizer()
    private var ids: [ObjectIdentifier: ID] = [:]
    private var spoken: Set<ID> = []

    override init() {
        super.init()
        synthesizer.delegate = self
    }

    static var englishVoices: [AVSpeechSynthesisVoice] {
        AVSpeechSynthesisVoice.speechVoices()
            .filter { $0.language.hasPrefix("en") }
            .sorted { ($0.quality.rawValue, $0.name) > ($1.quality.rawValue, $1.name) }
    }

    private func configureSession() {
        let s = AVAudioSession.sharedInstance()
        try? s.setCategory(.playback, mode: .spokenAudio, options: [.duckOthers])
        try? s.setActive(true)
    }

    /// Speaks exactly `text`, once per `utteranceID`.
    func speak(text: String, utteranceID: ID) {
        guard !spoken.contains(utteranceID) else { return }
        spoken.insert(utteranceID)
        configureSession()
        let u = AVSpeechUtterance(string: text)
        u.voice = voiceIdentifier.flatMap { AVSpeechSynthesisVoice(identifier: $0) } ?? AVSpeechSynthesisVoice(language: "en-US")
        ids[ObjectIdentifier(u)] = utteranceID
        synthesizer.speak(u)
    }

    func stop() {
        synthesizer.stopSpeaking(at: .immediate)
    }

    /// Fixed sample for Settings. Never enters history or the session store.
    func testVoice() {
        speak(text: Phrases.testVoiceText, utteranceID: "test-voice-\(UUID().uuidString)")
    }

    fileprivate func handle(_ key: ObjectIdentifier, _ kind: SpeechEventKind) {
        guard let id = ids[key] else { return }
        if kind != .started { ids[key] = nil }
        onEvent(id, kind)
    }
}

extension SpeechController: AVSpeechSynthesizerDelegate {
    nonisolated func speechSynthesizer(_ synthesizer: AVSpeechSynthesizer, didStart utterance: AVSpeechUtterance) {
        let key = ObjectIdentifier(utterance)
        Task { @MainActor in self.handle(key, .started) }
    }

    nonisolated func speechSynthesizer(_ synthesizer: AVSpeechSynthesizer, didFinish utterance: AVSpeechUtterance) {
        let key = ObjectIdentifier(utterance)
        Task { @MainActor in self.handle(key, .finished) }
    }

    nonisolated func speechSynthesizer(_ synthesizer: AVSpeechSynthesizer, didCancel utterance: AVSpeechUtterance) {
        let key = ObjectIdentifier(utterance)
        Task { @MainActor in self.handle(key, .interrupted) }
    }
}
