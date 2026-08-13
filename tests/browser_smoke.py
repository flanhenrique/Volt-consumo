from pathlib import Path
import sys
import time

from playwright.sync_api import expect, sync_playwright
from static_server import start_server

ROOT = Path(__file__).resolve().parents[1]
FAKE_SUPABASE = (ROOT / "tests/fixtures/fake-supabase.js").read_text(encoding="utf-8")
BASE_URL = ""


def isolated_context(browser, **kwargs):
    return browser.new_context(service_workers="block", **kwargs)


def install_gates(page, fake_backend=True):
    errors = []
    page.on("console", lambda message: errors.append(f"console.error: {message.text}") if message.type == "error" else None)
    page.on("pageerror", lambda error: errors.append(f"pageerror: {error}"))
    page.add_init_script("""
      window.__voltUnhandled = [];
      window.__voltReadySnapshots = [];
      window.__voltStartupSurfaces = [];
      window.addEventListener('unhandledrejection', event => window.__voltUnhandled.push(String(event.reason)));
      window.addEventListener('volt:startup-status', event => {
        const visible = ['login-screen', 'mfa-screen', 'error-screen', 'dashboard'].filter(id => {
          const element = document.getElementById(id);
          return element && getComputedStyle(element).display !== 'none';
        });
        window.__voltStartupSurfaces.push({ status: event.detail.status, visible });
        if (event.detail.status === 'READY') {
          window.__voltReadySnapshots.push({
            energy: document.getElementById('home-energy-consumption').textContent,
            water: document.getElementById('home-water-consumption').textContent,
            total: document.getElementById('home-total-cost').textContent
          });
        }
      });
    """)
    if fake_backend:
        page.route("**/vendor/supabase/supabase.js*", lambda route: route.fulfill(
            status=200, content_type="application/javascript", body=FAKE_SUPABASE
        ))
    return errors


def assert_clean(page, errors):
    unhandled = page.evaluate("window.__voltUnhandled || []")
    assert errors + unhandled == [], errors + unhandled


def assert_maintenance_removed(page):
    expect(page.locator("#maintenance-screen")).to_have_count(0)


def scenario_signed_out(browser, mobile=False):
    context = isolated_context(browser, viewport={"width": 390, "height": 844} if mobile else {"width": 1440, "height": 1000})
    page = context.new_page()
    errors = install_gates(page)
    page.goto(BASE_URL + "/")
    assert_maintenance_removed(page)
    try:
        expect(page.locator("#login-screen")).to_be_visible()
    except Exception as error:
        diagnostic = page.evaluate("""() => ({
          status: document.documentElement.dataset.startupStatus,
          login: !document.getElementById('login-screen').hidden,
          dashboard: !document.getElementById('dashboard').hidden,
          fatal: document.getElementById('fatal-error-message').textContent
        })""")
        raise AssertionError(f"estado inicial: {diagnostic}; erros: {errors}") from error
    expect(page.locator("#dashboard")).to_be_hidden()
    expect(page.locator("#boot-screen")).to_have_count(0)
    assert_clean(page, errors)
    context.close()


def scenario_login_transition(browser):
    context = isolated_context(browser, viewport={"width": 390, "height": 844})
    page = context.new_page()
    errors = install_gates(page)
    page.goto(BASE_URL + "/?dataDelay=180")
    page.evaluate("""() => {
      window.__voltTransitionSurfaces = [];
      window.addEventListener('volt:startup-status', event => {
        const visible = ['login-screen', 'mfa-screen', 'error-screen', 'dashboard'].filter(id => {
          const element = document.getElementById(id);
          return element && getComputedStyle(element).display !== 'none';
        });
        window.__voltTransitionSurfaces.push({ status: event.detail.status, visible });
      });
    }""")
    page.locator("#login-email").fill("ana@volt.test")
    page.locator("#login-password").fill("senha-segura-123")
    page.locator("#login-submit").click()
    expect(page.locator("#login-screen")).to_be_visible()
    expect(page.locator("#login-progress")).to_be_visible()
    expect(page.locator("#dashboard")).to_be_visible()
    expect(page.locator("#login-screen")).to_be_hidden()
    transitions = page.evaluate("""window.__voltTransitionSurfaces.filter(item =>
      ['LOADING_ACCOUNT', 'LOADING_DATA'].includes(item.status))""")
    assert transitions, "nenhuma transição de carregamento foi observada"
    assert all(item["visible"] == ["login-screen"] for item in transitions), transitions
    assert_clean(page, errors)
    context.close()


