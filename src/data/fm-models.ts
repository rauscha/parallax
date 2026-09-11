/**
 * The FM voice corpus — engine #5's model axis.
 *
 * Unlike Braids/Plaits/Rings, where a "model" is a firmware enum the WASM knows
 * about, an FM model is a **patch**: 156 bytes of our own operator settings,
 * authored in fm-voices.ts and pushed into the engine on selection. The `index`
 * field is just this array's order, and it is what lands in
 * `setParameter("model", i)` and in share URLs via the model code — so codes and
 * order are stable API. Append, do not reorder.
 *
 * Every voice is original work, authored by hand against the vendored engine —
 * locked decision 5: "build it from sound, not from the ROM." There is no
 * factory ROM sysex in this project and no transcribed parameter sets.
 *
 * **The prose follows the same honesty rule as the other three corpora:** every
 * claim is checkable against the vendored source or against what the running
 * engine measurably does. Two consequences you will see repeatedly below:
 *
 * - Where a macro knob genuinely does nothing on a voice, its card says so.
 *   Two of the fourteen have one, both for structural reasons the card explains —
 *   a silent feedback operator, or an algorithm with no modulators at all.
 *   A dead knob with confident prose is exactly the failure this panel cannot
 *   survive.
 * - Brightness comparisons ("brighter than", "the brightest here") are ordered
 *   by a measured spectral-brightness figure, not by taste. fm-voices.test.ts
 *   renders all fourteen and asserts the ordering the words imply.
 */
import type { EngineModel, EngineFamily } from "../audio/types";
import { buildPatch, type FmPatchSpec } from "./fm-patch";
import * as V from "./fm-voices";

export const FM_FAMILIES: EngineFamily[] = [
  { id: "bells", label: "Bells and Metallic" },
  { id: "epiano", label: "Electric Pianos" },
  { id: "brass", label: "Brass and Winds" },
  { id: "bass", label: "Basses" },
  { id: "inharmonic", label: "Inharmonic and Noise" },
  { id: "primitives", label: "Teaching Primitives" },
];

const k = (id: string, label: string, text: string) => ({ id, label, text });

/** A corpus entry: the picker/Explain metadata plus the patch it loads. */
export interface FmVoice {
  model: EngineModel;
  spec: FmPatchSpec;
}

