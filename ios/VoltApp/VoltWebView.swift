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
            guard int(body["version"]) == 1 else { return nil }

            let capturedAt: Date
            if let raw = body["capturedAt"] as? String,
               let date = ISO8601DateFormatter().date(from: raw) {
                capturedAt = date
            } else {
                capturedAt = Date()
            }

            return WidgetSnapshot(
                version: 1,
                capturedAt: capturedAt,
                energyConsumption: double(body["energyConsumption"]),
                energyGoal: double(body["energyGoal"]),
                energyProgress: double(body["energyProgress"]),
                energyCurrentCost: double(body["energyCurrentCost"]),
                totalCurrentCost: double(body["totalCurrentCost"]),
                waterConsumption: double(body["waterConsumption"]),
                waterGoal: double(body["waterGoal"]),
                waterCurrentCost: double(body["waterCurrentCost"]),
                co2Kg: double(body["co2Kg"]),
                energyStatus: (body["energyStatus"] as? String)?.trimmingCharacters(in: .whitespacesAndNewlines) ?? ""
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
    }

    private static let widgetBridgeScript = #"""
    (() => {
      if (window.__voltNativeWidgetBridgeInstalled) return;
      window.__voltNativeWidgetBridgeInstalled = true;

      const handler = window.webkit?.messageHandlers?.voltWidget;
      if (!handler) return;

      const text = (id) => document.getElementById(id)?.textContent?.trim() || "";
      const number = (value) => {
        const raw = String(value ?? "").trim().replace(/\s/g, "");
        if (!raw) return 0;
        const normalized = raw.includes(",")
          ? raw.replace(/\./g, "").replace(",", ".")
          : raw;
        const result = Number.parseFloat(normalized.replace(/[^\d.-]/g, ""));
        return Number.isFinite(result) ? result : 0;
      };

      let timer = null;
      let lastPayload = "";

      const publish = () => {
        if (document.documentElement.dataset.startupStatus !== "READY") return;

        const energyConsumption = number(text("home-energy-consumption"));
        const energyGoal = number(text("home-energy-goal"));
        const payload = {
          version: 1,
          energyConsumption,
          energyGoal,
          energyProgress: energyGoal > 0 ? energyConsumption / energyGoal : 0,
          energyCurrentCost: number(text("home-energy-cost")),
          totalCurrentCost: number(text("home-total-cost")),
          waterConsumption: number(text("home-water-consumption")),
          waterGoal: number(text("home-water-goal")),
          waterCurrentCost: number(text("home-water-cost")),
          co2Kg: number(text("home-insight-title")),
          energyStatus: text("home-energy-status")
        };

        const fingerprint = JSON.stringify(payload);
        if (fingerprint === lastPayload) return;
        lastPayload = fingerprint;

        handler.postMessage({
          ...payload,
          capturedAt: new Date().toISOString()
        });
      };

      const schedule = () => {
        clearTimeout(timer);
        timer = setTimeout(publish, 80);
      };

      window.addEventListener("volt:startup-status", schedule);
      window.addEventListener("volt:regulatory-context", schedule);
      document.addEventListener("change", schedule, true);
      document.addEventListener("visibilitychange", () => {
        if (document.visibilityState === "visible") schedule();
      });

      const target = document.getElementById("page-home") || document.body;
      if (target) {
        new MutationObserver(schedule).observe(target, {
          subtree: true,
          childList: true,
          characterData: true,
          attributes: true,
          attributeFilter: ["style", "data-tone", "aria-valuenow"]
        });
      }

      setTimeout(schedule, 400);
    })();
    """#
}
