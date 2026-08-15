import SwiftUI
import Foundation
import WebKit
import WidgetKit
import OSLog
import VoltWidgetCore

private let voltWebLogger = Logger(subsystem: "br.com.voltconsumo.app", category: "web")

@main
struct VOLTNativeApp: App {
    @StateObject private var router = VoltNavigationRouter()
    @StateObject private var webState = VoltWebLoadState()

    var body: some Scene {
        WindowGroup {
            ZStack {
                VoltWebView(router: router, webState: webState)
                    .ignoresSafeArea()

                if webState.isLoading {
                    VoltWebLoadingView()
                } else if let message = webState.errorMessage {
                    VoltWebErrorView(message: message)
                }

#if DEBUG
                VStack(spacing: 0) {
                    Text(webState.accessibilityState)
                        .accessibilityIdentifier("volt-web-state")
                    if let route = router.lastReceivedPath {
                        Text(route)
                            .accessibilityIdentifier("volt-native-route")
                    }
                }
                .font(.system(size: 1))
                .frame(width: 1, height: 1)
                .opacity(0.01)
                .allowsHitTesting(false)
#endif
            }
            .onOpenURL { router.handle($0) }
        }
    }
}

@MainActor
final class VoltNavigationRouter: ObservableObject {
    @Published private(set) var pendingPath: String?
    @Published private(set) var lastReceivedPath: String?

    func handle(_ url: URL) {
        guard url.scheme?.lowercased() == "volt" else { return }
        let path = [url.host, url.path]
            .compactMap { $0 }
            .joined()
            .trimmingCharacters(in: CharacterSet(charactersIn: "/"))
        let normalized = path.isEmpty ? "home" : path
        lastReceivedPath = normalized
        pendingPath = normalized
        voltWebLogger.info("VOLT_NATIVE_ROUTE_RECEIVED \(normalized, privacy: .public)")
    }

    func markDispatched(_ path: String) {
        if pendingPath == path { pendingPath = nil }
    }
}

@MainActor
final class VoltWebLoadState: ObservableObject {
    @Published var isLoading = true
    @Published var didFinish = false
    @Published var errorMessage: String?

    var accessibilityState: String {
        if errorMessage != nil { return "error" }
        return didFinish ? "ready" : "loading"
    }

    func started() {
        isLoading = true
        didFinish = false
        errorMessage = nil
    }

    func finished() {
        isLoading = false
        didFinish = true
        errorMessage = nil
    }

    func failed(_ error: Error) {
        isLoading = false
        didFinish = false
        errorMessage = "Não foi possível carregar o VOLT. Verifique sua conexão e tente novamente."
        voltWebLogger.error("VOLT_WEB_DID_FAIL \(error.localizedDescription, privacy: .public)")
    }
}

private struct VoltWebLoadingView: View {
    var body: some View {
        ZStack {
            Color(uiColor: .systemBackground).ignoresSafeArea()
            VStack(spacing: 14) {
                Image(systemName: "bolt.fill")
                    .font(.system(size: 32, weight: .semibold))
                    .foregroundStyle(.green)
                ProgressView()
                Text("Carregando VOLT…")
                    .font(.footnote)
                    .foregroundStyle(.secondary)
            }
        }
        .accessibilityIdentifier("volt-loading")
    }
}

private struct VoltWebErrorView: View {
    let message: String

    var body: some View {
        ZStack {
            Color(uiColor: .systemBackground).ignoresSafeArea()
            VStack(spacing: 12) {
                Image(systemName: "wifi.exclamationmark")
                    .font(.system(size: 30, weight: .semibold))
                Text("VOLT indisponível")
                    .font(.headline)
                Text(message)
                    .font(.footnote)
                    .multilineTextAlignment(.center)
                    .foregroundStyle(.secondary)
                    .padding(.horizontal, 28)
            }
        }
        .accessibilityIdentifier("volt-web-error")
    }
}

struct VoltWebView: UIViewRepresentable {
    @ObservedObject var router: VoltNavigationRouter
    @ObservedObject var webState: VoltWebLoadState

    @MainActor
    final class Coordinator: NSObject, WKNavigationDelegate {
        let bridge: VoltWidgetBridge
        let router: VoltNavigationRouter
        let webState: VoltWebLoadState
        weak var webView: WKWebView?
        var webReady = false
        var dispatchingPath: String?

        init(router: VoltNavigationRouter, webState: VoltWebLoadState) {
            self.router = router
            self.webState = webState
            bridge = VoltWidgetBridge()
        }

