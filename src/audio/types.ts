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