export const FM_VOICES: FmVoice[] = [
  {
    spec: V.V_PARALLAX_BELL,
    model: {
      index: 0, code: "PLX1", name: "Parallax Bell", family: "bells",
      description:
        "Two operators at a 2:1 ratio — the plainest FM voice that still sounds like something. A struck bell that brightens on attack and settles toward a sine.",
      knobs: [
        k("brightness", "Brightness", "Raises operator 2's output level, which IS the modulation index: more level means more sidebands, so the strike gets harder and more metallic."),
        k("ratio", "Ratio", "Moves operator 2 off its 2:1 lock. On the detent the partials are whole-number multiples and it reads as a bell; away from it they stop lining up and it reads as a gong."),
        k("feedback", "Feedback", "Loops operator 2 into itself before it modulates the carrier, adding progressively rougher harmonics — sine toward sawtooth toward noise."),
        k("envelope", "Envelope", "Scales every envelope rate together. Left is a long bloom, right a sharp pluck; the modulator still decays faster than the carrier, which is what makes it read as a strike and not a drone."),
      ],
      detail: {
        listenFor: "The first 200 ms. The bright overtones fade before the fundamental does — exactly what a real struck bar does, and the reason two-operator FM convinced anyone in the first place.",
        goodFor: "Learning the engine. Two nodes and one wire is the clearest thing the flowsheet can draw, which is why it is the default.",
      },
    },
  },
  {
    spec: V.V_GLASS,
    model: {
      index: 1, code: "GLAS", name: "Glass", family: "bells",
      description:
        "Three two-operator bells stacked and detuned against each other, at 7:1, 11:1 and 14:1 — high ratios put the sidebands far from the fundamental, which is what sounds like glass.",
      knobs: [
        k("brightness", "Brightness", "Pushes all three modulators at once. Because their ratios are high, extra index buys sidebands way up the spectrum rather than a thicker fundamental."),
        k("ratio", "Ratio", "Slides all three ratios together. The three stacks stay in proportion, so the voice keeps its identity while the whole partial structure moves."),
        k("feedback", "Feedback", "Roughens the 14:1 stack, which is already the thinnest and highest — a small move here is audible out of proportion to its size."),
        k("envelope", "Envelope", "The three bells decay at different rates by design. Turning this up compresses all of them toward a single short click; turning it down lets them separate."),
      ],
      detail: {
        listenFor: "The beating. Operators 3 and 5 are detuned a few cents from their neighbours, so the tail shimmers instead of sitting still.",
        goodFor: "Ringing top-end lines that do not need to be loud to be heard, and for hearing what a high ratio actually does.",
      },
    },
  },
  {
    spec: V.V_GONG,
    model: {
      index: 2, code: "GONG", name: "Bronze Gong", family: "bells",
      description:
        "Deliberately non-integer ratios — 3.48 and 1.41 — so no harmonic series survives the modulation. The longest decay in the corpus.",
      knobs: [
        k("brightness", "Brightness", "Deepens the inharmonicity rather than just adding treble: with ratios that are not whole numbers, more index means more partials that belong to no series at all."),
        k("ratio", "Ratio", "Scales both modulators together. Passing through a whole-number ratio is audible as the sound briefly snapping into tune, then back out."),
        k("feedback", "Feedback", "Operator 3's self-loop, which is what puts the grit in the strike. Wound all the way up it is closer to a cymbal than a gong."),
        k("envelope", "Envelope", "This voice is the slowest here — it takes about half a second to fall by half. Turning this up is the difference between a gong and a woodblock."),
      ],
      detail: {
        listenFor: "Operator 4 sits underneath as a bare, unmodulated partial, because algorithm 10 reaches it before the modulation bus has been written. That clean tone under the clangour is what keeps the voice from turning into noise.",
        goodFor: "Slow single hits where the tail is the point. It rewards a low note and a long gap.",
      },
    },
  },
  {
    spec: V.V_TINE,
    model: {
      index: 3, code: "TINE", name: "Tine Piano", family: "epiano",
      description:
        "A 14:1 modulator with an almost instant decay over two slow 1:1 carriers — a hard metallic ping on top of a body that sustains after the ping is gone.",
      knobs: [
        k("brightness", "Brightness", "The ping, not the body. It raises the 14:1 modulator, and because that operator's envelope has already collapsed by the time the note settles, you hear it almost entirely in the attack."),
        k("ratio", "Ratio", "Moves the ping's pitch relative to the note. Whole-number positions sound like a struck tine; between them it sounds like a struck bottle."),
        k("feedback", "Feedback", "A small amount of roughening on the ping. This voice starts near the bottom of its range because a clean tine is the point."),
        k("envelope", "Envelope", "Trades ping for body. Right shortens the whole note toward a click; left lets the two carriers bloom and the attack loses its edge."),
      ],
      detail: {
        listenFor: "Play softly. Key velocity sensitivity is 6 out of 7 on the tine and 3 on the carriers, so a light touch does not just get quieter — the ping disappears and the body stays.",
        goodFor: "Chordal comping and anything where you want a percussive attack that does not fight a sustained line.",
      },
    },
  },
  {
    spec: V.V_REEDPIANO,
    model: {
      index: 4, code: "RPNO", name: "Reed Piano", family: "epiano",
      description:
        "Barkier than the tine: a 2:1 modulator with real feedback on it, sitting over a bare detuned sine. The bark is in the attack and it does not fully clear.",
      knobs: [
        k("brightness", "Brightness", "The bark. At 2:1 the sidebands land on low harmonics, so this thickens the tone rather than adding sparkle — the opposite of what the same knob does on Glass."),
        k("ratio", "Ratio", "Away from 2:1 the bark stops being harmonic and starts sounding broken, which is either wrong or exactly right depending on the track."),
        k("feedback", "Feedback", "Starts well above centre on this voice, and it is the difference between a piano and a reed. Turning it down finds the cleaner tine sound underneath."),
        k("envelope", "Envelope", "The modulator falls to a third of its level and holds there, so some bark survives into the sustain. Turning this up removes that and leaves a clean tone."),
      ],
      detail: {
        listenFor: "Operator 3 is a plain sine a few cents off, and it is the only thing keeping the voice grounded while the modulator is working.",
        goodFor: "Comping with attitude, and for hearing feedback do something musical rather than destructive.",
      },
    },
  },
  {
    spec: V.V_BRASS,
    model: {
      index: 5, code: "BRSS", name: "Swell Brass", family: "brass",
      description:
        "Two modulators summed into one carrier, all three with a slow attack. The modulation index rises with the note, which is the entire trick behind FM brass.",
      knobs: [
        k("brightness", "Brightness", "How hard the section is blowing. Because the modulators share the carrier's slow attack, raising this makes the swell brighter at its peak without changing how it starts."),
        k("ratio", "Ratio", "Operator 3 sits an octave above operator 2. Moving them together thins the sound toward a clarinet on the way down and toward brass on the way up."),
        k("feedback", "Feedback", "The rasp. Brass without it sounds like an organ; too much and it stops sounding like it has a bore."),
        k("envelope", "Envelope", "The swell itself. This is the voice where the knob is most obviously an articulation control rather than a timbre one — right turns a section swell into a stab."),
      ],
      detail: {
        listenFor: "A slow sine vibrato fades in after about half a second, and it is delayed on purpose: arriving with the note would sound synthetic, arriving late sounds like a player.",
        goodFor: "Held lines and swells. It needs time — a sixteenth note never reaches its own peak.",
      },
    },
  },
  {
    spec: V.V_REED,
    model: {
      index: 6, code: "REED", name: "Hollow Reed", family: "brass",
      description:
        "A 3:1 modulator, so its sidebands land three harmonics apart around the carrier and the harmonics in between stay thin. Plus a bare carrier two detune steps away.",
      knobs: [
        k("brightness", "Brightness", "Opens the reed. The spacing of the sidebands does not change with this knob — only how many of them there are, and how far up they reach."),
        k("ratio", "Ratio", "3:1 is where the hollowness lives. Down an octave it fills in and sounds like a flute; up it thins toward a whistle."),
        k("feedback", "Feedback", "Breath noise, effectively. Small amounts read as air in the tube; large amounts read as overblowing."),
        k("envelope", "Envelope", "The attack is already soft. Turning this up gives it a tongued edge, and turning it down makes the note fade in from nothing."),
      ],
      detail: {
        listenFor: "The second carrier sits two detune steps above centre, so held notes beat slowly against themselves — an ensemble of two.",
        goodFor: "Melody lines that need to sit in a mix without cutting rather than by being loud.",
      },
    },
  },
  {
    spec: V.V_THUMB,
    model: {
      index: 7, code: "THMB", name: "Thumb Bass", family: "bass",
      description:
        "A 1:1 modulator whose index collapses almost immediately: bite on the attack, a clean fundamental underneath it a moment later.",
      knobs: [
        k("brightness", "Brightness", "The pluck. At 1:1 the sidebands are the note's own harmonics, so this is closer to a filter opening than to adding metal."),
        k("ratio", "Ratio", "1:1 keeps the bite harmonic and tight. Off it, the attack goes metallic and the voice stops reading as a string."),
        k("feedback", "Feedback", "Adds grind to the attack only, because the modulator it loops is gone by the time the note settles."),
        k("envelope", "Envelope", "Rate scaling is high on both operators, so high notes already decay faster than low ones. This knob moves the whole range at once."),
      ],
      detail: {
        listenFor: "How fast the bite disappears — the level halves within about 50 ms and then the fundamental holds. That gap is what makes a bass line readable under everything else.",
        goodFor: "Bass lines that need to be felt and heard separately. Play it low; the rate scaling is tuned for it.",
      },
    },
  },
  {
    spec: V.V_GROWL,
    model: {
      index: 8, code: "GRWL", name: "Growl Bass", family: "bass",
      description:
        "Two modulators into one carrier with the feedback loop wide open. The roughness is not an effect here — it is the timbre.",
      knobs: [
        k("brightness", "Brightness", "How much of the growl reaches the output. Raised far, the two modulators swamp the carrier and the pitch starts to get hard to hear."),
        k("ratio", "Ratio", "Both modulators sit at the note's own pitch, so the sidebands stay harmonic and the growl stays musical. Moving off that trades growl for clang."),
        k("feedback", "Feedback", "Starts at maximum, so the detent is already the end of its travel and turning it DOWN is what tames it. Hiss is the only other voice set this way."),
        k("envelope", "Envelope", "The attack is instant by design. Down, the growl becomes a swell; up, it becomes a short bark."),
      ],
      detail: {
        listenFor: "The pitch is still exactly there under the noise — the carrier is untouched. That is what separates FM growl from distortion.",
        goodFor: "Aggressive bass that has to survive being one voice in a mono synth.",
      },
    },
  },
  {
    spec: V.V_CLANK,
    model: {
      index: 9, code: "CLNK", name: "Clank", family: "inharmonic",
      description:
        "Two modulators at 4.59 and 9.17 — ratios with nothing in common, and none of them whole. Measurably the brightest voice in the corpus.",
      knobs: [
        k("brightness", "Brightness", "There is no polite setting. More index here means more partials scattered across the spectrum, and none of them reinforce each other."),
        k("ratio", "Ratio", "Both modulators move together, so their relationship never resolves into anything harmonic no matter where you put it. That is deliberate."),
        k("feedback", "Feedback", "Already high. It is what turns a struck metal sound into a struck broken-metal sound."),
        k("envelope", "Envelope", "Very short by default — the level halves in about 20 ms. Turning it down is the only way to hear what is actually in the spectrum."),
      ],
      detail: {
        listenFor: "There is no pitch to speak of, only a register. Playing a scale changes where the noise sits, not what note it is.",
        goodFor: "Percussion, and for demonstrating exactly where the FM harmonic series stops being a series.",
      },
    },
  },
  {
    spec: V.V_HISS,
    model: {
      index: 10, code: "HISS", name: "Hiss", family: "inharmonic",
      description:
        "A four-operator chain with the feedback loop at maximum on the operator at the top. Each stage modulates the next, so the spectrum multiplies out into something close to noise.",
      knobs: [
        k("brightness", "Brightness", "Raises all three modulators in the chain at once, and because they multiply rather than add, a small move changes the character a lot."),
        k("ratio", "Ratio", "The chain runs 1:1, 5:1, 9:1. Moving it up drives more of the output past anything the ear can call a pitch; moving it down finds tone again."),
        k("feedback", "Feedback", "The source of the noise. This is the only voice here built on algorithm 1, because reaching that algorithm's feedback operator means sounding the whole 6-5-4 chain that hangs off it."),
        k("envelope", "Envelope", "Turns a wash into a burst. The chain decays together, so the noise thins as it fades rather than just getting quieter."),
      ],
      detail: {
        listenFor: "It is not real noise — it is a very dense periodic signal, and at low notes you can still hear it repeat.",
        goodFor: "Wind, breath layers, and hits that need something behind them. Also the clearest demonstration that FM depth is multiplicative.",
      },
    },
  },
  {
    spec: V.V_SINE,
    model: {
      index: 11, code: "SINE", name: "One Operator", family: "primitives",
      description:
        "A single operator with nothing modulating it — a pure sine, and the floor the whole engine is built on. Three of the four macro knobs do nothing here, which is the lesson.",
      knobs: [
        k("brightness", "Brightness", "Does nothing on this voice. Algorithm 32 has six carriers and no modulators, and Brightness only moves modulators — on a carrier the same setting would be volume, not timbre."),
        k("ratio", "Ratio", "Does nothing, for the same reason: there is no modulator whose ratio there would be to move."),
        k("feedback", "Feedback", "Does nothing here either. Algorithm 32 puts its feedback loop on operator 6, and operator 6 is silent in this voice — compare Feedback Alone, which is the same algorithm with the other operator sounding."),
        k("envelope", "Envelope", "The only live knob. With no timbre to shape, all that is left is the shape of the note itself."),
      ],
      detail: {
        listenFor: "Nothing but the fundamental. Switch from here to any other voice, and everything new you hear is modulation.",
        goodFor: "Sub-bass, a reference tone, and the first node the flowsheet ever has to draw.",
      },
    },
  },
  {
    spec: V.V_TWO_OP,
    model: {
      index: 12, code: "2OPS", name: "Two Operators", family: "primitives",
      description:
        "One operator modulating another, both at the note's own pitch. The textbook case: at 1:1 the sidebands land on whole-number harmonics, so raising the index walks a sine toward a sawtooth.",
      knobs: [
        k("brightness", "Brightness", "This is the modulation index itself, with nothing else in the way. Sweep it slowly — the harmonics arrive in order, and you can count them."),
        k("ratio", "Ratio", "Leave it at 1:1 to hear the harmonic series; move it to hear that series break. This one knob is the difference between every tonal FM voice and every metallic one."),
        k("feedback", "Feedback", "Starts at zero on this voice so the demonstration is clean. Adding it is the fastest way to hear what feedback does to an otherwise textbook spectrum."),
        k("envelope", "Envelope", "The note is held flat on purpose, so the spectrum is the only thing changing. Use this knob when you want to stop that being true."),
      ],
      detail: {
        listenFor: "Sweep Brightness from bottom to top on a held note. Nothing else in the app makes the relationship between modulation index and harmonic content this plain.",
        goodFor: "Teaching. Also a perfectly good sawtooth-ish lead if you leave the knob where you like it.",
      },
    },
  },
  {
    spec: V.V_FEEDBACK,
    model: {
      index: 13, code: "FDBK", name: "Feedback Alone", family: "primitives",
      description:
        "One operator modulating itself, with nothing else running. Feedback is the only source of harmonics in the voice, so the knob and the sound are the same thing.",
      knobs: [
        k("brightness", "Brightness", "Does nothing here — algorithm 32 has no modulators for it to reach. The harmonics you hear are coming from the loop, not from another operator."),
        k("ratio", "Ratio", "Does nothing, for the same reason. An operator feeding itself has no separate ratio to set."),
        k("feedback", "Feedback", "The whole voice. From a bare sine at the bottom to a rough sawtooth at the top, and the only knob in the corpus that is solely responsible for its voice's character."),
        k("envelope", "Envelope", "Shapes the note. Compare it against One Operator — same algorithm, same envelope, and the loop is the only difference between them."),
      ],
      detail: {
        listenFor: "Put this next to One Operator. They are the same patch except that this one's operator listens to itself, and that single difference produces every harmonic in it.",
        goodFor: "Understanding the one FM mechanism that is not about two operators. Also a decent raw sawtooth.",
      },
    },
  },
];

/** Model metadata for the registry/picker, in index order. */
export const FM_MODELS: EngineModel[] = FM_VOICES.map((v) => v.model);

/** Patch bytes per model index, built once at module load. */
export const FM_PATCHES: Uint8Array[] = FM_VOICES.map((v) => buildPatch(v.spec));
