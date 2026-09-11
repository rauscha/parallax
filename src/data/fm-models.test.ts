// The FM corpus and its patch serialiser.
//
// Two kinds of check live here.
//
// **Pure, fast:** the byte layout. The one mistake this module exists to
// prevent is operator-order confusion — msfa indexes operators in sysex order,
// reversed from panel numbering — so that reversal is asserted directly rather
// than trusted.
//
// **Against the real binary:** that voice 0's patch is equivalent to the boot
// patch hardcoded in dsp/shim/fm_shim.cc. Those two descriptions of the same
// voice live in different languages and can drift apart silently; this renders
// both and compares samples. If it ever fails, one of the two was edited alone.

import { describe, it, expect, beforeAll } from "vitest";
import { readFileSync } from "node:fs";
import { pathToFileURL } from "node:url";
import { resolve } from "node:path";
import { FM_VOICES, FM_MODELS, FM_PATCHES, FM_FAMILIES } from "./fm-models";
import { buildPatch, SILENT_OP, FM_PATCH_SIZE, FM_LFO_WAVE } from "./fm-patch";

describe("FM patch serialiser", () => {
  it("emits exactly one unpacked patch", () => {
    expect(FM_PATCHES[0].length).toBe(FM_PATCH_SIZE);
    expect(FM_PATCH_SIZE).toBe(156);
  });

  // Panel operator 1 must land in msfa index 5. Everything about the flowsheet
  // diagram's correctness rests on this.
  it("reverses panel order into msfa sysex order", () => {
    const p = buildPatch({
      name: "ORDER",
      algorithm: 1,
      ops: [
        { rates: [1, 1, 1, 1], levels: [0, 0, 0, 0], outLevel: 11, coarse: 1 },
        { rates: [2, 2, 2, 2], levels: [0, 0, 0, 0], outLevel: 22, coarse: 1 },
        { rates: [3, 3, 3, 3], levels: [0, 0, 0, 0], outLevel: 33, coarse: 1 },
        { rates: [4, 4, 4, 4], levels: [0, 0, 0, 0], outLevel: 44, coarse: 1 },
        { rates: [5, 5, 5, 5], levels: [0, 0, 0, 0], outLevel: 55, coarse: 1 },
        { rates: [6, 6, 6, 6], levels: [0, 0, 0, 0], outLevel: 66, coarse: 1 },
      ],
    });
    // outLevel is byte 16 of each 21-byte block.
    expect(p[5 * 21 + 16]).toBe(11);   // panel op 1 -> block 5
    expect(p[4 * 21 + 16]).toBe(22);   // panel op 2 -> block 4
    expect(p[0 * 21 + 16]).toBe(66);   // panel op 6 -> block 0
  });

  it("writes the globals where Dx7Note reads them", () => {
    const p = buildPatch({
      name: "GLOBALS!!",
      algorithm: 32,
      feedback: 5,
      oscKeySync: false,
      ops: [SILENT_OP, SILENT_OP, SILENT_OP, SILENT_OP, SILENT_OP, SILENT_OP],
      lfo: { speed: 40, delay: 10, pitchModDepth: 20, ampModDepth: 30, keySync: false, wave: FM_LFO_WAVE.square, pitchModSens: 4 },
    });
    expect(p[134]).toBe(31);          // algorithm is stored 0-based
    expect(p[135]).toBe(5);
    expect(p[136]).toBe(0);
    expect([...p.subarray(137, 144)]).toEqual([40, 10, 20, 30, 0, 3, 4]);
    expect(p[144]).toBe(24);          // transpose centre
    expect(p[155]).toBe(0x3f);        // all six operators enabled
    // Flat pitch envelope by default — level 50 is centre, i.e. no pitch move.
    expect([...p.subarray(130, 134)]).toEqual([50, 50, 50, 50]);
  });

  it("clamps out-of-range fields instead of letting them wrap", () => {
    const p = buildPatch({
      name: "CLAMP",
      algorithm: 99,                  // only 32 exist
      feedback: 40,                   // 0..7
      ops: [
        { rates: [200, -5, 0, 0], levels: [0, 0, 0, 0], outLevel: 500, coarse: 99, detune: 40 },
        SILENT_OP, SILENT_OP, SILENT_OP, SILENT_OP, SILENT_OP,
      ],
    });
    const o = 5 * 21;
    expect(p[o + 0]).toBe(99);
    expect(p[o + 1]).toBe(0);
    expect(p[o + 16]).toBe(99);
    expect(p[o + 18]).toBe(31);
    expect(p[o + 20]).toBe(14);
    expect(p[134]).toBe(31);
    expect(p[135]).toBe(7);
  });

  it("defaults an unspecified operator to silence at the note's own pitch", () => {
    const p = buildPatch({
      name: "SILENT",
      algorithm: 1,
      ops: [SILENT_OP, SILENT_OP, SILENT_OP, SILENT_OP, SILENT_OP, SILENT_OP],
    });
    for (let op = 0; op < 6; ++op) {
      expect(p[op * 21 + 16]).toBe(0);    // output level
      expect(p[op * 21 + 18]).toBe(1);    // coarse = 1, i.e. the note itself
      expect(p[op * 21 + 20]).toBe(7);    // detune 7 = none
    }
  });
});

