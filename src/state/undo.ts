/**
 * Single-slot undo for the four one-tap destructive actions (Surprise,
 * Randomize, Clear, MIDI import). Each of those replaces work in one tap with
 * no way back; "people roll 10x more when rolling is reversible" (ux-ui M1,
 * fun §7.4, ideas 1.2). A snapshot beats a confirmation dialog — it doesn't tax
 * the playful roll loop.
 *
 * The snapshot is the same universal wire string share-links use (encodeState),
 * so restore goes through the exact path a shared link does (decodeState ->
 * loadState). In-memory only, one slot — no persistence, no redo, no ring.
 */
import { atom } from "nanostores";
import { encodeState, decodeState } from "./serialization";
import { patchStore, melodyStore } from "./stores";
import { loadState } from "./engine-control";

/** Label of the action that can currently be undone, or null when none/expired.
 *  The toast component renders off this. */
export const undoLabelStore = atom<string | null>(null);

const WINDOW_MS = 6000;
let snapshot: string | null = null;
let timer = 0;

/**
 * Snapshot the current full instrument state, then show the undo toast for a
 * few seconds. Call this BEFORE running the destructive action.
 */
export function captureUndo(label: string): void {
  snapshot = encodeState(patchStore.get(), melodyStore.get());
  undoLabelStore.set(label);
  clearTimeout(timer);
  timer = window.setTimeout(() => undoLabelStore.set(null), WINDOW_MS);
}

/** Restore the last snapshot (engine + patch + melody + key) and clear the slot. */
export async function performUndo(): Promise<void> {
  const wire = snapshot;
  snapshot = null;
  clearTimeout(timer);
  undoLabelStore.set(null);
  if (!wire) return;
  const state = decodeState(wire);
  if (state) await loadState(state);
}

/** Dismiss the toast without restoring (the window also auto-expires). */
export function dismissUndo(): void {
  clearTimeout(timer);
  undoLabelStore.set(null);
}
