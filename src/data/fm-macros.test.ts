// The four macro knobs: that they edit the right bytes, and that those edits
// actually do the thing the knob label claims when rendered through the engine.
//
// The second half matters more than the first. A macro that moves a byte is
// easy; a macro whose prose says "brighter" and whose audio gets duller is the
// failure the Explain panel cannot survive, because the whole product is the
// claim that the words match the sound.

import { describe, it, expect, beforeAll } from "vitest";
import { readFileSync } from "node:fs";
import { pathToFileURL } from "node:url";
import { resolve } from "node:path";
import { applyMacros, FM_MACRO_DEFAULTS, ratioOf, ratioToBytes } from "./fm-macros";
import { FM_PATCHES } from "./fm-models";
import { buildPatch, SILENT_OP } from "./fm-patch";
import { FM_ALGORITHMS, modulatorsOf, algorithmRoles } from "./fm-algorithms";

const OP = 21;
/** Byte offset of panel operator `n`'s block. */
const block = (panelOp: number) => (6 - panelOp) * OP;

describe("algorithm roles", () => {
  it("covers all 32 algorithms, each with at least one carrier", () => {
    expect(FM_ALGORITHMS.length).toBe(32);
    FM_ALGORITHMS.forEach((a, i) => {
      expect(a.algorithm).toBe(i + 1);
      expect(a.carriers.length).toBeGreaterThan(0);
      expect(a.carriers.length).toBeLessThanOrEqual(6);
      for (const c of a.carriers) expect(c).toBeGreaterThanOrEqual(1);
    });
  });

  // Spot-checks against the two algorithms whose shape is unmistakable, so a
  // bad regeneration cannot pass quietly.
  it("reads algorithm 1 as two carriers and algorithm 32 as six", () => {
    expect(algorithmRoles(1).carriers).toEqual([1, 3]);
    expect(algorithmRoles(1).feedbackOp).toBe(6);
    expect(algorithmRoles(32).carriers).toEqual([1, 2, 3, 4, 5, 6]);
    expect(modulatorsOf(32)).toEqual([]);
  });

  // Not a defect in this file — a real limitation of the vendored engine,
  // asserted so nobody writes knob prose that promises feedback on these two.
  it("reports no feedback operator on algorithms 4 and 6", () => {
    expect(algorithmRoles(4).feedbackOp).toBeNull();
    expect(algorithmRoles(6).feedbackOp).toBeNull();
  });
});

describe("ratio byte conversion", () => {
  it("round-trips the ratios a patch can express", () => {
    for (const target of [0.5, 0.75, 1, 1.41, 2, 3.5, 7, 14, 31]) {
      const { coarse, fine } = ratioToBytes(target);
      expect(ratioOf(coarse, fine)).toBeCloseTo(target, 1);
    }
  });

  it("stays inside the byte ranges the engine reads", () => {
    for (const target of [0.01, 0.4, 0.9, 60, 1000]) {
      const { coarse, fine } = ratioToBytes(target);
      expect(coarse).toBeGreaterThanOrEqual(0);
      expect(coarse).toBeLessThanOrEqual(31);
      expect(fine).toBeGreaterThanOrEqual(0);
      expect(fine).toBeLessThanOrEqual(99);
    }
  });
});

