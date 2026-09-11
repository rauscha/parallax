/**
 * The four FM macro knobs (spec §3), implemented as transforms on a patch.
 *
 * A raw six-operator patch has ~145 parameters. Exposing them all would give
 * the Explain panel nothing to say and break the pattern every other engine
 * follows, so the engine exposes four macros that *modulate the loaded voice*,
 * in the spirit of Plaits' HARMONICS/TIMBRE/MORPH.
 *
 * **Every macro is centred at 0.5 = the voice exactly as authored.** Turning
 * left takes a parameter toward its floor, right toward its ceiling, and the
 * detent puts the patch back. That is what makes a macro honest on a corpus of
 * hand-designed voices: there is a "right" position, and it is the middle.
 *
 * **Which operators a macro touches depends on the algorithm, not the patch.**
 * An operator's output level is a modulation index only if something listens to
 * it; on a carrier the same byte is a volume control. Roles come from
 * fm-algorithms.ts, which is generated from the vendored engine's own table.
 *
 * --- When a change is heard -------------------------------------------------
 * Immediately, including on a note that is already sounding. That is not free:
 * stock msfa builds a voice's operator state inside Dx7Note::init and exposes
 * no public path to change it afterwards (Env::setparam exists and is meant for
 * exactly this, but env_[] is private to Dx7Note, and Controllers carries pitch
 * bend and nothing else). Dx7Note::update and Env::update are our own additions
 * to the vendored engine, added 2026-09-11 on Andrew's decision — they re-aim
 * the running envelopes instead of restarting them. See
 * dsp/vendor/msfa/README.md.
 */
import { FM_PATCH_SIZE } from "./fm-patch";
import { algorithmRoles, modulatorsOf } from "./fm-algorithms";

const OP_STRIDE = 21;

/** The four macros, 0..1, 0.5 = the patch as authored. */
export interface FmMacros {
  brightness: number;
  ratio: number;
  feedback: number;
  envelope: number;
}

export const FM_MACRO_DEFAULTS: FmMacros = {
  brightness: 0.5,
  ratio: 0.5,
  feedback: 0.5,
  envelope: 0.5,
};

/**
 * How far Brightness can push a modulator's output level, in DX7 level units.
 * The engine's own scale is roughly 0.75 dB per unit near the top, so +-30 is
 * about a 20 dB swing of modulation index — enough to go from near-sine to
 * clangorous without the knob feeling twitchy in its first few degrees.
 */
const BRIGHTNESS_SPAN = 30;

/** How far Envelope can push every EG rate. Rates are 0..99, higher is faster. */
const ENVELOPE_SPAN = 30;

/** Ratio's reach, in octaves either side of the authored ratio. */
const RATIO_OCTAVES = 1;

const clampInt = (v: number, lo: number, hi: number): number =>
  v < lo ? lo : v > hi ? hi : Math.round(v);

const clamp01 = (v: number): number => (v < 0 ? 0 : v > 1 ? 1 : v);

/**
 * Bipolar interpolation around a patch value: 0 -> floor, 0.5 -> base, 1 -> ceil.
 * This is the shape every macro uses, and the reason the centre detent means
 * "as designed".
 */
function bipolar(macro: number, base: number, floor: number, ceil: number): number {
  const m = clamp01(macro);
  return m < 0.5
    ? floor + (base - floor) * (m * 2)
    : base + (ceil - base) * ((m - 0.5) * 2);
}

/**
 * msfa's frequency ratio for an operator in ratio mode, from its coarse and
 * fine bytes: `coarsemul[coarse] * (1 + fine/100)`, where coarse 0 means 0.5
 * and coarse n>=1 means n (dx7note.cc, osc_freq).
 */
export function ratioOf(coarse: number, fine: number): number {
  const base = coarse === 0 ? 0.5 : coarse;
  return base * (1 + 0.01 * fine);
}

/**
 * The closest coarse/fine pair to a target ratio. `fine` only ever multiplies
 * upward (0..+99 %), so each coarse covers [c, 2c) — meaning the integer part
 * picks the coarse and the remainder becomes the fine.
 */
export function ratioToBytes(target: number): { coarse: number; fine: number } {
  if (target <= 0.5) return { coarse: 0, fine: 0 };
  if (target < 1) {
    // coarse 0 is 0.5, so 0.5..1.0 is reachable as 0.5 * (1 + fine/100).
    return { coarse: 0, fine: clampInt((target / 0.5 - 1) * 100, 0, 99) };
  }
  const coarse = clampInt(Math.floor(Math.min(target, 31)), 1, 31);
  const fine = clampInt((target / coarse - 1) * 100, 0, 99);
  return { coarse, fine };
}

/**
 * Apply the macros to a patch, returning a new 156-byte block. The input is
 * never mutated — the corpus arrays are shared and must stay pristine.
 */
export function applyMacros(patch: Uint8Array, macros: FmMacros): Uint8Array {
  const out = new Uint8Array(patch);           // copy
  if (patch.length !== FM_PATCH_SIZE) return out;

  const algorithm = (out[134] | 0) + 1;        // byte is 0-based
  const mods = modulatorsOf(algorithm);
  const roles = algorithmRoles(algorithm);

  // --- Brightness: modulator output levels, together ------------------------
  // On a carrier the same byte is volume, so carriers are left alone. On
  // algorithm 32 there are no modulators at all and this macro does nothing —
  // which is a true fact about that algorithm, not a bug to paper over.
  if (macros.brightness !== 0.5) {
    for (const op of mods) {
      const o = (6 - op) * OP_STRIDE;          // panel number -> msfa block
      const base = out[o + 16];
      out[o + 16] = clampInt(
        bipolar(macros.brightness, base, base - BRIGHTNESS_SPAN, base + BRIGHTNESS_SPAN),
        0, 99,
      );
    }
  }

  // --- Ratio: modulator frequency ratios, together --------------------------
  // Multiplicative, so the musical distance either side of the detent is the
  // same. Whole-number ratios give harmonic sidebands; everything between them
  // gives inharmonic ones, which is the thing this knob is for hearing.
  if (macros.ratio !== 0.5) {
    const octaves = (clamp01(macros.ratio) - 0.5) * 2 * RATIO_OCTAVES;
    const scale = Math.pow(2, octaves);
    for (const op of mods) {
      const o = (6 - op) * OP_STRIDE;
      if (out[o + 17] !== 0) continue;         // fixed-frequency operator: no ratio to scale
      const target = ratioOf(out[o + 18], out[o + 19]) * scale;
      const { coarse, fine } = ratioToBytes(target);
      out[o + 18] = coarse;
      out[o + 19] = fine;
    }
  }

  // --- Feedback: the algorithm's one feedback operator ----------------------
  // Null on algorithms 4 and 6, where the hardware loops a pair of operators
  // and this engine does not implement it (see fm-algorithms.ts).
  if (macros.feedback !== 0.5 && roles.feedbackOp !== null) {
    out[135] = clampInt(bipolar(macros.feedback, out[135], 0, 7), 0, 7);
  }

  // --- Envelope: every operator's EG rates, together ------------------------
  // All six, carriers included: this is the percussive/sustained axis, and
  // moving only the modulators would change timbre instead of articulation.
  if (macros.envelope !== 0.5) {
    for (let op = 0; op < 6; ++op) {
      const o = op * OP_STRIDE;
      for (let i = 0; i < 4; ++i) {
        const base = out[o + i];
        out[o + i] = clampInt(
          bipolar(macros.envelope, base, base - ENVELOPE_SPAN, base + ENVELOPE_SPAN),
          0, 99,
        );
      }
    }
  }

  return out;
}
