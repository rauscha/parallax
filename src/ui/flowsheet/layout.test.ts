// The flowsheet's geometry, checked as properties rather than by eye.
//
// The invariants here are the ones a reader will silently trust: that signal
// flows downward, that no two node boxes overlap, and that the picture of a
// familiar algorithm is the familiar picture. A layout that violates any of them
// does not look broken — it looks like a different algorithm.

import { describe, it, expect } from "vitest";
import { FM_ALGORITHMS } from "../../data/fm-algorithms";
import { layoutAlgorithm, NODE_W, NODE_H, COL_PITCH } from "./layout";

const ALL = FM_ALGORITHMS.map((a) => a.algorithm);

describe("flowsheet layout — every algorithm", () => {
  it("places all six operators exactly once", () => {
    for (const a of ALL) {
      const ops = layoutAlgorithm(a).nodes.map((n) => n.op).sort((x, y) => x - y);
      expect(ops, `algo ${a}`).toEqual([1, 2, 3, 4, 5, 6]);
    }
  });

  it("puts carriers on the bottom row and nothing else there", () => {
    for (const a of ALL) {
      const l = layoutAlgorithm(a);
      for (const n of l.nodes) {
        expect(n.row === 0, `algo ${a} op ${n.op}`).toBe(n.carrier);
      }
    }
  });

  it("always draws a modulator above what it feeds", () => {
    // The reason the diagram is readable without arrowheads: every wire goes
    // down. A sideways or upward wire would mean the row assignment is wrong.
    for (const a of ALL) {
      const l = layoutAlgorithm(a);
      for (const e of l.edges) {
        const from = l.byOp.get(e.from)!;
        const to = l.byOp.get(e.to)!;
        expect(from.row, `algo ${a}: ${e.from}>${e.to}`).toBeGreaterThan(to.row);
        expect(e.y1, `algo ${a}: ${e.from}>${e.to} wire direction`).toBeLessThan(e.y2);
      }
    }
  });

  it("never overlaps two node boxes", () => {
    for (const a of ALL) {
      const l = layoutAlgorithm(a);
      for (let i = 0; i < l.nodes.length; ++i) {
        for (let j = i + 1; j < l.nodes.length; ++j) {
          const p = l.nodes[i];
          const q = l.nodes[j];
          const overlap =
            p.x < q.x + NODE_W && q.x < p.x + NODE_W &&
            p.y < q.y + NODE_H && q.y < p.y + NODE_H;
          expect(overlap, `algo ${a}: ops ${p.op} and ${q.op} overlap`).toBe(false);
        }
      }
    }
  });

  it("keeps every node inside the box it reports", () => {
    for (const a of ALL) {
      const l = layoutAlgorithm(a);
      for (const n of l.nodes) {
        expect(n.x, `algo ${a} op ${n.op}`).toBeGreaterThanOrEqual(0);
        expect(n.x + NODE_W, `algo ${a} op ${n.op}`).toBeLessThanOrEqual(l.width);
        expect(n.y + NODE_H, `algo ${a} op ${n.op}`).toBeLessThanOrEqual(l.height);
      }
      expect(l.outX).toBeGreaterThan(0);
      expect(l.outX).toBeLessThan(l.width);
      expect(l.outY).toBeLessThan(l.height);
    }
  });

  it("starts at the left edge — no empty column before the first node", () => {
    for (const a of ALL) {
      const l = layoutAlgorithm(a);
      expect(Math.min(...l.nodes.map((n) => n.slot)), `algo ${a}`).toBe(0);
    }
  });

  it("marks exactly the algorithm's own feedback operator", () => {
    for (const { algorithm, feedbackOp } of FM_ALGORITHMS) {
      const fb = layoutAlgorithm(algorithm).nodes.filter((n) => n.feedback).map((n) => n.op);
      expect(fb, `algo ${algorithm}`).toEqual(feedbackOp === null ? [] : [feedbackOp]);
    }
  });
});

describe("flowsheet layout — the shapes people recognise", () => {
  /** Operator → [row, slot], for readable assertions. */
  const shape = (a: number) => {
    const l = layoutAlgorithm(a);
    const out: Record<number, [number, number]> = {};
    for (const n of l.nodes) out[n.op] = [n.row, n.slot];
    return out;
  };

  it("algorithm 1 is two stacks: 6>5>4>3 and 2>1", () => {
    expect(shape(1)).toEqual({
      1: [0, 0], 2: [1, 0],
      3: [0, 1], 4: [1, 1], 5: [2, 1], 6: [3, 1],
    });
  });

  it("algorithm 16 fans 2, 3 and 5 onto operator 1", () => {
    const s = shape(16);
    expect(s[1]).toEqual([0, 0]);                      // the only carrier
    // Three modulators share row 1, spread apart, in operator order.
    const row1 = [s[2], s[3], s[5]].map(([r, c]) => { expect(r).toBe(1); return c; });
    expect(row1).toEqual([...row1].sort((a, b) => a - b));
    expect(new Set(row1).size).toBe(3);
    // 4 sits above 3 and 6 above 5 — both one row up from their target, so both
    // land on row 2 and the diagram is three rows tall, not four.
    expect(s[4]).toEqual([2, s[3][1]]);
    expect(s[6]).toEqual([2, s[5][1]]);
    expect(layoutAlgorithm(16).rows).toBe(3);
  });

  it("algorithm 19 centres operator 6 between the two carriers it feeds", () => {
    const s = shape(19);
    expect(s[6][0]).toBe(1);
    expect(s[6][1]).toBeCloseTo((s[4][1] + s[5][1]) / 2);
    // And that is a fractional slot, not snapped onto one of them — snapping
    // would read as a wire to one carrier only.
    expect(Number.isInteger(s[6][1])).toBe(false);
  });

  it("algorithm 32 is six carriers in a row and no wires at all", () => {
    const l = layoutAlgorithm(32);
    expect(l.edges).toEqual([]);
    expect(l.rows).toBe(1);
    expect(l.nodes.map((n) => n.slot)).toEqual([0, 1, 2, 3, 4, 5]);
    expect(l.width).toBe(5 * COL_PITCH + NODE_W + 32);
  });

  it("algorithm 23 leaves operator 1 bare, with nothing above it", () => {
    const l = layoutAlgorithm(23);
    expect(l.edges.some((e) => e.to === 1)).toBe(false);
    expect(l.byOp.get(1)!.row).toBe(0);
  });
});
