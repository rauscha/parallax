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
  /**
   * Deeper explanation for the Explain panel, split into two scannable lines:
   * `listenFor` is the sonic character — what your ear catches as TIMBRE/COLOR
   * move; `goodFor` is the musical use, references, and what to reach for it for.
   * Conversational and action-oriented (see the voice in any entry below).
   */
  detail?: { listenFor: string; goodFor: string };
}

export const BRAIDS_MODELS: BraidsModel[] = [
  { index: 0, code: "CSAW", name: "CS-80 Sawtooth", family: "analog",
    description: "A sawtooth with a moving notch — modeled after the Yamaha CS-80's filter character.",
    timbre: "Width of the notch carved out of the sawtooth.",
    color: "Depth and polarity of the notch — flips between subtractive and resonant feel.",
    detail: {
      listenFor: "A hollow, slightly nasal sawtooth where TIMBRE widens a notch carved out of the spectrum and COLOR deepens it from a gentle scoop into a resonant, vowel-like honk.",
      goodFor: "Vintage poly-synth leads and pads with that Vangelis CS-80 character; nudge COLOR for a sweepable resonant edge without reaching for a real filter." } },

  { index: 1, code: "MORPH", name: "Waveform Trajectory", family: "analog",
    description: "Sweeps a single oscillator continuously through triangle → sawtooth → square → pulse.",
    timbre: "Position along the triangle-saw-square-pulse trajectory.",
    color: "Tonal warmth — removes or restores high frequencies as you turn it.",
    detail: {
      listenFor: "The tone thickening as TIMBRE walks from a soft triangle through a buzzy sawtooth into a hollow square and thin pulse, with COLOR rolling the highs off or back on like a tone control.",
      goodFor: "One knob that covers most classic analog waveshapes — ideal for sweeping basses and morphing leads where you want a single continuous timbre move." } },

  { index: 2, code: "SHRED", name: "Sawtooth-Square Blend", family: "analog",
    description: "Two waveforms layered with phase offset and pulse-width control — the classic 'fattening' analog sound.",
    timbre: "Dephasing between the two oscillators, or pulse width of the square.",
    color: "Morph between sawtooth and square content.",
    detail: {
      listenFor: "Two detuned oscillators beating against each other — TIMBRE smears their phase (or the square's pulse width) for movement while COLOR blends from saw grit to square hollowness.",
      goodFor: "Fat, wide analog basses and leads; the built-in dephasing gives you that chorus-y 'two-VCO' thickness from a single voice." } },

  { index: 3, code: "FOLD", name: "Wavefolder", family: "analog",
    description: "Sine and triangle pushed through a folding wave-shaper — the West Coast / Buchla flavor.",
    timbre: "Folding strength — adds harmonics by reflecting the wave back on itself.",
    color: "Balance between sine and triangle inputs to the folder.",
    detail: {
      listenFor: "Harmonics blooming out of a pure tone as TIMBRE folds the wave back on itself — clean and round low, bright and brassy-to-clangorous as you push it — while COLOR shifts the underlying sine/triangle mix.",
      goodFor: "West Coast / Buchla-style timbres and evolving leads; modulate the fold amount for a living, breathing brightness." } },

  { index: 4, code: "PLPK", name: "Buzz / Formant-like", family: "analog",
    description: "Waveform shaped toward a Dirac comb — pulse-like, formant-rich tones.",
    timbre: "Progression of the waveform toward a Dirac (pulse) comb.",
    color: "Detuning between two waveshapes.",
    detail: {
      listenFor: "A buzzy, reedy tone that sharpens toward a bright pulse-comb as TIMBRE progresses, with COLOR detuning two shapes for a hollow, formant-like color.",
      goodFor: "Vocal-ish and reedy textures, buzzy bass, and retro 'computer speech' character without a full formant model." } },

  { index: 5, code: "SQR-", name: "Square + Sub", family: "analog",
    description: "Square oscillator with a sub-octave square added below.",
    timbre: "Pulse width of the main square.",
    color: "Balance between main and sub-octave.",
    detail: {
      listenFor: "A hollow square whose pulse width TIMBRE narrows toward a thinner, nasal tone, while COLOR brings in a sub-octave square for weight underneath.",
      goodFor: "Classic video-game and chip-style leads, plus solid square basses when you lean on the sub." } },

  { index: 6, code: "SAW-", name: "Sawtooth + Sub", family: "analog",
    description: "Sawtooth oscillator with a sub-octave square added below.",
    timbre: "Detuning / character of the main sawtooth.",
    color: "Balance between main and sub-octave.",
    detail: {
      listenFor: "A full sawtooth with COLOR adding an octave-down square underneath for body, while TIMBRE shapes the main saw's character.",
      goodFor: "Big analog basses and leads that need low-end authority — the sub does the heavy lifting a saw alone can't." } },

  { index: 7, code: "SYN-Q", name: "Square Hard-Sync", family: "analog",
    description: "A slave square reset by a master oscillator — the classic searing sync sweep.",
    timbre: "Pulse width of the slave square.",
    color: "Slave frequency relative to the master.",
    detail: {
      listenFor: "That searing, vocal sync tearing as COLOR sweeps the slave's pitch against the master, with TIMBRE setting the slave square's pulse width.",
      goodFor: "Aggressive sync leads (think classic 80s sync sweeps) — automate COLOR for the signature rising-formant scream." } },

  { index: 8, code: "SYN-W", name: "Sawtooth Hard-Sync", family: "analog",
    description: "A slave sawtooth reset by a master oscillator — bright, vocal, lead-synth sync sound.",
    timbre: "Character of the slave sawtooth.",
    color: "Slave frequency relative to the master.",
    detail: {
      listenFor: "A brighter, more vocal take on sync — COLOR slides the slave saw's pitch for sweeping formant peaks while TIMBRE shapes its tone.",
      goodFor: "Expressive sync lead lines; sequence or modulate COLOR and it almost talks." } },

  { index: 9, code: "SWx3", name: "Three Sawtooth Oscillators", family: "analog",
    description: "Three sawtooth oscillators stacked at musical intervals.",
    timbre: "Frequency interval of the second oscillator (quantized to musical intervals).",
    color: "Frequency interval of the third oscillator (quantized to musical intervals).",
    detail: {
      listenFor: "An instant chord — three saws stacked, with TIMBRE and COLOR each setting the (quantized) interval of the 2nd and 3rd voice, so one note becomes a power-chord or triad.",
      goodFor: "Huge unison/chord leads and pads; set fifths and octaves for power chords, thirds for full triads." } },

  { index: 10, code: "SQx3", name: "Three Square Oscillators", family: "analog",
    description: "Three square oscillators stacked at musical intervals.",
    timbre: "Frequency interval of the second oscillator (quantized).",
    color: "Frequency interval of the third oscillator (quantized).",
    detail: {
      listenFor: "The same stacked-interval idea with hollow squares — more chiptune and hollow than the saw stack; TIMBRE/COLOR pick the two added intervals.",
      goodFor: "Chiptune chords, organ-ish stacks, and retro game harmonies from a single trigger." } },

  { index: 11, code: "TRx3", name: "Three Triangle Oscillators", family: "analog",
    description: "Three triangle oscillators stacked at musical intervals — softer than the saw/square stacks.",
    timbre: "Frequency interval of the second oscillator (quantized).",
    color: "Frequency interval of the third oscillator (quantized).",
    detail: {
      listenFor: "Three soft triangles stacked — sweet and flute-like, far gentler than the saw/square stacks; the two knobs set the added intervals.",
      goodFor: "Mellow chordal pads, music-box and bell-adjacent stacks, and anything where saws would be too harsh." } },

  { index: 12, code: "SIx3", name: "Three Sine Oscillators", family: "analog",
    description: "Three sine waves stacked — pure, organ-like additive chords.",
    timbre: "Frequency interval of the second sine (quantized).",
    color: "Frequency interval of the third sine (quantized).",
    detail: {
      listenFor: "Pure sine tones stacked into clean, organ-like chords with no harmonic grit; TIMBRE/COLOR set the two intervals.",
      goodFor: "Drawbar-organ voicings, clean additive chords, and sub-plus-harmonic stacks where purity matters." } },

  { index: 13, code: "RING", name: "Ring-Modulated Sines", family: "analog",
    description: "Two sine waves multiplied — bell-like inharmonic metallic tones.",
    timbre: "Frequency of the second sine relative to the carrier.",
    color: "Frequency of the third sine relative to the carrier.",
    detail: {
      listenFor: "Clangorous, metallic bell tones — multiplying sines produces sum-and-difference partials, so the two knobs tip it from sweet to harshly inharmonic.",
      goodFor: "Bells, gongs, sci-fi textures, and inharmonic mallets; small COLOR moves dramatically change the metal." } },

  { index: 14, code: "SWRM", name: "Sawtooth Swarm", family: "analog",
    description: "A dense cluster of detuned sawtooths — supersaw-style swarming pad.",
    timbre: "Amount of detuning across the swarm.",
    color: "Cutoff of a high-pass filter on the swarm.",
    detail: {
      listenFor: "The classic supersaw shimmer — TIMBRE spreads the detuning from a tight unison into a wide, beating swarm while COLOR is a high-pass that thins the low rumble.",
      goodFor: "Trance/EDM leads and pads, big detuned chords, and anything that wants that wall-of-saws width." } },

  { index: 15, code: "COMB", name: "Sawtooth + Comb Filter", family: "analog",
    description: "A sawtooth fed through a comb filter — Karplus-Strong-ish resonances.",
    timbre: "Comb delay length (resonant pitch).",
    color: "Comb feedback amount and polarity (sign flip = different timbre).",
    detail: {
      listenFor: "Metallic, resonant ringing as a comb filter colors the saw — TIMBRE tunes the comb's resonant pitch, COLOR sets feedback (flipping its sign changes the whole character).",
      goodFor: "Plucky, stringy, and flange-y resonant tones; it sits between a raw oscillator and a physical-model string." } },

  { index: 16, code: "TOY*", name: "Electronic Toy", family: "analog",
    description: "Bit-reduced glitchy 'broken toy' sound — deliberately lo-fi.",
    timbre: "Simulated clock rate of the toy circuit.",
    color: "Glitch density.",
    detail: {
      listenFor: "A deliberately cheap, lo-fi warble — TIMBRE drops the simulated clock rate for more aliasing and grit, COLOR piles on glitch density.",
      goodFor: "Broken-toy textures, lo-fi leads, and grungy chip sounds when you want it to feel charmingly busted." } },

  { index: 17, code: "ZLPF", name: "Low-Pass Filter Synthesis", family: "digital-filter",
    description: "Oscillator + low-pass filter as a single combined model — warm, subtractive feel.",
    timbre: "Cutoff frequency of the low-pass.",
    color: "Morph the source waveshape feeding the filter.",
    detail: {
      listenFor: "A warm subtractive sweep — TIMBRE is the low-pass cutoff opening from dark to bright while COLOR morphs the source waveshape feeding the filter.",
      goodFor: "Classic subtractive basses and leads with no separate filter; ride TIMBRE like a cutoff for the familiar analog sweep." } },

  { index: 18, code: "ZPKF", name: "Peaking Filter Synthesis", family: "digital-filter",
    description: "Oscillator + resonant peaking filter — vocal, formant-ish bump.",
    timbre: "Centre frequency of the peak.",
    color: "Morph the source waveshape.",
    detail: {
      listenFor: "A vocal, formant-like bump that TIMBRE slides up and down the spectrum, with COLOR morphing the source waveshape under it.",
      goodFor: "Nasal, talking, wah-like tones; sweep TIMBRE for a single resonant peak that reads almost like a vowel." } },

  { index: 19, code: "ZBPF", name: "Band-Pass Filter Synthesis", family: "digital-filter",
    description: "Oscillator + band-pass — nasal, focused tones.",
    timbre: "Centre frequency of the band-pass.",
    color: "Morph the source waveshape.",
    detail: {
      listenFor: "A narrow, focused band — everything above and below the TIMBRE-set centre is scooped out, leaving a nasal, telephone-y tone; COLOR morphs the source.",
      goodFor: "Thin, focused leads, lo-fi/telephone effects, and resonant sweeps that cut through a mix." } },

  { index: 20, code: "ZHPF", name: "High-Pass Filter Synthesis", family: "digital-filter",
    description: "Oscillator + high-pass — bright, thinned-out tones.",
    timbre: "Cutoff frequency of the high-pass.",
    color: "Morph the source waveshape.",
    detail: {
      listenFor: "A thinned, airy tone as TIMBRE raises the high-pass cutoff and strips low end away, with COLOR morphing the source waveshape.",
      goodFor: "Bright stabs, thin plucks, and layering on top of a bassier voice where you want only the highs." } },

  { index: 21, code: "VOSM", name: "VOSIM (formant emulation)", family: "formant",
    description: "Two formant peaks generated by the VOSIM algorithm — vowel-adjacent, vocal textures.",
    timbre: "Frequency of the first formant.",
    color: "Frequency of the second formant.",
    detail: {
      listenFor: "Two resonant formant peaks that read as vowel-ish, vocal textures — the two knobs set the formant frequencies, so it sounds like a synthesized throat.",
      goodFor: "Robotic voice and choir-adjacent textures, talky leads, and retro speech-synth character — rawer than VOWL, more synthetic than VFOF." } },

  { index: 22, code: "VOWL", name: "Vowel Speech Synthesis", family: "formant",
    description: "Sung-vowel synthesis — interpolates between A, E, I, O, U as you turn the knob.",
    timbre: "Vowel — sweeps a → e → i → o → u.",
    color: "Formant frequency shift (vocal-tract size).",
    detail: {
      listenFor: "The vowels a→e→i→o→u as TIMBRE sweeps, with COLOR shifting the formants up (child) or down (giant) as if resizing the singer's vocal tract.",
      goodFor: "'Talking' synths and robotic vocal lines; sequence TIMBRE for words and keep it in the mid register where real voices sit." } },

  { index: 23, code: "VFOF", name: "FOF Vowel Synthesis", family: "formant",
    description: "Vowel synthesis using FOF (Fonction d'Onde Formantique) — smoother, more singer-like than VOWL.",
    timbre: "Vowel — sweeps through a → e → i → o → u.",
    color: "Formant frequency shift.",
    detail: {
      listenFor: "The same vowel sweep as VOWL but smoother and more sung — FOF grains give it a rounder, more human grain; TIMBRE picks the vowel, COLOR shifts the formants.",
      goodFor: "Choir and lead-vocal-adjacent pads where you want the singer quality without the rougher edge of VOWL or VOSM." } },

  { index: 24, code: "HARM", name: "Additive Harmonics", family: "harmonic",
    description: "12-harmonic additive synthesis — chimes, bells, organs, glassy tones.",
    timbre: "Central harmonic — where the energy peaks in the spectrum.",
    color: "Distribution of amplitude across the 12 harmonics.",
    detail: {
      listenFor: "A glassy, organ-to-bell spectrum you sculpt directly — TIMBRE moves where the energy peaks across 12 harmonics, COLOR spreads or concentrates their amplitudes.",
      goodFor: "Drawbar organs, glassy electric pianos, chimes, and clean additive pads; it's pure harmonics, so it stays sweet." } },

  { index: 25, code: "FM", name: "Phase Modulation (FM)", family: "fm",
    description: "Two-operator phase modulation — DX7-style bell, brass, electric piano tones.",
    timbre: "Modulation amount (FM index).",
    color: "Modulator-to-carrier frequency ratio.",
    detail: {
      listenFor: "Harmonic, musical tones when COLOR sits on a whole-number ratio (1:1, 2:1) and clangorous, bell-like inharmonics in between; TIMBRE (the FM index) adds harmonic bite.",
      goodFor: "DX7 bells, electric pianos, and metallic brass — start clean and push TIMBRE for brightness, detune COLOR a hair for bells." } },

  { index: 26, code: "FBFM", name: "Feedback FM", family: "fm",
    description: "Phase modulation with operator feedback — harsher, more aggressive than plain FM.",
    timbre: "Modulation amount (with feedback).",
    color: "Modulator-to-carrier frequency ratio.",
    detail: {
      listenFor: "A grittier, more aggressive FM where feedback adds a sawtooth-like edge and noise as TIMBRE climbs; COLOR still sets the modulator:carrier ratio.",
      goodFor: "Aggressive basses, distorted brass, and harder digital leads when plain FM is too polite." } },

  { index: 27, code: "WTFM", name: "Chaotic Feedback FM", family: "fm",
    description: "Dual-feedback FM — unstable, droning, often dissonant; sits between musical and broken.",
    timbre: "Modulation amount.",
    color: "Modulator-to-carrier ratio (small changes can flip the timbre completely).",
    detail: {
      listenFor: "A hollow digital tone at low TIMBRE that destabilizes into screaming chaos as COLOR climbs — a tiny COLOR move can flip the whole timbre.",
      goodFor: "Drones, industrial textures, and sound design rather than melody; park it right at the edge before it breaks up for the sweet spot." } },

  { index: 28, code: "PLUK", name: "Plucked String", family: "physical",
    description: "Physical-model plucked string (Karplus-Strong).",
    timbre: "Damping — how fast the string loses energy.",
    color: "Plucking position along the string.",
    detail: {
      listenFor: "A natural plucked string that TIMBRE damps from long sustain to a quick mute, while COLOR moves the pluck point — bright near the bridge, round toward the middle.",
      goodFor: "Guitars, harps, koto, and kalimba-style plucks; it self-decays and is paraphonic, so fast lines stack their own ringing strings." } },

  { index: 29, code: "BOWD", name: "Bowed String", family: "physical",
    description: "Physical-model bowed string.",
    timbre: "Bow friction.",
    color: "Bowing position along the string.",
    detail: {
      listenFor: "A sustaining bowed-string tone — TIMBRE sets bow friction from smooth to scratchy/over-pressured, COLOR moves the bowing point for a brighter or rounder timbre.",
      goodFor: "Cello/violin-adjacent sustained lines and pads; ride TIMBRE for expressive bow-pressure swells." } },

  { index: 30, code: "BLOW", name: "Reed Instrument", family: "physical",
    description: "Physical-model reed instrument — clarinet/saxophone family.",
    timbre: "Air pressure on the reed.",
    color: "Geometry of the instrument body (changes the formant character).",
    detail: {
      listenFor: "A breathy reed that TIMBRE drives with air pressure from soft to honking/overblown, while COLOR reshapes the body's formants from clarinet-hollow to sax-bright.",
      goodFor: "Woodwind leads and breathy melodic lines; push TIMBRE for that overblown squawk at the top." } },

  { index: 31, code: "FLUT", name: "Flute", family: "physical",
    description: "Physical-model flute / blown bottle.",
    timbre: "Air pressure on the embouchure.",
    color: "Geometry of the instrument body.",
    detail: {
      listenFor: "An airy flute/blown-bottle tone — TIMBRE is breath pressure (gentle up to overblowing into the next harmonic), COLOR changes the body geometry and its formants.",
      goodFor: "Flute and ocarina-style melodies, breathy pads, and bottle-blow textures; add a little air-pressure wobble for realism." } },

  { index: 32, code: "BELL", name: "Struck Bell", family: "physical",
    description: "Struck bell using Risset-style additive synthesis — long, shimmering inharmonic decay.",
    timbre: "Damping — how quickly the bell quietens.",
    color: "Inharmonicity — spreads or tightens the partials.",
    detail: {
      listenFor: "A long, shimmering inharmonic ring — TIMBRE sets how fast it quietens, COLOR spreads or tightens the partials from sweet chime to clangorous bell.",
      goodFor: "Bells, chimes, and metallic mallets; it self-decays naturally, so let notes ring rather than forcing a gate." } },

  { index: 33, code: "DRUM", name: "Struck Metallic Drum", family: "physical",
    description: "Struck metallic drum / membrane — gong-like, metallic strikes.",
    timbre: "Damping.",
    color: "Brightness of the strike.",
    detail: {
      listenFor: "A gong-to-metal-drum strike — TIMBRE damps the ring, COLOR brightens the attack from a dull thud to a clangy hit.",
      goodFor: "Metallic percussion, gongs, and tuned drum hits; it fires as a one-shot, so each strike rings out its full decay." } },

  { index: 34, code: "KICK", name: "TR-808 Bass Drum", family: "drum",
    description: "Roland TR-808 bass drum model — the iconic boom.",
    timbre: "Decay length of the drum body.",
    color: "Brightness / tone of the click and body.",
    detail: {
      listenFor: "The iconic 808 boom — TIMBRE stretches the body decay from a tight thud to a long sub-tail, COLOR adds click and tone to the attack.",
      goodFor: "808 kicks and sub-booms; it's a one-shot, so trigger it and let the tail ring out for that long 808 sustain." } },

  { index: 35, code: "CYMB", name: "Cymbal", family: "drum",
    description: "Cymbal model built from band-passed metallic noise plus harmonic squares.",
    timbre: "Band-pass filter cutoff.",
    color: "Balance between metallic squares and white noise.",
    detail: {
      listenFor: "A metallic, noisy cymbal — TIMBRE sweeps the band-pass for darker or sizzlier metal, COLOR balances ringing metallic squares against white-noise hiss.",
      goodFor: "Hi-hats, crashes, and metallic shakers; the one-shot trigger lets each hit decay fully." } },

  { index: 36, code: "SNAR", name: "TR-808 Snare", family: "drum",
    description: "Roland TR-808 snare model — pitched resonator plus noise burst.",
    timbre: "Tonal balance of the snare's resonator modes.",
    color: "Amount of snare-wire noise (snappiness).",
    detail: {
      listenFor: "The 808 snare crack — TIMBRE tunes the pitched resonator body, COLOR dials the snare-wire noise from a tom-like thump to a snappy crack.",
      goodFor: "808 snares, rimshots, and clap-adjacent hits; the one-shot lets the snap ring out naturally." } },

  { index: 37, code: "WTBL", name: "Wavetable (1D)", family: "wavetable",
    description: "Scans through one of 20 stored wavetables — each is a curated palette of waveforms.",
    timbre: "Scan position within the current wavetable.",
    color: "Selects which of the 20 wavetables is loaded.",
    detail: {
      listenFor: "A sweep through a row of single-cycle waveforms — TIMBRE scans the position within a table for morphing harmonics, COLOR swaps which of 20 wavetables is loaded.",
      goodFor: "Evolving leads and pads where you automate TIMBRE for a wavetable sweep; change COLOR to audition entirely different palettes." } },

  { index: 38, code: "WMAP", name: "Wave Map (2D)", family: "wavetable",
    description: "16×16 grid of waveforms — scan in two dimensions for a huge timbral surface.",
    timbre: "X-axis position (column) in the 16×16 grid.",
    color: "Y-axis position (row) in the 16×16 grid.",
    detail: {
      listenFor: "A 16×16 grid of single-cycle waves — TIMBRE scrolls columns, COLOR rows, so every spot is a different harmonic snapshot and moving between them morphs the tone.",
      goodFor: "Evolving pads (automate slowly) and glitchy transitions (jump around); both knobs are just position, so there's no wrong setting, only territory to explore." } },

  { index: 39, code: "WLIN", name: "Linear Wavetable Scan", family: "wavetable",
    description: "Single linear path through a sequence of waveforms with selectable interpolation.",
    timbre: "Position along the linear wavetable sequence.",
    color: "Interpolation method between adjacent waves (changes the morph character).",
    detail: {
      listenFor: "A smooth single-path scan through a wave sequence as TIMBRE moves, with COLOR changing the interpolation so morphs go from gliding to stepped and glitchy.",
      goodFor: "Clean wavetable sweeps and morphing leads; pick the interpolation for either liquid pads or crunchy digital steps." } },

  { index: 40, code: "WTx4", name: "4-Voice Wavetable Chord", family: "wavetable",
    description: "Four wavetable voices stacked as a chord — paraphonic from a single trigger.",
    timbre: "Selects one of 16 wavetable banks.",
    color: "Selects the chord / harmonic structure of the four voices.",
    detail: {
      listenFor: "An instant four-voice chord from one note — TIMBRE picks one of 16 wavetable banks (the timbre), COLOR selects the chord/harmonic structure of the four voices.",
      goodFor: "Lush paraphonic pads and stabs; one trigger gives full chords, so it's great for harmonic backing without sequencing each note." } },

  { index: 41, code: "NOIS", name: "Filtered Noise", family: "noise",
    description: "White noise through a resonant filter — wind, hiss, pitched whoosh.",
    timbre: "Filter resonance (sharpens into a pitched tone at high Q).",
    color: "Cross-fade between low-pass and high-pass filter shapes.",
    detail: {
      listenFor: "Wind and hiss that TIMBRE sharpens — at high resonance the filter rings into a pitched whistle — while COLOR cross-fades the filter from low-pass to high-pass.",
      goodFor: "Wind, surf, and whoosh textures, pitched noise risers, and percussion beds; crank TIMBRE's Q to pull a tone out of the noise." } },

  { index: 42, code: "TWNQ", name: "Twin-Peak Resonators", family: "noise",
    description: "Noise through two parallel resonant filters — vocal/whistling resonances.",
    timbre: "Q-factor of the resonators.",
    color: "Frequency spacing between the two resonant peaks.",
    detail: {
      listenFor: "Two whistling resonant peaks on noise — TIMBRE sharpens their Q toward pitched tones, COLOR sets the spacing between the peaks for vowel-like or interval-like colors.",
      goodFor: "Vocal/whistling textures, formant-ish noise, and eerie resonant sweeps; the twin peaks read almost like a sung interval." } },

  { index: 43, code: "CLKN", name: "Clocked Noise", family: "noise",
    description: "Noise sample-and-held at a controllable clock rate — granular, glitchy textures.",
    timbre: "Clock period — down to a 2-sample cycle.",
    color: "Bit-depth of the held value (2–32 discrete levels).",
    detail: {
      listenFor: "Granular, glitchy noise that TIMBRE pitches by changing the clock period (down to a 2-sample buzz) while COLOR crushes the bit-depth from smooth to steppy.",
      goodFor: "Digital percussion, glitch textures, and lo-fi noise leads; drop the clock period far enough and the noise turns into a pitched tone." } },

  { index: 44, code: "CLOU", name: "Granular Sine Cloud", family: "noise",
    description: "Cloud of overlapping sine-wave grains — pad, drone, swarm textures.",
    timbre: "Grain density / overlap.",
    color: "Random spread of grain frequencies.",
    detail: {
      listenFor: "A soft cloud of overlapping sine grains — TIMBRE thickens the density/overlap, COLOR randomizes their frequency spread from a focused tone to a wide shimmer.",
      goodFor: "Ambient pads, drones, and swarming textures; keep COLOR low for a pure tone, raise it for a wide, airy cloud." } },

  { index: 45, code: "PRTC", name: "Particle Noise", family: "noise",
    description: "Cloud of decaying impulse grains — rain, static, sparkle.",
    timbre: "Grain density / overlap.",
    color: "Random spread of grain frequencies.",
    detail: {
      listenFor: "Scattered, decaying clicks — TIMBRE sets how densely the impulse grains fall, COLOR spreads their frequencies from a tight tick to a wide sparkle.",
      goodFor: "Rain, static, crackle, and sparkle textures; layer it under pads for organic motion or use it as granular percussion." } },

  { index: 46, code: "QPSK", name: "Digital Modulation", family: "modulation",
    description: "QPSK-style digital modulation of an 8-bit value — modem-like, bit-tonal sounds.",
    timbre: "Bit rate (carrier modulation speed).",
    color: "The 8-bit value being modulated (which symbols are sent).",
    detail: {
      listenFor: "Modem- and data-stream sounds — TIMBRE sets the bit rate (how fast it chatters), COLOR changes the 8-bit value being sent so the pattern of tones shifts.",
      goodFor: "Glitch, datacom, and retro-computer textures; it's bit-tonal rather than melodic, so treat it as a sound-design source." } },
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
