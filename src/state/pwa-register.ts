/**
 * Service-worker registration (M5 increment D). Imported dynamically by main.ts
 * in production only, so the `virtual:pwa-register` module (which has no real
 * implementation in dev) and the Workbox runtime stay out of the dev graph and
 * code-split into their own chunk. registerType is 'autoUpdate', so a new build
 * skip-waits and claims clients automatically; we then reload the page so the
 * fresh assets apply on the *first* refresh instead of the second. A one-shot
 * "ready to work offline" confirmation is surfaced via offlineReadyStore.
 */
import { registerSW } from "virtual:pwa-register";
import { offlineReadyStore } from "./pwa";
import { writeShareUrl } from "./share-url";
import { isPlayingStore } from "./stores";

export function registerPwa(): void {
  if ("serviceWorker" in navigator) {
    // When a newly-installed SW activates (autoUpdate → skipWaiting +
    // clientsClaim), it takes control of this page and fires `controllerchange`.
    // Reload once so the page swaps to the new hashed assets immediately.
    // Guards: skip the very first install (no prior controller → there's
    // nothing stale to replace) and never reload more than once.
    const hadController = !!navigator.serviceWorker.controller;
    let reloading = false;

    function reloadForUpdate() {
      if (reloading) return;
      reloading = true;
      // A deploy landing mid-jam would reload the page and lose the melody +
      // patch (they live only in memory). Stamp the full state into the URL hash
      // first — the same wire share-links use — so TapToStart rehydrates it on
      // the refreshed page. (code-quality §3)
      try { writeShareUrl(); } catch { /* best-effort; reload anyway */ }
      window.location.reload();
    }

    navigator.serviceWorker.addEventListener("controllerchange", () => {
      if (reloading || !hadController) return;
      // Don't yank the page out from under an active performance: if the
      // transport is running, defer the reload until it stops.
      if (isPlayingStore.get()) {
        const unsub = isPlayingStore.subscribe((playing) => {
          if (!playing) { unsub(); reloadForUpdate(); }
        });
      } else {
        reloadForUpdate();
      }
    });
  }

  registerSW({
    immediate: true,
    onOfflineReady() {
      offlineReadyStore.set(true);
    },
    onRegisteredSW(_swUrl, registration) {
      // A long-lived/installed tab won't notice a new deploy on its own — poll
      // hourly so an always-open PWA still picks up updates (and then
      // auto-reloads via the controllerchange handler above).
      if (registration) {
        setInterval(() => { void registration.update().catch(() => {}); }, 60 * 60 * 1000);
      }
    },
  });
}
