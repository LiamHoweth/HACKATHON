import SwiftUI

@main
struct StillHereApp: App {
    @State private var model = AppModel()

    var body: some Scene {
        WindowGroup {
            RootView()
                .environment(model)
                .environment(model.store)
                .task { await model.checkConnection() }
        }
    }
}
