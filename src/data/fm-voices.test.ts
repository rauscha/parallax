// The corpus, checked against the running engine.
//
// This file exists because of the Explain panel's honesty rule. Every voice's
// prose makes claims — "the brightest here", "the longest decay", "this knob
// does nothing on this voice" — and a claim that nobody checks is just a
// confident sentence. So each one is asserted against real rendered audio from
// the committed binary.
//
// If a voice is retuned and a test here fails, the finding is that the WORDS
// are now wrong, not that the test is too strict.

import { describe, it, expect, beforeAll } from "vitest";
import { readFileSync } from "node:fs";
import { pathToFileURL } from "node:url";
import { resolve } from "node:path";
import { FM_VOICES, FM_MODELS, FM_PATCHES } from "./fm-models";
import { ratioOf, applyMacros, FM_MACRO_DEFAULTS } from "./fm-macros";
import { algorithmRoles } from "./fm-algorithms";

const SR = 44100;
const OP = 21;
const block = (panelOp: number) => (6 - panelOp) * OP;
const byCode = (code: string): number => FM_MODELS.findIndex((m) => m.code === code);

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

function render(patch: Uint8Array, seconds = 2.0, velocity = 110): Float64Array {
  const p = M._malloc(patch.length);
  M.HEAPU8.set(patch, p);
  M._fm_set_patch(p, patch.length);
  M._free(p);
  const n = Math.floor((SR * seconds) / N) * N;
  const ptr = M._fm_alloc(n);
  M._fm_note_on(60, velocity);
  M._fm_render(ptr, n);
  const out = Float64Array.from(M.HEAP16.subarray(ptr >> 1, (ptr >> 1) + n));
  M._fm_free(ptr);
  return out;
}

/** Spectral brightness proxy: RMS of the first difference over RMS of signal. */
function brightness(x: Float64Array): number {
  let s = 0, d = 0;
  for (let i = 1; i < x.length; ++i) { s += x[i] * x[i]; d += (x[i] - x[i - 1]) ** 2; }
  return s === 0 ? 0 : Math.sqrt(d / s);
}

function peakOf(x: Float64Array): number {
  let p = 0;
  for (const v of x) p = Math.max(p, Math.abs(v));
  return p;
}

/** Seconds from the loudest 1024-sample window until the level has halved. */
function halfLife(x: Float64Array): number {
  const W = 1024;
  const env: number[] = [];
  for (let i = 0; i + W <= x.length; i += W) {
    let s = 0;
    for (let j = i; j < i + W; ++j) s += x[j] * x[j];
    env.push(Math.sqrt(s / W));
  }
  let pi = 0;
  for (let i = 1; i < env.length; ++i) if (env[i] > env[pi]) pi = i;
  for (let i = pi; i < env.length; ++i) if (env[i] <= env[pi] * 0.5) return ((i - pi) * W) / SR;
  return Infinity;
}

const same = (a: Float64Array, b: Float64Array): boolean => {
  if (a.length !== b.length) return false;
  for (let i = 0; i < a.length; ++i) if (a[i] !== b[i]) return false;
  return true;
};

describe("every voice", () => {
  it("is audible, and leaves headroom inside int16", () => {
    for (const v of FM_VOICES) {
      const p = peakOf(render(FM_PATCHES[v.model.index], 1.0));
      expect(p, v.model.code).toBeGreaterThan(1500);
      expect(p, v.model.code).toBeLessThan(32767);
    }
  });

  // The make-up gain in FmEngine is one constant for the whole engine, which is
  // only honest if the corpus is level-consistent. Fourteen voices inside a 2 dB
  // window is what makes that constant defensible.
  it("sits within about 2 dB of the others at the same velocity", () => {
    const peaks = FM_VOICES.map((v) => peakOf(render(FM_PATCHES[v.model.index], 1.0)));
    const lo = Math.min(...peaks), hi = Math.max(...peaks);
    expect(20 * Math.log10(hi / lo)).toBeLessThan(2.5);
  });

  it("carries one card per macro knob, all four, in order", () => {
    for (const m of FM_MODELS) {
      expect(m.knobs.map((x) => x.id), m.code).toEqual(["brightness", "ratio", "feedback", "envelope"]);
    }
  });

  // A voice whose Feedback card promises an effect must be on an algorithm that
  // has a feedback operator AND must actually sound that operator.
  it("only promises feedback where the feedback operator is sounding", () => {
    for (const v of FM_VOICES) {
      const card = v.model.knobs.find((x) => x.id === "feedback")!;
      const promises = !/does nothing|Does nothing/.test(card.text);
      const fbOp = algorithmRoles(v.spec.algorithm).feedbackOp;
      if (!promises) continue;
      expect(fbOp, `${v.model.code} promises feedback`).not.toBeNull();
      expect(FM_PATCHES[v.model.index][block(fbOp!) + 16], `${v.model.code} op${fbOp} level`)
        .toBeGreaterThan(0);
    }
  });
});

