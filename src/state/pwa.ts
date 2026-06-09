/**
 * PWA status store (M5 increment D). Just the reactive flag the UI watches —
 * the actual service-worker registration lives in `pwa-register.ts`, which is
 * dynamically imported in production only. Keeping the store separate means a
 * component (PwaToast) can import it statically without dragging the Workbox
 * register (and the dev-absent `virtual:pwa-register` module) into the graph.
 */
import { atom } from "nanostores";

/** Flips true once the app has been fully precached and works offline. Drives
 *  a transient confirmation toast; never persisted. */
export const offlineReadyStore = atom<boolean>(false);
