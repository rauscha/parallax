// The edge trigger, checked without a canvas: it is what makes a periodic
// waveform stand still on the scope instead of sliding.

import { describe, it, expect } from "vitest";
import { findTrigger } from "./trace";

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
    // The property the scope depends on: trigger on a signal, shift the
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
