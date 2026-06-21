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

/** Duration palette (16th-note steps): eighth×2, quarter×4, dotted-quarter, half.
 *  Sampling uniformly gives ~25% eighths, ~50% quarters, ~12.5% dotted, ~12.5% halves. */
const DURS = [2, 2, 4, 4, 4, 4, 6, 8] as const;

/**
 * Fill `totalSteps` 16th-note steps with a sequence of note slots, mixing
 * durations from DURS and inserting silent rest gaps with probability `restProb`.
 * Each slot is { start, dur }; gaps advance the cursor without a slot.
 * Exported for unit tests — internal to the melody generation feature.
 */
export function buildRhythm(
  totalSteps: number,
  restProb: number,
): Array<{ start: number; dur: number }> {
  const slots: Array<{ start: number; dur: number }> = [];
  let pos = 0;
  while (pos < totalSteps) {
    const remaining = totalSteps - pos;
    const valid = (DURS as readonly number[]).filter(d => d <= remaining);
    const dur = valid.length > 0 ? valid[Math.floor(Math.random() * valid.length)] : remaining;
    slots.push({ start: pos, dur });
    pos += dur;
    // Rest gap: advance cursor without adding a slot (silence).
    if (pos < totalSteps && Math.random() < restProb) {
      const rests = [2, 4].filter(d => d <= totalSteps - pos);
      if (rests.length > 0) pos += rests[Math.floor(Math.random() * rests.length)];
    }
  }
  return slots;
}

/**
 * Choose the next index into `midis` with stepwise bias toward `targetIdx`:
 *   55% → ±1 step toward target  |  25% → ±2 steps  |  20% → jump to target.
 * Result is clamped to [0, midis.length − 1].
 * Exported for unit tests — internal to the melody generation feature.
 */
export function pickNext(midis: number[], idx: number, targetIdx: number): number {
  const len = midis.length;
  if (len <= 1) return 0;
  const drift = Math.sign(targetIdx - idx);   // -1, 0, or +1
  const r = Math.random();
  let step: number;
  if (r < 0.55) {
    step = drift !== 0 ? drift : (Math.random() < 0.5 ? 1 : -1);
  } else if (r < 0.80) {
    step = drift !== 0 ? drift * 2 : (Math.random() < 0.5 ? 2 : -2);
  } else {
    step = targetIdx - idx;
  }
  return Math.max(0, Math.min(len - 1, idx + step));
}

/**
 * Index of the first MIDI in `midis` whose pitch class is the root of `key`.
 * Falls back to 0 if the key is unresolvable (won't happen for valid inputs).
 * Exported for unit tests — internal to the melody generation feature.
 */
export function findTonicIdx(midis: number[], key: string): number {
  const chroma = Note.chroma(key);
  if (chroma === undefined) return 0;
  const idx = midis.findIndex(m => ((m % 12) + 12) % 12 === chroma);
  return idx === -1 ? 0 : idx;
}

/**
 * Arch-contour target index at phrase position `t` (0..1): rises from the tonic
 * to the peak over the first half, then falls back to the tonic over the second.
 * Resolving toward `tonicIdx` (rather than index 0, the lowest note in the row)
 * keeps the descent in-key for non-C-rooted ranges — in C-rooted ranges the
 * tonic *is* index 0, so behaviour there is unchanged.
 * Exported for unit tests — internal to the melody generation feature.
 */
export function contourTargetIdx(t: number, tonicIdx: number, peakIdx: number): number {
  return t < 0.5
    ? Math.round(tonicIdx + (peakIdx - tonicIdx) * (t * 2))         // tonic → peak as t goes 0→0.5
    : Math.round(peakIdx - (peakIdx - tonicIdx) * ((t - 0.5) * 2)); // peak → tonic as t goes 0.5→1
}

/**
 * Generate a musically-shaped in-scale melody:
 * - Varied rhythm (eighth, quarter, dotted-quarter, half).
 * - Phrase contour: rises to a peak around bar 2–3, resolves back to the tonic.
 * - Stepwise bias: prefers ±1–2 scale degrees, occasional leaps toward the target.
 * - Tonic anchors: first and last note are always the key root.
 */
export function randomizeMelody(
  key: string,
  scale: ScaleId,
  baseOctave: number,
  octaves: number = 2,
): Array<{ startStep: number; durationSteps: number; midi: number }> {
  const midis = buildRowMidis(key, scale, baseOctave, true, octaves);
  if (!midis.length) return [];

  const len      = midis.length;
  const tonicIdx = findTonicIdx(midis, key);

  // Peak: upper 60–80% of the MIDI index range, randomised per roll.
  const peakIdx = Math.floor(len * 0.60 + Math.random() * len * 0.20);

  const slots  = buildRhythm(TOTAL_STEPS, 0.20);
  const events: Array<{ startStep: number; durationSteps: number; midi: number }> = [];
  let currentIdx = tonicIdx;

  for (let i = 0; i < slots.length; i++) {
    const { start, dur } = slots[i];
    const isFirst = i === 0;
    const isLast  = i === slots.length - 1;

    if (isFirst || isLast) {
      currentIdx = tonicIdx;   // anchor both ends on the tonic
    } else {
      // Two-phrase arch: rise from tonic toward peak, then resolve back to tonic.
      const t = start / TOTAL_STEPS;              // 0..1
      const targetIdx = contourTargetIdx(t, tonicIdx, peakIdx);
      currentIdx = pickNext(midis, currentIdx, targetIdx);
    }

    events.push({ startStep: start, durationSteps: dur, midi: midis[currentIdx] });
  }

  return events;
}
