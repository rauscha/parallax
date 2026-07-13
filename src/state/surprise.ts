/**
 * "Surprise me" — roll a whole coherent instrument in one tap: a random engine
 * (which also flips the theme), a random model, musically-clamped random params,
 * and a fresh in-key melody. Orchestrates the same stores the UI writes to, so
 * the bindings push everything to the live engine exactly as a manual edit would.
 */
import type { ParameterDescriptor } from "../audio/types";
import { ENGINES, getEngineEntry } from "../audio/registry";
import { audioEngine } from "../audio/AudioEngine";
import { startEngine } from "./engine-control";
import { patchStore, melodyStore, engineIdStore } from "./stores";
import { gridBaseOctaveStore } from "../notation/editorMode";
import { randomizeMelody } from "../notation/grid";
import { captureUndo } from "./undo";
import { recordSound } from "./lineage";

const KEYS = ["C", "Db", "D", "Eb", "E", "F", "F#", "G", "Ab", "A", "Bb", "B"];
const SCALES = ["major", "minor", "pentatonic"] as const;

function pick<T>(a: readonly T[]): T {
  return a[Math.floor(Math.random() * a.length)];
}
function rand(min: number, max: number): number {
  return min + Math.random() * (max - min);
}

/** A random value for one param, with clamps that keep the patch playable. */
function randomParamValue(d: ParameterDescriptor): number {
  const span = d.max - d.min;
  const id = d.id.toLowerCase();

  // Output level: never silent, never blasting.
  if (id.includes("gain") || id.includes("level") || id.includes("volume")) {
    return +rand(Math.max(d.min, 0.3), Math.min(d.max, 0.6)).toFixed(4);
  }

  let v: number;
  if (d.step && d.step >= 1) {
    const steps = Math.round(span / d.step);
    v = d.min + Math.floor(Math.random() * (steps + 1)) * d.step;
  } else {
    v = rand(d.min, d.max);
  }

  // Tame the params that get unpleasant at their extremes so a roll stays fun.
  if (id === "attack") v = Math.min(v, d.min + span * 0.3);
  if (id === "release") v = Math.min(v, d.min + span * 0.6);
  if (id === "drift" || id === "signature") v = Math.min(v, d.min + span * 0.5);
  if (id === "damping") v = Math.min(v, d.min + span * 0.85);   // Rings: full damping ≈ endless ring — keep rolls finite

  return +v.toFixed(4);
}

/**
 * Roll the instrument. `swapEngine` (default true) may switch to a different
 * engine — which also changes the theme. Set false to keep the current voice.
 * Audio must already be started.
 */
export async function surpriseMe(opts: { swapEngine?: boolean } = {}): Promise<void> {
  const swapEngine = opts.swapEngine ?? true;

  // Snapshot the current instrument first so one tap is reversible.
  captureUndo("New instrument rolled");
  recordSound("surprise");   // ...and add it to the persistent Recent-sounds trail

  if (swapEngine && ENGINES.length > 1) {
    const others = ENGINES.filter((e) => e.id !== engineIdStore.get());
    const next = pick(others);
    await startEngine(next.id);   // re-seeds patch defaults + flips the theme
  }

  const entry = getEngineEntry(engineIdStore.get());
  const eng = audioEngine.currentEngine;
  if (!entry || !eng) return;

  // Model
  if (entry.models.length) {
    patchStore.setKey("modelId", pick(entry.models).code.toLowerCase());
  }

  // Params
  const params = { ...patchStore.get().params };
  for (const d of eng.getParameterSchema()) {
    if (d.id === "model") continue;   // owned by modelId, not a knob
    params[d.id] = randomParamValue(d);
  }
  patchStore.setKey("params", params);

  // Melody — a new key/scale and an in-key line over two octaves.
  const key = pick(KEYS);
  const scale = pick(SCALES);
  const events = randomizeMelody(key, scale, gridBaseOctaveStore.get(), 2);
  melodyStore.set({ ...melodyStore.get(), key, scale, events });
}
