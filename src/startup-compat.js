(() => {
  const navigatorObject = globalThis.navigator;
  const lockManager = navigatorObject?.locks;
  if (!navigatorObject || !lockManager?.request) return;

  const passthroughRequest = async (name, options, callback) => {
    const handler = typeof options === "function" ? options : callback;
    if (typeof handler !== "function") throw new TypeError("Lock callback ausente.");
    const mode = typeof options === "object" && options?.mode ? options.mode : "exclusive";
    return handler({ name: String(name || "volt-auth"), mode });
  };

  const replacement = {
    request: passthroughRequest,
    query: async () => ({ held: [], pending: [] })
  };

  try {
    Object.defineProperty(navigatorObject, "locks", {
      configurable: true,
      enumerable: true,
      value: replacement
    });
    document.documentElement.dataset.authLock = "compat";
    return;
  } catch {
    // Alguns WebKit não permitem propriedade própria em navigator.
  }

  try {
    Object.defineProperty(Object.getPrototypeOf(lockManager), "request", {
      configurable: true,
      writable: true,
      value: passthroughRequest
    });
    document.documentElement.dataset.authLock = "compat-prototype";
  } catch {
    document.documentElement.dataset.authLock = "native";
  }
})();
