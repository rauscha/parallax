/**
 * The FM voice specs — fourteen hand-authored six-operator patches.
 *
 * Separated from fm-models.ts so the *sound* and the *words about the sound*
 * are each readable on their own. This file is the sound.
 *
 * All original work. Locked decision 5: build it from sound, not from the ROM.
 * Nothing here is transcribed from any factory bank; these were designed
 * against the vendored engine and then measured — fm-voices.test.ts renders
 * every one of them through the real binary and checks the claims the Explain
 * prose makes about them.
 *
 * --- Two engine behaviours that shaped every patch here ----------------------
 *
 * **1. Silencing an operator in the middle of a chain breaks the chain.**
 * `FmCore::compute` tracks a `has_contents` flag per modulation bus. An
 * operator whose gain is under the engine's threshold and whose flags do not
 * say "add" marks its output bus EMPTY, and a carrier reading an empty bus is
 * rendered unmodulated — a bare sine. So "use algorithm 16 but only turn on
 * operators 1, 2 and 6" does not give you a deep stack; it gives you a sine,
 * silently. Active operators must form a contiguous chain. This was caught by
 * measurement, not by reading: the first draft of the noise voice measured
 * identically to the pure-sine voice.
 *
 * **2. The Feedback macro only reaches the ONE operator its algorithm marks.**
 * Algorithm 1 puts feedback on operator 6. A two-operator voice on algorithm 1
 * that uses operators 1 and 2 therefore has a dead Feedback knob. Algorithm 2
 * wires operators identically but puts the feedback flag on operator 2, so the
 * same voice gets a live knob for free. Every voice below either uses an
 * algorithm whose feedback operator it actually sounds, or says plainly in its
 * Explain prose that the knob does nothing here (see SINE).
 *
 * --- House rules -------------------------------------------------------------
 * - **Each voice demonstrates one FM idea** and the Explain prose names it.
 *   The flowsheet teacher (spec §4) draws these patches; a voice whose diagram
 *   teaches nothing is a wasted slot.
 * - **Keep the active operator count low enough to follow.** Six operators all
 *   doing something is a legitimate patch and an illegible diagram.
 * - **Operators are written in PANEL order** — ops[0] is operator 1. buildPatch
 *   reverses them into the engine's sysex order.
 */
import type { FmOperator, FmPatchSpec } from "./fm-patch";
import { SILENT_OP, FM_LFO_WAVE } from "./fm-patch";

type Ops = FmPatchSpec["ops"];

/** Six operators from a sparse panel-numbered map; the rest silent. */
function ops(map: Partial<Record<1 | 2 | 3 | 4 | 5 | 6, FmOperator>>): Ops {
  return [1, 2, 3, 4, 5, 6].map((n) => map[n as 1] ?? SILENT_OP) as unknown as Ops;
}

/** Percussive: strike, fall, gone while the key is still held. */
const struck = (decay: number, tail: number): Pick<FmOperator, "rates" | "levels"> => ({
  rates: [99, decay, tail, 70],
  levels: [99, 72, 0, 0],
});

/** Sustaining: strike, settle to `sustain`, hold until key-off. */
const held = (decay: number, sustain: number): Pick<FmOperator, "rates" | "levels"> => ({
  rates: [99, decay, 45, 62],
  levels: [99, 88, sustain, 0],
});

// --- Bells and metallic ------------------------------------------------------

/**
 * Voice 0. Byte-identical to LoadBootPatch() in dsp/shim/fm_shim.cc — and on
 * algorithm 2 for the reason that file explains: algorithms 1 and 2 wire these
 * two operators the same way, but only algorithm 2 puts the feedback flag on
 * the operator this voice actually uses.
 */
export const V_PARALLAX_BELL: FmPatchSpec = {
  name: "PARALLAX 1",
  algorithm: 2,
  feedback: 0,
  ops: ops({
    1: { rates: [99, 62, 45, 60], levels: [99, 88, 72, 0], outLevel: 99, coarse: 1, rateScaling: 1, keyVelSens: 2 },
    2: { rates: [99, 55, 40, 62], levels: [99, 72, 50, 0], outLevel: 78, coarse: 2, rateScaling: 2, keyVelSens: 2 },
  }),
};

/** Three 2-operator bells at once, detuned against each other — algorithm 5. */
export const V_GLASS: FmPatchSpec = {
  name: "GLASS",
  algorithm: 5,
  feedback: 3,
  ops: ops({
    1: { ...struck(40, 30), outLevel: 96, coarse: 1, rateScaling: 2, keyVelSens: 3 },
    2: { ...struck(50, 40), outLevel: 86, coarse: 7, rateScaling: 3, keyVelSens: 4 },
    3: { ...struck(42, 32), outLevel: 78, coarse: 2, detune: 10, rateScaling: 2, keyVelSens: 3 },
    4: { ...struck(54, 44), outLevel: 82, coarse: 11, rateScaling: 3, keyVelSens: 4 },
    5: { ...struck(38, 28), outLevel: 64, coarse: 1, detune: 4, rateScaling: 1, keyVelSens: 2 },
    6: { ...struck(58, 48), outLevel: 78, coarse: 14, rateScaling: 4, keyVelSens: 3 },
  }),
};

