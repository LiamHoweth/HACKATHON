import SwiftUI
import UIKit

@main
struct StillHereShellApp: App {
    init() {
        // Demo iPad must never dim or lock mid-conversation.
        UIApplication.shared.isIdleTimerDisabled = true
    }

    var body: some Scene {
        WindowGroup {
            DemoWebView(url: DemoConfig.appURL)
                .ignoresSafeArea()
                .statusBarHidden(true)
                .persistentSystemOverlays(.hidden)
        }
    }
}

enum DemoConfig {
    static let appURL = URL(string: "https://api-production-18038.up.railway.app/?demo=1")!
}
