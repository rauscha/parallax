/**
 * ISynthEngine — every audio source (Braids, future Plaits, sampler, even
 * a Web-MIDI-out passthrough) implements this surface. Notes are MIDI numbers;
 * each engine privately converts to Hz.
 *
 * This file is hot-path-adjacent: keep it pure TS, framework-free.
 */

export type MidiNote = number;            // 0..127
export type Seconds = number;
export type NormalizedValue = number;     // 0..1 unless the descriptor says otherwise

/** Capability flags so the UI can show/hide features without engine-specific checks. */
export interface EngineCapabilities {
  polyphony: number;                      // 1 = monophonic; Braids = 1
  producesAudio: boolean;                 // false for the future MIDI-out engine
  supportsPitchBend: boolean;
  supportsGlide: boolean;
  modelEnumerable: boolean;               // true if the engine has a discrete "model/preset" axis
}

export interface EngineManifest {
  id: string;                             // e.g. "braids", "plaits", "test-tone"
  name: string;                           // human-readable
  description: string;
  capabilities: EngineCapabilities;
}

/**
 * A parameter the engine exposes. The UI auto-generates controls from these,
 * and the explain panel reads them with a *context* (e.g. current Braids model)
 * to pull per-model meanings.
 */
export interface ParameterDescriptor {
  id: string;
  label: string;                          // base label; describe(ctx) may override
  group: string;                          // "pitch" | "timbre" | "envelope" | "lofi" | ...
  type: "continuous" | "discrete" | "boolean";
  min: number;
  max: number;
  step?: number;
  default: number;
  unit?: string;
  /** Pretty-print a value (e.g. "440 Hz", "12.7 ms"). */
  format?: (v: number) => string;
  /** Context-free description, used as fallback. */
  description?: string;
  /** Context-aware label/description — Braids overrides this so TIMBRE/COLOR
   *  rewrite themselves per model. */
  describe?: (ctx: unknown) => { label?: string; description?: string };
  /** How the engine receives the value. */
  apply: "audioparam" | "message";
}

export interface NoteOnOpts { velocity?: NormalizedValue; time?: Seconds; }
export interface NoteOffOpts { time?: Seconds; }

/**
 * Generic, engine-agnostic model metadata for the picker + Explain panel.
 *
 * Each engine that has a discrete "model" axis exposes its catalogue as
 * EngineModel[] (via the registry). This is a superset of the original
 * Braids-specific shape: the per-model macro-knob meanings live in `knobs`
 * (Braids = TIMBRE/COLOR, Plaits = HARMONICS/TIMBRE/MORPH), so the Explain
 * panel renders one card per knob without knowing which engine it's looking at.
 */
export interface EngineKnobMeaning {
  /** Parameter id this card describes — must match a getParameterSchema() id
   *  so the knob ↔ card highlight (activeParamStore) links up. */
  id: string;
  /** Short display label, e.g. "Timbre", "Harmonics", "Morph". */
  label: string;
  /** What this knob does *in this model*. The whole reason the app exists. */
  text: string;
}

export interface EngineModel {
  /** Firmware/engine enum index. Goes into setParameter("model", index). */
  index: number;
  /** Short hardware-style display code, e.g. "CSAW", "VA". */
  code: string;
  /** Display name in plain English. */
  name: string;
  /** Family id for grouping (matches one of the engine's EngineFamily ids). */
  family: string;
  /** One-sentence character description. */
  description: string;
  /** Per-model macro-knob meanings, in display order (1+ cards). */
  knobs: EngineKnobMeaning[];
  /** Deeper Explain text — sonic character + musical use. */
  detail?: { listenFor: string; goodFor: string };
}

export interface EngineFamily {
  id: string;
  label: string;
}

export interface ISynthEngine {
  manifest: EngineManifest;

  /** Lifecycle. init() loads WASM/worklet/etc off-graph; safe to call repeatedly. */
  init(ctx: AudioContext): Promise<void>;
  dispose(): Promise<void>;

  /** The engine's audio output node (or null for a pure MIDI-out engine). */
  readonly output: AudioNode | null;

  /** Voice control — MIDI semantics. */
  noteOn(midi: MidiNote, opts?: NoteOnOpts): void;
  noteOff(midi: MidiNote, opts?: NoteOffOpts): void;
  allNotesOff(): void;
  setPitchBend?(semitones: number): void;
  setGlideTime?(seconds: Seconds): void;

  /** Parameters. */
  getParameterSchema(context?: unknown): ParameterDescriptor[];
  setParameter(id: string, value: number, time?: Seconds): void;
  getParameter(id: string): number;
}
