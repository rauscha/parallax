/**
 * The 24 Plaits synthesis models, in the firmware's engine-registry order
 * (dsp/vendor/plaits/dsp/voice.cc — the firmware-1.2 "engine2" voices occupy
 * indices 0..7, the original 16 follow at 8..23). The `index` goes straight
 * into plaits_set_engine(); do not reorder.
 *
 * HARMONICS / TIMBRE / MORPH meanings are quoted/paraphrased from Émilie
 * Gillet's official Plaits manual + the firmware-1.2 notes, in the same
 * conversational, action-oriented voice as the Braids catalogue. They are the
 * whole point of the Explain panel, so keep them tight and faithful.
 *
 * Sources:
 *  - https://pichenettes.github.io/mutable-instruments-documentation/modules/plaits/manual/
 *  - https://pichenettes.github.io/mutable-instruments-documentation/modules/plaits/firmware/
 */
import type { EngineModel, EngineFamily } from "../audio/types";

export const PLAITS_FAMILIES: EngineFamily[] = [
  { id: "analog",     label: "Analog" },
  { id: "distortion", label: "Waveshaping & Terrain" },
  { id: "fm",         label: "FM" },
  { id: "harmonic",   label: "Harmonic & Wavetable" },
  { id: "formant",    label: "Formant & Voice" },
  { id: "granular",   label: "Granular" },
  { id: "physical",   label: "Physical Models" },
  { id: "noise",      label: "Noise" },
  { id: "chiptune",   label: "Chiptune" },
  { id: "drum",       label: "Drums" },
];

const k = (id: string, label: string, text: string) => ({ id, label, text });

