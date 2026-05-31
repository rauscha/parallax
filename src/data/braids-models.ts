/**
 * The 47 Braids synthesis models, sourced from Émilie Gillet's official manual
 * (pichenettes.github.io/mutable-instruments-documentation/modules/braids/manual)
 * cross-referenced with the firmware's enum (dsp/vendor/braids/settings.h).
 *
 * The `index` is the firmware's MacroOscillatorShape enum value — the integer
 * that goes into braids_set_shape(). Do not reorder this array.
 *
 * Per-model TIMBRE/COLOR meanings are the *whole reason this app exists* — the
 * explain panel in M4 will surface them. Keep them tight, concrete, and
 * faithful to the manual.
 */

export type BraidsFamily =
  | "analog"
  | "digital-filter"
  | "formant"
  | "harmonic"
  | "fm"
  | "physical"
  | "drum"
  | "wavetable"
  | "noise"
  | "modulation";

export interface BraidsModel {
  /** Firmware enum index (0..46). Goes directly into braids_set_shape(). */
  index: number;
  /** 4-character display code, hardware-style. */
  code: string;
  /** Display name in plain English. */
  name: string;
  /** Loose grouping for the model picker. */
  family: BraidsFamily;
  /** One-sentence character description. */
  description: string;
  /** What the TIMBRE knob does in this model. */
  timbre: string;
  /** What the COLOR knob does in this model. */
  color: string;
}

