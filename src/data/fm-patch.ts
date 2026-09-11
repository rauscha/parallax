/**
 * FM patch authoring — a typed, human-ordered description of a six-operator
 * voice, serialised to the 156-byte unpacked layout that msfa's `Dx7Note::init`
 * reads.
 *
 * Two things this module exists to prevent:
 *
 * 1. **Operator numbering mistakes.** msfa indexes operators 0..5 in sysex
 *    order, which is *reversed* from the panel numbering everybody thinks in:
 *    byte block 0 is operator 6, block 5 is operator 1. Voices here are
 *    authored in panel order — `ops[0]` is operator 1 — and `buildPatch`
 *    reverses them on the way out. Get this backwards and every algorithm
 *    reads mirrored. (See dsp/vendor/msfa/README.md.)
 * 2. **Silent range errors.** Every field is clamped to the range the engine
 *    actually reads, so a typo becomes a dull voice rather than an out-of-range
 *    byte reinterpreted as something else entirely.
 *
 * Algorithm numbers here are 1..32 as printed on the panel; the byte is 0-based.
 *
 * All patch data in this project is our own, authored by hand. No factory ROM
 * sysex, no transcribed parameter sets — locked decision 5, "build it from
 * sound, not from the ROM".
 *
 * Byte layout (per operator, 21 bytes at msfaIndex * 21):
 *   0..3  EG rates 1-4        4..7  EG levels 1-4
 *   8     level scaling break point
 *   9,10  left / right depth  11,12 left / right curve
 *   13    rate scaling        14    amp mod sens   15  key velocity sens
 *   16    output level        17    osc mode (0 = ratio, 1 = fixed)
 *   18    freq coarse         19    freq fine      20  detune (7 = none)
 * Globals:
 *   126..129 pitch EG rates   130..133 pitch EG levels (50 = flat)
 *   134 algorithm (0-based)   135 feedback    136 osc key sync
 *   137..140 LFO speed / delay / pitch mod depth / amp mod depth
 *   141 LFO key sync          142 LFO wave    143 LFO pitch mod sens
 *   144 transpose             145..154 name   155 operator on/off mask
 */

export const FM_PATCH_SIZE = 156;
const OP_STRIDE = 21;

/** LFO waveform byte values, in the engine's enum order (lfo.cc). */
export const FM_LFO_WAVE = {
  triangle: 0,
  sawDown: 1,
  sawUp: 2,
  square: 3,
  sine: 4,
  sampleHold: 5,
} as const;

export type FmLfoWave = (typeof FM_LFO_WAVE)[keyof typeof FM_LFO_WAVE];

/** One operator, described the way a panel describes it. */
export interface FmOperator {
  /** EG rates 1-4, 0..99. Higher is faster. */
  rates: [number, number, number, number];
  /** EG levels 1-4, 0..99. Level 4 is the level held after key-off. */
  levels: [number, number, number, number];
  /** Output level 0..99. A modulator's output level IS its modulation index. */
  outLevel: number;
  /** Frequency ratio coarse 0..31 (1 = the note's own pitch; 0 = half). */
  coarse: number;
  /** Frequency ratio fine 0..99 — hundredths between coarse steps. */
  fine?: number;
  /** Detune 0..14, 7 = none. A cent-scale offset, for thickening. */
  detune?: number;
  /** Rate scaling 0..7 — how much faster the envelope runs at high pitches. */
  rateScaling?: number;
  /** Key velocity sensitivity 0..7. */
  keyVelSens?: number;
  /** Amplitude-modulation sensitivity 0..3 — how much LFO amp mod reaches it. */
  ampModSens?: number;
  /** Level-scaling break point 0..99 (key-tracking pivot). */
  breakPoint?: number;
  /** Level scaling below / above the break point, 0..99. */
  leftDepth?: number;
  rightDepth?: number;
  /** Level-scaling curve 0..3 (0 = -lin, 1 = -exp, 2 = +exp, 3 = +lin). */
  leftCurve?: number;
  rightCurve?: number;
  /** 0 = ratio (tracks the note), 1 = fixed frequency. Default 0. */
  fixed?: boolean;
}

