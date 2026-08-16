# VOLT Android Widgets

Companion Android shell for the VOLT PWA plus home-screen App Widgets built with Kotlin and Jetpack Glance.

## Included widgets

- **VOLT Energia** — consumption, target, projection and estimated cost.
- **VOLT Água** — consumption, target, projection and estimated cost.
- **VOLT Resumo** — energy + water + total estimate; responsive from medium to large.
- **VOLT + Leitura** — compact chooser and direct shortcuts for `Leitura de luz` and `Leitura de água`.

All widgets are resizable. The layout reacts to the launcher-provided size using `SizeMode.Responsive`.

## Data flow

1. `MainActivity` loads `https://www.voltconsumo.com.br/` inside a restricted HTTPS WebView.
2. `WebViewCompat.addWebMessageListener` exposes `voltAndroidWidget` only to the exact VOLT origin.
3. `src/volt-widget-bridge.js` builds the same schema-v1 widget snapshot used by the native widget layer.
4. Android persists only the widget snapshot in app-private `SharedPreferences`.
5. Widget receivers are explicitly refreshed after snapshot changes.
6. Logout sends `{ command: "clear" }`, removes the local snapshot and refreshes all widgets.

No Supabase access token, refresh token or password is written into widget storage.

## Routes

- `volt://home`
- `volt://consumption/energy`
- `volt://consumption/water`
- `volt://reading`
- `volt://reading/energy`
- `volt://reading/water`

The direct reading routes reuse the existing VOLT reading wizard rather than creating a second data-entry path.

## Build

The project is a standalone Gradle build under `native/android-widgets`.

```bash
gradle -p native/android-widgets :app:testDebugUnitTest :app:lintDebug :app:assembleDebug
```

Build baseline:

- AGP 9.3.0
- Gradle 9.5.0
- JDK 17
- compileSdk / targetSdk 37
- minSdk 24
- Jetpack Glance 1.1.1
- AndroidX WebKit 1.16.0

## CI gate

`.github/workflows/android-widgets-gate.yml` runs unit tests, JavaScript snapshot/route tests, lint, APK assembly, manifest verification, an Android emulator smoke test, the real VOLT WebView, and `volt://reading/energy`.

The workflow uploads the debug APK and emulator evidence as artifacts. It does not publish to Google Play.
