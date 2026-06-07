/**
 * Laxsynth shapes — the 9 base waveforms of our original WavSynth-style engine.
 *
 * Laxsynth is NOT a port of anything: it's a clean-room single-cycle wavetable
 * voice (size / mult / warp / mirror operators → filter → drive → envelope) in
 * the same synthesis *class* as the Dirtywave M8 WavSynth, which is closed-source
 * and can't be ported. See ~/.claude/plans/pure-wibbling-cook.md.
 *
 * The `index` is the SHAPE selector — it goes straight into setParameter("model",
 * index) and on to the worklet's `setShape`. Do not reorder.
 *
 * The Explain panel renders one card per `knobs[]` entry; we expose WARP + MIRROR
 * (both clean 0..1 so the panel's percentage readout stays honest), and fold the
 * SIZE (grain/resolution) and MULT (sync brightness) guidance into the prose. The
 * knob `id`s must match getParameterSchema() ids in LaxsynthEngine.
 */
import type { EngineModel, EngineFamily } from "../audio/types";

export const LAXSYNTH_FAMILIES: EngineFamily[] = [
  { id: "wave",  label: "Wavetable" },
  { id: "noise", label: "Noise" },
];

const k = (id: string, label: string, text: string) => ({ id, label, text });

export const LAXSYNTH_MODELS: EngineModel[] = [
  // --- tonal wavetable shapes (indices 0..6) --------------------------------
  { index: 0, code: "SINE", name: "Sine", family: "wave",
    description: "A pure fundamental with no harmonics — until the operators add some. Raise MULT for hard-sync overtones; drop SIZE for a grittier, more aliased sine.",
    knobs: [
      k("warp", "Warp", "Bends the sine asymmetrically toward a brassy, formant-rich shape — the closest thing to a Casio-CZ resonant sweep without a filter."),
      k("mirror", "Mirror", "Folds the sine back on itself, adding octave and odd harmonics — subtle at first, hollow and reedy past 100%."),
    ],
    detail: {
      listenFor: "A clean, deep fundamental; Warp turns it vocal and brassy, MULT makes it ring like an FM carrier.",
      goodFor: "Sub bass, pure tones, and sine-on-sync leads. Keep SIZE high for a smooth sub, low for 8-bit fuzz." } },

  { index: 1, code: "TRI", name: "Triangle", family: "wave",
    description: "A soft, hollow odd-harmonic wave — mellower than a square, fuller than a sine. SIZE controls how stepped/aliased the slopes get; MULT stacks sync copies.",
    knobs: [
      k("warp", "Warp", "Skews the triangle so one slope steepens toward a saw/ramp lean — drifts from flutey to buzzy."),
      k("mirror", "Mirror", "Does almost nothing here — a triangle is already a mirror reflection about its centre. Use it on PULSE for real PWM."),
    ],
    detail: {
      listenFor: "A gentle, flute-like tone that thickens as you Warp it toward a saw.",
      goodFor: "Soft leads, mellow plucks, and a rounder alternative to a sub sine." } },

  { index: 2, code: "SAW", name: "Sawtooth", family: "wave",
    description: "The bright, buzzy workhorse — a full harmonic series. SIZE sets the grain (low = chiptune fizz), MULT adds sync edge.",
    knobs: [
      k("warp", "Warp", "Bends the falling edge toward a parabola or ramp — thins the buzz to a reedy whine or fattens it."),
      k("mirror", "Mirror", "Reflects the ramp into a triangle-ish shape, rolling off the harsh top end as you turn it up."),
    ],
    detail: {
      listenFor: "Classic bright, cutting buzz — the most harmonically rich starting point here.",
      goodFor: "Leads and basses that need to cut, acid lines (add resonance), big detune-style stabs via MULT." } },

  { index: 3, code: "RAMP", name: "Ramp", family: "wave",
    description: "A rising ramp — harmonically a saw's twin when played straight, but it reacts differently to asymmetric WARP and MIRROR, so the two diverge once you start shaping.",
    knobs: [
      k("warp", "Warp", "Pushes the rising edge into a curve — because the slope direction is flipped vs SAW, the same Warp gives a different bite."),
      k("mirror", "Mirror", "Folds the rising ramp into a peaked shape, thinning the harmonics from the top down."),
    ],
    detail: {
      listenFor: "Saw-like brightness on its own; the personality shows once Warp/Mirror skew it.",
      goodFor: "A second saw colour for layering, and asymmetric-warp leads that a plain saw can't reach." } },

  { index: 4, code: "PULS", name: "Pulse", family: "wave",
    description: "A square/pulse — hollow at 50% width, nasal and thin when narrow. This is the chip-lead staple. SIZE smooths or steps the edges.",
    knobs: [
      k("warp", "Warp", "Sweeps the phase for a moving, PWM-like shimmer — hand-automate it (or an LFO later) for that classic width wobble."),
      k("mirror", "Mirror", "Sets the pulse width directly — THIS is your PWM knob. 100% is a even square; away from centre narrows the pulse."),
    ],
    detail: {
      listenFor: "Hollow square → thin nasal pulse as Mirror moves off centre; the quintessential 8-bit lead.",
      goodFor: "Chiptune leads and reedy basses. Park Mirror for a fixed width, sweep it for PWM." } },

  { index: 5, code: "OVFL", name: "Overflow", family: "wave",
    description: "A wrapped, overflowed ramp — what you get when the wave runs past full scale and folds back, all jagged digital edges. SIZE and MULT make it more or less unhinged.",
    knobs: [
      k("warp", "Warp", "Changes where the overflow wraps, shifting the jagged steps into new buzzy harmonic clusters."),
      k("mirror", "Mirror", "Reflects the wrapped shape, multiplying the discontinuities for an even harsher, ring-mod-ish edge."),
    ],
    detail: {
      listenFor: "Harsh, buzzy, distinctly digital — the angriest of the tonal shapes.",
      goodFor: "Aggressive chip basses and leads, glitchy textures, anything that should sound broken-on-purpose." } },

  { index: 6, code: "HSIN", name: "Half-Sine", family: "wave",
    description: "A rectified half-sine with a hollow, formant-like bump — a Casio-CZ flavour. SIZE controls smoothness; MULT turns the bump into a buzzing comb.",
    knobs: [
      k("warp", "Warp", "Moves the formant-like peak across the cycle — a vowel-ish sweep that a filter alone can't do."),
      k("mirror", "Mirror", "Mirrors the half-cycle into a fuller, more symmetric tone, softening the formant character."),
    ],
    detail: {
      listenFor: "A hollow, vocal, slightly nasal tone with a movable resonant bump.",
      goodFor: "Vowel-ish leads, retro digital keys, and pads that want motion without a filter sweep." } },

  // --- noise shapes (indices 7..8) — bypass the wavetable --------------------
  { index: 7, code: "PNZ", name: "Pitched Noise", family: "noise",
    description: "Sample-and-hold noise re-sampled at the note's pitch — tuned grit that tracks the keyboard. SIZE sets the grain coarseness; the filter is your main tone-shaper here.",
    knobs: [
      k("warp", "Warp", "Little effect — noise bypasses the wavetable. Reach for SIZE (grain) and the filter to shape this one."),
      k("mirror", "Mirror", "Little effect on noise. Use the filter cutoff/resonance and DRIVE to carve the character instead."),
    ],
    detail: {
      listenFor: "Tuned hiss and grit that follows the pitch — between a tone and pure noise.",
      goodFor: "Percussion, noisy chip textures, wind and surf, and gritty layers under a tonal shape." } },

  { index: 8, code: "LFSR", name: "LFSR Noise", family: "noise",
    description: "Linear-feedback-shift-register noise — the metallic NES / Game Boy noise channel. SIZE shifts the grain between hiss and buzzy 'periodic noise'; the filter sets the tone.",
    knobs: [
      k("warp", "Warp", "Little effect — LFSR noise bypasses the wavetable. Shape it with SIZE (grain) and the filter."),
      k("mirror", "Mirror", "Little effect here. The DRIVE/limiter and filter do the tone-shaping for this one."),
    ],
    detail: {
      listenFor: "Unmistakable 8-bit console noise — snares, hats, lasers and zaps.",
      goodFor: "Chiptune drums and sound effects; pitch it low for a noisy bass-thud, high for hats." } },
];