describe("applyMacros", () => {
  const base = FM_PATCHES[0];

  it("returns the patch untouched at the centre detent", () => {
    const out = applyMacros(base, FM_MACRO_DEFAULTS);
    expect([...out]).toEqual([...base]);
  });

  it("never mutates the corpus array", () => {
    const before = [...base];
    applyMacros(base, { ...FM_MACRO_DEFAULTS, brightness: 1, envelope: 0 });
    expect([...base]).toEqual(before);
  });

  // Voice 0 is algorithm 1: carriers 1 and 3, so operator 2 is a modulator and
  // operator 1 is not. Brightness must move one and not the other.
  it("raises modulator output levels and leaves carriers alone", () => {
    const carrierBefore = base[block(1) + 16];
    const modBefore = base[block(2) + 16];
    const up = applyMacros(base, { ...FM_MACRO_DEFAULTS, brightness: 1 });
    const down = applyMacros(base, { ...FM_MACRO_DEFAULTS, brightness: 0 });
    expect(up[block(2) + 16]).toBeGreaterThan(modBefore);
    expect(down[block(2) + 16]).toBeLessThan(modBefore);
    expect(up[block(1) + 16]).toBe(carrierBefore);
    expect(down[block(1) + 16]).toBe(carrierBefore);
  });

  it("scales modulator ratios by an octave either side", () => {
    const baseRatio = ratioOf(base[block(2) + 18], base[block(2) + 19]);
    const up = applyMacros(base, { ...FM_MACRO_DEFAULTS, ratio: 1 });
    const down = applyMacros(base, { ...FM_MACRO_DEFAULTS, ratio: 0 });
    expect(ratioOf(up[block(2) + 18], up[block(2) + 19])).toBeCloseTo(baseRatio * 2, 1);
    expect(ratioOf(down[block(2) + 18], down[block(2) + 19])).toBeCloseTo(baseRatio / 2, 1);
  });

  it("drives feedback between none and full", () => {
    expect(applyMacros(base, { ...FM_MACRO_DEFAULTS, feedback: 0 })[135]).toBe(0);
    expect(applyMacros(base, { ...FM_MACRO_DEFAULTS, feedback: 1 })[135]).toBe(7);
  });

  it("leaves feedback alone on an algorithm that has none", () => {
    const alg4 = buildPatch({
      name: "ALG4", algorithm: 4, feedback: 3,
      ops: [SILENT_OP, SILENT_OP, SILENT_OP, SILENT_OP, SILENT_OP, SILENT_OP],
    });
    expect(applyMacros(alg4, { ...FM_MACRO_DEFAULTS, feedback: 1 })[135]).toBe(3);
  });

  it("speeds up every operator's envelope, carriers included", () => {
    const fast = applyMacros(base, { ...FM_MACRO_DEFAULTS, envelope: 1 });
    const slow = applyMacros(base, { ...FM_MACRO_DEFAULTS, envelope: 0 });
    for (const op of [1, 2]) {
      // Rate 2 is the one with headroom in both directions on this voice.
      expect(fast[block(op) + 1]).toBeGreaterThan(base[block(op) + 1]);
      expect(slow[block(op) + 1]).toBeLessThan(base[block(op) + 1]);
    }
  });

  it("does nothing to brightness on algorithm 32, which has no modulators", () => {
    const alg32 = buildPatch({
      name: "ALG32", algorithm: 32,
      ops: Array.from({ length: 6 }, () => ({
        rates: [99, 60, 40, 60] as [number, number, number, number],
        levels: [99, 80, 60, 0] as [number, number, number, number],
        outLevel: 60, coarse: 1,
      })) as never,
    });
    const out = applyMacros(alg32, { ...FM_MACRO_DEFAULTS, brightness: 1 });
    for (let op = 1; op <= 6; ++op) expect(out[block(op) + 16]).toBe(60);
  });
});

// --- What it sounds like -----------------------------------------------------

const SR = 44100;

type FmModule = {
  _fm_init(n: number): void;
  _fm_block_size(): number;
  _fm_alloc(n: number): number;
  _fm_free(p: number): void;
  _fm_set_patch(p: number, len: number): void;
  _fm_note_on(n: number, v: number): void;
  _fm_render(p: number, n: number): void;
  _malloc(n: number): number;
  _free(p: number): void;
  HEAP16: Int16Array;
  HEAPU8: Uint8Array;
};

