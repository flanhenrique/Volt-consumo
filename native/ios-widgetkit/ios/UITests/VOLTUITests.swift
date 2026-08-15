import XCTest

final class VOLTUITests: XCTestCase {
    override func setUp() {
        super.setUp()
        continueAfterFailure = false
        XCUIDevice.shared.orientation = .portrait
    }

    @MainActor
    func testWebViewFinishesLoading() throws {
        let app = XCUIApplication()
        app.launch()

        XCTAssertTrue(app.wait(for: .runningForeground, timeout: 10.0))
        let webState = app.staticTexts["volt-web-state"]
        XCTAssertTrue(webState.waitForExistence(timeout: 10.0), "Native WebView state marker did not appear")

        let ready = NSPredicate(format: "label == %@", "ready")
        let expectation = XCTNSPredicateExpectation(predicate: ready, object: webState)
        let result = XCTWaiter.wait(for: [expectation], timeout: 35.0)
        XCTAssertEqual(result, .completed, "The VOLT WebView did not finish loading")
        XCTAssertFalse(app.otherElements["volt-web-error"].exists)

        let webView = app.webViews.firstMatch
        XCTAssertTrue(webView.waitForExistence(timeout: 10.0), "The WKWebView was not exposed to UI automation")

        let webURL = app.staticTexts["volt-web-url"]
        XCTAssertTrue(webURL.waitForExistence(timeout: 10.0), "The WKWebView did not publish its completed navigation URL")
        XCTAssertTrue(webURL.label.hasPrefix("https://"), "The WKWebView did not finish on HTTPS: \(webURL.label)")
        XCTAssertTrue(webURL.label.contains("voltconsumo.com.br"), "The WKWebView finished on an unexpected host: \(webURL.label)")

        let attachment = XCTAttachment(screenshot: app.screenshot())
        attachment.name = "VOLT WebView Ready"
        attachment.lifetime = .keepAlways
        add(attachment)
    }

    @MainActor
    func testEnergyReadingDeepLinkLaunchesAndRoutes() throws {
        let app = XCUIApplication()
        let customURL = try XCTUnwrap(URL(string: "volt://reading/energy"))
        app.open(customURL)

        XCTAssertTrue(app.wait(for: .runningForeground, timeout: 10.0))
        let route = app.staticTexts["volt-native-route"]
        XCTAssertTrue(route.waitForExistence(timeout: 10.0), "Native route marker did not appear")
        XCTAssertEqual(route.label, "reading/energy")

        let dispatchedRoute = app.staticTexts["volt-native-route-dispatched"]
        XCTAssertTrue(dispatchedRoute.waitForExistence(timeout: 40.0), "The energy reading route was not dispatched into the VOLT WebView")
        XCTAssertEqual(dispatchedRoute.label, "reading/energy")

        let webState = app.staticTexts["volt-web-state"]
        XCTAssertTrue(webState.waitForExistence(timeout: 10.0), "Native WebView state marker did not appear after deep link")
        XCTAssertEqual(webState.label, "ready", "The VOLT WebView was not ready after routing the energy deep link")

        let attachment = XCTAttachment(screenshot: app.screenshot())
        attachment.name = "VOLT Energy Reading Deep Link"
        attachment.lifetime = .keepAlways
        add(attachment)
    }
}
