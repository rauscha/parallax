/**
 * Reading a patch back out of its bytes, for the flowsheet's per-node readouts.
 *
 * Why read the bytes rather than the `FmPatchSpec` the voice was authored from:
 * the spec is what we *asked* for, the bytes are what the engine *got*. Between
 * them sit `buildPatch`'s clamps and `applyMacros`, so a Brightness knob at 0.8
 * means the node's level readout and the voice's authored level disagree — and
 * the number worth printing next to a live trace is the one that produced it.
 *
 * The frequency ratio in particular has to come from the engine's own arithmetic
 * or not be printed at all. `osc_freq` in dx7note.cc builds a log-frequency from
 * a 32-entry coarse table, a fine multiplier and a detune offset; "coarse 3"
 * is a ratio of 3.0 only because the table says so. Guessing `coarse` as the
 * ratio would be right for the integers and wrong everywhere else — and
 * "everywhere else" is the interesting half, because a non-integer ratio is
 * exactly what makes a trace drift instead of lock.
 */
import { FM_PATCH_SIZE } from "../../data/fm-patch";

/**
 * msfa's coarse-ratio table, from `coarsemul[]` in dsp/vendor/msfa/dx7note.cc,
 * as log2 of the ratio. Copied rather than recomputed: entry 0 is 0.5 and the
 * rest are not a formula, they are a table.
 */
const COARSE_LOG2 = [
  -16777216, 0, 16777216, 26591258, 33554432, 38955489, 43368474, 47099600,
  50331648, 53182516, 55732705, 58039632, 60145690, 62083076, 63876816,
  65546747, 67108864, 68576247, 69959732, 71268397, 72509921, 73690858,
  74816848, 75892776, 76922906, 77910978, 78860292, 79773775, 80654032,
  81503396, 82323963, 83117622,
].map((v) => v / (1 << 24));

/** Detune is 12606 log-frequency units per count, centred at 7. */
const DETUNE_LOG2 = 12606 / (1 << 24);

/** Byte offset of one operator's 21-byte block. Panel 1 is msfa index 5. */
function blockOf(panelOp: number): number {
  return (6 - panelOp) * 21;
}

export interface OperatorReadout {
  /** Panel operator number, 1..6. */
  op: number;
  /** Output level 0..99 — a modulator's modulation index, a carrier's volume. */
  outLevel: number;
  /** Frequency as a multiple of the played note, or null in fixed-frequency mode. */
  ratio: number | null;
  /** Fixed frequency in Hz, or null in ratio mode. */
  fixedHz: number | null;
  coarse: number;
  fine: number;
  detune: number;
  /** EG rates and levels, 0..99. */
  rates: [number, number, number, number];
  levels: [number, number, number, number];
}

export interface PatchReadout {
  algorithm: number;
  feedback: number;
  ops: OperatorReadout[];
}

/** Ratio of an operator's frequency to the played note, per `osc_freq`. */
export function ratioOf(coarse: number, fine: number, detune: number): number {
  const log2 = COARSE_LOG2[coarse & 31]
    + Math.log2(1 + 0.01 * fine)
    + DETUNE_LOG2 * (detune - 7);
  return Math.pow(2, log2);
}

/**
 * Fixed-mode frequency in Hz. msfa builds it as
 * `logfreq = (4458616 * ((coarse & 3) * 100 + fine)) >> 3`, which is a decade
 * scale: coarse selects 1/10/100/1000 Hz and fine interpolates within it.
 */
export function fixedHzOf(coarse: number, fine: number): number {
  const logfreq = (4458616 * ((coarse & 3) * 100 + fine)) / 8;
  // msfa's log-frequency is log2(f) in 24-bit fixed point, referenced so that
  // 0 is 1 Hz on this branch.
  return Math.pow(2, logfreq / (1 << 24));
}

/** Decode the 156 unpacked bytes into per-operator display values, panel order. */
export function readPatch(bytes: Uint8Array): PatchReadout {
  if (bytes.length !== FM_PATCH_SIZE) {
    throw new Error(`readPatch: expected ${FM_PATCH_SIZE} bytes, got ${bytes.length}`);
  }
  const ops: OperatorReadout[] = [];
  for (let op = 1; op <= 6; ++op) {
    const b = blockOf(op);
    const coarse = bytes[b + 18];
    const fine = bytes[b + 19];
    const detune = bytes[b + 20];
    const fixed = bytes[b + 17] === 1;
    ops.push({
      op,
      outLevel: bytes[b + 16],
      ratio: fixed ? null : ratioOf(coarse, fine, detune),
      fixedHz: fixed ? fixedHzOf(coarse, fine) : null,
      coarse, fine, detune,
      rates: [bytes[b], bytes[b + 1], bytes[b + 2], bytes[b + 3]],
      levels: [bytes[b + 4], bytes[b + 5], bytes[b + 6], bytes[b + 7]],
    });
  }
  return { algorithm: bytes[134] + 1, feedback: bytes[135], ops };
}

/**
 * Format a ratio the way it should be read: whole numbers as whole numbers, so
 * "2" and "2.01" are visibly different kinds of thing rather than "2.00" and
 * "2.01". That distinction is the entire point of showing the number.
 */
export function formatRatio(r: number | null): string {
  if (r === null) return "fixed";
  const near = Math.round(r);
  if (near > 0 && Math.abs(r - near) < 0.0005) return `${near}`;
  return r < 10 ? r.toFixed(2) : r.toFixed(1);
}
