/**
 * Staff geometry — pure helpers, no Svelte, no DOM.
 *
 * All coordinates are in "staff spaces" (SP). One staff space = the gap
 * between adjacent staff lines, the unit Bravura's metadata is calibrated to.
 * The Svelte layer scales SP → px via SVG viewBox.
 *
 * Coordinate convention:
 *   - y = 0 at the TOP staff line (F5), y increases downward (SVG convention)
 *   - x increases rightward
 *   - "diatonic position" 0 = middle C (C4); each scale step = +1
 *
 * Staff line Y positions (treble):
 *   F5 (top)    y = 0     position 10
 *   D5          y = 1     position  8
 *   B4 (mid)    y = 2     position  6
 *   G4          y = 3     position  4
 *   E4 (bot)    y = 4     position  2
 */

export const STEPS_PER_BAR = 16;
export const BARS = 4;
export const TOTAL_STEPS = STEPS_PER_BAR * BARS;

export const TOP_LINE_POS = 10;     // F5
export const BOTTOM_LINE_POS = 2;   // E4
export const MIDDLE_LINE_POS = 6;   // B4 — stem-flip pivot

/** Layout knobs in SP. The component chooses an SVG viewBox that contains all of these. */
export interface StaffMetrics {
  marginLeft: number;     // SP — room for clef + time sig
  marginRight: number;    // SP — trailing whitespace
  staffWidth: number;     // SP — full SVG width
  topPad: number;         // SP above top line — ledger headroom
  bottomPad: number;      // SP below bottom line — ledger headroom
  stepWidth: number;      // SP per 16th-step (derived)
}

export function makeMetrics(staffWidth: number): StaffMetrics {
  const marginLeft = 7;     // clef (~3 SP) + time sig (~3 SP) + breathing room
  const marginRight = 1.5;
  const topPad = 6;
  const bottomPad = 6;
  const stepWidth = (staffWidth - marginLeft - marginRight) / TOTAL_STEPS;
  return { marginLeft, marginRight, staffWidth, topPad, bottomPad, stepWidth };
}

/** Total SVG viewBox height in SP, including top/bottom padding. */
export function totalHeight(m: StaffMetrics): number {
  return m.topPad + 4 + m.bottomPad;
}

/** Y-coordinate (in SP) of the top staff line. */
export function staffTopY(m: StaffMetrics): number {
  return m.topPad;
}

export function positionToY(position: number, m: StaffMetrics): number {
  return staffTopY(m) + (TOP_LINE_POS - position) * 0.5;
}

export function stepToX(step: number, m: StaffMetrics): number {
  return m.marginLeft + step * m.stepWidth;
}

/** Inverse of stepToX: floor an X coordinate (in SP) into its 16th-cell.
 *
 * Cell semantics ("snap by cell" in FL Studio terms): a click anywhere
 * inside step N's visual rectangle [N*stepWidth, (N+1)*stepWidth) lands
 * at step N. Never pushes the cursor forward into the next cell — so a
 * click slightly past the bar start never strands a 16th-rest at step 0.
 *
 * This is the right semantic for a step sequencer: each cell IS a step,
 * the way it is in classic trackers (FastTracker, OpenMPT, Renoise).
 * Round-to-nearest is a piano-roll convention for capturing fluid timing,
 * not for writing into discrete rhythm cells. */
export function xToStep(x: number, m: StaffMetrics): number {
  const raw = (x - m.marginLeft) / m.stepWidth;
  return Math.max(0, Math.min(TOTAL_STEPS - 1, Math.floor(raw)));
}

/** Inverse of positionToY: snap a Y coordinate (in SP) to the nearest diatonic position. */
export function yToPosition(y: number, m: StaffMetrics): number {
  return Math.round(2 * (staffTopY(m) - y) + TOP_LINE_POS);
}

/* —— MIDI ↔ diatonic position (sharps-default) ————————————————— */

// Pitch class (C=0…B=11) → (degree within octave 0=C…6=B, accidental).
// Two spellings — sharp-default and flat-default. Flat-default is selected
// when the active key is in the flat family (F, Bb, Eb, etc.).
const PC_TO_DEGREE_SHARP: ReadonlyArray<readonly [number, "" | "sharp" | "flat"]> = [
  [0, ""],       // C
  [0, "sharp"],  // C#
  [1, ""],       // D
  [1, "sharp"],  // D#
  [2, ""],       // E
  [3, ""],       // F
  [3, "sharp"],  // F#
  [4, ""],       // G
  [4, "sharp"],  // G#
  [5, ""],       // A
  [5, "sharp"],  // A#
  [6, ""],       // B
];
const PC_TO_DEGREE_FLAT: ReadonlyArray<readonly [number, "" | "sharp" | "flat"]> = [
  [0, ""],       // C
  [1, "flat"],   // Db
  [1, ""],       // D
  [2, "flat"],   // Eb
  [2, ""],       // E
  [3, ""],       // F
  [4, "flat"],   // Gb
  [4, ""],       // G
  [5, "flat"],   // Ab
  [5, ""],       // A
  [6, "flat"],   // Bb
  [6, ""],       // B
];

const DEGREE_TO_PC = [0, 2, 4, 5, 7, 9, 11];

