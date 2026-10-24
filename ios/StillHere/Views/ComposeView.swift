// My words: system keyboard text field plus a grouped-letter scanning keyboard. Works with no network.
import SwiftUI

struct ComposeView: View {
    @Environment(SessionStore.self) private var store
    @Environment(\.horizontalSizeClass) private var hSize
    let purpose: ComposePurpose
    let group: Int?

    var body: some View {
        let targets = store.targets
        VStack(alignment: .leading, spacing: 16) {
            TextField(purpose == .message ? "Type my own words" : "A topic or keyword",
                      text: Binding(get: { store.draft(purpose) }, set: { store.setDraft(purpose, $0) }),
                      axis: .vertical)
                .font(.title2)
                .lineLimit(2...6)
                .padding(14)
                .background(Color(.secondarySystemBackground), in: RoundedRectangle(cornerRadius: 14))
                .accessibilityLabel(purpose == .message ? "My words" : "Topic or keyword")
                .accessibilityHint("Type with the keyboard, or use the letter groups below.")
            Text("\(store.draft(purpose).count) / \(purpose == .message ? Limits.composeChars : Limits.seedChars)")
                .font(.caption).foregroundStyle(.secondary)
            LazyVGrid(columns: Array(repeating: GridItem(.flexible(), spacing: 10), count: hSize == .regular ? 3 : 2), spacing: 10) {
                ForEach(targets) { TargetButton(target: $0) }
            }
        }
    }
}