export const PLAITS_MODELS: EngineModel[] = [
  // --- firmware 1.2 expansion (registry indices 0..7) -----------------------
  { index: 0, code: "VAF", name: "Classic Waveshapes + Filter", family: "analog",
    description: "Two detuned analog-style oscillators running into a self-oscillating resonant filter.",
    knobs: [
      k("harmonics", "Harmonics", "Resonance and filter character — a gentle 24 dB/oct fully left, a harsher 12 dB/oct fully right."),
      k("timbre", "Timbre", "Filter cutoff — opens the voice from dark and closed to bright and open."),
      k("morph", "Morph", "Oscillator waveform and the amount of sub-oscillator underneath."),
    ],
    detail: {
      listenFor: "A creamy subtractive-synth voice — TIMBRE is a real filter sweep, and pushing HARMONICS into resonance gives you that vocal, whistling self-oscillation.",
      goodFor: "Classic analog basses, leads and pads when you want a filter to play with, not just a raw oscillator." } },

  { index: 1, code: "PD", name: "Phase Distortion", family: "distortion",
    description: "Casio-CZ-style phase distortion and phase modulation between two sine paths.",
    knobs: [
      k("harmonics", "Harmonics", "Distortion frequency — where in the waveform the bend happens, like a resonant peak."),
      k("timbre", "Timbre", "Distortion amount — from clean sine to buzzy, formant-rich edges."),
      k("morph", "Morph", "Distortion asymmetry — skews the shape for a different harmonic flavour."),
    ],
    detail: {
      listenFor: "That digital-but-warm CZ-101 character — a resonant sweep that's grittier than a filter but smoother than hard sync.",
      goodFor: "80s digital basses and leads, resonant sweeps without a filter, plucky synth keys." } },

  { index: 2, code: "6OPA", name: "6-Op FM · Bank A", family: "fm",
    description: "A two-voice, six-operator DX7-style FM engine — bank A leans to basses and synths (32 presets).",
    knobs: [
      k("harmonics", "Harmonics", "Preset selection — scrolls through the 32 factory FM patches in this bank."),
      k("timbre", "Timbre", "Modulator level — the master 'brightness/grit' of the FM, dialing the patch from mellow to clangorous."),
      k("morph", "Morph", "Envelope and modulation 'time-travel' — stretches the patch's built-in envelopes and movement."),
    ],
    detail: {
      listenFor: "Real DX7 voices — glassy electric pianos, metallic basses, bell tones, the unmistakable digital-FM sheen.",
      goodFor: "When you want authentic Yamaha-FM presets without programming operators by hand — basses and synth leads here." } },

  { index: 3, code: "6OPB", name: "6-Op FM · Bank B", family: "fm",
    description: "The same six-operator FM engine — bank B leans to keyboards, strings and percussion (32 presets).",
    knobs: [
      k("harmonics", "Harmonics", "Preset selection — scrolls the 32 keyboard / string / percussion FM patches."),
      k("timbre", "Timbre", "Modulator level — overall brightness and bite of the FM patch."),
      k("morph", "Morph", "Envelope and modulation stretching — speeds up or slows the patch's internal motion."),
    ],
    detail: {
      listenFor: "FM electric pianos, tuned mallets, plucky string-ish patches with that crisp digital attack.",
      goodFor: "Melodic, percussive FM tones — Rhodes-y keys, marimbas, harp-like plucks." } },

  { index: 4, code: "6OPC", name: "6-Op FM · Bank C", family: "fm",
    description: "The same six-operator FM engine — bank C leans to organs, pads and brass (32 presets).",
    knobs: [
      k("harmonics", "Harmonics", "Preset selection — scrolls the 32 organ / pad / brass FM patches."),
      k("timbre", "Timbre", "Modulator level — from soft and hollow to bright and reedy."),
      k("morph", "Morph", "Envelope and modulation stretching — reshapes the swell and movement of the patch."),
    ],
    detail: {
      listenFor: "Sustained FM textures — drawbar-ish organs, evolving pads, brassy stabs with digital edge.",
      goodFor: "Held chords and pads, organ tones, brass sections that need that DX-era character." } },

  { index: 5, code: "TERR", name: "Wave Terrain", family: "distortion",
    description: "Wave-terrain synthesis: a stylus traces a path across eight interpolated 2D landscapes.",
    knobs: [
      k("harmonics", "Harmonics", "Terrain — morphs continuously between the eight 2D landscapes the path runs over."),
      k("timbre", "Timbre", "Path radius — how big a loop the stylus traces, from a tiny circle to a wide sweep."),
      k("morph", "Morph", "Path offset — slides the loop across the terrain, uncovering new contours."),
    ],
    detail: {
      listenFor: "Unpredictable, organic timbres that shift as the path crosses ridges and valleys — somewhere between wavetable and FM.",
      goodFor: "Evolving leads and drones, sound-design textures, anything where you want surprise and motion." } },

  { index: 6, code: "STMC", name: "String Machine", family: "harmonic",
    description: "A vintage divide-down string-synth emulation with a stereo ensemble chorus.",
    knobs: [
      k("harmonics", "Harmonics", "Chord — selects the four-note chord the paraphonic voices spell out."),
      k("timbre", "Timbre", "Chorus / filter amount — the lush ensemble shimmer and brightness."),
      k("morph", "Morph", "Waveform — blends the drawbar/organ-ish source waves feeding the ensemble."),
    ],
    detail: {
      listenFor: "Solina/Logan string-ensemble warmth — a wide, chorused, slightly hollow pad that sits in a chord.",
      goodFor: "Lush string pads, retro sci-fi chords, anything that wants that 70s ensemble shimmer." } },

  { index: 7, code: "CHIP", name: "Chiptune", family: "chiptune",
    description: "A clocked arpeggiator driving variable-width square voices — an 8-bit games console in a patch. Each note you play steps the arpeggio one place through the chosen chord.",
    knobs: [
      k("harmonics", "Harmonics", "Chord — the set of notes the arpeggio walks through. Turn fully down for a single note (no arpeggio); up for richer chords."),
      k("timbre", "Timbre", "Arpeggio pattern & range — up / down / up-down / random, across 1, 2 or 4 octaves."),
      k("morph", "Morph", "Pulse width and sync — the squelchy width-mod and ring of the squares."),
    ],
    detail: {
      listenFor: "NES/Game-Boy squares with that unmistakable arpeggio chatter — because each strike advances the arp, repeating one note walks up or down the chord rather than replaying it.",
      goodFor: "8-bit arpeggios, chord stabs and bleeps. For straight melodic lines drop HARMONICS to minimum so every note plays as written; use the Decay knob to set how long each step rings." } },

  // --- original 16 (registry indices 8..23) ---------------------------------
  { index: 8, code: "VA", name: "Virtual Analog", family: "analog",
    description: "A classic pair of analog waveforms — one variable square, one variable saw.",
    knobs: [
      k("harmonics", "Harmonics", "Detuning between the two oscillators — from unison to a fat, drifting spread."),
      k("timbre", "Timbre", "The square wave, from a narrow pulse through full square into hard-sync formants."),
      k("morph", "Morph", "The saw wave, from triangle to sawtooth with an increasingly wide notch."),
    ],
    detail: {
      listenFor: "Pure, clean analog-style oscillators — detune them and you get a thick, beating, supersaw-ish wall.",
      goodFor: "Bread-and-butter synth basses, leads and pads; the raw-oscillator starting point." } },

  { index: 9, code: "WSH", name: "Waveshaper", family: "distortion",
    description: "An asymmetric triangle pushed through a waveshaper and wavefolder.",
    knobs: [
      k("harmonics", "Harmonics", "Waveshaper waveform — the curve the signal is bent through."),
      k("timbre", "Timbre", "Wavefolder amount — more folding adds brighter, metallic harmonics."),
      k("morph", "Morph", "Waveform asymmetry — skews the shape for even-harmonic, hollow colours."),
    ],
    detail: {
      listenFor: "West-coast Buchla-style timbres — folding adds shimmering overtones that bloom as TIMBRE rises.",
      goodFor: "Bright bells, harmonically rich leads, evolving folded drones." } },

  { index: 10, code: "FM", name: "2-Op FM", family: "fm",
    description: "Two sine oscillators in a simple FM pair, one modulating the other.",
    knobs: [
      k("harmonics", "Harmonics", "Frequency ratio between the two operators — sets the harmonic 'interval' of the FM."),
      k("timbre", "Timbre", "Modulation index — how much FM, from pure sine to bright and clangorous."),
      k("morph", "Morph", "Feedback — operator 2 modulating its own phase, adding grit and noise."),
    ],
    detail: {
      listenFor: "Textbook FM — clean bells and electric pianos at low index, harsh metallic edges as it climbs.",
      goodFor: "FM basses, bells, clangs, and that classic DX bite from just two operators." } },

  { index: 11, code: "FORM", name: "Granular Formant", family: "formant",
    description: "Two synchronized sine segments forming a moving formant — granular-formant synthesis.",
    knobs: [
      k("harmonics", "Harmonics", "Frequency ratio between formant 1 and formant 2."),
      k("timbre", "Timbre", "Formant frequency — slides the resonant peak up and down like a vowel."),
      k("morph", "Morph", "Formant width and shape — from broad and soft to narrow and sharp."),
    ],
    detail: {
      listenFor: "Vocal, vowel-like resonances and buzzy formant tones that move as TIMBRE sweeps.",
      goodFor: "Talking/vowel textures, gritty formant leads, vocal-ish pads." } },

  { index: 12, code: "ADD", name: "Harmonic Additive", family: "harmonic",
    description: "A mixture of harmonically-related sine waves — classic additive synthesis.",
    knobs: [
      k("harmonics", "Harmonics", "Number of bumps in the spectrum — how many harmonic peaks are emphasised."),
      k("timbre", "Timbre", "Index of the most prominent harmonic — which partial the spectrum centres on."),
      k("morph", "Morph", "Bump shape — from flat and wide to peaked and narrow."),
    ],
    detail: {
      listenFor: "Smooth, organ-like and bell-like tones built from pure partials — no filter, just harmonics.",
      goodFor: "Drawbar organs, glassy pads, clean harmonic leads and additive bells." } },

  { index: 13, code: "WT", name: "Wavetable", family: "harmonic",
    description: "Four banks of 8×8 wavetables with smooth interpolation between waves.",
    knobs: [
      k("harmonics", "Harmonics", "Bank selection — picks which of the four 8×8 wavetable banks you're scanning."),
      k("timbre", "Timbre", "Row index — scans vertically through the grid of waveforms."),
      k("morph", "Morph", "Column index — scans horizontally through the grid of waveforms."),
    ],
    detail: {
      listenFor: "Digital, PPG/Microwave-style sweeps — clean at rest, alive and buzzy when you scan TIMBRE/MORPH.",
      goodFor: "Evolving digital leads and pads, modulated wavetable motion, retro digital basses." } },

  { index: 14, code: "CHRD", name: "Chords", family: "harmonic",
    description: "A paraphonic four-note chord engine spanning several source waveforms.",
    knobs: [
      k("harmonics", "Harmonics", "Chord type — from octaves and fifths up through richer chord shapes."),
      k("timbre", "Timbre", "Chord inversion and transposition — voices the chord higher/lower and rotates it."),
      k("morph", "Morph", "Waveform — sweeps from organ-drawbar tones into wavetable colours."),
    ],
    detail: {
      listenFor: "Instant four-note chords from one note in — harmonically full, with the character set by MORPH.",
      goodFor: "Pads, stabs, and harmony from a monophonic sequence — chords without polyphony." } },

  { index: 15, code: "SPCH", name: "Speech / Vowels", family: "formant",
    description: "Several vocal algorithms, from formant filtering through SAM and LPC speech.",
    knobs: [
      k("harmonics", "Harmonics", "Crossfades between formant filtering, SAM, and LPC vowel sets."),
      k("timbre", "Timbre", "Species — shifts the formants from deep 'Daleks' up to chipmunk highs."),
      k("morph", "Morph", "Phoneme or word-segment selection — which vowel/word is spoken."),
    ],
    detail: {
      listenFor: "Robotic vowels and talking textures — anything from a low growl to a squeaky cartoon voice.",
      goodFor: "Vocal leads, talking-synth lines, robotic phrases and vowel pads." } },

  { index: 16, code: "SWRM", name: "Swarm", family: "granular",
    description: "A swarm of enveloped sawtooth grains clustered around the pitch.",
    knobs: [
      k("harmonics", "Harmonics", "Amount of pitch randomization across the swarm — tight unison to a wide cloud."),
      k("timbre", "Timbre", "Grain density — how thick and busy the swarm is."),
      k("morph", "Morph", "Grain duration and overlap — from short, separate grains to a smooth wash."),
    ],
    detail: {
      listenFor: "A shimmering, swarming cluster of saws — supersaw-like when tight, a noisy storm when spread.",
      goodFor: "Huge detuned leads, swarming pads, textural risers and clouds." } },

  { index: 17, code: "NOIS", name: "Filtered Noise", family: "noise",
    description: "Variable-clock noise through a resonant filter.",
    knobs: [
      k("harmonics", "Harmonics", "Filter response — sweeps from low-pass through band-pass to high-pass."),
      k("timbre", "Timbre", "Clock frequency — the 'pitch' / brightness of the noise source."),
      k("morph", "Morph", "Filter resonance — from soft coloration to a ringing, pitched whistle."),
    ],
    detail: {
      listenFor: "Pitched and unpitched noise — wind, hiss, surf, or a resonant whistle when MORPH rings the filter.",
      goodFor: "Percussion, wind/sea textures, noise sweeps, and resonant zaps." } },

  { index: 18, code: "DUST", name: "Particle Noise", family: "granular",
    description: "Particles of noise fired through a network of band-pass / all-pass filters.",
    knobs: [
      k("harmonics", "Harmonics", "Amount of frequency randomization of the particles."),
      k("timbre", "Timbre", "Particle density — sparse clicks up to a dense crackle."),
      k("morph", "Morph", "Filter type — from all-pass through to band-pass colour."),
    ],
    detail: {
      listenFor: "Crackle, rain, Geiger-counter clicks and granular sparkle that thickens with TIMBRE.",
      goodFor: "Textural percussion, rain/fire ambiences, glitchy sparkle layers." } },

  { index: 19, code: "STRG", name: "Inharmonic String", family: "physical",
    description: "A plucked/bowed inharmonic string — Karplus-Strong physical modelling (mini-Rings).",
    knobs: [
      k("harmonics", "Harmonics", "Inharmonicity, or material — from a clean string toward bell-like, metallic tension."),
      k("timbre", "Timbre", "Excitation brightness and the density of the 'dust' that drives the string."),
      k("morph", "Morph", "Decay time — how long the string rings, from a short pluck to a long sustain."),
    ],
    detail: {
      listenFor: "Plucked and bowed strings with real physical body — set HARMONICS high for prepared-piano clang.",
      goodFor: "Plucks, kalimba and koto tones, bowed pads, and inharmonic struck sounds." } },

  { index: 20, code: "MODL", name: "Modal Resonator", family: "physical",
    description: "A modal resonator — struck and bowed bars, bowls and tubes (mini-Rings).",
    knobs: [
      k("harmonics", "Harmonics", "Inharmonicity, or material — wood and nylon through glass and metal."),
      k("timbre", "Timbre", "Excitation brightness and dust density — softens or sharpens the strike."),
      k("morph", "Morph", "Decay time — energy absorption, from a quick tap to a long ring."),
    ],
    detail: {
      listenFor: "Mallets, bells, bowls and tuned percussion with believable resonant bodies.",
      goodFor: "Marimbas, glass/metal percussion, gongs and resonant struck/bowed tones." } },

  { index: 21, code: "BD", name: "Analog Bass Drum", family: "drum",
    description: "An analog bass-drum circuit simulation — the classic 808/909-style kick.",
    knobs: [
      k("harmonics", "Harmonics", "Attack sharpness and amount of overdrive — click and grit on the front of the hit."),
      k("timbre", "Timbre", "Brightness — the tone and punch of the body."),
      k("morph", "Morph", "Decay time — from a tight thud to a long booming tail."),
    ],
    detail: {
      listenFor: "A real analog kick — round and deep, with a clicky overdriven transient when HARMONICS is up.",
      goodFor: "Kick drums of every flavour, from tight techno thumps to long 808 booms (use with a note trigger)." } },

  { index: 22, code: "SD", name: "Analog Snare", family: "drum",
    description: "An analog snare/tom circuit — bridged-T resonators plus filtered noise.",
    knobs: [
      k("harmonics", "Harmonics", "Balance of the tonal body and the noisy 'snare' component."),
      k("timbre", "Timbre", "Balance between the different resonant modes of the drum — tunes the body."),
      k("morph", "Morph", "Decay time — from a short snap to a ringing rattle."),
    ],
    detail: {
      listenFor: "Snares and toms — dial HARMONICS toward noise for a snare, toward tone for a tom.",
      goodFor: "Snares, rimshots and toms; pitch it across the keyboard for a tom kit." } },

  { index: 23, code: "HH", name: "Analog Hi-Hat", family: "drum",
    description: "An analog hi-hat / cymbal — a cluster of square oscillators with a metallic edge.",
    knobs: [
      k("harmonics", "Harmonics", "Balance of the metallic oscillator cluster and the filtered noise."),
      k("timbre", "Timbre", "High-pass filter cutoff — how thin and sizzly the top end is."),
      k("morph", "Morph", "Decay time — from a tight closed hat to an open, washy cymbal."),
    ],
    detail: {
      listenFor: "Metallic, sizzling hats and cymbals — that ringing 6-square 808 character.",
      goodFor: "Closed and open hi-hats, ride/crash-ish metals, and metallic percussion." } },
];

/** Quick lookup by engine index. */
export function getPlaitsModel(index: number): EngineModel | undefined {
  return PLAITS_MODELS[index];
}
