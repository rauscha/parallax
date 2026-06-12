/**
 * Grid sequencer geometry — pure TS, no Svelte.
 * Rows ↔ MIDI notes (fold-to-scale or chromatic), columns ↔ steps.
 */
import { Scale, Note } from "@tonaljs/tonal";
import type { Melody } from "../state/stores";

export const COLS_PER_BAR = 16;
export const BARS = 4;
export const TOTAL_STEPS = COLS_PER_BAR * BARS;  // 64
export const MIDI_MIN = 24;   // C1
export const MIDI_MAX = 108;  // C8

type ScaleId = Melody["scale"];

const TONAL_NAME: Record<ScaleId, string> = {
  major: "major",
  minor: "minor",
  pentatonic: "major pentatonic",
  chromatic: "chromatic",
};

const PITCH_NAMES_SHARP = ["C","C#","D","D#","E","F","F#","G","G#","A","A#","B"];
const PITCH_NAMES_FLAT  = ["C","Db","D","Eb","E","F","Gb","G","Ab","A","Bb","B"];

/** Display name for a MIDI note (pitch class only, no octave). */
export function pitchName(midi: number, useFlats: boolean): string {
  const names = useFlats ? PITCH_NAMES_FLAT : PITCH_NAMES_SHARP;
  return names[((midi % 12) + 12) % 12];
}

/**
 * Build the ordered array of MIDI notes for grid rows (index 0 = lowest pitch).
 *
 * foldToScale=true → only in-scale notes ("In Key" mode, default).
 * foldToScale=false → all 12 semitones ("Chromatic" escape hatch).
 * baseOctave controls the start octave (e.g. 3 → starts at C3 = MIDI 48).
 * octaves controls how many octaves the rows span (2 on desktop; 1 on small
 * screens, where two octaves of rows are too tall to show well).
 */
export function buildRowMidis(
  key: string,
  scale: ScaleId,
  baseOctave: number,
  foldToScale: boolean,
  octaves: number = 2,
): number[] {
  const startMidi = (baseOctave + 1) * 12;   // e.g. baseOctave=3 → C3 = 48
  const endMidi   = startMidi + octaves * 12; // `octaves` octaves up

  if (!foldToScale || scale === "chromatic") {
    return Array.from({ length: endMidi - startMidi + 1 }, (_, i) => startMidi + i);
  }

  const scaleNotes = Scale.get(`${key} ${TONAL_NAME[scale]}`).notes;
  const chromaSet = new Set<number>();
  for (const n of scaleNotes) {
    const c = Note.chroma(n);
    if (c !== undefined) chromaSet.add(c);
  }
  if (chromaSet.size === 0) {
    // Malformed key — fall back to chromatic
    return Array.from({ length: endMidi - startMidi + 1 }, (_, i) => startMidi + i);
  }

  const result: number[] = [];
  for (let midi = startMidi; midi <= endMidi; midi++) {
    if (chromaSet.has(((midi % 12) + 12) % 12)) result.push(midi);
  }
  return result;
}

/** True if the MIDI note is the root of the given key (tinted as "home" row). */
export function isRoot(midi: number, key: string): boolean {
  const rc = Note.chroma(key);
  if (rc === undefined) return false;
  return ((midi % 12) + 12) % 12 === rc;
}

/** True if the MIDI note is in the given key + scale. */
export function isInScale(midi: number, key: string, scale: ScaleId): boolean {
  if (scale === "chromatic") return true;
  const scaleNotes = Scale.get(`${key} ${TONAL_NAME[scale]}`).notes;
  const chroma = ((midi % 12) + 12) % 12;
  return scaleNotes.some(n => Note.chroma(n) === chroma);
}

/**
 * G4 — Re-map melody events from (oldKey, oldScale) → (newKey, newScale)
 * preserving scale degree.  Events whose pitch class isn't in the old scale
 * are kept at their MIDI value unchanged (they were placed in chromatic mode).
 */
export function remapByDegree(
  events: ReadonlyArray<{ startStep: number; durationSteps: number; midi: number }>,
  oldKey: string,
  oldScale: ScaleId,
  newKey: string,
  newScale: ScaleId,
): Array<{ startStep: number; durationSteps: number; midi: number }> {
  if (oldKey === newKey && oldScale === newScale) return [...events];

  const oldNotes = Scale.get(`${oldKey} ${TONAL_NAME[oldScale]}`).notes;
  const newNotes = Scale.get(`${newKey} ${TONAL_NAME[newScale]}`).notes;
  if (!oldNotes.length || !newNotes.length) return [...events];

  return events.map(ev => {
    const chroma = ((ev.midi % 12) + 12) % 12;
    const deg = oldNotes.findIndex(n => Note.chroma(n) === chroma);
    if (deg === -1 || deg >= newNotes.length) return ev;   // not in scale → keep

    // Keep the note near where it was, not on the same *letter*-octave. Naming
    // the degree's pitch class at `Math.floor(midi/12)-1` preserved the octave
    // by label, which dives across the B/C boundary: in C→Db, B4 (degree 7,
    // pitch class C) became "C4" — 11 semitones down — instead of C5, 1 up. Try
    // the candidate pitch class in the octave below / at / above and keep the
    // one nearest the original midi.
    const baseOctave = Math.floor(ev.midi / 12) - 1;
    let newMidi: number | null = null;
    for (const oct of [baseOctave - 1, baseOctave, baseOctave + 1]) {
      const cand = Note.midi(`${newNotes[deg]}${oct}`);
      if (cand === undefined || cand === null) continue;
      if (newMidi === null || Math.abs(cand - ev.midi) < Math.abs(newMidi - ev.midi)) {
        newMidi = cand;
      }
    }
    if (newMidi === null) return ev;
    return { ...ev, midi: Math.max(MIDI_MIN, Math.min(MIDI_MAX, newMidi)) };
  });
}

/**
 * G4 — Generate a random in-scale melody.
 * Walks quarter-note beats, skips ~30% for rhythmic interest.
 */
export function randomizeMelody(
  key: string,
  scale: ScaleId,
  baseOctave: number,
  octaves: number = 2,
): Array<{ startStep: number; durationSteps: number; midi: number }> {
  const midis = buildRowMidis(key, scale, baseOctave, true, octaves);
  if (!midis.length) return [];

  const events: Array<{ startStep: number; durationSteps: number; midi: number }> = [];
  for (let beat = 0; beat < 16; beat++) {
    if (beat > 0 && Math.random() < 0.3) continue;   // ~30% gaps for rhythm
    events.push({
      startStep: beat * 4,
      durationSteps: 4,
      midi: midis[Math.floor(Math.random() * midis.length)],
    });
  }
  return events;
}
