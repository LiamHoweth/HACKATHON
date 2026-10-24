import SwiftUI

struct RootView: View {
    @Environment(AppModel.self) private var model
    @Environment(SessionStore.self) private var store
    @Environment(\.horizontalSizeClass) private var hSize
    @State private var showPartnerSheet = false

    var body: some View {
        @Bindable var store = store
        VStack(spacing: 0) {
            StatusRow(showPartner: hSize == .regular ? nil : { showPartnerSheet = true })
            Divider()
            if hSize == .regular {
                HStack(spacing: 0) {
                    CommunicationView()
                        .frame(maxWidth: .infinity)
                    Divider()
                    PartnerPanel()
                        .frame(width: 380)
                }
            } else {
                CommunicationView()
            }
        }
        .background(Color(.systemBackground))
        .background {
            KeyCaptureView(
                onSwitchDown: { model.scanner.keyDown() },
                onSwitchUp: { model.scanner.keyUp() },
                onSwitchCancel: { model.scanner.cancelPress() },
                onEscape: { store.safetyPause() },
                isActive: store.settings.inputMode == .switchScanning
            )
            .frame(width: 1, height: 1)
        }
        .sheet(isPresented: $showPartnerSheet) {
            NavigationStack {
                PartnerPanel()
                    .navigationTitle("Partner")
                    .navigationBarTitleDisplayMode(.inline)
                    .toolbar { Button("Done") { showPartnerSheet = false } }
            }
            .presentationDetents([.medium, .large])
        }
        .sheet(isPresented: Binding(
            get: { store.surface == .settings },
            set: { if !$0 && store.surface == .settings { closeSettings() } }
        )) {
            SettingsView(onDone: closeSettings)
        }
        .onChange(of: store.settings.inputMode) { model.updateScanning() }
    }

    private func closeSettings() {
        store.activate(targetID: "set-done", cycleID: newID(), surfaceRevision: store.surfaceRevision, source: .touch)
    }
}

struct StatusRow: View {
    @Environment(AppModel.self) private var model
    @Environment(SessionStore.self) private var store
    var showPartner: (() -> Void)?

    var body: some View {
        ViewThatFits(in: .horizontal) {
            HStack(spacing: 10) { items; Spacer(minLength: 0); buttons }
            VStack(alignment: .leading, spacing: 6) {
                HStack(spacing: 10) { items }
                HStack { Spacer(); buttons }
            }
        }
        .font(.subheadline)
        .padding(.horizontal, 16)
        .padding(.vertical, 8)
    }

    @ViewBuilder private var items: some View {
        Text("Still Here").font(.headline)
        chip(store.settings.inputMode.label, systemImage: store.settings.inputMode == .touch ? "hand.tap" : "switch.2")
        chip(micLabel, systemImage: model.recorder.isRecording ? "mic.fill" : "mic.slash")
        chip(store.sourceLabel, systemImage: "sparkles")
        chip(model.connection.label, systemImage: connectionIcon)
    }

    @ViewBuilder private var buttons: some View {
        if let showPartner {
            Button { showPartner() } label: { Label("Partner", systemImage: "person.wave.2") }
                .buttonStyle(.borderedProminent)
                .accessibilityHint("Opens the partner panel to type or record what was said.")
        }
        Button { store.openSettings() } label: { Label("Settings", systemImage: "gearshape") }
            .buttonStyle(.bordered)
            .disabled(!store.canOpenSettings)
    }

    private var micLabel: String {
        switch model.recorder.status {
        case .recording: "Mic: recording"
        case .transcribing: "Mic: transcribing"
        case .requesting: "Mic: asking"
        default: "Mic: off"
        }
    }

    private var connectionIcon: String {
        switch model.connection {
        case .connected: "checkmark.circle"
        case .failed: "exclamationmark.triangle"
        default: "circle.dotted"
        }
    }

    private func chip(_ text: String, systemImage: String) -> some View {
        Label(text, systemImage: systemImage)
            .padding(.horizontal, 8).padding(.vertical, 4)
            .background(Color(.secondarySystemBackground), in: Capsule())
            .lineLimit(1)
    }
}