def scenario_authenticated(browser):
    context = isolated_context(browser, viewport={"width": 1440, "height": 1000})
    page = context.new_page()
    errors = install_gates(page)
    page.goto(BASE_URL + "/?session=user&dataDelay=180")
    assert_maintenance_removed(page)
    expect(page.locator("#dashboard")).to_be_visible()
    expect(page.locator("#login-screen")).to_be_hidden()
    startup_surfaces = page.evaluate("window.__voltStartupSurfaces")
    loading_surfaces = [item for item in startup_surfaces if item["status"] in ("BOOTING", "RESTORING_SESSION", "LOADING_ACCOUNT", "LOADING_DATA")]
    assert loading_surfaces, startup_surfaces
    assert all(item["visible"] == ["login-screen"] for item in loading_surfaces), loading_surfaces
    expect(page.locator("#greeting")).to_have_text("Olá, Ana Volt!")
    visible = page.evaluate("window.__voltReadySnapshots")
    assert len(visible) == 1, f"READY ocorreu {len(visible)} vezes: {visible}"
    assert all(visible[0].values()), f"READY ocorreu antes de consolidar a Home: {visible}"
    assert page.get_by_text("Tarifas e encargos").count() == 0
    assert page.get_by_text("Organização ativa").count() == 0

    page.get_by_role("button", name="Leituras").click()
    page.get_by_role("button", name="Nova leitura", exact=True).click()
    page.locator("#reading-type").select_option("energy")
    page.locator("#reading-value").fill("1130")
    page.locator("#reading-date").fill("2026-08-10T12:00")
    page.locator("#reading-reviewed").check()
    page.locator("#reading-form").get_by_role("button", name="Confirmar leitura").click()
    expect(page.locator("#reading-dialog")).not_to_have_attribute("open", "")
    page.get_by_role("button", name="Início").click()
    expect(page.locator("#dashboard")).to_be_visible()

    page.get_by_role("button", name="Configurações").click()
    expect(page.locator("#account-email")).to_have_value("ana@volt.test")
    page.locator("#display-name").fill("Ana Persistente")
    page.locator("#account-form").get_by_role("button", name="Salvar nome").click()
    expect(page.locator("#account-message")).to_have_text("Nome atualizado.")
    page.reload()
    expect(page.locator("#dashboard")).to_be_visible()
    expect(page.locator("#greeting")).to_have_text("Olá, Ana Persistente!")

    page.get_by_role("button", name="Relatórios").click()
    expect(page.locator("#page-reports")).to_be_visible()
    expect(page.locator("#page-reports")).to_be_empty()

    page.get_by_role("button", name="Configurações").click()
    page.locator("#logout").click()
    expect(page.locator("#login-screen")).to_be_visible()
    expect(page.locator("#dashboard")).to_be_hidden()
    assert page.evaluate("window.__voltFake.getSession()") is None
    assert_clean(page, errors)
    context.close()


def scenario_mfa(browser):
    context = isolated_context(browser)
    page = context.new_page()
    errors = install_gates(page)
    page.goto(BASE_URL + "/?session=mfa")
    assert_maintenance_removed(page)
    expect(page.locator("#mfa-screen")).to_be_visible()
    expect(page.locator("#dashboard")).to_be_hidden()
    page.locator("#mfa-code").fill("123456")
    page.locator("#mfa-form").get_by_role("button", name="Verificar").click()
    expect(page.locator("#dashboard")).to_be_visible()
    expect(page.locator("#mfa-screen")).to_be_hidden()
    assert_clean(page, errors)
    context.close()


def scenario_admin(browser):
    context = isolated_context(browser)
    page = context.new_page()
    errors = install_gates(page)
    page.goto(BASE_URL + "/?session=admin")
    assert_maintenance_removed(page)
    expect(page.locator("#dashboard")).to_be_visible()
    users = page.get_by_role("button", name="Usuários")
    expect(users).to_be_visible()
    users.click()
    expect(page.locator("#users-list .user-account-item")).to_have_count(3)
    expect(page.locator("#users-total")).to_have_text("3")
    expect(page.locator("#users-confirmed")).to_have_text("2")
    expect(page.locator("#page-users").get_by_text("Organização", exact=False)).to_have_count(0)
    expect(page.get_by_text("ana@example.com")).to_be_visible()
    page.locator("#invite-user").click()
    page.locator("#invite-email").fill("novo@volt.test")
    page.locator("#invite-form").get_by_role("button", name="Criar convite").click()
    expect(page.locator("#invite-message")).to_have_text("Convite criado por 48 horas.")
    page.locator("[data-close-dialog='invite-dialog']").click()
    page.locator("#page-users").evaluate("element => element.dataset.ownershipProbe = 'same-node'")
    page.get_by_role("button", name="Início").click()
    users.click()
    expect(page.locator("#page-users")).to_have_attribute("data-ownership-probe", "same-node")
    expect(page.locator("#users-list .user-account-item")).to_have_count(3)
    assert_clean(page, errors)
    context.close()


