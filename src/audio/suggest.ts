// Suggestion engine for the "Match a sound" tool. Given the detected features of
// a region (pitch presence, brightness, envelope), rank every model across all
// engines and propose a *starting* patch the user then refines by ear.
//
// Two layers, mirroring sample-analysis.ts:
//   • rankModels(features, catalogue) — the pure, deterministic core (testable);
//     imports only `./sample-analysis` *types*, so it runs under plain node.
//   • suggestPatches(analysis)        — thin browser wrapper that flattens the
//     live ENGINES registry into a catalogue and calls rankModels.
//
// The scoring is deliberately simple and explainable: family fit (driven by
// brightness, whether the region reads as pitched, and its envelope) plus
// keyword hits in the model's own Explain prose. This is a heuristic starting
// point, NOT an optimizer — the dual-spectrum compare + macro knobs are where
// the sound actually gets dialed in.

import { ENGINES } from "./registry";
import type { Brightness, DecayChar, RegionAnalysis } from "./sample-analysis";

/** The subset of a RegionAnalysis the ranker reads (RegionAnalysis satisfies it). */
export interface SuggestFeatures {
  note: string | null;
  confidence: number;
  brightness: Brightness;
  decayChar: DecayChar;
  attackMs: number;
}

/** A model flattened across engines into the minimal shape the ranker needs. */
export interface SuggestModel {
  engineId: string;
  engineName: string;
  index: number;
  code: string;
  name: string;
  family: string;
  description: string;
  listenFor: string;
  goodFor: string;
  /** Ordered macro-knob param ids (e.g. ["timbre","color"]). */
  knobIds: string[];
}

export interface PatchSuggestion {
  engineId: string;
  engineName: string;
  /** Lowercase code — matches the patchStore.modelId convention. */
  modelId: string;
  modelCode: string;
  modelName: string;
  family: string;
  /** One-line "why" drawn from the model's goodFor (or description). */
  why: string;
  score: number;
  /** Starting macro nudges as 0..1 fractions, keyed by param id. Applied over
   *  the engine's defaults at Apply time (mapped into each knob's range). */
  macros: Record<string, number>;
}

// Families that tilt bright / dark. Used only as a gentle nudge — keyword hits
// in the model's own prose do the fine-grained work.
const BRIGHT_FAMS = new Set([
  "fm", "harmonic", "wavetable", "distortion", "chiptune", "formant", "modulation",
]);
const DARK_FAMS = new Set(["analog", "wave", "physical"]);
// Families that are inherently unpitched — a clear detected pitch should steer
// away from these, and a no-pitch (percussive) region toward them.
const UNPITCHED_FAMS = new Set(["drum", "noise"]);

type PitchClass = "pitched" | "percussive" | "ambiguous";
function pitchClassOf(f: SuggestFeatures): PitchClass {
  if (f.note != null && f.confidence >= 0.5) return "pitched";
  if (f.note == null || f.confidence < 0.2) return "percussive";
  return "ambiguous";
}

/** Keyword groups matched against the model's prose; each *group* scores once
 *  (so a verbose description can't run away with the ranking). */
function keywordScore(f: SuggestFeatures, text: string): number {
  const groups: string[][] = [];
  if (f.brightness === "high")
    groups.push(["bright", "buzzy", "harsh", "metallic", "clangorous", "brassy", "edge", "sharp", "aggressive", "gritty"]);
  if (f.brightness === "low")
    groups.push(["warm", "soft", "round", "hollow", "mellow", "smooth", "sine", "dark", "pure"]);
  if (f.decayChar === "plucky")
    groups.push(["pluck", "struck", "string", "percussive", "transient", "stab", "snappy", "decay"]);
  if (f.decayChar === "sustained")
    groups.push(["pad", "sustain", "drone", "hold", "vowel", "lush"]);
  if (f.decayChar === "evolving")
    groups.push(["evolv", "morph", "sweep", "moving", "animated", "living"]);
  if (pitchClassOf(f) === "percussive")
    groups.push(["noise", "noisy", "percussive", "drum", "cymbal", "snare", "hat", "clap"]);

  let s = 0;
  for (const group of groups) {
    if (group.some((kw) => text.includes(kw))) s += 0.6;
  }
  return s;
}

