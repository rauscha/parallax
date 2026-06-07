import { audioEngine } from "../audio/AudioEngine";
import { engineEntryOrDefault } from "../audio/registry";
import { installBindings } from "./bindings";

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
 * Construct the engine for `engineId`, swap it into the AudioEngine (which
 * disposes the previous one + releases its notes), then re-seed the patch store
 * and wire store→engine pushes. The AudioEngine must already be started.
 *
 * The melody, transport, and Part are untouched — they read currentEngine
 * dynamically, so a swap keeps the sequence playing on the new voice.
 *
 * Throws if the engine fails to init (e.g. WASM load) — the caller surfaces it.
 */
export async function startEngine(engineId: string): Promise<void> {
  const entry = engineEntryOrDefault(engineId);
  const engine = entry.createEngine();
  await audioEngine.useEngine(engine);
  disposeBindings?.();
  disposeBindings = installBindings(audioEngine);
}
