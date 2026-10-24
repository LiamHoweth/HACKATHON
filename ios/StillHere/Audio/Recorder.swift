// Partner speech capture: m4a (AAC), 20 s max. Mic permission is requested only when the partner taps Talk.
// The transcript is always shown as an editable draft; it is never auto-submitted.
import AVFoundation
import Foundation
import Observation

@MainActor
@Observable
final class Recorder {
    enum Status: Equatable {
        case idle, requesting, recording, transcribing
        case draft(String)
        case error(String)
    }

    static let maxSeconds: TimeInterval = 20

    private(set) var status: Status = .idle
    private(set) var startedAt: Date?
    @ObservationIgnored private var recorder: AVAudioRecorder?
    @ObservationIgnored private var fileURL: URL?
    @ObservationIgnored private var autoStop: Task<Void, Never>?
    @ObservationIgnored private var transcription: Task<Void, Never>?
    /// Transcribes a finished file. Injected by AppModel.
    @ObservationIgnored var transcribe: (URL) async -> Result<TranscriptData, APIErrorInfo> = { _ in
        .failure(APIErrorInfo(code: .notConfigured, message: "Transcription is not configured.", recoverable: false))
    }

    var isRecording: Bool { status == .recording }

    func start() async {
        guard status == .idle || isErrorOrDraft else { return }
        status = .requesting
        let granted = await AVAudioApplication.requestRecordPermission()
        guard granted else {
            status = .error("Microphone access is off. Type what your partner said instead, or allow the microphone in Settings.")
            return
        }
        guard status == .requesting else { return } // discarded while asking
        do {
            let session = AVAudioSession.sharedInstance()
            try session.setCategory(.playAndRecord, mode: .default, options: [.defaultToSpeaker])
            try session.setActive(true)
            let url = FileManager.default.temporaryDirectory.appending(path: "partner-\(UUID().uuidString).m4a")
            let settings: [String: Any] = [
                AVFormatIDKey: Int(kAudioFormatMPEG4AAC),
                AVSampleRateKey: 16_000,
                AVNumberOfChannelsKey: 1,
                AVEncoderAudioQualityKey: AVAudioQuality.medium.rawValue,
            ]
            let r = try AVAudioRecorder(url: url, settings: settings)
            guard r.record(forDuration: Self.maxSeconds) else { throw CocoaError(.fileWriteUnknown) }
            recorder = r
            fileURL = url
            startedAt = Date()
            status = .recording
            autoStop = Task { [weak self] in
                try? await Task.sleep(for: .seconds(Self.maxSeconds))
                guard !Task.isCancelled else { return }
                self?.finish()
            }
        } catch {
            status = .error("Recording could not start. Type instead.")
            cleanup()
        }
    }

    private var isErrorOrDraft: Bool {
        if case .error = status { return true }
        if case .draft = status { return true }
        return false
    }

    func finish() {
        guard status == .recording, let url = fileURL else { return }
        autoStop?.cancel()
        recorder?.stop()
        recorder = nil
        restorePlayback()
        status = .transcribing
        transcription = Task { [weak self] in
            guard let self else { return }
            let result = await self.transcribe(url)
            try? FileManager.default.removeItem(at: url)
            guard !Task.isCancelled, self.status == .transcribing else { return }
            switch result {
            case .success(let t):
                let text = t.text.trimmingCharacters(in: .whitespacesAndNewlines)
                self.status = text.isEmpty ? .error("No speech was heard. Re-record or type instead.") : .draft(text)
            case .failure(let e):
                self.status = .error(e.code == .unauthorized ? "Access code needed for transcription. Type instead." : "\(e.message) Type instead.")
            }
        }
    }

    /// Stops and throws away any recording (used before speaking, on pause, and on Back).
    func discard() {
        autoStop?.cancel()
        transcription?.cancel()
        recorder?.stop()
        recorder?.deleteRecording()
        cleanup()
        status = .idle
    }

    private func cleanup() {
        recorder = nil
        if let url = fileURL { try? FileManager.default.removeItem(at: url) }
        fileURL = nil
        startedAt = nil
        restorePlayback()
    }

    private func restorePlayback() {
        try? AVAudioSession.sharedInstance().setCategory(.playback, mode: .spokenAudio, options: [.duckOthers])
    }
}