describe("FM corpus", () => {
  it("has an index matching its array position", () => {
    FM_MODELS.forEach((m, i) => expect(m.index).toBe(i));
  });

  it("has unique codes — share URLs and presets key on them", () => {
    const codes = FM_MODELS.map((m) => m.code.toLowerCase());
    expect(new Set(codes).size).toBe(codes.length);
  });

  it("places every voice in a declared family", () => {
    const ids = new Set(FM_FAMILIES.map((f) => f.id));
    for (const m of FM_MODELS) expect(ids.has(m.family)).toBe(true);
  });

  // The Explain panel's knob cards link to parameter ids by exact match
  // (activeParamStore). A typo here silently breaks the knob <-> card highlight.
  it("names only real macro parameters in its knob cards", () => {
    const known = new Set(["brightness", "ratio", "feedback", "envelope", "gain", "model"]);
    for (const m of FM_MODELS) {
      expect(m.knobs.length).toBeGreaterThan(0);
      for (const k of m.knobs) expect(known.has(k.id)).toBe(true);
    }
  });
});

// --- Equivalence with the shim's hardcoded boot patch ------------------------

const SR = 44100;

type FmModule = {
  _fm_init(sampleRate: number): void;
  _fm_block_size(): number;
  _fm_alloc(n: number): number;
  _fm_free(ptr: number): void;
  _fm_set_patch(ptr: number, len: number): void;
  _fm_note_on(note: number, velocity: number): void;
  _fm_render(ptr: number, n: number): void;
  _malloc(n: number): number;
  _free(ptr: number): void;
  HEAP16: Int16Array;
  HEAPU8: Uint8Array;
};

describe("voice 0 matches the shim's boot patch", () => {
  let M: FmModule;
  let N: number;

  beforeAll(async () => {
    const root = resolve(__dirname, "../..");
    const glue = pathToFileURL(resolve(root, "public/fm.js")).href;
    const wasmBinary = readFileSync(resolve(root, "public/fm.wasm"));
    const { default: createFmModule } = await import(/* @vite-ignore */ glue);
    M = await createFmModule({ wasmBinary });
    M._fm_init(SR);
    N = M._fm_block_size();
  });

  const render = (): Int16Array => {
    const n = Math.floor((SR * 0.3) / N) * N;
    const ptr = M._fm_alloc(n);
    M._fm_note_on(60, 100);
    M._fm_render(ptr, n);
    const out = Int16Array.from(M.HEAP16.subarray(ptr >> 1, (ptr >> 1) + n));
    M._fm_free(ptr);
    return out;
  };

  it("renders sample-identical audio to the engine's own initial patch", () => {
    const fromShim = render();

    const bytes = FM_PATCHES[0];
    const p = M._malloc(bytes.length);
    M.HEAPU8.set(bytes, p);
    M._fm_set_patch(p, bytes.length);
    M._free(p);

    const fromCorpus = render();

    expect(fromCorpus.length).toBe(fromShim.length);
    expect(fromCorpus.length).toBeGreaterThan(0);
    // Sample-exact: same patch bytes through the same deterministic DSP.
    let firstDiff = -1;
    for (let i = 0; i < fromShim.length; ++i) {
      if (fromShim[i] !== fromCorpus[i]) { firstDiff = i; break; }
    }
    expect(firstDiff, `first differing sample at ${firstDiff}`).toBe(-1);
  });

  it("declares the same voice name the shim writes", () => {
    const name = String.fromCharCode(...FM_PATCHES[0].subarray(145, 155)).trim();
    expect(name).toBe("PARALLAX 1");
    expect(FM_VOICES[0].spec.name).toBe("PARALLAX 1");
  });
});
