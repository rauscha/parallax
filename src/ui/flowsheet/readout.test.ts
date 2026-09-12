// The numbers printed next to each trace. A wrong readout is a caption that
// contradicts the picture, which is worse than no caption — so the decode is
// round-tripped against buildPatch, and the ratio arithmetic is checked against
// the engine's own table rather than against my memory of it.

import { describe, it, expect } from "vitest";
import { buildPatch, SILENT_OP, type FmPatchSpec } from "../../data/fm-patch";
import { readPatch, ratioOf, formatRatio, fixedHzOf } from "./readout";
import { FM_VOICES } from "../../data/fm-models";

const spec = (over: Partial<FmPatchSpec> = {}): FmPatchSpec => ({
  name: "T",
  algorithm: 5,
  ops: [
    { ...SILENT_OP, outLevel: 90, coarse: 1 },
    { ...SILENT_OP, outLevel: 80, coarse: 2 },
    { ...SILENT_OP, outLevel: 70, coarse: 3, fine: 50 },
    { ...SILENT_OP, outLevel: 60, coarse: 0 },
    { ...SILENT_OP, outLevel: 50, coarse: 14, detune: 9 },
    { ...SILENT_OP, outLevel: 40, coarse: 1, fixed: true },
  ],
  ...over,
});

describe("ratioOf", () => {
  it("reads the engine's coarse table, including its 0.5 at index 0", () => {
    expect(ratioOf(0, 0, 7)).toBeCloseTo(0.5, 6);
    expect(ratioOf(1, 0, 7)).toBeCloseTo(1, 6);
    expect(ratioOf(2, 0, 7)).toBeCloseTo(2, 6);
    expect(ratioOf(3, 0, 7)).toBeCloseTo(3, 4);
    expect(ratioOf(31, 0, 7)).toBeCloseTo(31, 2);
  });

  it("applies fine as a percentage multiplier, not as a step", () => {
    // The formula is coarse x (1 + fine/100): coarse 1 with fine 50 is 1.5,
    // NOT halfway to coarse 2 by some other route.
    expect(ratioOf(1, 50, 7)).toBeCloseTo(1.5, 5);
    expect(ratioOf(2, 50, 7)).toBeCloseTo(3, 5);
  });

  it("treats detune 7 as none and moves a few cents either side", () => {
    expect(ratioOf(1, 0, 7)).toBe(1);
    const up = ratioOf(1, 0, 14);
    const down = ratioOf(1, 0, 0);
    expect(up).toBeGreaterThan(1);
    expect(down).toBeLessThan(1);
    // The step is 12606/2^24 in log2, which is ~0.90 cents per count — so the
    // whole 0..14 range spans about 12.6 cents, well under an eighth of a
    // semitone. Worth pinning: detune in this engine is a thickening, not a
    // tuning control, and a readout that implied otherwise would mislead.
    expect(1200 * Math.log2(up)).toBeCloseTo(6.3, 1);
    expect(1200 * Math.log2(up / down)).toBeCloseTo(12.6, 1);
  });

  it("wraps coarse past 31 the way the engine's mask does", () => {
    expect(ratioOf(32, 0, 7)).toBe(ratioOf(0, 0, 7));
  });
});

describe("fixedHzOf", () => {
  it("is a decade scale — coarse picks the decade", () => {
    // coarse & 3 selects 1 / 10 / 100 / 1000 Hz at fine 0.
    expect(fixedHzOf(0, 0)).toBeCloseTo(1, 3);
    expect(fixedHzOf(1, 0)).toBeCloseTo(10, 1);
    expect(fixedHzOf(2, 0)).toBeCloseTo(100, 0);
    expect(fixedHzOf(3, 0)).toBeCloseTo(1000, -1);
  });
});

describe("readPatch", () => {
  it("round-trips levels and ratios out of the bytes, in panel order", () => {
    const r = readPatch(buildPatch(spec()));
    expect(r.algorithm).toBe(5);
    expect(r.ops.map((o) => o.op)).toEqual([1, 2, 3, 4, 5, 6]);
    expect(r.ops.map((o) => o.outLevel)).toEqual([90, 80, 70, 60, 50, 40]);
    expect(r.ops[0].ratio).toBeCloseTo(1, 6);
    expect(r.ops[1].ratio).toBeCloseTo(2, 6);
    expect(r.ops[2].ratio).toBeCloseTo(4.5, 4);      // coarse 3, fine 50
    expect(r.ops[3].ratio).toBeCloseTo(0.5, 6);      // coarse 0
  });

  it("does not read operator 1 out of msfa's block 0", () => {
    // The mistake this module exists to prevent. Operator 1 lives in byte block
    // 5; reading block 0 would label every node with operator 6's numbers and
    // mirror the whole diagram.
    const r = readPatch(buildPatch(spec()));
    expect(r.ops[0].outLevel).toBe(90);
    expect(r.ops[5].outLevel).toBe(40);
  });

  it("reports fixed-frequency operators as Hz, not as a ratio", () => {
    const r = readPatch(buildPatch(spec()));
    expect(r.ops[5].ratio).toBeNull();
    expect(r.ops[5].fixedHz).not.toBeNull();
    expect(r.ops[0].fixedHz).toBeNull();
  });

  it("carries detune into the ratio", () => {
    const r = readPatch(buildPatch(spec()));
    // Operator 5: coarse 14 (ratio 14) with detune 9 — slightly sharp of 14.
    expect(r.ops[4].ratio!).toBeGreaterThan(14);
    expect(r.ops[4].ratio!).toBeLessThan(14.1);
  });

  it("reads feedback and the 1-based algorithm number", () => {
    const r = readPatch(buildPatch(spec({ algorithm: 32, feedback: 6 })));
    expect(r.algorithm).toBe(32);
    expect(r.feedback).toBe(6);
  });

  it("decodes every shipped voice without throwing, with sane numbers", () => {
    for (const v of FM_VOICES) {
      const r = readPatch(buildPatch(v.spec));
      expect(r.algorithm, v.spec.name).toBeGreaterThanOrEqual(1);
      expect(r.algorithm, v.spec.name).toBeLessThanOrEqual(32);
      expect(r.ops).toHaveLength(6);
      for (const o of r.ops) {
        expect(o.outLevel, `${v.spec.name} op ${o.op}`).toBeGreaterThanOrEqual(0);
        expect(o.outLevel, `${v.spec.name} op ${o.op}`).toBeLessThanOrEqual(99);
        if (o.ratio !== null) {
          expect(o.ratio, `${v.spec.name} op ${o.op}`).toBeGreaterThan(0);
          expect(o.ratio, `${v.spec.name} op ${o.op}`).toBeLessThan(64);
        }
      }
    }
  });

  it("rejects a wrong-sized buffer rather than reading garbage", () => {
    expect(() => readPatch(new Uint8Array(128))).toThrow(/156/);
  });
});

describe("formatRatio", () => {
  it("shows a whole ratio as a whole number and a near miss as a decimal", () => {
    // The distinction the display exists to make: 2 locks, 2.01 drifts.
    expect(formatRatio(2)).toBe("2");
    expect(formatRatio(ratioOf(2, 0, 7))).toBe("2");
    expect(formatRatio(2.01)).toBe("2.01");
    expect(formatRatio(0.5)).toBe("0.50");
    expect(formatRatio(14.02)).toBe("14.0");
    expect(formatRatio(null)).toBe("fixed");
  });

  it("does not round a detuned ratio into looking locked", () => {
    // Detune is a few cents — small, but the whole point is that it is not zero.
    expect(formatRatio(ratioOf(2, 0, 9))).not.toBe("2");
  });
});