/**
 * Non-integer ratios and a long tail — algorithm 10, whose operator 4 is a
 * carrier the engine reaches before the modulation bus is written, so it sounds
 * as a bare partial underneath the inharmonic stack.
 */
export const V_GONG: FmPatchSpec = {
  name: "GONG",
  algorithm: 10,
  feedback: 4,
  ops: ops({
    1: { rates: [99, 34, 26, 45], levels: [99, 82, 0, 0], outLevel: 99, coarse: 1, rateScaling: 1, keyVelSens: 3 },
    2: { rates: [99, 40, 30, 50], levels: [99, 70, 0, 0], outLevel: 88, coarse: 3, fine: 16, rateScaling: 2, keyVelSens: 4 },
    3: { rates: [99, 46, 34, 52], levels: [99, 62, 0, 0], outLevel: 80, coarse: 1, fine: 41, rateScaling: 2, keyVelSens: 4 },
    4: { rates: [99, 30, 24, 45], levels: [99, 76, 0, 0], outLevel: 74, coarse: 1, detune: 11, rateScaling: 1, keyVelSens: 3 },
  }),
};

// --- Electric pianos ---------------------------------------------------------

/**
 * A very fast high-ratio "tine" over a slow body — algorithm 20, which gives
 * two carriers fed by the same modulator plus one bare carrier.
 */
export const V_TINE: FmPatchSpec = {
  name: "TINE",
  algorithm: 20,
  feedback: 2,
  ops: ops({
    1: { ...held(60, 55), outLevel: 99, coarse: 1, rateScaling: 2, keyVelSens: 3 },
    2: { ...held(58, 48), outLevel: 76, coarse: 1, detune: 10, rateScaling: 2, keyVelSens: 3 },
    3: { rates: [99, 92, 86, 78], levels: [99, 22, 0, 0], outLevel: 90, coarse: 14, rateScaling: 3, keyVelSens: 6 },
    4: { ...held(54, 44), outLevel: 58, coarse: 1, detune: 4, rateScaling: 2, keyVelSens: 3 },
  }),
};

/** Barkier: a 2:1 modulator with feedback, over a bare sine body — algorithm 12. */
export const V_REEDPIANO: FmPatchSpec = {
  name: "REED PNO",
  algorithm: 12,
  feedback: 5,
  ops: ops({
    1: { ...held(58, 50), outLevel: 99, coarse: 1, rateScaling: 2, keyVelSens: 4 },
    2: { rates: [99, 66, 52, 62], levels: [99, 68, 34, 0], outLevel: 88, coarse: 2, rateScaling: 3, keyVelSens: 6 },
    3: { ...held(56, 45), outLevel: 66, coarse: 1, detune: 4, rateScaling: 2, keyVelSens: 4 },
  }),
};

// --- Brass and winds ---------------------------------------------------------

/**
 * Two modulators summed into one carrier, all three with a slow attack —
 * algorithm 17. The rising modulation index as the note swells is the whole
 * trick behind FM brass.
 */
export const V_BRASS: FmPatchSpec = {
  name: "BRASS",
  algorithm: 17,
  feedback: 4,
  ops: ops({
    1: { rates: [54, 58, 44, 58], levels: [99, 90, 82, 0], outLevel: 99, coarse: 1, rateScaling: 1, keyVelSens: 3 },
    2: { rates: [44, 52, 42, 58], levels: [99, 78, 66, 0], outLevel: 90, coarse: 1, rateScaling: 2, keyVelSens: 5 },
    3: { rates: [40, 50, 40, 58], levels: [99, 70, 56, 0], outLevel: 72, coarse: 2, rateScaling: 2, keyVelSens: 4 },
  }),
  lfo: { speed: 38, delay: 42, pitchModDepth: 14, pitchModSens: 2, wave: FM_LFO_WAVE.sine, keySync: false },
};

/** A hollow odd-harmonic tube: a 3:1 modulator, plus a bare carrier — algorithm 9. */
export const V_REED: FmPatchSpec = {
  name: "REED",
  algorithm: 9,
  feedback: 3,
  ops: ops({
    1: { rates: [72, 60, 48, 60], levels: [99, 86, 78, 0], outLevel: 99, coarse: 1, rateScaling: 1, keyVelSens: 3 },
    2: { rates: [68, 58, 46, 60], levels: [99, 76, 66, 0], outLevel: 84, coarse: 3, rateScaling: 2, keyVelSens: 5 },
    3: { rates: [70, 58, 46, 60], levels: [99, 70, 60, 0], outLevel: 58, coarse: 1, detune: 9, rateScaling: 1, keyVelSens: 3 },
  }),
  lfo: { speed: 44, delay: 56, pitchModDepth: 12, pitchModSens: 2, wave: FM_LFO_WAVE.triangle, keySync: false },
};

