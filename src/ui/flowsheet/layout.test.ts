// The flowsheet's geometry, checked as properties rather than by eye.
//
// The invariants here are the ones a reader will silently trust: that signal
// flows downward, that no two node boxes overlap, and that the picture of a
// familiar algorithm is the familiar picture. A layout that violates any of them
// does not look broken — it looks like a different algorithm.

import { describe, it, expect } from "vitest";
import { FM_ALGORITHMS } from "../../data/fm-algorithms";
import {
  layoutAlgorithm, geometryFor, NODE_W, NODE_H, COL_PITCH, STACK_SUMMARIES_ABOVE,
  STANDARD, COMPACT, CHROME_H, COLUMN_INSET, type Geometry,
} from "./layout";

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

/**
 * The 2026-09-13 re-proportioning. These are the two claims the new constants
 * make, and neither is obvious from reading them: that the diagram now fits a
 * laptop, and that the stacking threshold splits the algorithms where intended.
 */
describe("fits a 1536x864 laptop", () => {
  /**
   * What sits above the diagram: the sticky bar (57) plus the macro row (72,
   * once the 445-character hint moves behind the ? in the bar), plus the
   * workspace's own 20 top / 32 bottom padding.
   */
  const CHROME = 57 + 72 + 20 + 32;
  const VIEWPORT_H = 864;

  it("draws every algorithm without pushing the carriers below the fold", () => {
    for (let a = 1; a <= 32; ++a) {
      const l = layoutAlgorithm(a);
      expect(CHROME + l.height, `algorithm ${a}`).toBeLessThanOrEqual(VIEWPORT_H);
    }
  });

  it("keeps the carrier row itself on screen, which is the actual complaint", () => {
    // The bug that started this: OP 1 and OP 3 sat at y 751..883 in an 864
    // viewport, so the operators you actually hear were the ones you could not
    // see. Row 0 is the carrier row.
    for (let a = 1; a <= 32; ++a) {
      const l = layoutAlgorithm(a);
      const lowest = Math.max(...l.nodes.filter((n) => n.row === 0).map((n) => n.y + NODE_H));
      expect(CHROME + lowest, `algorithm ${a} carriers`).toBeLessThanOrEqual(VIEWPORT_H);
    }
  });

  it("is shorter than the layout it replaced, for every algorithm", () => {
    // Old constants: NODE_H 132, ROW_PITCH 164, OUT_H 92, PAD 16.
    for (let a = 1; a <= 32; ++a) {
      const l = layoutAlgorithm(a);
      const before = 32 + (l.rows - 1) * 164 + 132 + 92;
      expect(l.height, `algorithm ${a}`).toBeLessThan(before);
    }
  });
});

/**
 * The 2026-09-15 audit: the standard proportions held at 1536×864 and broke at
 * 1366×768 — algorithm 32's only sounding operator behind a scrollbar, the 968 px
 * algorithms clipping OP 6 by 30 px, the default voice's output below the fold.
 * Each screen here is a viewport the flowsheet must serve without a horizontal
 * scroll, with its carriers and its output sum visible on landing.
 */
