import SwiftUI

@MainActor
final class VoltDeepLinkRouter: ObservableObject {
    @Published private(set) var revision = 0

    func open(_ url: URL) {
        guard url.scheme?.lowercased() == "volt" else { return }
        revision &+= 1
    }
}

@main
struct VoltApp: App {
    @StateObject private var deepLinkRouter = VoltDeepLinkRouter()

    var body: some Scene {
        WindowGroup {
            VoltWebView(deepLinkRouter: deepLinkRouter)
                .ignoresSafeArea(.container, edges: .bottom)
                .onOpenURL { url in
                    deepLinkRouter.open(url)
                }
        }
    }
}