describe("the ratios the prose quotes", () => {
  const ratioAt = (code: string, op: number): number => {
    const p = FM_PATCHES[byCode(code)];
    return ratioOf(p[block(op) + 18], p[block(op) + 19]);
  };

  it("match the patch bytes", () => {
    expect(ratioAt("PLX1", 2)).toBeCloseTo(2, 2);       // "2:1"
    expect(ratioAt("GLAS", 2)).toBeCloseTo(7, 2);       // "7:1, 11:1 and 14:1"
    expect(ratioAt("GLAS", 4)).toBeCloseTo(11, 2);
    expect(ratioAt("GLAS", 6)).toBeCloseTo(14, 2);
    expect(ratioAt("GONG", 2)).toBeCloseTo(3.48, 2);    // "3.48 and 1.41"
    expect(ratioAt("GONG", 3)).toBeCloseTo(1.41, 2);
    expect(ratioAt("TINE", 3)).toBeCloseTo(14, 2);      // "a 14:1 modulator"
    expect(ratioAt("REED", 2)).toBeCloseTo(3, 2);       // "a 3:1 modulator"
    expect(ratioAt("CLNK", 2)).toBeCloseTo(4.59, 2);    // "4.59 and 9.17"
    expect(ratioAt("CLNK", 3)).toBeCloseTo(9.17, 2);
    expect(ratioAt("HISS", 6)).toBeCloseTo(1, 2);       // "the chain runs 1:1, 5:1, 9:1"
    expect(ratioAt("HISS", 5)).toBeCloseTo(5, 2);
    expect(ratioAt("HISS", 4)).toBeCloseTo(9, 2);
  });
});

describe("the comparative claims", () => {
  it("makes Clank the brightest voice in the corpus", () => {
    const scored = FM_VOICES
      .map((v) => ({ code: v.model.code, b: brightness(render(FM_PATCHES[v.model.index], 1.0)) }))
      .sort((a, b) => b.b - a.b);
    expect(scored[0].code).toBe("CLNK");
  });

  it("leaves One Operator the least bright, as a bare sine should be", () => {
    const scored = FM_VOICES
      .map((v) => ({ code: v.model.code, b: brightness(render(FM_PATCHES[v.model.index], 1.0)) }))
      .sort((a, b) => a.b - b.b);
    expect(scored[0].code).toBe("SINE");
  });

  // The failure this catches is the one that bit the first draft: an operator
  // silenced mid-chain makes the carrier render as a plain sine, silently.
  it("leaves every other voice audibly modulated", () => {
    const sine = brightness(render(FM_PATCHES[byCode("SINE")], 1.0));
    for (const v of FM_VOICES) {
      if (v.model.code === "SINE") continue;
      expect(brightness(render(FM_PATCHES[v.model.index], 1.0)), v.model.code)
        .toBeGreaterThan(sine * 1.25);
    }
  });

  it("gives Bronze Gong the longest decay", () => {
    const decaying = FM_VOICES
      .map((v) => ({ code: v.model.code, t: halfLife(render(FM_PATCHES[v.model.index], 2.0)) }))
      .filter((x) => Number.isFinite(x.t))
      .sort((a, b) => b.t - a.t);
    expect(decaying[0].code).toBe("GONG");
  });

  it("halves Thumb Bass in about 50 ms and Clank in about 20", () => {
    expect(halfLife(render(FM_PATCHES[byCode("THMB")], 2.0))).toBeLessThan(0.1);
    expect(halfLife(render(FM_PATCHES[byCode("CLNK")], 2.0))).toBeLessThan(0.05);
  });
});

describe("the dead-knob claims", () => {
  const withMacro = (code: string, macro: string, value: number): Float64Array =>
    render(applyMacros(FM_PATCHES[byCode(code)], { ...FM_MACRO_DEFAULTS, [macro]: value }), 0.8);

  // One Operator says three of its four knobs do nothing. That has to be true.
  it("means it when One Operator says Brightness, Ratio and Feedback do nothing", () => {
    const base = render(FM_PATCHES[byCode("SINE")], 0.8);
    for (const macro of ["brightness", "ratio", "feedback"]) {
      expect(same(base, withMacro("SINE", macro, 1)), `${macro} at max`).toBe(true);
      expect(same(base, withMacro("SINE", macro, 0)), `${macro} at min`).toBe(true);
    }
  });

  // Rendered twice and compared on the second pass. Dx7Note::init does not clear
  // fb_buf_, so a voice with feedback running carries a little state across
  // note-ons and two consecutive renders of the SAME patch are not bit-identical
  // until the loop has settled. That is the engine's behaviour, not a macro
  // doing something — which is exactly what this test has to tell apart.
  const settled = (code: string, macro?: string, value?: number): Float64Array => {
    const patch = macro === undefined
      ? FM_PATCHES[byCode(code)]
      : applyMacros(FM_PATCHES[byCode(code)], { ...FM_MACRO_DEFAULTS, [macro]: value! });
    render(patch, 0.8);
    return render(patch, 0.8);
  };

  it("means it when Feedback Alone says Brightness and Ratio do nothing", () => {
    const base = settled("FDBK");
    for (const macro of ["brightness", "ratio"]) {
      expect(same(base, settled("FDBK", macro, 1)), macro).toBe(true);
    }
  });

  it("but gives Feedback Alone a Feedback knob that is the whole voice", () => {
    const quiet = brightness(withMacro("FDBK", "feedback", 0));
    const loud = brightness(withMacro("FDBK", "feedback", 1));
    expect(loud).toBeGreaterThan(quiet * 2);
  });

  // The reason the boot patch moved from algorithm 1 to algorithm 2: on
  // algorithm 1 the feedback flag sits on operator 6, which this voice does not
  // sound, so the default voice would have shipped with a dead knob.
  it("gives the default voice a live Feedback knob", () => {
    const off = brightness(withMacro("PLX1", "feedback", 0.5));
    const on = brightness(withMacro("PLX1", "feedback", 1));
    expect(on).toBeGreaterThan(off * 1.2);
  });

  it("keeps One Operator and Feedback Alone identical except for the loop", () => {
    const sine = render(FM_PATCHES[byCode("SINE")], 0.8);
    const noLoop = withMacro("FDBK", "feedback", 0);
    expect(same(sine, noLoop)).toBe(true);
  });
});
