/**
 * Service-worker registration (M5 increment D). Imported dynamically by main.ts
 * in production only, so the `virtual:pwa-register` module (which has no real
 * implementation in dev) and the Workbox runtime stay out of the dev graph and
 * code-split into their own chunk. registerType is 'autoUpdate', so new builds
 * apply on the next load with no prompt; we surface only a one-shot "ready to
 * work offline" confirmation via offlineReadyStore.
 */
import { registerSW } from "virtual:pwa-register";
import { offlineReadyStore } from "./pwa";

export function registerPwa(): void {
  registerSW({
    immediate: true,
    onOfflineReady() {
      offlineReadyStore.set(true);
    },
  });
}
