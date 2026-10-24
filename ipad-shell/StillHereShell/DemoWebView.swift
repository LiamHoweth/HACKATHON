import SwiftUI
import WebKit

/// Full-screen web view around the deployed app. Everything the demo needs is on by default:
/// camera/microphone requests from the app's own origin are granted, media plays without a tap,
/// and the access code (from the gitignored DemoSecrets.swift) is placed in sessionStorage
/// before the page runs.
struct DemoWebView: UIViewRepresentable {
    let url: URL

    func makeCoordinator() -> Coordinator { Coordinator(origin: url) }

    func makeUIView(context: Context) -> WKWebView {
        let config = WKWebViewConfiguration()
        config.allowsInlineMediaPlayback = true
        config.mediaTypesRequiringUserActionForPlayback = []
        config.websiteDataStore = .default()
        config.userContentController.addUserScript(
            WKUserScript(source: Self.bootstrapScript, injectionTime: .atDocumentStart, forMainFrameOnly: true)
        )

        let webView = WKWebView(frame: .zero, configuration: config)
        webView.uiDelegate = context.coordinator
        webView.navigationDelegate = context.coordinator
        webView.isInspectable = true // Safari Web Inspector from the Mac, for troubleshooting
        webView.scrollView.contentInsetAdjustmentBehavior = .never
        webView.scrollView.bounces = false
        webView.backgroundColor = .black
        webView.isOpaque = false
        webView.load(URLRequest(url: url))
        return webView
    }

    func updateUIView(_ webView: WKWebView, context: Context) {}

    /// Runs before any page script: marks the native shell and stores the access code.
    private static var bootstrapScript: String {
        let code = (try? String(data: JSONEncoder().encode(DemoSecrets.accessCode), encoding: .utf8)) ?? "\"\""
        return """
        window.__STILL_HERE_DEMO__ = true;
        try { if (\(code)) sessionStorage.setItem('still-here:access', \(code)); } catch (e) {}
        """
    }

    final class Coordinator: NSObject, WKUIDelegate, WKNavigationDelegate {
        private let origin: URL
        init(origin: URL) { self.origin = origin }

        // Grant camera/microphone to the app's own host without a second web-level prompt.
        // (iPadOS still asks once for app-level camera access the first time; tap Allow.)
        func webView(_ webView: WKWebView,
                     decideMediaCapturePermissionsFor origin: WKSecurityOrigin,
                     initiatedBy frame: WKFrameInfo,
                     type: WKMediaCaptureType) async -> WKPermissionDecision {
            origin.host == self.origin.host ? .grant : .deny
        }

        // Keep navigation inside the app's host.
        func webView(_ webView: WKWebView,
                     decidePolicyFor navigationAction: WKNavigationAction) async -> WKNavigationActionPolicy {
            guard let host = navigationAction.request.url?.host else { return .allow }
            return host == origin.host ? .allow : .cancel
        }

        // Network hiccup on load: retry instead of leaving a blank screen.
        func webView(_ webView: WKWebView, didFailProvisionalNavigation navigation: WKNavigation!, withError error: Error) {
            retry(webView)
        }

        func webViewWebContentProcessDidTerminate(_ webView: WKWebView) {
            webView.reload()
        }

        private func retry(_ webView: WKWebView) {
            let target = origin
            DispatchQueue.main.asyncAfter(deadline: .now() + 2) {
                webView.load(URLRequest(url: target))
            }
        }
    }
}
