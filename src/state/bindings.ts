import type { AudioEngine } from "../audio/AudioEngine";
import { patchStore, engineIdStore } from "./stores";
import { BRAIDS_MODELS } from "../data/braids-models";

/**
 * Wire the central stores to the live audio engine. After this runs, the
 * patchStore is the source of truth: UI reads/writes the store, and the
 * binding pushes changes downward to the engine. The engine never writes
 * back to the store — that would create a feedback loop.
 *
 * Call once after audioEngine.useEngine(...) succeeds, before flipping
 * audioReadyStore — subscribers (ModelPicker, ParamPanel) snapshot the
 * seeded values the moment they react to `ready`.
 *
 * Returns a dispose() the caller should run before useEngine() is called
 * a second time (M6 hot-swap territory).
 */
export function installBindings(audioEngine: AudioEngine): () => void {
  const eng = audioEngine.currentEngine;
  if (!eng) throw new Error("installBindings: no current engine — call useEngine() first.");

  // Snapshot the engine's defaults into the store. This is the only direction
  // the store ever reads from the engine; from here on out it flows downward.
  const schema = eng.getParameterSchema();
  const seedParams: Record<string, number> = {};
  for (const s of schema) {
    if (s.id === "model") continue;        // modelId lives on its own field
    seedParams[s.id] = eng.getParameter(s.id);
  }

  // For Braids, the constructor defaults to model index 0 (CSAW). Future
  // engines that aren't modelEnumerable get modelId: null.
  const initialModelId = eng.manifest.capabilities.modelEnumerable
    ? codeForIndex(0)
    : null;

  patchStore.set({
    version: 1,
    engineId: eng.manifest.id,
    modelId: initialModelId,
    params: seedParams,
  });
  engineIdStore.set(eng.manifest.id);

  // Track last-applied values so we only push *changed* keys to the engine.
  // Avoids redundant setParameter calls when an unrelated field on the patch
  // (engineId, modelId, etc.) is what actually changed.
  const lastParams: Record<string, number> = { ...seedParams };
  let lastModelId: string | null = initialModelId;

  const unsubPatch = patchStore.subscribe((p) => {
    for (const [id, v] of Object.entries(p.params)) {
      if (lastParams[id] !== v) {
        audioEngine.currentEngine?.setParameter(id, v);
        lastParams[id] = v;
      }
    }
    if (p.modelId !== lastModelId) {
      lastModelId = p.modelId;
      if (p.modelId) {
        const idx = indexForCode(p.modelId);
        // Route via the standard parameter API so we don't import engine-specific
        // types here — BraidsEngine.setParameter("model", idx) delegates to setShape.
        if (idx >= 0) audioEngine.currentEngine?.setParameter("model", idx);
      }
    }
  });

  return () => { unsubPatch(); };
}

function codeForIndex(idx: number): string | null {
  return BRAIDS_MODELS[idx]?.code.toLowerCase() ?? null;
}

function indexForCode(code: string): number {
  const lower = code.toLowerCase();
  return BRAIDS_MODELS.findIndex((m) => m.code.toLowerCase() === lower);
}
