// Partner side: type or record what was said, and see the conversation with delivery status.
import SwiftUI

struct PartnerPanel: View {
    @Environment(SessionStore.self) private var store
    @Environment(AppModel.self) private var model
    @State private var text = ""
    @State private var draft = ""

    var body: some View {
        ScrollView {
            VStack(alignment: .leading, spacing: 14) {
                Text("Partner").font(.title2.bold()).accessibilityAddTraits(.isHeader)
                TextField("What did you say?", text: $text, axis: .vertical)
                    .lineLimit(1...4)
                    .textFieldStyle(.roundedBorder)
                    .font(.title3)
                    .submitLabel(.send)
                    .onSubmit(send)
                Button("Send to Still Here", action: send)
                    .buttonStyle(.borderedProminent)
                    .disabled(text.trimmingCharacters(in: .whitespacesAndNewlines).isEmpty)
                recording
                if store.waitingCount > 0 {
                    Text("Waiting: \(store.waitingCount)").font(.headline)
                }
                Divider()
                Text("Conversation").font(.headline)
                ForEach(store.conversation.reversed()) { entry in
                    switch entry {
                    case .partner(let p):
                        Text("Partner: \(p.text)").fixedSize(horizontal: false, vertical: true)
                            .foregroundStyle(p.acceptedForContext ? .primary : .secondary)
                    case .user(let u):
                        VStack(alignment: .leading) {
                            Text("Me: \(u.text)").fixedSize(horizontal: false, vertical: true)
                            Text("\(u.delivery.label) · \(u.source.label)").font(.caption).foregroundStyle(.secondary)
                        }
                    }
                }
            }
            .padding(16)
        }
    }

    private func send() {
        store.partnerSubmit(text, source: .typed)
        text = ""
    }

    @ViewBuilder private var recording: some View {
        switch model.recorder.status {
        case .idle, .error:
            Button {
                Task { await model.recorder.start() }
            } label: { Label("Talk (record up to 20 s)", systemImage: "mic") }
                .buttonStyle(.bordered)
                .disabled(!store.settings.cloudConsent || store.speech != nil)
            if !store.settings.cloudConsent {
                Text("Recording needs cloud consent in Settings.").font(.caption).foregroundStyle(.secondary)
            }
            if case .error(let msg) = model.recorder.status { Text(msg).font(.callout).foregroundStyle(.red) }
        case .requesting:
            ProgressView("Asking for microphone…")
        case .recording:
            Button { model.recorder.finish() } label: { Label("Finish recording", systemImage: "stop.circle") }
                .buttonStyle(.borderedProminent)
        case .transcribing:
            ProgressView("Transcribing…")
        case .draft(let transcript):
            VStack(alignment: .leading, spacing: 8) {
                Text("Check the transcript before using it:").font(.callout)
                TextField("Transcript", text: $draft, axis: .vertical)
                    .textFieldStyle(.roundedBorder)
                    .onAppear { draft = transcript }
                HStack {
                    Button("Use this") {
                        store.partnerSubmit(draft, source: draft == transcript ? .transcribed : .edited)
                        model.recorder.discard()
                    }.buttonStyle(.borderedProminent)
                    Button("Re-record") {
                        model.recorder.discard()
                        Task { await model.recorder.start() }
                    }
                    Button("Back") { model.recorder.discard() }
                }
            }
        }
    }
}