describe("fits the laptops it is used on", () => {
  /**
   * The output sum's rendered height, tallest case: two lines when six carriers
   * are summed. Measured in Chromium — carriers' bottom at 769, the sum's bottom
   * at 830, less the 10 px it is drawn below the carrier row.
   */
  const OUT_NODE_H = 52;
  /** The side column's minimum, from `.workspace` in Flowsheet.svelte, plus the grid gap. */
  const SIDE_MIN = 360;
  const GRID_GAP = 28;

  const SCREENS: Array<[number, number, Geometry["name"]]> = [
    [1920, 1080, "standard"],
    [1536, 864, "standard"],
    [1440, 900, "compact"],
    [1366, 768, "compact"],
  ];

  for (const [w, h, expected] of SCREENS) {
    describe(`${w}×${h}`, () => {
      const geo = geometryFor(w, h);
      const column = w - COLUMN_INSET;

      it(`uses the ${expected} proportions`, () => {
        expect(geo.name).toBe(expected);
      });

      it("never needs a horizontal scroll to reach an operator", () => {
        for (let a = 1; a <= 32; ++a) {
          const l = layoutAlgorithm(a, geo);
          const right = Math.max(...l.nodes.map((n) => n.x + geo.nodeW));
          expect(right, `algorithm ${a}`).toBeLessThanOrEqual(column);
          expect(l.width, `algorithm ${a} sheet`).toBeLessThanOrEqual(column);
        }
      });

      it("leaves the side column its minimum whenever it sits beside the diagram", () => {
        for (let a = 1; a <= 32; ++a) {
          const l = layoutAlgorithm(a, geo);
          if (l.width > STACK_SUMMARIES_ABOVE) continue;
          expect(column - GRID_GAP - l.width, `algorithm ${a}`).toBeGreaterThanOrEqual(SIDE_MIN);
        }
      });

      it("keeps the carriers and the output sum on screen", () => {
        for (let a = 1; a <= 32; ++a) {
          const l = layoutAlgorithm(a, geo);
          const carriers = Math.max(...l.nodes.filter((n) => n.row === 0).map((n) => n.y + geo.nodeH));
          expect(CHROME_H + carriers, `algorithm ${a} carriers`).toBeLessThanOrEqual(h);
          const sumBottom = l.outY - geo.outH / 2 + 10 + OUT_NODE_H;
          expect(CHROME_H + sumBottom, `algorithm ${a} output sum`).toBeLessThanOrEqual(h);
        }
      });
    });
  }

  it("keeps every structural property under the compact proportions too", () => {
    for (let a = 1; a <= 32; ++a) {
      const s = layoutAlgorithm(a);
      const c = layoutAlgorithm(a, COMPACT);
      // Same shape, smaller boxes: rows and slots are the algorithm's, not the size's.
      expect(c.nodes.map((n) => [n.row, n.slot]), `algorithm ${a}`)
        .toEqual(s.nodes.map((n) => [n.row, n.slot]));
      for (const e of c.edges) expect(e.y1, `algorithm ${a}`).toBeLessThan(e.y2);
      for (let i = 0; i < c.nodes.length; ++i) {
        for (let j = i + 1; j < c.nodes.length; ++j) {
          const p = c.nodes[i];
          const q = c.nodes[j];
          const overlap =
            p.x < q.x + COMPACT.nodeW && q.x < p.x + COMPACT.nodeW &&
            p.y < q.y + COMPACT.nodeH && q.y < p.y + COMPACT.nodeH;
          expect(overlap, `algorithm ${a}: ops ${p.op} and ${q.op}`).toBe(false);
        }
      }
    }
  });

  it("stacks the same algorithms at either size, so the view keeps its shape", () => {
    for (let a = 1; a <= 32; ++a) {
      expect(layoutAlgorithm(a, COMPACT).width > STACK_SUMMARIES_ABOVE, `algorithm ${a}`)
        .toBe(layoutAlgorithm(a).width > STACK_SUMMARIES_ABOVE);
    }
  });

  it("derives each scope height from its node, so the two cannot drift apart", () => {
    expect(STANDARD.scopeH).toBe(60);
    expect(COMPACT.scopeH).toBe(46);
  });
});

describe("STACK_SUMMARIES_ABOVE", () => {
  it("stacks the six-carrier algorithm, which has no room for a side column", () => {
    expect(layoutAlgorithm(32).width).toBeGreaterThan(STACK_SUMMARIES_ABOVE);
  });

  it("keeps the narrow majority in two columns", () => {
    const stacked = [];
    for (let a = 1; a <= 32; ++a) {
      if (layoutAlgorithm(a).width > STACK_SUMMARIES_ABOVE) stacked.push(a);
    }
    // The side-by-side reading is the normal one; stacking is the exception for
    // genuinely wide algorithms. The view changing shape as you page through
    // voices is its own kind of hard-to-read, so this stays a small minority:
    // 4 of 32 as set. If a constant change ever flips a big share of the corpus
    // over, that is a redesign and should fail here first.
    expect(stacked.length).toBeLessThanOrEqual(6);
  });

  it("leaves a side column at least 480px wide whenever it does NOT stack", () => {
    // 1536 viewport, 40px of page padding, 28px grid gap. The narrowest
    // non-stacking case is a 968px diagram, which leaves 500.
    const AVAILABLE = 1536 - 40 - 28;
    for (let a = 1; a <= 32; ++a) {
      const l = layoutAlgorithm(a);
      if (l.width > STACK_SUMMARIES_ABOVE) continue;
      expect(AVAILABLE - l.width, `algorithm ${a} side column`).toBeGreaterThanOrEqual(480);
    }
  });
});
