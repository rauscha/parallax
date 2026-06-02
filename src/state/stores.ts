import { atom, map } from "nanostores";

/** Engine identity (which ISynthEngine is loaded). */
export const engineIdStore = atom<string>("braids");

/** Patch = engine + parameters. Versioned so v1 share-URLs migrate cleanly. */
export interface Patch {
  version: 1;
  engineId: string;
  modelId: string | null;
  params: Record<string, number>;
}
export const patchStore = map<Patch>({
  version: 1,
  engineId: "braids",
  modelId: null,
  params: {},
});

/** Melody = transport + grid + events. Stubbed for M0, fleshed in M3. */
export interface MelodyEvent {
  startStep: number;        // 0..63 (16th-note grid, 4 bars × 16 steps)
  durationSteps: number;
  midi: number;
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

/** Audio system status — drives the tap-to-start overlay. */
export const audioReadyStore = atom<boolean>(false);

/** Which MIDI notes are currently sounding (UI lights, scope phase-lock hint). */
export const activeNotesStore = atom<Set<number>>(new Set());

/** Sequencer transport state. True while Tone.Transport is running. */
export const isPlayingStore = atom<boolean>(false);
