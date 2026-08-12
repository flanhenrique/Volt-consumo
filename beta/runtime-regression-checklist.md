# Runtime regression checklist — Beta

Use before merging performance/cleanup changes.

## Authentication
- Login succeeds with an existing confirmed account.
- Login button returns from `Entrando…` on success and failure.
- Existing session restores without a second visible login cycle.
- MFA challenge remains blocking when an enrolled account is still at AAL1.
- Password recovery still opens the recovery dialog and does not initialize the dashboard.

## First render
- Energy and water account queries finish before regional/report modules begin heavy work.
- Only one initial account-data load is issued.
- Focus + `visibilitychange` do not cause duplicate back-to-back account refreshes.
- Home does not change layout after deferred modules load.
- Brazil Home labels are not rewritten by the Uruguay renderer.

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

## Service worker
- v93 installs with all static dependencies required by `app.js` and early `beta-v3.js` imports.
- Reports/OCR/optional screens are cached on demand, not during install.
- Missing optional assets cannot fail installation of the core shell.
- Non-navigation asset failures never fall back to `index.html`.

## No regressions
- New energy and water readings can be saved.
- Existing readings can be edited/deleted through the supported Beta flows.
- Settings remain persisted.
- Tutorial/onboarding still appears when required.
- Restore Application still logs out and clears local shell state without deleting protected backend readings.
