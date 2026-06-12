import { atom, map } from "nanostores";
import { DEFAULT_ENGINE_ID } from "../audio/registry";

/** Engine identity (which ISynthEngine is loaded). */
export const engineIdStore = atom<string>(DEFAULT_ENGINE_ID);

/** Patch = engine + parameters. Versioned so v1 share-URLs migrate cleanly. */
export interface Patch {
  version: 1;
  engineId: string;
  modelId: string | null;
  params: Record<string, number>;
}
export const patchStore = map<Patch>({
  version: 1,
  engineId: DEFAULT_ENGINE_ID,
  modelId: null,
  params: {},
});

/** Melody = transport + grid + events. Stubbed for M0, fleshed in M3. */
export interface MelodyEvent {
  startStep: number;        // 0..63 (16th-note grid, 4 bars × 16 steps)
  durationSteps: number;
  midi: number;
  /** Optional explicit staff position (absolute, C4=0). When set, the renderer
   *  uses this instead of deriving from midi — needed to spell things like Bb
   *  on the B-line vs A# on the A-space, or to force a C natural in F major. */
  position?: number;
  /** Optional explicit accidental glyph. When set, renderer draws this sign
   *  next to the notehead regardless of what the key would suggest. */
  accidental?: "sharp" | "flat" | "natural";
}
export interface Melody {
  tempo: number;            // BPM
  key: string;              // tonal-compatible: "C", "F#", ...
  scale: "major" | "minor" | "pentatonic" | "chromatic";
  events: MelodyEvent[];
}
export const melodyStore = map<Melody>({
  tempo: 120,
  key: "C",
  scale: "major",
  events: [],
});

/** Which synth parameter the user is currently engaging — hover, keyboard
 *  focus, or an active drag. Drives the knob ↔ Explain-card highlight link so
 *  touching a knob lights its card (and hovering a card lights its knob). It's
 *  a transient UI cue, not patch state, so it lives here and is never persisted
 *  or shared. null = nothing engaged. Holds the param id (e.g. "timbre"). */
export const activeParamStore = atom<string | null>(null);

/** Audio system status — drives the tap-to-start overlay. */
export const audioReadyStore = atom<boolean>(false);

/** Which MIDI notes are currently sounding (UI lights, scope phase-lock hint). */
export const activeNotesStore = atom<Set<number>>(new Set());

/** Sequencer transport state. True while Tone.Transport is running. */
export const isPlayingStore = atom<boolean>(false);
