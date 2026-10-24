// Wires the SessionStore to real effects: network generation, speech, recording, and switch scanning.
import Foundation
import Observation

enum ConnectionState: Equatable {
    case unknown, checking
    case connected(ServerStatus)
    case failed(String)

    var label: String {
        switch self {
        case .unknown: "Server: not checked"
        case .checking: "Server: checking…"
        case .connected(let s):
            s.accessRequired && s.accessCodeValid != true ? "Server: access code needed" : "Server: connected"
        case .failed: "Server: unreachable"
        }
    }
}

@MainActor
@Observable
final class AppModel: SessionEffects {
    let store: SessionStore
    let recorder = Recorder()
    let scanner = ScanController()
    @ObservationIgnored let speech = SpeechController()
    private(set) var connection: ConnectionState = .unknown
    private(set) var hasAccessCode: Bool
    @ObservationIgnored private var tasks: [ID: Task<Void, Never>] = [:]

    init(settings: AppSettings = SettingsStorage.load()) {
        store = SessionStore(settings: settings)
        hasAccessCode = !(AccessCodeKeychain.read() ?? "").isEmpty
        store.persistSettings = { SettingsStorage.save($0) }
        store.effects = self
        speech.voiceIdentifier = settings.voiceIdentifier
        speech.onEvent = { [weak self] id, kind in self?.store.speechEvent(utteranceID: id, kind: kind) }
        recorder.transcribe = { [weak self] url in
            guard let self else { return .failure(APIErrorInfo(code: .network, message: "Unavailable.", recoverable: true)) }
            guard let client = self.client() else { return .failure(Self.badURL) }
            return await client.transcribe(fileURL: url, captureID: newID(), sessionEpoch: self.store.sessionEpoch)
        }
        configureScanner()
    }

    static let badURL = APIErrorInfo(code: .notConfigured, message: "The server address in Settings is not valid.", recoverable: false)

    func client() -> APIClient? {
        APIClient(baseURL: store.settings.baseURL, accessCode: AccessCodeKeychain.read())
    }

    func setAccessCode(_ code: String) {
        AccessCodeKeychain.save(code)
        hasAccessCode = !(AccessCodeKeychain.read() ?? "").isEmpty
    }

    func checkConnection() async {
        guard let client = client() else { connection = .failed(Self.badURL.message); return }
        connection = .checking
        switch await client.status() {
        case .success(let s): connection = .connected(s)
        case .failure(let e): connection = .failed(e.userMessage)
        }
    }

    // MARK: Scanning

    private func configureScanner() {
        scanner.enabledTargetIDs = { [weak self] in self?.store.targets.filter(\.enabled).map(\.id) ?? [] }
        scanner.revision = { [weak self] in self?.store.surfaceRevision ?? 0 }
        scanner.interval = { [weak self] in self?.store.settings.scanInterval ?? 1.5 }
        scanner.commit = { [weak self] snap in
            self?.store.activate(targetID: snap.targetID, cycleID: snap.cycleID, surfaceRevision: snap.revision, source: .switchScan)
        }
        updateScanning()
    }

    func updateScanning() {
        if store.settings.inputMode == .switchScanning { scanner.start() } else { scanner.stop() }
    }

    // MARK: SessionEffects

    func generate(_ request: ReplyRequest) {
        let identity = request.identity
        guard let client = client() else {
            store.receiveGeneration(identity: identity, result: .failure(Self.badURL))
            return
        }
        tasks[identity.requestId] = Task { [weak self] in
            let result = await client.replies(request)
            guard !Task.isCancelled else { return }
            self?.tasks[identity.requestId] = nil
            self?.store.receiveGeneration(identity: identity, result: result)
        }
    }

    func abortGeneration(requestID: ID) {
        tasks[requestID]?.cancel()
        tasks[requestID] = nil
    }

    func speak(text: String, utteranceID: ID) {
        recorder.discard()
        speech.voiceIdentifier = store.settings.voiceIdentifier
        speech.speak(text: text, utteranceID: utteranceID)
    }

    func stopSpeech(utteranceID: ID) { speech.stop() }
    func stopAllSpeech() { speech.stop() }
    func discardRecording() { recorder.discard() }
}
