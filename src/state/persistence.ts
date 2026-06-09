/**
 * Local preset library (M5). Saves named snapshots of the full instrument
 * state — engine, model, knobs, melody — to IndexedDB via idb-keyval, so they
 * survive reloads and live entirely on the user's machine (nothing is ever
 * uploaded). Each preset stores the same compact wire string the share-URLs
 * use (`encodeState`), so saving, sharing, and loading all share one format
 * and one defensive decode.
 *
 * Presets are keyed by name: saving under an existing name updates it. The
 * UI lists existing names so the user can avoid an accidental clobber.
 */
import { get, set, del, entries, createStore } from "idb-keyval";
import { patchStore, melodyStore } from "./stores";
import { encodeState, decodeState, type SharedState } from "./serialization";

// Own IndexedDB database + object store, namespaced away from anything else.
const presetStore = createStore("parallax-presets", "items");

const STORED_VERSION = 1;

/** Lightweight row for the preset list — avoids decoding every wire blob. */
export interface PresetSummary {
  name: string;
  savedAt: number; // epoch ms
  engineId: string;
  modelId: string | null;
}

interface StoredPreset extends PresetSummary {
  v: number;
  wire: string; // encodeState(patch, melody)
}

/** Save the current patch + melody under `name` (trims; rejects empty). */
export async function savePreset(name: string): Promise<void> {
  const trimmed = name.trim();
  if (!trimmed) throw new Error("Preset name required");
  const patch = patchStore.get();
  const record: StoredPreset = {
    v: STORED_VERSION,
    name: trimmed,
    savedAt: Date.now(),
    engineId: patch.engineId,
    modelId: patch.modelId,
    wire: encodeState(patch, melodyStore.get()),
  };
  await set(trimmed, record, presetStore);
}

/** All saved presets as summaries, newest first. Skips any corrupt rows. */
export async function listPresets(): Promise<PresetSummary[]> {
  const all = await entries<string, StoredPreset>(presetStore);
  return all
    .map(([, v]) => v)
    .filter((v): v is StoredPreset => !!v && typeof v === "object" && typeof v.name === "string")
    .map((v) => ({
      name: v.name,
      savedAt: typeof v.savedAt === "number" ? v.savedAt : 0,
      engineId: v.engineId,
      modelId: v.modelId ?? null,
    }))
    .sort((a, b) => b.savedAt - a.savedAt);
}

/** Decode a saved preset to applyable state, or null if missing/corrupt. */
export async function loadPreset(name: string): Promise<SharedState | null> {
  const record = await get<StoredPreset>(name, presetStore);
  if (!record?.wire) return null;
  return decodeState(record.wire);
}

/** Does a preset with this name already exist? (clobber-warning in the UI). */
export async function presetExists(name: string): Promise<boolean> {
  return (await get<StoredPreset>(name.trim(), presetStore)) != null;
}

/** Remove a saved preset. No-op if it doesn't exist. */
export async function deletePreset(name: string): Promise<void> {
  await del(name, presetStore);
}
