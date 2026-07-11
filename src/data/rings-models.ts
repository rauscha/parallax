/**
 * The 12 Rings models: the 6 resonator models of rings::Part (3 normal +
 * 3 "hidden", in the firmware's ResonatorModel enum order —
 * dsp/vendor/rings/dsp/part.h) at indices 0..5, then the "Disastrous Peace"
 * easter-egg string synth (rings::StringSynthPart) at 6..11, one entry per
 * FxType in enum order. The `index` goes straight into rings_set_model();
 * do not reorder.
 *
 * STRUCTURE / BRIGHTNESS / DAMPING / POSITION meanings are paraphrased from
 * Émilie Gillet's official Rings manual, then checked against the vendored
 * firmware source (part.cc, resonator.cc, string.cc, fm_voice.cc,
 * string_synth_part.cc, fx/reverb.h) in the same conversational voice as the
 * Braids and Plaits catalogues. A few manual-style phrasings didn't survive
 * that check and were corrected — see task-5-report.md for the citations.
 * They are the whole point of the Explain panel — keep them tight and
 * faithful.
 *
 * Sources:
 *  - https://pichenettes.github.io/mutable-instruments-documentation/modules/rings/manual/
 *  - dsp/vendor/rings/dsp/part.cc, string_synth_part.cc (ground truth)
 */
import type { EngineModel, EngineFamily } from "../audio/types";

export const RINGS_FAMILIES: EngineFamily[] = [
  { id: "modal",   label: "Modal Resonator" },
  { id: "strings", label: "Strings" },
  { id: "fm",      label: "FM Voice" },
  { id: "synth",   label: "String Synth (Disastrous Peace)" },
];

const k = (id: string, label: string, text: string) => ({ id, label, text });

// The four knob cards every Disastrous Peace variant shares, minus POSITION
// (which is where the variants differ — each supplies its own).
const dpChord = k("structure", "Structure", "Chord — picks the chord the paraphonic string voices spell out, from the firmware's built-in chord table.");
const dpReg   = k("brightness", "Brightness", "Registration — the blend of octaves and harmonics feeding the ensemble, like pulling drawbars on an organ.");
const dpEnv   = k("damping", "Damping", "Swell and fade — the envelope of the pad around each strum, from organ-stab to slow string-machine bloom.");

