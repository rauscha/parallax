/**
 * Patch-lineage ("Recent sounds") — the in-memory source of truth + persistence
 * and the capture/restore API. Impure shell over the pure ring logic in
 * `lineage-core.ts`; mirrors `persistence.ts` (own idb-keyval namespace, every idb
 * access wrapped so a private-mode / disabled IndexedDB degrades to in-memory and
 * never throws into the UI).
 *
 * Captures the OUTGOING sound on the two generative actions (Surprise roll, Match
 * Apply) and on a restore, so the list is a short trail you can step back through —
 * persistently, across reloads. Strictly additive: the existing single-slot undo
 * toast (`undo.ts`) and all melody actions are untouched.
 */
import { atom } from "nanostores";
import { get, set, del, createStore } from "idb-keyval";
import { patchStore, melodyStore } from "./stores";
import { decodeState } from "./serialization";
import { loadState } from "./engine-control";
import {
  buildEntry,
  pushSnapshot,
  mergeRing,
  isValidEntry,
  type LineageEntry,
  type LineageSource,
} from "./lineage-core";

/** The UI renders off this. The currently-live sound is NOT in it. */
export const lineageStore = atom<LineageEntry[]>([]);

// Own IndexedDB database + object store, namespaced away from presets.
const lineageDb = createStore("parallax-lineage", "items");
const RING_KEY = "ring";
const STORED_VERSION = 1;

interface StoredRing {
  v: number;
  entries: LineageEntry[];
}

/**
 * Fire-and-forget persist — the UI always reads the in-memory atom, so a slow or
 * failed idb write never blocks the list updating.
 */
async function persist(entries: LineageEntry[]): Promise<void> {
  try {
    await set(RING_KEY, { v: STORED_VERSION, entries } satisfies StoredRing, lineageDb);
  } catch {
    /* IndexedDB unavailable (private mode / disabled) → in-memory only. */
  }
}

/**
 * Snapshot the CURRENT patch + melody as the outgoing sound and push it onto the
 * ring. Call this BEFORE the generative action replaces state. `source` drives the
 * row glyph. Dedups against the head (a no-op re-roll won't churn the list).
 */
export function recordSound(source: LineageSource): void {
  const entry = buildEntry(patchStore.get(), melodyStore.get(), source, Date.now());
  const next = pushSnapshot(lineageStore.get(), entry);
  if (next === lineageStore.get()) return;   // dedup no-op (same reference)
  lineageStore.set(next);
  void persist(next);
}

/**
 * Step back to a recent sound. Records the current outgoing sound first (so the
 * step is itself reversible), then restores via the proven decode → loadState path
 * presets/share-links use (hot-swaps the engine + theme if it differs). Returns
 * false if the snapshot can't be decoded (corrupt/foreign) so the caller can
 * surface an inline message; never throws on a bad blob.
 */
export async function restoreSound(entry: LineageEntry): Promise<boolean> {
  const state = decodeState(entry.wire);
  if (!state) return false;
  recordSound("restore");          // capture the outgoing sound before we leave it
  await loadState(state);
  return true;
}

/** Empty the trail (memory + persisted key). */
export async function clearLineage(): Promise<void> {
  lineageStore.set([]);
  try {
    await del(RING_KEY, lineageDb);
  } catch {
    /* idb unavailable — the in-memory clear above is what the UI shows anyway. */
  }
}

/**
 * Load the persisted ring into `lineageStore` once on boot. Merge rule: any entry
 * captured before this resolves stays newest; persisted entries append after, then
 * dedup + cap — so an early roll isn't clobbered. Degrades silently if idb is
 * unavailable.
 */
export async function hydrateLineage(): Promise<void> {
  let persisted: LineageEntry[] = [];
  try {
    const stored = await get<StoredRing>(RING_KEY, lineageDb);
    if (stored && stored.v === STORED_VERSION && Array.isArray(stored.entries)) {
      persisted = stored.entries.filter(isValidEntry);
    }
  } catch {
    /* idb unavailable → keep whatever's in memory. */
  }
  lineageStore.set(mergeRing(lineageStore.get(), persisted));
}
