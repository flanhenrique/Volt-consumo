// Compatibility guard for libraries that probe Service Worker APIs inside the
// intentionally opaque-origin OCR sandbox. Reading navigator.serviceWorker in
// such a sandbox may throw before OCR initialization can continue.
//
// Keep this shim dependency-free and loaded before third-party OCR code.
(() => {
  try {
    Object.defineProperty(navigator, "serviceWorker", {
      configurable: true,
      enumerable: false,
      value: undefined
    });
  } catch {
    // If the browser does not allow an own-property override, leave the
    // sandbox untouched. The OCR caller already has a manual-entry fallback.
  }
})();