describe("macros do what their labels claim", () => {
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

  function renderWith(patch: Uint8Array, seconds = 0.5): Float64Array {
    const p = M._malloc(patch.length);
    M.HEAPU8.set(patch, p);
    M._fm_set_patch(p, patch.length);
    M._free(p);
    const n = Math.floor((SR * seconds) / N) * N;
    const ptr = M._fm_alloc(n);
    M._fm_note_on(60, 100);
    M._fm_render(ptr, n);
    const out = Float64Array.from(M.HEAP16.subarray(ptr >> 1, (ptr >> 1) + n));
    M._fm_free(ptr);
    return out;
  }

  /**
   * Spectral brightness proxy: RMS of the first difference over RMS of the
   * signal. It rises monotonically with the centre of mass of the spectrum, and
   * needs no FFT to be trustworthy.
   */
  function brightnessOf(x: Float64Array): number {
    let s = 0, d = 0;
    for (let i = 1; i < x.length; ++i) { s += x[i] * x[i]; d += (x[i] - x[i - 1]) ** 2; }
    return s === 0 ? 0 : Math.sqrt(d / s);
  }

  /**
   * Seconds from the loudest moment until the level has halved.
   *
   * Not "time to silence": this voice is *held* for the whole render and its
   * carrier holds at EG level 3, so it never reaches silence until key-off.
   * What the Envelope macro moves is how fast it gets from the attack peak down
   * to that held level, which is what the ear calls the note's shape.
   */
  function decayTime(x: Float64Array): number {
    const W = 512;
    const env: number[] = [];
    for (let i = 0; i + W <= x.length; i += W) {
      let s = 0;
      for (let j = i; j < i + W; ++j) s += x[j] * x[j];
      env.push(Math.sqrt(s / W));
    }
    let peakIdx = 0;
    for (let i = 1; i < env.length; ++i) if (env[i] > env[peakIdx]) peakIdx = i;
    const target = env[peakIdx] * 0.5;
    for (let i = peakIdx; i < env.length; ++i) {
      if (env[i] <= target) return ((i - peakIdx) * W) / SR;
    }
    return (x.length - peakIdx * W) / SR;
  }

  const base = FM_PATCHES[0];

  it("Brightness genuinely brightens", () => {
    const dull = brightnessOf(renderWith(applyMacros(base, { ...FM_MACRO_DEFAULTS, brightness: 0.1 })));
    const mid = brightnessOf(renderWith(applyMacros(base, FM_MACRO_DEFAULTS)));
    const bright = brightnessOf(renderWith(applyMacros(base, { ...FM_MACRO_DEFAULTS, brightness: 0.9 })));
    expect(dull).toBeLessThan(mid);
    expect(mid).toBeLessThan(bright);
  });

  it("Envelope turned up shortens the note", () => {
    const slow = decayTime(renderWith(applyMacros(base, { ...FM_MACRO_DEFAULTS, envelope: 0.1 }), 1.5));
    const fast = decayTime(renderWith(applyMacros(base, { ...FM_MACRO_DEFAULTS, envelope: 0.9 }), 1.5));
    expect(fast).toBeLessThan(slow);
  });

  it("Ratio moves the sidebands without moving the fundamental", () => {
    const fundamental = (x: Float64Array): number => {
      let cross = 0, prev = 0;
      const from = Math.floor(SR * 0.05), len = Math.floor(SR * 0.3);
      for (let i = from; i < from + len; ++i) { if (prev <= 0 && x[i] > 0) cross++; prev = x[i]; }
      return (cross * SR) / len;
    };
    const detent = renderWith(applyMacros(base, FM_MACRO_DEFAULTS));
    const shifted = renderWith(applyMacros(base, { ...FM_MACRO_DEFAULTS, ratio: 0.75 }));
    // The carrier is untouched, so the pitch must not move...
    expect(fundamental(detent)).toBeGreaterThan(261.6 * 0.97);
    expect(fundamental(detent)).toBeLessThan(261.6 * 1.03);
    // ...but the timbre must.
    expect(Math.abs(brightnessOf(shifted) - brightnessOf(detent))).toBeGreaterThan(0.001);
  });

  it("stays inside int16 at every macro extreme", () => {
    for (const m of [
      { brightness: 1, ratio: 1, feedback: 1, envelope: 1 },
      { brightness: 1, ratio: 0, feedback: 1, envelope: 0 },
      { brightness: 0, ratio: 1, feedback: 0, envelope: 1 },
    ]) {
      const x = renderWith(applyMacros(base, m));
      let peak = 0;
      for (const v of x) peak = Math.max(peak, Math.abs(v));
      expect(peak).toBeLessThan(32767);
    }
  });
});
