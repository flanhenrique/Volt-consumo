from pathlib import Path

from playwright.sync_api import expect, sync_playwright

from static_server import start_server


ROOT = Path(__file__).resolve().parents[1]
OUTPUT = ROOT / "test-results" / "current-visual-audit"
FAKE_SUPABASE = (ROOT / "tests/fixtures/fake-supabase.js").read_text(encoding="utf-8")


def prepare(page):
    errors = []
    page.on("console", lambda message: errors.append(f"console.error: {message.text}") if message.type == "error" else None)
    page.on("pageerror", lambda error: errors.append(f"pageerror: {error}"))
    page.route("**/vendor/supabase/supabase.js*", lambda route: route.fulfill(
        status=200, content_type="application/javascript", body=FAKE_SUPABASE
    ))
    return errors


def assert_maintenance_removed(page):
    expect(page.locator("#maintenance-screen")).to_have_count(0)


def capture(browser, base_url, name, viewport, url, navigate=None, theme="dark"):
    context = browser.new_context(viewport=viewport, service_workers="block")
    page = context.new_page()
    errors = prepare(page)
    page.add_init_script(f"localStorage.setItem('volt-theme', {theme!r})")
    page.goto(base_url + url)
    assert_maintenance_removed(page)
    expect(page.locator("#dashboard")).to_be_visible()
    if navigate:
        direct = page.locator(f'[data-nav="{navigate}"]:visible').first
        if direct.count():
            direct.click()
        else:
            page.locator("[data-action='open-more']:visible").click()
            page.locator(f'#more-dialog [data-nav="{navigate}"]:visible').click()
        expect(page.locator(f"#page-{navigate}")).to_be_visible()
    assert page.evaluate("document.documentElement.scrollWidth <= document.documentElement.clientWidth + 1")
    page.screenshot(path=OUTPUT / f"{name}.png", full_page=True)
    assert errors == [], errors
    context.close()


def main():
    OUTPUT.mkdir(parents=True, exist_ok=True)
    server, thread = start_server(ROOT)
    base_url = f"http://127.0.0.1:{server.server_address[1]}"
    try:
        with sync_playwright() as playwright:
            browser = playwright.chromium.launch()
            capture(browser, base_url, "home-desktop-dark", {"width": 1440, "height": 900}, "/?session=user")
            capture(browser, base_url, "home-mobile-dark", {"width": 390, "height": 844}, "/?session=user")
            capture(browser, base_url, "users-desktop-dark", {"width": 1440, "height": 900}, "/?session=admin", "users")
            capture(browser, base_url, "users-mobile-dark", {"width": 390, "height": 844}, "/?session=admin", "users")
            browser.close()
    finally:
        server.shutdown()
        server.server_close()
        thread.join(timeout=3)
    print(f"VISUAL AUDIT: PASSOU ({OUTPUT})")


if __name__ == "__main__":
    main()
