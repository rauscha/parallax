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
 * `wires` was added at phase 8 by the same method, one step further: the flag
 * bytes alone do not say who modulates whom, only which bus each operator reads
 * and writes, so the generator *simulates* the bus machine in `FmCore::compute`
 * — including its `has_contents` rule — and records what was on an operator's
 * in-bus when it rendered. The two derivations are independent and agree on
 * `carriers` for all 32 algorithms, which is the cross-check that they read the
 * table correctly. See the phase-8 commit for the generator.
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
  /**
   * Modulation wiring as `[modulator, carrier]` pairs of PANEL operator numbers
   * — "modulator's output is summed into carrier's phase". This is the graph the
   * flowsheet draws, and it is derived by *simulating* `FmCore::compute`'s three
   * buses rather than by reading flags one operator at a time, because a wire is
   * not a property of either operator alone: an operator reads whatever happens
   * to be on its in-bus at the moment it renders, which may be a sum of several
   * earlier operators (algorithm 7's 4 and 5 both land on 3) or nothing at all
   * (algorithm 23's operator 1, a bare carrier).
   *
   * Consequence worth knowing before drawing: an operator with no incoming wire
   * is a pure sine, and one whose wires all come from silenced operators renders
   * as a pure sine too — see the `has_contents` note in fm-voices.ts.
   */
  wires: Array<[number, number]>;
}

export const FM_ALGORITHMS: FmAlgorithmRoles[] = [
  { algorithm: 1, carriers: [1, 3], feedbackOp: 6, wires: [[6, 5], [5, 4], [4, 3], [2, 1]] },
  { algorithm: 2, carriers: [1, 3], feedbackOp: 2, wires: [[6, 5], [5, 4], [4, 3], [2, 1]] },
  { algorithm: 3, carriers: [1, 4], feedbackOp: 6, wires: [[6, 5], [5, 4], [3, 2], [2, 1]] },
  { algorithm: 4, carriers: [1, 4], feedbackOp: null, wires: [[6, 5], [5, 4], [3, 2], [2, 1]] },
  { algorithm: 5, carriers: [1, 3, 5], feedbackOp: 6, wires: [[6, 5], [4, 3], [2, 1]] },
  { algorithm: 6, carriers: [1, 3, 5], feedbackOp: null, wires: [[6, 5], [4, 3], [2, 1]] },
  { algorithm: 7, carriers: [1, 3], feedbackOp: 6, wires: [[6, 5], [5, 3], [4, 3], [2, 1]] },
  { algorithm: 8, carriers: [1, 3], feedbackOp: 4, wires: [[6, 5], [5, 3], [4, 3], [2, 1]] },
  { algorithm: 9, carriers: [1, 3], feedbackOp: 2, wires: [[6, 5], [5, 3], [4, 3], [2, 1]] },
  { algorithm: 10, carriers: [1, 4], feedbackOp: 3, wires: [[6, 4], [5, 4], [3, 2], [2, 1]] },
  { algorithm: 11, carriers: [1, 4], feedbackOp: 6, wires: [[6, 4], [5, 4], [3, 2], [2, 1]] },
  { algorithm: 12, carriers: [1, 3], feedbackOp: 2, wires: [[6, 3], [5, 3], [4, 3], [2, 1]] },
  { algorithm: 13, carriers: [1, 3], feedbackOp: 6, wires: [[6, 3], [5, 3], [4, 3], [2, 1]] },
  { algorithm: 14, carriers: [1, 3], feedbackOp: 6, wires: [[6, 4], [5, 4], [4, 3], [2, 1]] },
  { algorithm: 15, carriers: [1, 3], feedbackOp: 2, wires: [[6, 4], [5, 4], [4, 3], [2, 1]] },
  { algorithm: 16, carriers: [1], feedbackOp: 6, wires: [[6, 5], [4, 3], [5, 1], [3, 1], [2, 1]] },
  { algorithm: 17, carriers: [1], feedbackOp: 2, wires: [[6, 5], [4, 3], [5, 1], [3, 1], [2, 1]] },
  { algorithm: 18, carriers: [1], feedbackOp: 3, wires: [[6, 5], [5, 4], [4, 1], [3, 1], [2, 1]] },
  { algorithm: 19, carriers: [1, 4, 5], feedbackOp: 6, wires: [[6, 5], [6, 4], [3, 2], [2, 1]] },
  { algorithm: 20, carriers: [1, 2, 4], feedbackOp: 3, wires: [[6, 4], [5, 4], [3, 2], [3, 1]] },
  { algorithm: 21, carriers: [1, 2, 4, 5], feedbackOp: 3, wires: [[6, 5], [6, 4], [3, 2], [3, 1]] },
  { algorithm: 22, carriers: [1, 3, 4, 5], feedbackOp: 6, wires: [[6, 5], [6, 4], [6, 3], [2, 1]] },
  { algorithm: 23, carriers: [1, 2, 4, 5], feedbackOp: 6, wires: [[6, 5], [6, 4], [3, 2]] },
  { algorithm: 24, carriers: [1, 2, 3, 4, 5], feedbackOp: 6, wires: [[6, 5], [6, 4], [6, 3]] },
  { algorithm: 25, carriers: [1, 2, 3, 4, 5], feedbackOp: 6, wires: [[6, 5], [6, 4]] },
  { algorithm: 26, carriers: [1, 2, 4], feedbackOp: 6, wires: [[6, 4], [5, 4], [3, 2]] },
  { algorithm: 27, carriers: [1, 2, 4], feedbackOp: 3, wires: [[6, 4], [5, 4], [3, 2]] },
  { algorithm: 28, carriers: [1, 3, 6], feedbackOp: 5, wires: [[5, 4], [4, 3], [2, 1]] },
  { algorithm: 29, carriers: [1, 2, 3, 5], feedbackOp: 6, wires: [[6, 5], [4, 3]] },
  { algorithm: 30, carriers: [1, 2, 3, 6], feedbackOp: 5, wires: [[5, 4], [4, 3]] },
  { algorithm: 31, carriers: [1, 2, 3, 4, 5], feedbackOp: 6, wires: [[6, 5]] },
  { algorithm: 32, carriers: [1, 2, 3, 4, 5, 6], feedbackOp: 6, wires: [] },
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
