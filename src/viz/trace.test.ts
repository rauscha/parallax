// The parts of the trace primitive that can be checked without a canvas: the
// edge trigger and the min/max column reduction. Both are load-bearing for the
// flowsheet's honesty claim — the trigger is what makes eight traces comparable
// (they all share one offset), and the reduction is what stops a dense trace
// from being drawn as a waveform it doesn't have.

import { describe, it, expect } from "vitest";
import { findTrigger, columns, peak } from "./trace";

/** `n` samples of a sine at `cycles` cycles across the buffer, phase in turns. */
function sine(n: number, cycles: number, phase = 0): Float32Array {
  const out = new Float32Array(n);
  for (let i = 0; i < n; ++i) {
    out[i] = Math.sin(2 * Math.PI * (cycles * (i / n) + phase));
  }
  return out;
}

describe("findTrigger", () => {
  it("lands on a rising zero crossing", () => {
    const buf = sine(1024, 8);
    const t = findTrigger(buf);
    expect(t).toBeGreaterThan(0);
    // Between the sample before and the sample after, the signal goes - to +.
    expect(buf[Math.floor(t)]).toBeLessThanOrEqual(0);
    expect(buf[Math.ceil(t) + 1]).toBeGreaterThan(0);
  });

  it("is fractional, so a trace does not jitter by a sample each frame", () => {
    // A crossing that falls between samples must be reported between samples.
    // 7 cycles over 1000 samples puts no crossing exactly on a sample index.
    const t = findTrigger(sine(1000, 7));
    expect(Number.isInteger(t)).toBe(false);
  });

  it("finds the same phase regardless of where the window starts", () => {
    // The property the flowsheet depends on: trigger on a signal, shift the
    // signal, and the triggered waveform is the same waveform. Checked by
    // sampling the wave at the trigger point plus a quarter cycle — it must be
    // near the peak in both cases.
    const n = 1024;
    const cycles = 8;
    const quarter = n / cycles / 4;
    for (const phase of [0, 0.13, 0.37, 0.6, 0.85]) {
      const buf = sine(n, cycles, phase);
      const t = findTrigger(buf);
      expect(t).toBeGreaterThanOrEqual(0);
      const at = buf[Math.round(t + quarter)];
      expect(at, `phase ${phase}`).toBeGreaterThan(0.95);
    }
  });

  it("returns -1 on silence and on DC", () => {
    expect(findTrigger(new Float32Array(256))).toBe(-1);
    expect(findTrigger(new Float32Array(256).fill(0.5))).toBe(-1);
  });

  it("does not arm on ripple below the hysteresis threshold", () => {
    // A tiny wobble around zero is noise, not a cycle. With a 0.02 threshold a
    // ±0.005 signal must not trigger, or the trace would lock onto noise and
    // appear to be a signal.
    const buf = sine(512, 40);
    for (let i = 0; i < buf.length; ++i) buf[i] *= 0.005;
    expect(findTrigger(buf, 0, buf.length, 0.02)).toBe(-1);
  });

  it("honours start and count", () => {
    const buf = sine(1024, 8);
    const t = findTrigger(buf, 500, 200);
    expect(t).toBeGreaterThanOrEqual(500);
    expect(t).toBeLessThan(700);
  });
});

describe("columns", () => {
  it("keeps the true excursion of a signal denser than the display", () => {
    // The aliasing case, stated as a test: 200 cycles reduced to 50 columns.
    // Point-sampling would return some slow beat pattern with a small range;
    // min/max must report the full ±1 in every column.
    const buf = sine(4000, 200);
    const out = new Float32Array(100);
    columns(buf, 0, 4000, 50, out);
    for (let c = 0; c < 50; ++c) {
      expect(out[2 * c], `col ${c} min`).toBeLessThan(-0.9);
      expect(out[2 * c + 1], `col ${c} max`).toBeGreaterThan(0.9);
    }
  });

  it("reports min <= max everywhere, including a single-sample column", () => {
    const buf = sine(64, 3);
    const out = new Float32Array(256);
    columns(buf, 0, 64, 128, out);      // fewer samples than columns
    for (let c = 0; c < 128; ++c) {
      expect(out[2 * c]).toBeLessThanOrEqual(out[2 * c + 1]);
    }
  });

  it("does not wrap past the end of the buffer", () => {
    // A window is a window. Reading past the end must read as zero, not as the
    // start of the buffer — joining the two would draw a discontinuity that is
    // not in the signal.
    const buf = new Float32Array(100).fill(1);
    const out = new Float32Array(20);
    columns(buf, 90, 40, 10, out);      // asks for 40 from index 90
    expect(out[0]).toBe(1);             // first columns are inside the buffer
    expect(out[19]).toBe(0);            // last is past the end: zero, not buf[0]
  });

  it("writes zero, not Infinity, for an empty column", () => {
    const out = new Float32Array(8).fill(NaN);
    columns(new Float32Array(0), 0, 4, 4, out);
    for (const v of out) expect(Number.isFinite(v)).toBe(true);
  });
});

describe("peak", () => {
  it("measures the largest absolute sample in a range", () => {
    const buf = new Float32Array([0.1, -0.9, 0.3, 0.5]);
    expect(peak(buf)).toBeCloseTo(0.9);
    expect(peak(buf, 2, 2)).toBeCloseTo(0.5);
  });
});