function scoreModel(f: SuggestFeatures, m: SuggestModel): number {
  let s = 0;
  const fam = m.family;
  const pc = pitchClassOf(f);
  const unpitched = UNPITCHED_FAMS.has(fam);

  // 1) Pitched vs percussive — the strongest gate.
  if (pc === "pitched") s += unpitched ? -5 : 1.5;
  else if (pc === "percussive") s += unpitched ? 4 : -2;
  // "ambiguous" gives no push either way.

  // 2) Brightness → family tilt.
  if (f.brightness === "high") {
    if (BRIGHT_FAMS.has(fam)) s += 2.5;
    else if (DARK_FAMS.has(fam)) s -= 1;
  } else if (f.brightness === "low") {
    if (DARK_FAMS.has(fam)) s += 2.5;
    else if (BRIGHT_FAMS.has(fam)) s -= 1.5;
  } else {
    // medium — mild preference for the middle-ground families.
    if (fam === "analog" || fam === "harmonic" || fam === "wavetable" || fam === "wave") s += 1;
  }

  // 3) Envelope → family tilt.
  if (f.decayChar === "plucky") {
    if (fam === "physical") s += 2;
    else if (fam === "drum") s += 1.5;
    else if (fam === "wavetable" || fam === "granular") s += 0.5;
  } else if (f.decayChar === "sustained") {
    if (fam === "analog" || fam === "harmonic" || fam === "formant" || fam === "wave") s += 1.5;
    else if (fam === "drum") s -= 3; // drums can't hold a sustain
    else if (fam === "physical") s -= 0.5;
  } else {
    // evolving
    if (fam === "wavetable" || fam === "granular") s += 1.5;
    else if (fam === "fm" || fam === "distortion") s += 1;
  }
  if (f.attackMs <= 5 && (fam === "drum" || fam === "physical")) s += 0.5;

  // 4) Keyword hits in the model's own Explain prose.
  s += keywordScore(f, `${m.description} ${m.listenFor} ${m.goodFor}`.toLowerCase());

  return s;
}

/** Starting macro fractions (0..1) from brightness. The first knob is, in most
 *  engines, the main timbre/harmonics control (more ≈ brighter); the second is a
 *  gentler tone nudge in the same direction. Just a launch point — the user
 *  refines by ear, so the moves are intentionally modest. */
function macroTargets(f: SuggestFeatures, knobIds: string[]): Record<string, number> {
  const out: Record<string, number> = {};
  if (knobIds.length === 0) return out;
  out[knobIds[0]] = f.brightness === "high" ? 0.68 : f.brightness === "low" ? 0.33 : 0.5;
  if (knobIds[1]) {
    out[knobIds[1]] = f.brightness === "high" ? 0.6 : f.brightness === "low" ? 0.4 : 0.5;
  }
  return out;
}

/**
 * Rank a catalogue of models against the detected features. Pure + deterministic
 * — ties break on catalogue (registry) order so results are stable. The browser
 * wrapper below feeds it the live registry; tests feed it a hand-built catalogue.
 */
export function rankModels(
  f: SuggestFeatures,
  catalogue: SuggestModel[],
): PatchSuggestion[] {
  const scored = catalogue.map((m, i) => ({ m, i, score: scoreModel(f, m) }));
  scored.sort((a, b) => b.score - a.score || a.i - b.i);
  return scored.map(({ m, score }) => ({
    engineId: m.engineId,
    engineName: m.engineName,
    modelId: m.code.toLowerCase(),
    modelCode: m.code,
    modelName: m.name,
    family: m.family,
    why: (m.goodFor || m.description || "").trim(),
    score,
    macros: macroTargets(f, m.knobIds),
  }));
}

/** Flatten the live ENGINES registry into the ranker's catalogue shape. */
function buildCatalogue(): SuggestModel[] {
  const out: SuggestModel[] = [];
  for (const eng of ENGINES) {
    for (const m of eng.models) {
      out.push({
        engineId: eng.id,
        engineName: eng.name,
        index: m.index,
        code: m.code,
        name: m.name,
        family: m.family,
        description: m.description,
        listenFor: m.detail?.listenFor ?? "",
        goodFor: m.detail?.goodFor ?? "",
        knobIds: m.knobs.map((k) => k.id),
      });
    }
  }
  return out;
}

/**
 * Browser-facing entry: rank every model across all engines for the detected
 * region features and return the top `limit` suggestions. A RegionAnalysis
 * structurally satisfies SuggestFeatures, so callers pass it straight through.
 */
export function suggestPatches(analysis: RegionAnalysis, limit = 4): PatchSuggestion[] {
  return rankModels(analysis, buildCatalogue()).slice(0, limit);
}
