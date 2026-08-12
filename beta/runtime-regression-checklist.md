# Runtime regression checklist — Beta

Use before merging performance/cleanup changes.

## Authentication
- Login succeeds with an existing confirmed account.
- Login button returns from `Entrando…` on success and failure.
- Existing session restores without a second visible login cycle.
- `INITIAL_SESSION` does not trigger a second account-data load after `getSession()`.
- `TOKEN_REFRESHED` does not reload the dashboard or account data.
- MFA challenge remains blocking when an enrolled account is still at AAL1.
- Password recovery still opens the recovery dialog and does not initialize the dashboard.

## First render
- Energy and water account queries finish before regional/report modules begin heavy work.
- Only one initial account-data load is issued.
- Focus + `visibilitychange` do not cause duplicate back-to-back account refreshes.
- Hidden screens remain `display:none` and never overlap the active screen.
- Home financial values stay hidden until account data, tariff resolution and cycle context stabilize.
- Home does not show intermediate financial totals before the consolidated value.
- Home does not change layout after deferred modules load.
- Brazil Home labels are not rewritten by the Uruguay renderer.
- Multiple `volt:beta-data` signals in the same frame produce one consolidated render signal.
- Repeated cycle/locality/tariff events with unchanged state do not rewrite the Home DOM.

## Navigation
- Reports modules load only after opening Relatórios.
- Platform users module loads only after opening Usuários.
- Reopening either page does not reload its modules.
- Bottom navigation gets a single indicator.

## Regional
- Brazil tariff resolver only submits settings if resolved values actually changed.
- Uruguay accepts `balnearia` as OSE beach zone.
- Maldonado department code `MA` resolves Maldonado zone for supported cities.
- OSE `residential-exempt` and `verified-excess-only` are treated as verified tax states.
- Sanitation remains separate when the tariff is not fully modeled.

## Cycles
- `separate-cycles.js` does not poll the DOM every 100 ms while waiting for setup UI.
- Cycle UI upgrade occurs once and its observer disconnects after the required elements exist.
- `volt:cycle-context` is emitted only when cycle, period, consumption or estimate changes.
- Saving an unchanged cycle does not update account metadata again.

## Service worker
- v94 installs with all static dependencies required by `app.js` and early `beta-v3.js` imports.
- Versioned `?v=...` shell requests resolve from canonical cache entries while offline.
- Reports/OCR/optional screens are cached on demand, not during install.
- Missing optional assets cannot fail installation of the core shell.
- Non-navigation asset failures never fall back to `index.html`.

## No regressions
- New energy and water readings can be saved.
- Existing readings can be edited/deleted through the supported Beta flows.
- Settings remain persisted.
- Tutorial/onboarding still appears when required.
- Restore Application still logs out and clears local shell state without deleting protected backend readings.
