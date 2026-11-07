/**
 * Engine registry — the single place that knows which synth engines exist,
 * how to construct them, and what their model catalogues are.
 *
 * Everything multi-engine flows through here: the engine picker enumerates
 * ENGINES; TapToStart / EnginePicker call createEngine(); ModelPicker and
 * ExplainPanel read models/families for the *active* engine id; bindings.ts
 * maps modelId ↔ engine index per engine.
 *
 * Adapter pattern: the original Braids catalogue (data/braids-models.ts) keeps
 * its own hand-authored shape untouched — we map it into the generic
 * EngineModel here. New engines (Plaits) author their data directly as
 * EngineModel[] and register below.
 */
import type { ISynthEngine, EngineModel, EngineFamily } from "./types";
import { BraidsEngine } from "./engines/BraidsEngine";
import { PlaitsEngine } from "./engines/PlaitsEngine";
import { LaxsynthEngine } from "./engines/LaxsynthEngine";
import { RingsEngine } from "./engines/RingsEngine";
import { BRAIDS_MODELS, BRAIDS_FAMILIES } from "../data/braids-models";
import { PLAITS_MODELS, PLAITS_FAMILIES } from "../data/plaits-models";
import { LAXSYNTH_MODELS, LAXSYNTH_FAMILIES } from "../data/laxsynth-models";
import { RINGS_MODELS, RINGS_FAMILIES } from "../data/rings-models";

export interface EngineRegistryEntry {
  id: string;
  name: string;
  /** Construct a fresh engine instance. Caller inits + swaps it in. */
  createEngine: () => ISynthEngine;
  /** Discrete model axis, in engine-index order. Empty if not enumerable. */
  models: EngineModel[];
  /** Family groupings for the model picker. */
  families: EngineFamily[];
}

// --- Braids: adapt the hand-authored catalogue into the generic shape. -------
// TIMBRE/COLOR become the two per-model knob cards.
const BRAIDS_ENGINE_MODELS: EngineModel[] = BRAIDS_MODELS.map((m) => ({
  index: m.index,
  code: m.code,
  name: m.name,
  family: m.family,
  description: m.description,
  knobs: [
    { id: "timbre", label: "Timbre", text: m.timbre },
    { id: "color", label: "Color", text: m.color },
  ],
  detail: m.detail,
}));

export const DEFAULT_ENGINE_ID = "braids";

export const ENGINES: EngineRegistryEntry[] = [
  {
    id: "braids",
    name: "Braids",
    createEngine: () => new BraidsEngine(),
    models: BRAIDS_ENGINE_MODELS,
    families: BRAIDS_FAMILIES,
  },
  {
    // Plaits authors its catalogue directly in the generic EngineModel shape
    // (data/plaits-models.ts) — no adapter needed.
    id: "plaits",
    name: "Plaits",
    createEngine: () => new PlaitsEngine(),
    models: PLAITS_MODELS,
    families: PLAITS_FAMILIES,
  },
  {
    // Laxsynth (our original WavSynth-style engine) authors its catalogue
    // directly as EngineModel[] too — no adapter needed.
    id: "laxsynth",
    name: "Laxsynth",
    createEngine: () => new LaxsynthEngine(),
    models: LAXSYNTH_MODELS,
    families: LAXSYNTH_FAMILIES,
  },
  {
    // Rings (resonator) authors its catalogue directly as EngineModel[] too.
    id: "rings",
    name: "Rings",
    createEngine: () => new RingsEngine(),
    models: RINGS_MODELS,
    families: RINGS_FAMILIES,
  },
];

export function getEngineEntry(id: string): EngineRegistryEntry | undefined {
  return ENGINES.find((e) => e.id === id);
}

/** Resolve an engine entry, falling back to the default so callers never crash
 *  on an unknown/stale engine id (e.g. a share-URL from a future build). */
export function engineEntryOrDefault(id: string): EngineRegistryEntry {
  return getEngineEntry(id) ?? getEngineEntry(DEFAULT_ENGINE_ID) ?? ENGINES[0];
}

/** modelId (lowercase code) → engine index, for the active engine. -1 if none. */
export function indexForCode(engineId: string, code: string): number {
  const models = getEngineEntry(engineId)?.models ?? [];
  const lower = code.toLowerCase();
  return models.findIndex((m) => m.code.toLowerCase() === lower);
}

/** engine index → modelId (lowercase code), for the active engine. */
export function codeForIndex(engineId: string, index: number): string | null {
  return getEngineEntry(engineId)?.models[index]?.code.toLowerCase() ?? null;
}
