/**
 * Per-algorithm operator roles, derived mechanically from the vendored engine.
 *
 * GENERATED, not hand-typed. The source of truth is the `algorithms[32]` table
 * in dsp/vendor/msfa/fm_core.cc; this file is the result of reading each
 * operator's flag byte and applying the same two rules FmCore::compute applies:
 *
 *   carrier      <=>  (flags & 3) === 0      — it writes to the output bus
 *   feedback op  <=>  (flags & 0xc0) === 0xc0
 *
 * and converting msfa's reversed indices to panel operator numbers (msfa index
 * 0 is operator 6). Regenerate with the script in the phase-4 commit message if
 * the vendored table is ever re-vendored.
 *
 * Why this exists: the macro knobs in fm-macros.ts act on *modulators* — an
 * operator's output level is only a modulation index if something downstream
 * listens to it — and "which operators are modulators" is a property of the
 * algorithm, not of the patch. Hardcoding a guess would make Brightness a
 * volume knob on some voices and a timbre knob on others.
 *
 * Known engine limitation, visible here: algorithms 4 and 6 report no feedback
 * operator. On real DX7-lineage hardware those two route feedback around a
 * *pair* of operators, which msfa does not implement — its own source says
 * "todo: more than one op in a feedback loop". So the Feedback macro genuinely
 * does nothing on a voice using algorithm 4 or 6, and any voice we build on
 * those must say so rather than ship a dead knob with confident prose.
 */

/** Operator roles for one algorithm. Operator numbers are PANEL numbers, 1..6. */
export interface FmAlgorithmRoles {
  /** Algorithm number as printed on a panel, 1..32. */
  algorithm: number;
  /** Operators whose output reaches the audio out directly. */
  carriers: number[];
  /** The operator carrying a self-feedback loop, or null if the algorithm has none. */
  feedbackOp: number | null;
}

export const FM_ALGORITHMS: FmAlgorithmRoles[] = [
  { algorithm: 1, carriers: [1, 3], feedbackOp: 6 },
  { algorithm: 2, carriers: [1, 3], feedbackOp: 2 },
  { algorithm: 3, carriers: [1, 4], feedbackOp: 6 },
  { algorithm: 4, carriers: [1, 4], feedbackOp: null },
  { algorithm: 5, carriers: [1, 3, 5], feedbackOp: 6 },
  { algorithm: 6, carriers: [1, 3, 5], feedbackOp: null },
  { algorithm: 7, carriers: [1, 3], feedbackOp: 6 },
  { algorithm: 8, carriers: [1, 3], feedbackOp: 4 },
  { algorithm: 9, carriers: [1, 3], feedbackOp: 2 },
  { algorithm: 10, carriers: [1, 4], feedbackOp: 3 },
  { algorithm: 11, carriers: [1, 4], feedbackOp: 6 },
  { algorithm: 12, carriers: [1, 3], feedbackOp: 2 },
  { algorithm: 13, carriers: [1, 3], feedbackOp: 6 },
  { algorithm: 14, carriers: [1, 3], feedbackOp: 6 },
  { algorithm: 15, carriers: [1, 3], feedbackOp: 2 },
  { algorithm: 16, carriers: [1], feedbackOp: 6 },
  { algorithm: 17, carriers: [1], feedbackOp: 2 },
  { algorithm: 18, carriers: [1], feedbackOp: 3 },
  { algorithm: 19, carriers: [1, 4, 5], feedbackOp: 6 },
  { algorithm: 20, carriers: [1, 2, 4], feedbackOp: 3 },
  { algorithm: 21, carriers: [1, 2, 4, 5], feedbackOp: 3 },
  { algorithm: 22, carriers: [1, 3, 4, 5], feedbackOp: 6 },
  { algorithm: 23, carriers: [1, 2, 4, 5], feedbackOp: 6 },
  { algorithm: 24, carriers: [1, 2, 3, 4, 5], feedbackOp: 6 },
  { algorithm: 25, carriers: [1, 2, 3, 4, 5], feedbackOp: 6 },
  { algorithm: 26, carriers: [1, 2, 4], feedbackOp: 6 },
  { algorithm: 27, carriers: [1, 2, 4], feedbackOp: 3 },
  { algorithm: 28, carriers: [1, 3, 6], feedbackOp: 5 },
  { algorithm: 29, carriers: [1, 2, 3, 5], feedbackOp: 6 },
  { algorithm: 30, carriers: [1, 2, 3, 6], feedbackOp: 5 },
  { algorithm: 31, carriers: [1, 2, 3, 4, 5], feedbackOp: 6 },
  { algorithm: 32, carriers: [1, 2, 3, 4, 5, 6], feedbackOp: 6 },
];

/** Roles for one algorithm (1..32). Out-of-range falls back to algorithm 1. */
export function algorithmRoles(algorithm: number): FmAlgorithmRoles {
  return FM_ALGORITHMS[algorithm - 1] ?? FM_ALGORITHMS[0];
}

/** Panel operator numbers that modulate something, for one algorithm. */
export function modulatorsOf(algorithm: number): number[] {
  const carriers = new Set(algorithmRoles(algorithm).carriers);
  return [1, 2, 3, 4, 5, 6].filter((op) => !carriers.has(op));
}
