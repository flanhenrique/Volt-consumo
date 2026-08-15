import SwiftUI
import Foundation
import WebKit
import WidgetKit
import VoltWidgetCore

@main
struct VOLTNativeApp: App {
    @StateObject private var router = VoltNavigationRouter()
    var body: some Scene {
        WindowGroup {
            VoltWebContainer(router: router)
                .ignoresSafeArea()
                .onOpenURL { router.handle($0) }
        }
    }
}

@MainActor
final class VoltNavigationRouter: ObservableObject {
    @Published var pendingPath: String?
    func handle(_ url: URL) {
        guard url.scheme?.lowercased() == "volt" else { return }
        let path = [url.host, url.path].compactMap { $0 }.joined().trimmingCharacters(in: CharacterSet(charactersIn: "/"))
        pendingPath = path.isEmpty ? "home" : path
    }
}

struct VoltWebContainer: UIViewRepresentable {
    @ObservedObject var router: VoltNavigationRouter
    func makeCoordinator() -> Coordinator { Coordinator() }
    func makeUIView(context: Context) -> WKWebView {
        let configuration = WKWebViewConfiguration()
        configuration.websiteDataStore = .default()
        configuration.userContentController.add(context.coordinator.bridge, name: "voltWidget")
        let webView = WKWebView(frame: .zero, configuration: configuration)
        context.coordinator.webView = webView
        webView.allowsBackForwardNavigationGestures = true
        webView.scrollView.contentInsetAdjustmentBehavior = .never
        webView.load(URLRequest(url: VOLTWidgetConstants.webBaseURL))
        return webView
    }
    func updateUIView(_ webView: WKWebView, context: Context) {
        guard let path = router.pendingPath, context.coordinator.lastHandledPath != path else { return }
        context.coordinator.lastHandledPath = path
        let safePath = path.replacingOccurrences(of: "'", with: "\\'")
        webView.evaluateJavaScript("window.dispatchEvent(new CustomEvent('volt:native-route',{detail:{path:'\(safePath)'}}));")
        DispatchQueue.main.async {
            if router.pendingPath == path { router.pendingPath = nil }
            context.coordinator.lastHandledPath = nil
        }
    }
    static func dismantleUIView(_ uiView: WKWebView, coordinator: Coordinator) { uiView.configuration.userContentController.removeScriptMessageHandler(forName: "voltWidget") }
    final class Coordinator { let bridge = VoltWidgetBridge(); weak var webView: WKWebView?; var lastHandledPath: String? }
}

final class VoltWidgetBridge: NSObject, WKScriptMessageHandler {
    private let store: WidgetSnapshotStore
    init(store: WidgetSnapshotStore = .shared) { self.store = store }
    func userContentController(_ userContentController: WKUserContentController, didReceive message: WKScriptMessage) {
        guard message.name == "voltWidget" else { return }
        if let command = message.body as? [String: Any], command["command"] as? String == "clear" { store.clear(); reloadWidgets(); return }
        guard JSONSerialization.isValidJSONObject(message.body), let data = try? JSONSerialization.data(withJSONObject: message.body), let snapshot = try? VoltWidgetSnapshotCodec.decode(data) else { return }
        do { try store.save(snapshot); reloadWidgets() } catch { }
    }
    private func reloadWidgets() {
        WidgetCenter.shared.reloadTimelines(ofKind: VOLTWidgetConstants.summaryWidgetKind)
        WidgetCenter.shared.reloadTimelines(ofKind: VOLTWidgetConstants.energyWidgetKind)
        WidgetCenter.shared.reloadTimelines(ofKind: VOLTWidgetConstants.waterWidgetKind)
        WidgetCenter.shared.reloadTimelines(ofKind: VOLTWidgetConstants.readingWidgetKind)
        WidgetCenter.shared.reloadTimelines(ofKind: VOLTWidgetConstants.lockWidgetKind)
    }
}
