// Compatibility shim.
//
// Regulatory benefits and annual credits are no longer hardcoded in the browser.
// They are resolved from the versioned Supabase regulatory catalog so a future
// legal/tariff change cannot silently alter historical cycles.
//
// The national ANEEL tariff catalog remains separate in national-energy-catalog.js.

export function findEnergyBillingProfile() {
  return null;
}