export interface MidiPlacement {
  position: number;
  accidental: "" | "sharp" | "flat";
}

export function midiToPlacement(midi: number, preferFlats = false): MidiPlacement {
  const m = ((midi % 12) + 12) % 12;
  const octave = Math.floor(midi / 12) - 1;       // MIDI: C4 = 60 → octave 4
  const map = preferFlats ? PC_TO_DEGREE_FLAT : PC_TO_DEGREE_SHARP;
  const [degree, accidental] = map[m];
  // For Cb (pitch class 11 spelled with flat), it sits at degree 0 of the
  // NEXT octave-up. Adjust the octave used to compute staff position.
  // The flat map keeps every pitch class on its natural-or-one-degree-below
  // line; no octave wraparound needed for our 12 entries since neither Cb nor
  // B# appear (we kept B and C as their naturals).
  const position = (octave - 4) * 7 + degree;
  return { position, accidental };
}

/** Diatonic position → MIDI (no accidental). Used by the inverse-click path. */
export function positionToMidi(position: number): number {
  const octave = 4 + Math.floor(position / 7);
  const degree = ((position % 7) + 7) % 7;
  const pc = DEGREE_TO_PC[degree];
  return (octave + 1) * 12 + pc;
}

/* —— Duration → glyph + flag ——————————————————————————————————————— */

export type NoteheadKind = "whole" | "half" | "black";
export interface DurationVisual {
  notehead: NoteheadKind;
  stem: boolean;
  flag: 0 | 1 | 2;        // 0 = none, 1 = 8th, 2 = 16th
}

export function durationToVisual(steps: number): DurationVisual {
  if (steps >= 16) return { notehead: "whole", stem: false, flag: 0 };
  if (steps >= 8)  return { notehead: "half",  stem: true,  flag: 0 };
  if (steps >= 4)  return { notehead: "black", stem: true,  flag: 0 };
  if (steps >= 2)  return { notehead: "black", stem: true,  flag: 1 };
  return               { notehead: "black", stem: true,  flag: 2 };
}

/* —— Stem direction + ledger lines ———————————————————————————————— */

export function stemUp(position: number): boolean {
  return position <= MIDDLE_LINE_POS;
}

/**
 * Returns the diatonic positions (line positions only) where ledger lines
 * must be drawn for a note at `position`. Empty array if the note is on
 * the staff.
 */
export function ledgersFor(position: number): number[] {
  const out: number[] = [];
  if (position < BOTTOM_LINE_POS) {
    // Lines below the staff: pos 0 (C4), -2 (A3), -4 (F3)…
    for (let p = BOTTOM_LINE_POS - 2; p >= position; p -= 2) out.push(p);
  } else if (position > TOP_LINE_POS) {
    // Lines above: pos 12 (A5), 14 (C6)…
    for (let p = TOP_LINE_POS + 2; p <= position; p += 2) out.push(p);
  }
  return out;
}

/* —— Rest decomposition ———————————————————————————————————————— */

export type RestKind = "whole" | "half" | "quarter" | "8th" | "16th";
export interface RestSpan {
  step: number;
  durationSteps: number;
  kind: RestKind;
}

/** Greedy aligned-rest decomposition. Splits a [start, end) gap into rests
 *  that respect classical alignment (half rests don't cross a bar's middle;
 *  whole rests fill an entire bar; smaller rests align with their power-of-2). */
export function fillRestGap(start: number, end: number): RestSpan[] {
  const out: RestSpan[] = [];
  let s = Math.max(0, start);
  const e = Math.min(TOTAL_STEPS, end);
  while (s < e) {
    let placed = false;
    for (const [dur, kind] of [
      [16, "whole" as const],
      [8,  "half"  as const],
      [4,  "quarter" as const],
      [2,  "8th"   as const],
      [1,  "16th"  as const],
    ] as const) {
      if (s + dur > e) continue;
      if (s % dur !== 0) continue;
      // Whole rest: must be a full bar — s already % 16 === 0 implies bar boundary.
      // Half rest: must not cross a bar's middle (16-step bar split at step 8).
      if (dur === 8 && s % 16 !== 0 && s % 16 !== 8) continue;
      out.push({ step: s, durationSteps: dur, kind });
      s += dur;
      placed = true;
      break;
    }
    if (!placed) {
      // Shouldn't happen — 16th covers any single step — but guard anyway.
      out.push({ step: s, durationSteps: 1, kind: "16th" });
      s += 1;
    }
  }
  return out;
}

/** Given an ordered note list, return all silent-step gaps as [start, end) ranges. */
export function silentGaps(events: ReadonlyArray<{ startStep: number; durationSteps: number }>): Array<[number, number]> {
  const sorted = [...events].sort((a, b) => a.startStep - b.startStep);
  const gaps: Array<[number, number]> = [];
  let cursor = 0;
  for (const e of sorted) {
    if (e.startStep > cursor) gaps.push([cursor, e.startStep]);
    cursor = Math.max(cursor, e.startStep + e.durationSteps);
  }
  if (cursor < TOTAL_STEPS) gaps.push([cursor, TOTAL_STEPS]);
  return gaps;
}
