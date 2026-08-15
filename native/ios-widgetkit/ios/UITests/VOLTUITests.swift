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

        let attachment = XCTAttachment(screenshot: app.screenshot())
        attachment.name = "VOLT Energy Reading Deep Link"
        attachment.lifetime = .keepAlways
        add(attachment)
    }
}