export interface FmPatchSpec {
  /** Up to 10 characters; longer names are truncated in the byte block only. */
  name: string;
  /** Algorithm 1..32, as printed on a panel. */
  algorithm: number;
  /** Feedback amount 0..7 on whichever operator the algorithm loops. */
  feedback?: number;
  /** Operators in PANEL order: ops[0] is operator 1. Exactly six. */
  ops: [FmOperator, FmOperator, FmOperator, FmOperator, FmOperator, FmOperator];
  /** Pitch envelope. Defaults to flat (rates 99, levels 50 = no pitch move). */
  pitchEg?: {
    rates: [number, number, number, number];
    levels: [number, number, number, number];
  };
  lfo?: {
    speed?: number;          // 0..99
    delay?: number;          // 0..99
    pitchModDepth?: number;  // 0..99
    ampModDepth?: number;    // 0..99
    keySync?: boolean;       // restart the LFO on each key-down
    wave?: FmLfoWave;
    pitchModSens?: number;   // 0..7
  };
  /** Restart operator phases on key-down. Default true (consistent attacks). */
  oscKeySync?: boolean;
}

const clamp = (v: number, lo: number, hi: number): number =>
  v < lo ? lo : v > hi ? hi : Math.round(v);

/** Default operator — silent, at the note's own pitch, no envelope movement. */
export const SILENT_OP: FmOperator = {
  rates: [99, 99, 99, 99],
  levels: [0, 0, 0, 0],
  outLevel: 0,
  coarse: 1,
};

/**
 * Serialise a voice to the 156 unpacked bytes `fm_set_patch` accepts.
 *
 * Panel order in, sysex order out: operator 1 lands in byte block 5.
 */
export function buildPatch(spec: FmPatchSpec): Uint8Array {
  const p = new Uint8Array(FM_PATCH_SIZE);

  spec.ops.forEach((op, panelIndex) => {
    // Panel operator 1 (panelIndex 0) is msfa index 5. This line is the whole
    // reason this module exists.
    const msfaIndex = 5 - panelIndex;
    const o = msfaIndex * OP_STRIDE;

    for (let i = 0; i < 4; ++i) {
      p[o + i] = clamp(op.rates[i], 0, 99);
      p[o + 4 + i] = clamp(op.levels[i], 0, 99);
    }
    p[o + 8] = clamp(op.breakPoint ?? 0, 0, 99);
    p[o + 9] = clamp(op.leftDepth ?? 0, 0, 99);
    p[o + 10] = clamp(op.rightDepth ?? 0, 0, 99);
    p[o + 11] = clamp(op.leftCurve ?? 0, 0, 3);
    p[o + 12] = clamp(op.rightCurve ?? 0, 0, 3);
    p[o + 13] = clamp(op.rateScaling ?? 0, 0, 7);
    p[o + 14] = clamp(op.ampModSens ?? 0, 0, 3);
    p[o + 15] = clamp(op.keyVelSens ?? 0, 0, 7);
    p[o + 16] = clamp(op.outLevel, 0, 99);
    p[o + 17] = op.fixed ? 1 : 0;
    p[o + 18] = clamp(op.coarse, 0, 31);
    p[o + 19] = clamp(op.fine ?? 0, 0, 99);
    p[o + 20] = clamp(op.detune ?? 7, 0, 14);
  });

  const peg = spec.pitchEg ?? { rates: [99, 99, 99, 99], levels: [50, 50, 50, 50] };
  for (let i = 0; i < 4; ++i) {
    p[126 + i] = clamp(peg.rates[i], 0, 99);
    p[130 + i] = clamp(peg.levels[i], 0, 99);
  }

  p[134] = clamp(spec.algorithm, 1, 32) - 1;   // panel 1..32 -> byte 0..31
  p[135] = clamp(spec.feedback ?? 0, 0, 7);
  p[136] = (spec.oscKeySync ?? true) ? 1 : 0;

  const lfo = spec.lfo ?? {};
  p[137] = clamp(lfo.speed ?? 35, 0, 99);
  p[138] = clamp(lfo.delay ?? 0, 0, 99);
  p[139] = clamp(lfo.pitchModDepth ?? 0, 0, 99);
  p[140] = clamp(lfo.ampModDepth ?? 0, 0, 99);
  p[141] = (lfo.keySync ?? true) ? 1 : 0;
  p[142] = clamp(lfo.wave ?? FM_LFO_WAVE.triangle, 0, 5);
  p[143] = clamp(lfo.pitchModSens ?? 0, 0, 7);

  p[144] = 24;                                  // transpose centre

  const name = spec.name.slice(0, 10).padEnd(10, " ");
  for (let i = 0; i < 10; ++i) p[145 + i] = name.charCodeAt(i) & 0x7f;

  p[155] = 0x3f;                                // all six operators enabled

  return p;
}
