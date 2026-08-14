import SwiftUI

@main
struct VoltApp: App {
    var body: some Scene {
        WindowGroup {
            VoltWebView()
                .ignoresSafeArea(.container, edges: .bottom)
        }
    }
}