def scenario_service_worker(browser):
    context = browser.new_context(service_workers="allow")
    page = context.new_page()
    errors = install_gates(page, fake_backend=False)
    def expect_login(label, timeout=20_000):
        try:
            expect(page.locator("#login-screen")).to_be_visible(timeout=timeout)
        except Exception as error:
            diagnostic = page.evaluate("""async () => ({
              status: document.documentElement.dataset.startupStatus,
              login: !document.getElementById('login-screen').hidden,
              dashboard: !document.getElementById('dashboard').hidden,
              fatal: document.getElementById('fatal-error-message').textContent,
              controller: Boolean(navigator.serviceWorker.controller),
              caches: await caches.keys()
            })""")
            raise AssertionError(f"{label}: {diagnostic}; erros: {errors}") from error
    page.goto(BASE_URL + "/tests/fixtures/sw-harness.html")
    page.evaluate("""async () => {
      await caches.open('volt-app-v1');
      await caches.open('volt-app-v3-liquid-glass');
      await caches.open('another-product-cache');
      await navigator.serviceWorker.register('/sw.js', { scope: '/' });
    }""")
    deadline = time.monotonic() + 30
    while time.monotonic() < deadline:
        if page.evaluate("async () => Boolean((await window.navigator.serviceWorker?.getRegistration())?.active)"):
            break
        page.wait_for_timeout(100)
    else:
        registration_state = page.evaluate("async () => ({ app: document.documentElement.dataset.serviceWorker, appError: document.documentElement.dataset.serviceWorkerError, supported: 'serviceWorker' in navigator, registrations: (await window.navigator.serviceWorker.getRegistrations()).map(registration => ({ scope: registration.scope, installing: registration.installing?.state, waiting: registration.waiting?.state, active: registration.active?.state })) })")
        raise AssertionError(f"Service Worker não ativou: {registration_state}; erros: {errors}")
    assert page.evaluate("async () => (await caches.keys()).sort()") == ["another-product-cache", "volt-app-v4-atomic-20260813.7"]
    page.goto(BASE_URL + "/")
    assert_maintenance_removed(page)
    expect_login("visita controlada")
    assert page.evaluate("() => Boolean(window.navigator.serviceWorker.controller)")
    errors_before_missing_asset = len(errors)
    missing = page.evaluate("""async () => {
      const response = await fetch('/arquivo-ausente.js');
      return { status: response.status, type: response.headers.get('content-type') || '' };
    }""")
    assert missing["status"] == 404
    assert "text/html" not in missing["type"], f"SW entregou HTML como JavaScript: {missing}"
    expected_asset_errors = errors[errors_before_missing_asset:]
    assert all("404" in message and "Failed to load resource" in message for message in expected_asset_errors), expected_asset_errors
    del errors[errors_before_missing_asset:]
    cdp = context.new_cdp_session(page)
    cdp.send("Network.enable")
    cdp.send("Network.setCacheDisabled", {"cacheDisabled": True})
    page.reload()
    expect_login("hard reload")
    cdp.send("Network.setCacheDisabled", {"cacheDisabled": False})
    context.set_offline(True)
    page.reload()
    expect_login("visita offline")
    context.set_offline(False)
    page.wait_for_timeout(500)
    page.reload()
    expect_login("retorno online")
    assert_clean(page, errors)
    context.close()


def scenario_beta_redirect(browser):
    context = isolated_context(browser)
    page = context.new_page()
    errors = install_gates(page)
    page.goto(BASE_URL + "/beta/?session=user", wait_until="commit")
    page.wait_for_url(BASE_URL + "/?session=user")
    assert_maintenance_removed(page)
    expect(page.locator("#dashboard")).to_be_visible()
    assert page.locator("script[type=module]").count() == 1
    assert_clean(page, errors)
    context.close()


def main():
    global BASE_URL
    failures = []
    server, server_thread = start_server(ROOT)
    BASE_URL = f"http://127.0.0.1:{server.server_port}"
    try:
        with sync_playwright() as playwright:
            for browser_name in ("chromium", "webkit"):
                browser_type = getattr(playwright, browser_name)
                try:
                    browser = browser_type.launch()
                except Exception as error:
                    failures.append(f"{browser_name}: navegador indisponível: {error}")
                    continue
                scenarios = [
                    ("deslogado desktop", scenario_signed_out),
                    ("deslogado mobile", lambda item: scenario_signed_out(item, mobile=True)),
                    ("transição Login/Home sem branco", scenario_login_transition),
                    ("sessão/Home/Leituras/Configurações/Relatórios/Logout", scenario_authenticated),
                    ("MFA", scenario_mfa),
                    ("Usuários", scenario_admin),
                    ("compatibilidade /beta", scenario_beta_redirect)
                ]
                if browser_name == "chromium":
                    scenarios.insert(-1, ("Service Worker", scenario_service_worker))
                for label, scenario in scenarios:
                    try:
                        scenario(browser)
                        print(f"PASSOU [{browser_name}] {label}")
                    except Exception as error:
                        failures.append(f"{browser_name} — {label}: {error}")
                browser.close()
    finally:
        server.shutdown()
        server.server_close()
        server_thread.join(timeout=5)
    if failures:
        print("BROWSER GATE: FALHOU")
        for failure in failures:
            print(f"- {failure}")
        return 1
    print("BROWSER GATE: PASSOU")
    return 0


if __name__ == "__main__":
    sys.exit(main())
