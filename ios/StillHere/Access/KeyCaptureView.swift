// Captures hardware keyboard / Bluetooth switch presses (Space or Return) with distinct down/up phases.
// It is a first responder only while no text field is editing, so text fields keep normal typing.
import SwiftUI
import UIKit

struct KeyCaptureView: UIViewRepresentable {
    var onSwitchDown: () -> Void
    var onSwitchUp: () -> Void
    var onSwitchCancel: () -> Void
    var onEscape: () -> Void
    var isActive: Bool

    func makeUIView(context: Context) -> KeyCaptureUIView {
        let v = KeyCaptureUIView()
        v.isAccessibilityElement = false
        v.accessibilityElementsHidden = true
        return v
    }

    func updateUIView(_ v: KeyCaptureUIView, context: Context) {
        v.onSwitchDown = onSwitchDown
        v.onSwitchUp = onSwitchUp
        v.onSwitchCancel = onSwitchCancel
        v.onEscape = onEscape
        v.isActive = isActive
        v.reclaimFocusSoon()
    }
}

final class KeyCaptureUIView: UIView {
    var onSwitchDown: () -> Void = {}
    var onSwitchUp: () -> Void = {}
    var onSwitchCancel: () -> Void = {}
    var onEscape: () -> Void = {}
    var isActive = false
    private var observers: [NSObjectProtocol] = []

    override var canBecomeFirstResponder: Bool { true }

    override func didMoveToWindow() {
        super.didMoveToWindow()
        guard window != nil, observers.isEmpty else { return }
        let names: [Notification.Name] = [UITextField.textDidEndEditingNotification, UITextView.textDidEndEditingNotification]
        observers = names.map {
            NotificationCenter.default.addObserver(forName: $0, object: nil, queue: .main) { [weak self] _ in
                MainActor.assumeIsolated { self?.reclaimFocusSoon() }
            }
        }
        reclaimFocusSoon()
    }

    isolated deinit { observers.forEach(NotificationCenter.default.removeObserver) }

    func reclaimFocusSoon() {
        DispatchQueue.main.async { [weak self] in
            guard let self, self.window != nil, !self.isFirstResponder else { return }
            if Self.textInputIsActive(in: self.window) { return }
            self.becomeFirstResponder()
        }
    }

    private static func textInputIsActive(in window: UIWindow?) -> Bool {
        guard let window else { return false }
        func search(_ v: UIView) -> Bool {
            if v.isFirstResponder, v is UITextInput { return true }
            return v.subviews.contains(where: search)
        }
        return search(window)
    }

    private func isSwitchKey(_ press: UIPress) -> Bool {
        guard let key = press.key else { return false }
        return key.keyCode == .keyboardSpacebar || key.keyCode == .keyboardReturnOrEnter || key.keyCode == .keypadEnter
    }

    override func pressesBegan(_ presses: Set<UIPress>, with event: UIPressesEvent?) {
        var handled = false
        for p in presses {
            if p.key?.keyCode == .keyboardEscape { onEscape(); handled = true }
            else if isActive && isSwitchKey(p) { onSwitchDown(); handled = true }
        }
        if !handled { super.pressesBegan(presses, with: event) }
    }

    override func pressesEnded(_ presses: Set<UIPress>, with event: UIPressesEvent?) {
        var handled = false
        for p in presses where isActive && isSwitchKey(p) { onSwitchUp(); handled = true }
        if !handled { super.pressesEnded(presses, with: event) }
    }

    override func pressesCancelled(_ presses: Set<UIPress>, with event: UIPressesEvent?) {
        // A cancelled press never commits.
        if presses.contains(where: isSwitchKey) { onSwitchCancel() }
        super.pressesCancelled(presses, with: event)
    }
}
