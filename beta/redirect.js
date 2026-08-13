const destination = new URL("../", location.href);
destination.search = location.search;
destination.hash = location.hash;

if ("serviceWorker" in navigator) {
  navigator.serviceWorker.getRegistrations()
    .then((registrations) => Promise.all(registrations
      .filter((registration) => new URL(registration.scope).pathname.endsWith("/beta/"))
      .map((registration) => registration.unregister())))
    .finally(() => location.replace(destination));
} else {
  location.replace(destination);
}