        func webView(_ webView: WKWebView, didStartProvisionalNavigation navigation: WKNavigation!) {
            webReady = false
            webState.started()
            voltWebLogger.info("VOLT_WEB_DID_START")
        }

        func webView(_ webView: WKWebView, didFinish navigation: WKNavigation!) {
            webReady = true
            webState.finished()
            voltWebLogger.info("VOLT_WEB_DID_FINISH \(webView.url?.absoluteString ?? "unknown", privacy: .public)")
            dispatchPendingRoute(in: webView)
        }

        func webView(_ webView: WKWebView, didFail navigation: WKNavigation!, withError error: Error) {
            webReady = false
            webState.failed(error)
        }

        func webView(_ webView: WKWebView, didFailProvisionalNavigation navigation: WKNavigation!, withError error: Error) {
            webReady = false
            webState.failed(error)
        }

        func dispatchPendingRoute(in webView: WKWebView) {
            guard webReady,
                  let path = router.pendingPath,
                  dispatchingPath != path else { return }

            dispatchingPath = path
            guard let data = try? JSONSerialization.data(withJSONObject: path, options: [.fragmentsAllowed]),
                  let encodedPath = String(data: data, encoding: .utf8) else {
                dispatchingPath = nil
                return
            }

            let script = "window.__VOLT_PENDING_NATIVE_ROUTE__ = \(encodedPath); window.dispatchEvent(new CustomEvent('volt:native-route',{detail:{path:\(encodedPath)}}));"
            webView.evaluateJavaScript(script) { [weak self] _, error in
                Task { @MainActor in
                    guard let self else { return }
                    self.dispatchingPath = nil
                    if let error {
                        voltWebLogger.error("VOLT_NATIVE_ROUTE_DISPATCH_FAILED \(error.localizedDescription, privacy: .public)")
                        return
                    }
                    self.router.markDispatched(path)
                    voltWebLogger.info("VOLT_NATIVE_ROUTE_DISPATCHED \(path, privacy: .public)")
                }
            }
        }
    }

    func makeCoordinator() -> Coordinator {
        Coordinator(router: router, webState: webState)
    }

    func makeUIView(context: Context) -> WKWebView {
        let configuration = WKWebViewConfiguration()
        configuration.websiteDataStore = .default()
        configuration.userContentController.add(context.coordinator.bridge, name: "voltWidget")

        let webView = WKWebView(frame: .zero, configuration: configuration)
        context.coordinator.webView = webView
        webView.navigationDelegate = context.coordinator
        webView.allowsBackForwardNavigationGestures = true
        webView.scrollView.contentInsetAdjustmentBehavior = .never
        webView.load(URLRequest(url: VOLTWidgetConstants.webBaseURL))
        return webView
    }

    func updateUIView(_ webView: WKWebView, context: Context) {
        context.coordinator.dispatchPendingRoute(in: webView)
    }

    static func dismantleUIView(_ uiView: WKWebView, coordinator: Coordinator) {
        uiView.navigationDelegate = nil
        uiView.configuration.userContentController.removeScriptMessageHandler(forName: "voltWidget")
    }
}

@MainActor
final class VoltWidgetBridge: NSObject, WKScriptMessageHandler {
    private let store: WidgetSnapshotStore

    init(store: WidgetSnapshotStore = .shared) {
        self.store = store
    }

    func userContentController(_ userContentController: WKUserContentController, didReceive message: WKScriptMessage) {
        guard message.name == "voltWidget" else { return }

        if let command = message.body as? [String: Any], command["command"] as? String == "clear" {
            store.clear()
            reloadWidgets()
            return
        }

        guard JSONSerialization.isValidJSONObject(message.body),
              let data = try? JSONSerialization.data(withJSONObject: message.body),
              let snapshot = try? VoltWidgetSnapshotCodec.decode(data) else { return }

        do {
            try store.save(snapshot)
            reloadWidgets()
        } catch {
            return
        }
    }

    private func reloadWidgets() {
        WidgetCenter.shared.reloadTimelines(ofKind: VOLTWidgetConstants.summaryWidgetKind)
        WidgetCenter.shared.reloadTimelines(ofKind: VOLTWidgetConstants.energyWidgetKind)
        WidgetCenter.shared.reloadTimelines(ofKind: VOLTWidgetConstants.waterWidgetKind)
        WidgetCenter.shared.reloadTimelines(ofKind: VOLTWidgetConstants.readingWidgetKind)
        WidgetCenter.shared.reloadTimelines(ofKind: VOLTWidgetConstants.lockWidgetKind)
    }
}