export const RINGS_MODELS: EngineModel[] = [
  // --- rings::Part — the resonator models (indices 0..5) --------------------
  { index: 0, code: "MODL", name: "Modal Resonator", family: "modal",
    description: "A bank of tuned resonant filters — the physics of struck bells, bars, tubes and plates.",
    knobs: [
      k("structure", "Structure", "Material and geometry — sweeps the interval between partials from tight plate-like clusters through wooden-bar spacing out to wide, bell-like inharmonic spreads."),
      k("brightness", "Brightness", "Excitation brightness — felt-muted and dark on the left; hard, metallic, many-partialed shimmer on the right."),
      k("damping", "Damping", "Decay time — from a dry woodblock thud to a ring that hangs in the air for many seconds."),
      k("position", "Position", "Strike position — where the mallet lands. Moving it nulls out different partials, like hitting a bar at its node versus its edge."),
    ],
    detail: {
      listenFor: "A genuinely physical strike. Sweep STRUCTURE slowly and hear the same hit morph from wood to glass to bell — the partials re-space while the attack stays put.",
      goodFor: "Mallet instruments, bells, glassy percussion, gamelan tones — pitched thuds and rings that sit beautifully under a melody." } },

  { index: 1, code: "SYMP", name: "Sympathetic Strings", family: "strings",
    description: "One plucked string surrounded by a set of sympathetic strings that ring along with it.",
    knobs: [
      k("structure", "Structure", "Sympathetic tuning — the intervals of the accompanying strings: unisons and fifths on the left, wider and stranger spreads to the right."),
      k("brightness", "Brightness", "String material — warm nylon to bright steel; the sympathetic halo shimmers more as it opens."),
      k("damping", "Damping", "Decay time of the whole string set — short pluck to long communal ring."),
      k("position", "Position", "Pluck position, doubled up — sets where the main string is struck (as on a bare string), while the sympathetic strings orbit that same point on a slow per-string LFO, wobbling hardest near the middle of the range and sitting still at the extremes."),
    ],
    detail: {
      listenFor: "The halo. A single pluck sets the neighbouring strings humming in sympathy, like a sitar's drone strings answering the note.",
      goodFor: "Sitar-ish plucks, rich drones, meditative arpeggios where every note leaves a glow behind it." } },

  { index: 2, code: "STRG", name: "Modulated String", family: "strings",
    description: "A physically modelled string with adjustable stiffness — from perfect harp to detuned, bell-tinged piano wire.",
    knobs: [
      k("structure", "Structure", "Stiffness and dispersion — a perfectly harmonic string on the left; upper partials stretch sharp like piano wire through the middle, then buzz inharmonically at the top."),
      k("brightness", "Brightness", "Pluck brightness — soft thumb to hard pick."),
      k("damping", "Damping", "Decay time — staccato pluck to long singing sustain."),
      k("position", "Position", "Pluck position — comb-filters the attack; near the bridge is thin and nasal, near the middle round and full."),
    ],
    detail: {
      listenFor: "What STRUCTURE does to the overtones — dead-on harmonic low, piano-stretch in the middle, metallic buzz up top. The workhorse string.",
      goodFor: "Plucks, harps, clavs, koto lines — any melody that wants a real string under it." } },

  { index: 3, code: "FMVC", name: "FM Voice", family: "fm",
    description: "A two-operator FM voice hiding inside the resonator — one of the firmware's hidden models.",
    knobs: [
      k("structure", "Structure", "Carrier-to-modulator ratio — steps through a catalogue of tuned ratios, from consonant octaves to clangorous inharmonic pairs."),
      k("brightness", "Brightness", "Modulation index — sine-pure on the left; bright and brassy as the modulator digs in."),
      k("damping", "Damping", "Envelope decay of the internal FM voice — pluck to long bell."),
      k("position", "Position", "Feedback — pushes the modulator into itself for raspier, noisier spectra."),
    ],
    detail: {
      listenFor: "Classic 2-op FM — glassy electric-piano attacks and metallic bell tones — but strummed and rung like a physical instrument.",
      goodFor: "FM bells, DX-flavoured plucks and basses that keep the resonator's natural ring-out." } },

  { index: 4, code: "SYMQ", name: "Quantized Strings", family: "strings",
    description: "Sympathetic strings, quantized — the string set snaps to a table of real chords instead of free intervals. Hidden model.",
    knobs: [
      k("structure", "Structure", "Chord — steps through the firmware's chord table; every strum lands on a recognizable harmony."),
      k("brightness", "Brightness", "String material — warm and dark to bright and steely."),
      k("damping", "Damping", "Decay time of the chordal string set."),
      k("position", "Position", "Pluck position, doubled up — same as Sympathetic Strings: sets the strike point on the lead voice while its chordal partners drift around it on a slow LFO, opening into shimmer near mid-range and settling flat at the extremes."),
    ],
    detail: {
      listenFor: "SYMP's halo locked to actual chords — strum once and a tuned, harmonious cloud blooms every time.",
      goodFor: "Chordal drones and pads that always land in key — pairs perfectly with Snap-to-scale." } },

  { index: 5, code: "VERB", name: "String + Reverb", family: "strings",
    description: "The modulated string with a lush reverb wrapped around it — pluck and space in one voice. Hidden model.",
    knobs: [
      k("structure", "Structure", "Stiffness and dispersion of the string — harmonic to piano-stretched to buzzy."),
      k("brightness", "Brightness", "Pluck brightness, and with it how much sparkle feeds the tail."),
      k("damping", "Damping", "Decay of string AND tail together — turns a dry pluck into a wash."),
      k("position", "Position", "Pluck position — the comb-filtered attack colour that the reverb then carries."),
    ],
    detail: {
      listenFor: "The reverb blooming out of each pluck — this is the hidden model people fall in love with.",
      goodFor: "Ambient plucks, intros, codas — anything that should sound finished without any external effects." } },

  // --- rings::StringSynthPart — "Disastrous Peace" (indices 6..11) ----------
  { index: 6, code: "DPFM", name: "Disastrous Peace · Formant", family: "synth",
    description: "The easter-egg paraphonic string synth — a 70s divide-down machine — through a vowel-like formant filter.",
    knobs: [dpChord, dpReg, dpEnv,
      k("position", "Position", "Formant depth — vowel-like filtering over the strings; talk-box territory to the right."),
    ],
    detail: {
      listenFor: "A whole string section that seems to sing vowels — the formant filter makes the chord talk.",
      goodFor: "Vocal pads, retro sci-fi choirs, drones with a human shadow in them." } },

  { index: 7, code: "DPCH", name: "Disastrous Peace · Chorus", family: "synth",
    description: "The easter-egg string synth through a thick stereo-style chorus.",
    knobs: [dpChord, dpReg, dpEnv,
      k("position", "Position", "Chorus depth — from dry strings to wide, seasick ensemble motion."),
    ],
    detail: {
      listenFor: "The chord going liquid as POSITION rises — classic chorused string-machine swim.",
      goodFor: "Warm retro pads, Boards-of-Canada haze, backdrops that move without an LFO." } },

  { index: 8, code: "DPRV", name: "Disastrous Peace · Reverb", family: "synth",
    description: "The easter-egg string synth soaked in a hall reverb.",
    knobs: [dpChord, dpReg, dpEnv,
      k("position", "Position", "Reverb send — the hall grows around the strings until they dissolve into it."),
    ],
    detail: {
      listenFor: "Each strum blooming into the room — the pad and its space are one instrument here.",
      goodFor: "Ambient beds, slow chord changes, endings that fade instead of stopping." } },

  { index: 9, code: "DPF2", name: "Disastrous Peace · Formant II", family: "synth",
    description: "The string synth through a second formant set — shifted higher than the first, but with a softer, less peaky resonance.",
    knobs: [dpChord, dpReg, dpEnv,
      k("position", "Position", "Formant depth — vowel shapes pitched brighter than the first formant mode, but rounder and less peaky, not sharper."),
    ],
    detail: {
      listenFor: "The difference from DPFM — same singing strings, but the vowels sit higher and softer-edged, less nasal, not more defined.",
      goodFor: "Airier, softer vocal textures over the chord — a gentler foil to DPFM's more pronounced formants, good for calls-and-answers between the two." } },

  { index: 10, code: "DPEN", name: "Disastrous Peace · Ensemble", family: "synth",
    description: "The string synth through a multi-voice ensemble — the classic string-machine swirl.",
    knobs: [dpChord, dpReg, dpEnv,
      k("position", "Position", "Ensemble depth — the many-LFO shimmer that made 70s string machines sound huge."),
    ],
    detail: {
      listenFor: "That unmistakable Solina-style swirl — dozens of phantom players drifting around the chord.",
      goodFor: "The definitive retro string pad. When in doubt, this is the Disastrous Peace to reach for." } },

  { index: 11, code: "DPR2", name: "Disastrous Peace · Reverb II", family: "synth",
    description: "The string synth through a second reverb — tighter and brighter than the first, with more room to sweep from a short slap to a longer wash.",
    knobs: [dpChord, dpReg, dpEnv,
      k("position", "Position", "Reverb send — a shorter, brighter tail than DPRV's at the same setting, with a wider sweep from a quick slap to a fairly long wash."),
    ],
    detail: {
      listenFor: "The brighter, tighter room — same strings as DPRV, but the tail keeps more top end and covers a wider range of lengths.",
      goodFor: "Bright ambient washes and short reverberant stabs — a crisper, less cavernous alternative to DPRV when the mix needs less mud." } },
];

export function getRingsModel(index: number): EngineModel | undefined {
  return RINGS_MODELS[index];
}