// --- Basses ------------------------------------------------------------------

/** 1:1 modulator whose index collapses fast: attack bite, clean sustain. */
export const V_THUMB: FmPatchSpec = {
  name: "THUMB",
  algorithm: 2,
  feedback: 3,
  ops: ops({
    1: { rates: [99, 64, 50, 70], levels: [99, 86, 66, 0], outLevel: 99, coarse: 1, rateScaling: 3, keyVelSens: 3 },
    2: { rates: [99, 78, 70, 75], levels: [99, 44, 0, 0], outLevel: 94, coarse: 1, rateScaling: 4, keyVelSens: 6 },
  }),
};

/** Feedback as the timbre: two modulators, one of them looped — algorithm 18. */
export const V_GROWL: FmPatchSpec = {
  name: "GROWL",
  algorithm: 18,
  feedback: 7,
  ops: ops({
    1: { rates: [99, 62, 50, 66], levels: [99, 86, 70, 0], outLevel: 99, coarse: 1, rateScaling: 3, keyVelSens: 3 },
    2: { rates: [99, 68, 54, 64], levels: [99, 76, 56, 0], outLevel: 84, coarse: 1, rateScaling: 3, keyVelSens: 5 },
    3: { rates: [99, 72, 56, 64], levels: [99, 70, 48, 0], outLevel: 88, coarse: 1, rateScaling: 3, keyVelSens: 5 },
  }),
};

// --- Inharmonic and noise ----------------------------------------------------

/** Two modulators at ratios with no common factor — no harmonic series survives. */
export const V_CLANK: FmPatchSpec = {
  name: "CLANK",
  algorithm: 10,
  feedback: 6,
  ops: ops({
    1: { ...struck(62, 50), outLevel: 99, coarse: 1, rateScaling: 3, keyVelSens: 4 },
    2: { ...struck(66, 54), outLevel: 92, coarse: 3, fine: 53, rateScaling: 4, keyVelSens: 5 },
    3: { ...struck(70, 58), outLevel: 88, coarse: 7, fine: 31, rateScaling: 4, keyVelSens: 5 },
    4: { ...struck(58, 46), outLevel: 70, coarse: 1, detune: 12, rateScaling: 3, keyVelSens: 4 },
  }),
};

/**
 * A four-deep chain with the loop wide open — algorithm 1, using the operators
 * that algorithm actually chains (6 -> 5 -> 4 -> carrier 3), which is also the
 * one arrangement where algorithm 1's feedback operator is sounding.
 */
export const V_HISS: FmPatchSpec = {
  name: "HISS",
  algorithm: 1,
  feedback: 7,
  ops: ops({
    3: { rates: [99, 58, 46, 62], levels: [99, 82, 64, 0], outLevel: 99, coarse: 1, rateScaling: 2, keyVelSens: 3 },
    4: { rates: [99, 62, 50, 62], levels: [99, 78, 60, 0], outLevel: 88, coarse: 9, rateScaling: 3, keyVelSens: 4 },
    5: { rates: [99, 66, 54, 62], levels: [99, 74, 56, 0], outLevel: 86, coarse: 5, rateScaling: 3, keyVelSens: 4 },
    6: { rates: [99, 70, 58, 62], levels: [99, 70, 52, 0], outLevel: 92, coarse: 1, rateScaling: 3, keyVelSens: 4 },
  }),
};

// --- Teaching primitives -----------------------------------------------------

/** One operator, nothing modulating it. The floor of the whole engine. */
export const V_SINE: FmPatchSpec = {
  name: "SINE",
  algorithm: 32,
  feedback: 0,
  ops: ops({
    1: { rates: [92, 60, 45, 62], levels: [99, 92, 88, 0], outLevel: 99, coarse: 1, keyVelSens: 3 },
  }),
};

/** Two operators locked at 1:1 — the textbook harmonic-series demonstration. */
export const V_TWO_OP: FmPatchSpec = {
  name: "TWO OP",
  algorithm: 2,
  feedback: 0,
  ops: ops({
    1: { rates: [95, 60, 45, 62], levels: [99, 92, 88, 0], outLevel: 99, coarse: 1, keyVelSens: 2 },
    2: { rates: [95, 60, 45, 62], levels: [99, 92, 88, 0], outLevel: 82, coarse: 1, keyVelSens: 2 },
  }),
};

/** One operator modulating itself, with nothing else moving. */
export const V_FEEDBACK: FmPatchSpec = {
  name: "FEEDBACK",
  algorithm: 32,
  feedback: 6,
  ops: ops({
    6: { rates: [92, 60, 45, 62], levels: [99, 92, 88, 0], outLevel: 99, coarse: 1, keyVelSens: 3 },
  }),
};
