/**
 * Shareable patch links. The whole instrument state — engine, model, every
 * knob, and the full melody — round-trips through `location.hash` so a link is
 * a complete, self-contained recreation of what you're hearing. Nothing leaves
 * the browser: the state lives in the URL fragment, which is never sent to a
 * server.
 *
 * Pipeline: stores → `encodeState` (canonical JSON) → lz-string
 * `compressToEncodedURIComponent` (URL-safe, no extra escaping needed) →
 * `#p=…`. Decode reverses it, with `decodeState` defending against anything
 * hand-edited or stale.
 *
 * This is the DOM/runtime half; the pure shape + validation lives in
 * `serialization.ts` (Node-testable, no imports).
 */
import {
  compressToEncodedURIComponent,
  decompressFromEncodedURIComponent,
} from "lz-string";
import { patchStore, melodyStore, engineIdStore } from "./stores";
import { encodeState, decodeState, type SharedState } from "./serialization";

const HASH_KEY = "p";

/** Read + validate a shared patch from the current URL hash, or null if there
 *  isn't one (or it's unreadable). Pure read — does not touch any store. */
export function readSharedState(): SharedState | null {
  const raw = location.hash.startsWith("#") ? location.hash.slice(1) : location.hash;
  if (!raw) return null;
  const blob = new URLSearchParams(raw).get(HASH_KEY);
  if (!blob) return null;
  const json = decompressFromEncodedURIComponent(blob);
  if (!json) return null;
  return decodeState(json);
}

/** Build a full shareable URL from the current store state (does not navigate). */
export function buildShareUrl(): string {
  const json = encodeState(patchStore.get(), melodyStore.get());
  const blob = compressToEncodedURIComponent(json);
  const frag = new URLSearchParams(`${HASH_KEY}=${blob}`);
  return `${location.origin}${location.pathname}#${frag.toString()}`;
}

/**
 * Mint a share URL for the current state, write it into the address bar via
 * `replaceState` (so it's bookmarkable/refreshable without spamming history),
 * and return it for copying.
 */
export function writeShareUrl(): string {
  const url = buildShareUrl();
  history.replaceState(null, "", url);
  return url;
}

/**
 * Apply a decoded shared state to the stores. The engine must already be the
 * one named in `resolvedEngineId` (the caller starts it first). The melody is
 * set with a fresh events array, so the Part rebuilds. Call AFTER
 * installBindings/installPart have seeded.
 *
 * When the state names an engine this build doesn't have (a preset, recent
 * sound or link saved with the retired FM engine, or one from a future build),
 * only the melody carries over. Its model code and knob values belong to the
 * missing engine; laid over the fallback they would put unknown keys in the
 * patch and leave the fallback's own knobs unset. So the fallback keeps the
 * defaults it was just seeded with.
 */
export function applySharedState(state: SharedState, resolvedEngineId: string): void {
  engineIdStore.set(resolvedEngineId);
  if (state.patch.engineId === resolvedEngineId) {
    patchStore.set({ ...state.patch, engineId: resolvedEngineId });
  }
  melodyStore.set(state.melody);
}
