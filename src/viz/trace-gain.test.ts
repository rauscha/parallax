/**
 * The gain "Fit each" applies to a node trace.
 *
 * These numbers are not invented. They were measured in Chromium on 2026-09-13,
 * on the FM engine's Parallax Bell voice, by reading the ink extent of every
 * node canvas:
 *
 *   OP 1, carrier, 0 dB    — 44 of 46 rows (96%)
 *   OP 2, modulator, −32 dB — 9 of 46 rows (20%)   ← "Fit each" was ON
 *
 * Working backwards from that ratio, OP 2's true peak is 0.208 × 0.002 =
 * 4.2e-4, which puts the carrier at 0.0166 — matching the "a single carrier
 * peaks around 0.015 of full scale" already written into Flowsheet.svelte.
 * The old inline expression was
 *
 *     1 / Math.max(0.002, peak(frame, base, 1024))
 *
 * and the 0.002 divide-by-zero guard sits only ~18 dB below the loudest trace,
 * so every quieter trace was clamped and "Fit each" quietly stopped fitting.
 */
import { describe, it, expect } from "vitest";
import { traceGain, FIT_FLOOR_RATIO } from "./trace-gain";

/** The measured full-scale peak of a sounding carrier on this engine. */
const CARRIER = 0.0166;
/** Level ratio for a given number of dB down. */
const down = (db: number) => Math.pow(10, -db / 20);

describe("traceGain — shared scale", () => {
  it("scales every trace by the sheet reference, so heights stay comparable", () => {
    const ref = CARRIER;
    expect(traceGain(CARRIER, ref, false)).toBeCloseTo(1 / ref, 6);
    expect(traceGain(CARRIER * down(32), ref, false)).toBeCloseTo(1 / ref, 6);
  });

  it("never divides by zero when the sheet is silent", () => {
    expect(Number.isFinite(traceGain(0, 0, false))).toBe(true);
  });
});

describe("traceGain — fit each", () => {
  it("fills the box for the loudest trace", () => {
    expect(traceGain(CARRIER, CARRIER, true) * CARRIER).toBeCloseTo(1, 6);
  });

  it("fills the box for a modulator 32 dB down — the bug this test exists for", () => {
    // Before the fix this returned 1/0.002 = 500, drawing OP 2 at 20% of its
    // canvas while the button claimed it was fitting.
    const p = CARRIER * down(32);
    expect(traceGain(p, CARRIER, true) * p).toBeCloseTo(1, 6);
  });

  it("fits a trace 55 dB down, still well inside the honesty ceiling", () => {
    const p = CARRIER * down(55);
    expect(traceGain(p, CARRIER, true) * p).toBeCloseTo(1, 6);
  });

  it("stops amplifying past the ceiling, so quantisation noise is not promoted", () => {
    // A trace 90 dB down is mostly noise. Normalising it to full height would
    // draw a confident waveform out of nothing — exactly what §6.3 forbids.
    const p = CARRIER * down(90);
    const drawn = traceGain(p, CARRIER, true) * p;
    expect(drawn).toBeLessThan(0.2);
    expect(drawn).toBeGreaterThan(0);
  });

  it("puts the ceiling at the documented ratio below the sheet reference", () => {
    const floor = CARRIER * FIT_FLOOR_RATIO;
    // A trace exactly at the floor still fills the box; below it, it shrinks.
    expect(traceGain(floor, CARRIER, true) * floor).toBeCloseTo(1, 6);
    expect(traceGain(floor / 4, CARRIER, true) * (floor / 4)).toBeCloseTo(0.25, 6);
  });

  it("draws silence flat rather than amplifying it to full scale", () => {
    expect(traceGain(0, CARRIER, true) * 0).toBe(0);
    expect(Number.isFinite(traceGain(0, CARRIER, true))).toBe(true);
  });

  it("never divides by zero when the whole sheet is silent", () => {
    expect(Number.isFinite(traceGain(0, 0, true))).toBe(true);
  });

  it("is independent of absolute level — the same ratio fits the same way", () => {
    // The engine's output level is not a constant of nature; a louder patch
    // must not change which traces are legible.
    const quiet = traceGain(0.0166 * down(40), 0.0166, true) * (0.0166 * down(40));
    const loud = traceGain(0.5 * down(40), 0.5, true) * (0.5 * down(40));
    expect(quiet).toBeCloseTo(loud, 6);
  });
});