export const BRAIDS_MODELS: BraidsModel[] = [
  { index: 0, code: "CSAW", name: "CS-80 Sawtooth", family: "analog",
    description: "A sawtooth with a moving notch — modeled after the Yamaha CS-80's filter character.",
    timbre: "Width of the notch carved out of the sawtooth.",
    color: "Depth and polarity of the notch — flips between subtractive and resonant feel." },

  { index: 1, code: "MORPH", name: "Waveform Trajectory", family: "analog",
    description: "Sweeps a single oscillator continuously through triangle → sawtooth → square → pulse.",
    timbre: "Position along the triangle-saw-square-pulse trajectory.",
    color: "Tonal warmth — removes or restores high frequencies as you turn it." },

  { index: 2, code: "SHRED", name: "Sawtooth-Square Blend", family: "analog",
    description: "Two waveforms layered with phase offset and pulse-width control — the classic 'fattening' analog sound.",
    timbre: "Dephasing between the two oscillators, or pulse width of the square.",
    color: "Morph between sawtooth and square content." },

  { index: 3, code: "FOLD", name: "Wavefolder", family: "analog",
    description: "Sine and triangle pushed through a folding wave-shaper — the West Coast / Buchla flavor.",
    timbre: "Folding strength — adds harmonics by reflecting the wave back on itself.",
    color: "Balance between sine and triangle inputs to the folder." },

  { index: 4, code: "PLPK", name: "Buzz / Formant-like", family: "analog",
    description: "Waveform shaped toward a Dirac comb — pulse-like, formant-rich tones.",
    timbre: "Progression of the waveform toward a Dirac (pulse) comb.",
    color: "Detuning between two waveshapes." },

  { index: 5, code: "SQR-", name: "Square + Sub", family: "analog",
    description: "Square oscillator with a sub-octave square added below.",
    timbre: "Pulse width of the main square.",
    color: "Balance between main and sub-octave." },

  { index: 6, code: "SAW-", name: "Sawtooth + Sub", family: "analog",
    description: "Sawtooth oscillator with a sub-octave square added below.",
    timbre: "Detuning / character of the main sawtooth.",
    color: "Balance between main and sub-octave." },

  { index: 7, code: "SYN-Q", name: "Square Hard-Sync", family: "analog",
    description: "A slave square reset by a master oscillator — the classic searing sync sweep.",
    timbre: "Pulse width of the slave square.",
    color: "Slave frequency relative to the master." },

  { index: 8, code: "SYN-W", name: "Sawtooth Hard-Sync", family: "analog",
    description: "A slave sawtooth reset by a master oscillator — bright, vocal, lead-synth sync sound.",
    timbre: "Character of the slave sawtooth.",
    color: "Slave frequency relative to the master." },

  { index: 9, code: "SWx3", name: "Three Sawtooth Oscillators", family: "analog",
    description: "Three sawtooth oscillators stacked at musical intervals.",
    timbre: "Frequency interval of the second oscillator (quantized to musical intervals).",
    color: "Frequency interval of the third oscillator (quantized to musical intervals)." },

  { index: 10, code: "SQx3", name: "Three Square Oscillators", family: "analog",
    description: "Three square oscillators stacked at musical intervals.",
    timbre: "Frequency interval of the second oscillator (quantized).",
    color: "Frequency interval of the third oscillator (quantized)." },

  { index: 11, code: "TRx3", name: "Three Triangle Oscillators", family: "analog",
    description: "Three triangle oscillators stacked at musical intervals — softer than the saw/square stacks.",
    timbre: "Frequency interval of the second oscillator (quantized).",
    color: "Frequency interval of the third oscillator (quantized)." },

  { index: 12, code: "SIx3", name: "Three Sine Oscillators", family: "analog",
    description: "Three sine waves stacked — pure, organ-like additive chords.",
    timbre: "Frequency interval of the second sine (quantized).",
    color: "Frequency interval of the third sine (quantized)." },

  { index: 13, code: "RING", name: "Ring-Modulated Sines", family: "analog",
    description: "Two sine waves multiplied — bell-like inharmonic metallic tones.",
    timbre: "Frequency of the second sine relative to the carrier.",
    color: "Frequency of the third sine relative to the carrier." },

  { index: 14, code: "SWRM", name: "Sawtooth Swarm", family: "analog",
    description: "A dense cluster of detuned sawtooths — supersaw-style swarming pad.",
    timbre: "Amount of detuning across the swarm.",
    color: "Cutoff of a high-pass filter on the swarm." },

  { index: 15, code: "COMB", name: "Sawtooth + Comb Filter", family: "analog",
    description: "A sawtooth fed through a comb filter — Karplus-Strong-ish resonances.",
    timbre: "Comb delay length (resonant pitch).",
    color: "Comb feedback amount and polarity (sign flip = different timbre)." },

  { index: 16, code: "TOY*", name: "Electronic Toy", family: "analog",
    description: "Bit-reduced glitchy 'broken toy' sound — deliberately lo-fi.",
    timbre: "Simulated clock rate of the toy circuit.",
    color: "Glitch density." },

  { index: 17, code: "ZLPF", name: "Low-Pass Filter Synthesis", family: "digital-filter",
    description: "Oscillator + low-pass filter as a single combined model — warm, subtractive feel.",
    timbre: "Cutoff frequency of the low-pass.",
    color: "Morph the source waveshape feeding the filter." },

  { index: 18, code: "ZPKF", name: "Peaking Filter Synthesis", family: "digital-filter",
    description: "Oscillator + resonant peaking filter — vocal, formant-ish bump.",
    timbre: "Centre frequency of the peak.",
    color: "Morph the source waveshape." },

  { index: 19, code: "ZBPF", name: "Band-Pass Filter Synthesis", family: "digital-filter",
    description: "Oscillator + band-pass — nasal, focused tones.",
    timbre: "Centre frequency of the band-pass.",
    color: "Morph the source waveshape." },

  { index: 20, code: "ZHPF", name: "High-Pass Filter Synthesis", family: "digital-filter",
    description: "Oscillator + high-pass — bright, thinned-out tones.",
    timbre: "Cutoff frequency of the high-pass.",
    color: "Morph the source waveshape." },

  { index: 21, code: "VOSM", name: "VOSIM (formant emulation)", family: "formant",
    description: "Two formant peaks generated by the VOSIM algorithm — vowel-adjacent, vocal textures.",
    timbre: "Frequency of the first formant.",
    color: "Frequency of the second formant." },

  { index: 22, code: "VOWL", name: "Vowel Speech Synthesis", family: "formant",
    description: "Sung-vowel synthesis — interpolates between A, E, I, O, U as you turn the knob.",
    timbre: "Vowel — sweeps a → e → i → o → u.",
    color: "Formant frequency shift (vocal-tract size)." },

  { index: 23, code: "VFOF", name: "FOF Vowel Synthesis", family: "formant",
    description: "Vowel synthesis using FOF (Fonction d'Onde Formantique) — smoother, more singer-like than VOWL.",
    timbre: "Vowel — sweeps through a → e → i → o → u.",
    color: "Formant frequency shift." },

  { index: 24, code: "HARM", name: "Additive Harmonics", family: "harmonic",
    description: "12-harmonic additive synthesis — chimes, bells, organs, glassy tones.",
    timbre: "Central harmonic — where the energy peaks in the spectrum.",
    color: "Distribution of amplitude across the 12 harmonics." },

  { index: 25, code: "FM", name: "Phase Modulation (FM)", family: "fm",
    description: "Two-operator phase modulation — DX7-style bell, brass, electric piano tones.",
    timbre: "Modulation amount (FM index).",
    color: "Modulator-to-carrier frequency ratio." },

  { index: 26, code: "FBFM", name: "Feedback FM", family: "fm",
    description: "Phase modulation with operator feedback — harsher, more aggressive than plain FM.",
    timbre: "Modulation amount (with feedback).",
    color: "Modulator-to-carrier frequency ratio." },

  { index: 27, code: "WTFM", name: "Chaotic Feedback FM", family: "fm",
    description: "Dual-feedback FM — unstable, droning, often dissonant; sits between musical and broken.",
    timbre: "Modulation amount.",
    color: "Modulator-to-carrier ratio (small changes can flip the timbre completely)." },

  { index: 28, code: "PLUK", name: "Plucked String", family: "physical",
    description: "Physical-model plucked string (Karplus-Strong).",
    timbre: "Damping — how fast the string loses energy.",
    color: "Plucking position along the string." },

  { index: 29, code: "BOWD", name: "Bowed String", family: "physical",
    description: "Physical-model bowed string.",
    timbre: "Bow friction.",
    color: "Bowing position along the string." },

  { index: 30, code: "BLOW", name: "Reed Instrument", family: "physical",
    description: "Physical-model reed instrument — clarinet/saxophone family.",
    timbre: "Air pressure on the reed.",
    color: "Geometry of the instrument body (changes the formant character)." },

  { index: 31, code: "FLUT", name: "Flute", family: "physical",
    description: "Physical-model flute / blown bottle.",
    timbre: "Air pressure on the embouchure.",
    color: "Geometry of the instrument body." },

  { index: 32, code: "BELL", name: "Struck Bell", family: "physical",
    description: "Struck bell using Risset-style additive synthesis — long, shimmering inharmonic decay.",
    timbre: "Damping — how quickly the bell quietens.",
    color: "Inharmonicity — spreads or tightens the partials." },

  { index: 33, code: "DRUM", name: "Struck Metallic Drum", family: "physical",
    description: "Struck metallic drum / membrane — gong-like, metallic strikes.",
    timbre: "Damping.",
    color: "Brightness of the strike." },

  { index: 34, code: "KICK", name: "TR-808 Bass Drum", family: "drum",
    description: "Roland TR-808 bass drum model — the iconic boom.",
    timbre: "Decay length of the drum body.",
    color: "Brightness / tone of the click and body." },

  { index: 35, code: "CYMB", name: "Cymbal", family: "drum",
    description: "Cymbal model built from band-passed metallic noise plus harmonic squares.",
    timbre: "Band-pass filter cutoff.",
    color: "Balance between metallic squares and white noise." },

  { index: 36, code: "SNAR", name: "TR-808 Snare", family: "drum",
    description: "Roland TR-808 snare model — pitched resonator plus noise burst.",
    timbre: "Tonal balance of the snare's resonator modes.",
    color: "Amount of snare-wire noise (snappiness)." },

  { index: 37, code: "WTBL", name: "Wavetable (1D)", family: "wavetable",
    description: "Scans through one of 20 stored wavetables — each is a curated palette of waveforms.",
    timbre: "Scan position within the current wavetable.",
    color: "Selects which of the 20 wavetables is loaded." },

  { index: 38, code: "WMAP", name: "Wave Map (2D)", family: "wavetable",
    description: "16×16 grid of waveforms — scan in two dimensions for a huge timbral surface.",
    timbre: "X-axis position (column) in the 16×16 grid.",
    color: "Y-axis position (row) in the 16×16 grid." },

  { index: 39, code: "WLIN", name: "Linear Wavetable Scan", family: "wavetable",
    description: "Single linear path through a sequence of waveforms with selectable interpolation.",
    timbre: "Position along the linear wavetable sequence.",
    color: "Interpolation method between adjacent waves (changes the morph character)." },

  { index: 40, code: "WTx4", name: "4-Voice Wavetable Chord", family: "wavetable",
    description: "Four wavetable voices stacked as a chord — paraphonic from a single trigger.",
    timbre: "Selects one of 16 wavetable banks.",
    color: "Selects the chord / harmonic structure of the four voices." },

  { index: 41, code: "NOIS", name: "Filtered Noise", family: "noise",
    description: "White noise through a resonant filter — wind, hiss, pitched whoosh.",
    timbre: "Filter resonance (sharpens into a pitched tone at high Q).",
    color: "Cross-fade between low-pass and high-pass filter shapes." },

  { index: 42, code: "TWNQ", name: "Twin-Peak Resonators", family: "noise",
    description: "Noise through two parallel resonant filters — vocal/whistling resonances.",
    timbre: "Q-factor of the resonators.",
    color: "Frequency spacing between the two resonant peaks." },

  { index: 43, code: "CLKN", name: "Clocked Noise", family: "noise",
    description: "Noise sample-and-held at a controllable clock rate — granular, glitchy textures.",
    timbre: "Clock period — down to a 2-sample cycle.",
    color: "Bit-depth of the held value (2–32 discrete levels)." },

  { index: 44, code: "CLOU", name: "Granular Sine Cloud", family: "noise",
    description: "Cloud of overlapping sine-wave grains — pad, drone, swarm textures.",
    timbre: "Grain density / overlap.",
    color: "Random spread of grain frequencies." },

  { index: 45, code: "PRTC", name: "Particle Noise", family: "noise",
    description: "Cloud of decaying impulse grains — rain, static, sparkle.",
    timbre: "Grain density / overlap.",
    color: "Random spread of grain frequencies." },

  { index: 46, code: "QPSK", name: "Digital Modulation", family: "modulation",
    description: "QPSK-style digital modulation of an 8-bit value — modem-like, bit-tonal sounds.",
    timbre: "Bit rate (carrier modulation speed).",
    color: "The 8-bit value being modulated (which symbols are sent)." },
];

/** Quick lookup by index. */
export function getBraidsModel(index: number): BraidsModel | undefined {
  return BRAIDS_MODELS[index];
}

/** Group by family for the picker. */
export const BRAIDS_FAMILIES: { id: BraidsFamily; label: string }[] = [
  { id: "analog",          label: "Analog & Sub" },
  { id: "digital-filter",  label: "Z-Filters" },
  { id: "formant",         label: "Formants / Voice" },
  { id: "harmonic",        label: "Harmonic" },
  { id: "fm",              label: "FM" },
  { id: "physical",        label: "Physical Models" },
  { id: "drum",            label: "Drums" },
  { id: "wavetable",       label: "Wavetables" },
  { id: "noise",           label: "Noise / Granular" },
  { id: "modulation",      label: "Digital Modulation" },
];
