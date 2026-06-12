import { audioEngine } from "../audio/AudioEngine";
import { engineEntryOrDefault } from "../audio/registry";
import { installBindings } from "./bindings";
import { engineIdStore } from "./stores";
import { applySharedState } from "./share-url";
import type { SharedState } from "./serialization";

/**
 * Engine swap orchestration. One place owns the lifecycle of "which engine is
 * live + its store bindings," so both the initial start (TapToStart) and later
 * hot-swaps (EnginePicker) go through the same path.
 *
 * installBindings() returns a dispose() for its store→engine subscription; we
 * must run it before installing the next one, otherwise two subscriptions push
 * to currentEngine and their lastParams caches drift out of sync.
 */
let disposeBindings: (() => void) | null = null;

/**
 * Serializes engine swaps. EnginePicker guards itself, but Surprise, preset/
 * share-link load, and Match-Apply are independent entry points that all call
 * startEngine — two interleaved swaps race useEngine() and the slower init()
 * can win _engine + bindings regardless of click order, disposing the engine
 * the other call just installed. Every swap chains onto this promise so they
 * run strictly one-at-a-time.
 */
let inFlight: Promise<void> = Promise.resolve();

/**
 * Construct the engine for `engineId`, swap it into the AudioEngine (which
 * disposes the previous one + releases its notes), then re-seed the patch store
 * and wire store→engine pushes. The AudioEngine must already be started.
 *
 * The melody, transport, and Part are untouched — they read currentEngine
 * dynamically, so a swap keeps the sequence playing on the new voice.
 *
 * Throws if the engine fails to init (e.g. WASM load) — the caller surfaces it.
 */
export function startEngine(engineId: string): Promise<void> {
  // Chain onto the previous swap (even a failed one) so swaps never overlap.
  const run = inFlight.catch(() => {}).then(() => doSwap(engineId));
  inFlight = run.catch(() => {});   // keep the chain alive after a rejection
  return run;
}

async function doSwap(engineId: string): Promise<void> {
  const entry = engineEntryOrDefault(engineId);
  const engine = entry.createEngine();
  await audioEngine.useEngine(engine);
  disposeBindings?.();
  disposeBindings = installBindings(audioEngine);
}

/**
 * Load a full instrument state (from a preset, or any decoded SharedState) at
 * runtime, hot-swapping the engine first if the state names a different one.
 * `startEngine` re-seeds the patch from the new engine's defaults, so we then
 * overlay the saved patch + melody via applySharedState. The engine id is
 * resolved through the registry, so a state referencing an engine this build
 * lacks falls back to the default cleanly. Audio must already be started.
 */
export async function loadState(state: SharedState): Promise<void> {
  const resolved = engineEntryOrDefault(state.patch.engineId).id;
  if (resolved !== engineIdStore.get()) {
    await startEngine(resolved);
  }
  applySharedState(state, resolved);
}
