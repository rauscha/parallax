/**
 * The FM voice corpus — engine #5's model axis.
 *
 * Unlike Braids/Plaits/Rings, where a "model" is a firmware enum the WASM knows
 * about, an FM model is a **patch**: 156 bytes of our own operator settings,
 * authored here and pushed into the engine on selection. The `index` field is
 * just this array's order, and it is what lands in `setParameter("model", i)`
 * and in share URLs via the model code — so codes and order are stable API.
 * Append, do not reorder.
 *
 * Every voice in here is original work, authored by hand against the vendored
 * engine — locked decision 5: "build it from sound, not from the ROM." There is
 * no factory ROM sysex in this project and no transcribed parameter sets.
 *
 * The prose follows the same honesty rule as the Braids/Plaits/Rings corpora:
 * every claim is verifiable against the vendored source or against what the
 * running engine measurably does. Each voice also demonstrates one FM *idea*,
 * because the flowsheet teacher (spec §4) draws these voices — a voice whose
 * diagram teaches nothing is a wasted slot.
 */
import type { EngineModel, EngineFamily } from "../audio/types";
import { buildPatch, SILENT_OP, type FmPatchSpec } from "./fm-patch";

export const FM_FAMILIES: EngineFamily[] = [
  { id: "bells", label: "Bells and Metallic" },
  { id: "epiano", label: "Electric Pianos" },
  { id: "brass", label: "Brass and Winds" },
  { id: "bass", label: "Basses" },
  { id: "inharmonic", label: "Inharmonic and Noise" },
  { id: "primitives", label: "Teaching Primitives" },
];

const k = (id: string, label: string, text: string) => ({ id, label, text });

/** A corpus entry: the picker/Explain metadata plus the patch bytes it loads. */
export interface FmVoice {
  model: EngineModel;
  spec: FmPatchSpec;
}

// --- Voice 0 — the boot patch ------------------------------------------------
// Byte-identical to LoadBootPatch() in dsp/shim/fm_shim.cc, so selecting model
// 0 is a no-op against the engine's own initial state. fm-models.test.ts
// asserts that equivalence by rendering both and comparing samples; if the
// shim's boot patch is ever edited, that test is what catches the divergence.
const BELL_2OP: FmPatchSpec = {
  name: "PARALLAX 1",
  algorithm: 1,
  feedback: 0,
  ops: [
    // Operator 1 — the carrier. This is what you hear.
    { rates: [99, 62, 45, 60], levels: [99, 88, 72, 0], outLevel: 99,
      coarse: 1, rateScaling: 1, keyVelSens: 2 },
    // Operator 2 — the modulator, one octave up, decaying faster than the
    // carrier so the tone starts bright and settles toward a sine.
    { rates: [99, 55, 40, 62], levels: [99, 72, 50, 0], outLevel: 78,
      coarse: 2, rateScaling: 2, keyVelSens: 2 },
    SILENT_OP, SILENT_OP, SILENT_OP, SILENT_OP,
  ],
};

export const FM_VOICES: FmVoice[] = [
  {
    model: {
      index: 0,
      code: "PLX1",
      name: "Parallax Bell",
      family: "bells",
      description:
        "Two operators at a 2:1 ratio — the plainest FM voice that still sounds like something. A struck bell that brightens on attack and settles toward a sine.",
      knobs: [
        k("brightness", "Brightness", "Raises operator 2's output level, which is the modulation index — more level means more and stronger sidebands, so the strike gets harder and more metallic."),
        k("ratio", "Ratio", "Moves operator 2 away from its 2:1 lock. On the detent it is a clean harmonic bell; off it, the partials stop being whole-number multiples and the tone turns into a gong."),
        k("feedback", "Feedback", "Feeds operator 2 back into itself. At this voice's algorithm the loop adds progressively noisier harmonics — a sine turning into a sawtooth turning into hiss."),
        k("envelope", "Envelope", "Scales every operator's envelope rates together. Left is a long bloom, right is a sharp pluck; the modulator still decays faster than the carrier, which is what makes it read as a strike."),
      ],
      detail: {
        listenFor:
          "The first 200 ms. The bright overtones fade before the fundamental does, which is exactly what a real struck bar does and the reason 2-operator FM convinced anyone in the first place.",
        goodFor:
          "Learning the engine. It is the voice the flowsheet diagram is clearest on — two nodes, one wire — so it is the default for a reason.",
      },
    },
    spec: BELL_2OP,
  },
];

/** Model metadata for the registry/picker, in index order. */
export const FM_MODELS: EngineModel[] = FM_VOICES.map((v) => v.model);

/** Patch bytes per model index, built once at module load. */
export const FM_PATCHES: Uint8Array[] = FM_VOICES.map((v) => buildPatch(v.spec));
