import SwiftUI
import UIKit
import WebKit
import WidgetKit

struct VoltWebView: UIViewRepresentable {
    private let appURL = URL(string: "https://www.voltconsumo.com.br")!

    func makeCoordinator() -> Coordinator {
        Coordinator()
    }

    func makeUIView(context: Context) -> WKWebView {
        let configuration = WKWebViewConfiguration()
        configuration.websiteDataStore = .default()
        configuration.defaultWebpagePreferences.allowsContentJavaScript = true
        configuration.applicationNameForUserAgent = "VOLT-iOS/1.0"

        let controller = WKUserContentController()
        controller.add(context.coordinator, name: "voltWidget")
        controller.addUserScript(
            WKUserScript(
                source: Self.widgetBridgeScript,
                injectionTime: .atDocumentEnd,
                forMainFrameOnly: true
            )
        )
        configuration.userContentController = controller

        let webView = WKWebView(frame: .zero, configuration: configuration)
        webView.navigationDelegate = context.coordinator
        webView.allowsBackForwardNavigationGestures = true
        webView.scrollView.contentInsetAdjustmentBehavior = .always
        webView.load(URLRequest(url: appURL, cachePolicy: .reloadRevalidatingCacheData))
        return webView
    }

    func updateUIView(_ webView: WKWebView, context: Context) {}

    static func dismantleUIView(_ webView: WKWebView, coordinator: Coordinator) {
        webView.configuration.userContentController.removeScriptMessageHandler(forName: "voltWidget")
        webView.navigationDelegate = nil
    }

    final class Coordinator: NSObject, WKScriptMessageHandler, WKNavigationDelegate {
        func userContentController(_ userContentController: WKUserContentController, didReceive message: WKScriptMessage) {
            guard message.name == "voltWidget", let body = message.body as? [String: Any] else { return }
            guard let snapshot = Self.makeSnapshot(from: body) else { return }

            do {
                try WidgetStore.save(snapshot)
                WidgetCenter.shared.reloadTimelines(ofKind: VoltShared.widgetKind)
            } catch {
                #if DEBUG
                print("[VOLT] Falha ao persistir snapshot do widget: \(error)")
                #endif
            }
        }

        func webView(
            _ webView: WKWebView,
            decidePolicyFor navigationAction: WKNavigationAction,
            decisionHandler: @escaping (WKNavigationActionPolicy) -> Void
        ) {
            guard
                navigationAction.targetFrame?.isMainFrame == true,
                let url = navigationAction.request.url,
                let scheme = url.scheme?.lowercased(),
                ["http", "https"].contains(scheme),
                let host = url.host?.lowercased()
            else {
                decisionHandler(.allow)
                return
            }

            let allowedHosts = Set(["www.voltconsumo.com.br", "voltconsumo.com.br"])
            if allowedHosts.contains(host) {
                decisionHandler(.allow)
            } else {
                UIApplication.shared.open(url)
                decisionHandler(.cancel)
            }
        }

        private static func makeSnapshot(from body: [String: Any]) -> WidgetSnapshot? {
            guard int(body["version"]) == 2 else { return nil }

            let capturedAt: Date
            if let raw = body["capturedAt"] as? String,
               let date = ISO8601DateFormatter().date(from: raw) {
                capturedAt = date
            } else {
                capturedAt = Date()
            }

            return WidgetSnapshot(
                version: 2,
                capturedAt: capturedAt,
                cycleLabel: string(body["cycleLabel"]),
                energyConsumption: double(body["energyConsumption"]),
                energyGoal: double(body["energyGoal"]),
                energyProgress: double(body["energyProgress"]),
                energyProjectedConsumption: double(body["energyProjectedConsumption"]),
                energyCurrentCost: double(body["energyCurrentCost"]),
                energyProjectedCost: double(body["energyProjectedCost"]),
                totalCurrentCost: double(body["totalCurrentCost"]),
                totalProjectedCost: double(body["totalProjectedCost"]),
                waterConsumption: double(body["waterConsumption"]),
                waterGoal: double(body["waterGoal"]),
                waterProgress: double(body["waterProgress"]),
                waterProjectedConsumption: double(body["waterProjectedConsumption"]),
                waterCurrentCost: double(body["waterCurrentCost"]),
                waterProjectedCost: double(body["waterProjectedCost"]),
                co2Kg: double(body["co2Kg"]),
                projectedCo2Kg: double(body["projectedCo2Kg"]),
                energyStatus: string(body["energyStatus"]),
                energyStatusTone: string(body["energyStatusTone"]),
                confidence: string(body["confidence"])
            )
        }

        private static func double(_ value: Any?) -> Double {
            if let number = value as? NSNumber { return number.doubleValue }
            if let value = value as? Double { return value }
            if let value = value as? String { return Double(value) ?? 0 }
            return 0
        }

        private static func int(_ value: Any?) -> Int {
            if let number = value as? NSNumber { return number.intValue }
            if let value = value as? Int { return value }
            if let value = value as? String { return Int(value) ?? 0 }
            return 0
        }

        private static func string(_ value: Any?) -> String {
            (value as? String)?.trimmingCharacters(in: .whitespacesAndNewlines) ?? ""
        }
    }

    private static let widgetBridgeScript = #"""
    (() => {
      if (window.__voltNativeWidgetBridgeInstalled) return;
      window.__voltNativeWidgetBridgeInstalled = true;

      const handler = window.webkit?.messageHandlers?.voltWidget;
      if (!handler) return;

      let lastPayload = "";
      const publish = (payload) => {
        if (!payload || Number(payload.version) !== 2) return;
        const fingerprint = JSON.stringify(payload);
        if (fingerprint === lastPayload) return;
        lastPayload = fingerprint;
        handler.postMessage(payload);
      };

      window.addEventListener("volt:widget-snapshot", (event) => publish(event.detail));
      if (window.__VOLT_WIDGET_SNAPSHOT__) publish(window.__VOLT_WIDGET_SNAPSHOT__);
    })();
    """#
}
