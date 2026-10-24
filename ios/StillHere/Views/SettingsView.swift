import AVFoundation
import SwiftUI

struct SettingsView: View {
    @Environment(SessionStore.self) private var store
    @Environment(AppModel.self) private var model
    let onDone: () -> Void
    @State private var accessCode = ""

    var body: some View {
        @Bindable var store = store
        NavigationStack {
            Form {
                Section("Server") {
                    TextField("Backend URL", text: $store.settings.baseURL)
                        .keyboardType(.URL).textInputAutocapitalization(.never).autocorrectionDisabled()
                    SecureField(model.hasAccessCode ? "Access code saved (enter to replace)" : "Access code", text: $accessCode)
                        .onSubmit { model.setAccessCode(accessCode); accessCode = "" }
                    Button("Save access code") { model.setAccessCode(accessCode); accessCode = "" }
                        .disabled(accessCode.isEmpty)
                    Button("Check connection") { Task { await model.checkConnection() } }
                    Text(connectionDetail).font(.callout).foregroundStyle(.secondary)
                }
                Section("AI") {
                    Toggle("Cloud consent (needed for Live AI and the microphone)", isOn: $store.settings.cloudConsent)
                    Picker("AI mode", selection: $store.settings.aiMode) {
                        ForEach(AIMode.allCases) { Text($0.label).tag($0) }
                    }
                }
                Section("Input") {
                    Picker("Input mode", selection: $store.settings.inputMode) {
                        ForEach(InputMode.allCases) { Text($0.label).tag($0) }
                    }
                    Stepper(String(format: "Scan speed: %.2f s", store.settings.scanInterval),
                            value: $store.settings.scanInterval, in: AppSettings.scanRange, step: 0.25)
                    Text("Use Space or Return on a keyboard or Bluetooth switch. Escape pauses.")
                        .font(.callout).foregroundStyle(.secondary)
                }
                Section("Voice") {
                    Picker("Voice", selection: $store.settings.voiceIdentifier) {
                        Text("System default").tag(String?.none)
                        ForEach(SpeechController.englishVoices, id: \.identifier) { v in
                            Text("\(v.name) (\(v.language))").tag(Optional(v.identifier))
                        }
                    }
                    Button("Test voice") {
                        model.speech.voiceIdentifier = store.settings.voiceIdentifier
                        model.speech.testVoice()
                    }
                }
            }
            .navigationTitle("Settings")
            .toolbar { Button("Done", action: onDone) }
        }
    }

    private var connectionDetail: String {
        switch model.connection {
        case .connected(let s):
            var parts = ["Connected. Live AI \(s.replies.configured ? "configured" : "not configured")",
                         "fixtures \(s.fixturesEnabled ? "on" : "off")"]
            if s.accessRequired {
                switch s.accessCodeValid {
                case .some(true): parts.append("access code valid")
                case .some(false): parts.append("access code needed (the saved code was rejected)")
                case .none: parts.append("access code needed")
                }
            }
            return parts.joined(separator: ", ") + "."
        case .failed(let m): return m
        case .checking: return "Checking…"
        case .unknown: return "Not checked yet."
        }
    }
}
