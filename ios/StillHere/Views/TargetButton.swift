// One activatable target. Touch goes through the same SessionStore.activate path as switch scanning.
import SwiftUI

struct TargetButton: View {
    @Environment(SessionStore.self) private var store
    @Environment(AppModel.self) private var model
    let target: Target
    var large = false
    var armed = true

    private var highlighted: Bool { model.scanner.highlightedID == target.id }

    var body: some View {
        let revision = store.surfaceRevision
        Button {
            store.activate(targetID: target.id, cycleID: newID(), surfaceRevision: revision, source: .touch)
        } label: {
            VStack(alignment: .leading, spacing: 4) {
                Text(target.label)
                    .font(large ? .title2.weight(.semibold) : .title3.weight(.semibold))
                    .multilineTextAlignment(.leading)
                    .fixedSize(horizontal: false, vertical: true)
                if let detail = target.detail {
                    Text(detail).font(.body).foregroundStyle(.secondary)
                        .fixedSize(horizontal: false, vertical: true)
                }
            }
            .frame(maxWidth: .infinity, minHeight: large ? 84 : 60, alignment: .leading)
            .padding(.horizontal, 18)
            .padding(.vertical, 12)
            .background(background, in: RoundedRectangle(cornerRadius: 16))
            .overlay {
                RoundedRectangle(cornerRadius: 16)
                    .strokeBorder(highlighted ? Color.scanHighlight : Color.primary.opacity(0.15), lineWidth: highlighted ? 7 : 1)
            }
            .contentShape(RoundedRectangle(cornerRadius: 16))
        }
        .buttonStyle(.plain)
        .disabled(!target.enabled || !armed)
        .opacity(target.enabled ? 1 : 0.45)
        .accessibilityLabel(target.label)
        .accessibilityHint(target.hint ?? target.detail ?? "")
        .accessibilityIdentifier("target-\(target.id)")
    }

    private var background: Color {
        if highlighted { return Color.scanHighlight.opacity(0.28) }
        switch target.tone {
        case .speak: return Color.accentColor.opacity(target.enabled && armed ? 0.85 : 0.35)
        case .cancel: return Color(.secondarySystemBackground)
        case .quiet: return Color(.tertiarySystemBackground)
        case .normal: return Color(.secondarySystemBackground)
        }
    }
}

extension Color {
    /// High-contrast scan highlight, distinct from VoiceOver focus.
    static let scanHighlight = Color(uiColor: UIColor { $0.userInterfaceStyle == .dark ? .systemYellow : .systemOrange })
}

/// A vertical list of targets in registry order (so visual order == scan order).
struct TargetList: View {
    let targets: [Target]
    var columns = 1
    var body: some View {
        LazyVGrid(columns: Array(repeating: GridItem(.flexible(), spacing: 12, alignment: .top), count: columns), spacing: 12) {
            ForEach(targets) { TargetButton(target: $0) }
        }
    }
}
