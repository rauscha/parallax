/**
 * Where the six operator nodes go.
 *
 * Pure geometry, no DOM, so the thing most likely to be wrong — "is this the
 * shape of the algorithm?" — is testable rather than eyeballed.
 *
 * The convention is the one every FM panel and manual uses, and it is worth
 * keeping for exactly that reason: **carriers along the bottom, modulators
 * stacked above what they modulate, signal flowing downward into the output.**
 * Someone who has seen an algorithm chart before should recognise this one
 * without being taught it twice.
 *
 * Method:
 *
 * 1. **Row = distance to the output.** A carrier is row 0; anything else is one
 *    row above the highest thing it feeds. This is well defined because the
 *    wiring is acyclic (the only loop in this engine is single-operator
 *    feedback, which is drawn as a loop on the node, not as a wire).
 * 2. **Column = above your targets.** Carriers take slots left to right in
 *    operator order. Every other operator is centred over the operators it
 *    feeds, which is why algorithm 19's operator 6 sits neatly between 4 and 5.
 * 3. **Spread on collision.** Two operators wanting the same slot are pushed
 *    apart to at least one slot, preserving left-to-right order — algorithm 16's
 *    2, 3 and 5 all want to be over operator 1, and end up as a fan.
 *
 * Fractional slots are kept rather than rounded: a modulator genuinely centred
 * between two carriers reads as feeding both, and snapping it to one of them
 * would imply a wire that isn't there.
 */
import { algorithmRoles } from "../../data/fm-algorithms";

/**
 * Node box, CSS pixels. Sized for a legible scope inside, per spec §4.4.
 *
 * Re-proportioned 2026-09-13, after measuring the view on a 1536×864 laptop.
 * Two things came out of that measurement and both are encoded here.
 *
 * **Wider, because a waveform is wide.** The box was 160×132 — nearly square —
 * holding a 144×46 trace. The scarce axis on a laptop is vertical (four rows of
 * this plus a header did not fit in 864), and the abundant one is horizontal, so
 * the box grows the way the content wants: 216 wide gives the scope 200.
 *
 * **Shorter, because 20 px of it were empty.** The old box spent 70 px on chrome
 * for 49.84 px of actual head, foot, padding, border and gaps — measured in
 * Chromium, not estimated. That slack is now given to the scope (46 → 60) and
 * the box still comes out 4 px shorter than before.
 *
 * Net: the trace goes from 6,624 px² to 12,000 px², and a four-row algorithm
 * gets shorter rather than taller.
 */
export const NODE_W = 216;
export const NODE_H = 128;
/**
 * Distance between slot centres, and between row centres. ROW_PITCH − NODE_H is
 * the gap the wires cross: 20 px, down from 32. The wires read as connections at
 * 20 px and the four-row algorithms need the 36 px it saves.
 */
export const COL_PITCH = 240;
export const ROW_PITCH = 148;
/**
 * Space reserved under row 0 for the output sum node. The node itself is drawn
 * 10 px below the last row and is ~40 px tall, so 64 holds it with room; the old
 * 92 was reserving space nothing used.
 */
export const OUT_H = 64;
export const PAD = 16;
/**
 * Everything in a node box that is not the scope: head, envelope strip, foot,
 * padding, border and the gaps between them — measured in Chromium when the box
 * was re-proportioned (128 − 60). A geometry's scope height is its node height
 * minus this, so the two can never disagree.
 */
export const NODE_CHROME_H = 68;

/** One set of node proportions. The algorithm decides the shape; this decides the size. */
export interface Geometry {
  name: "standard" | "compact";
  nodeW: number;
  nodeH: number;
  colPitch: number;
  rowPitch: number;
  outH: number;
  /** Height of the operator scope inside a node. */
  scopeH: number;
}

/** The 2026-09-13 proportions, for a 1536×864 laptop and anything larger. */
export const STANDARD: Geometry = {
  name: "standard",
  nodeW: NODE_W, nodeH: NODE_H,
  colPitch: COL_PITCH, rowPitch: ROW_PITCH,
  outH: OUT_H, scopeH: NODE_H - NODE_CHROME_H,
};

/**
 * For a 1366×768 laptop, added after the 2026-09-15 audit found the standard
 * proportions failing there in both directions:
 *
 * - **Width.** Algorithm 32 is 1448 px standard in a ~1311 px column, which put
 *   OP 6 — the only sounding operator on *Feedback Alone*, and the loop the voice
 *   is named for — behind a scrollbar. Here it is 32 + 5·210 + 188 = 1270.
 *   The 968 px algorithms (20, 12) overran their column by 30 px beside the
 *   360 px side column; here they are 850 and leave 433.
 * - **Height.** A four-row algorithm put the carriers' bottom edge at 769 and
 *   the output sum at 830 of 768. Here the carriers end at 701 and the sum sits
 *   on screen under them.
 *
 * The scope pays for it: 172×46 instead of 200×60. 46 is exactly the height the
 * scope had before the redesign, so this is a size the traces have already been
 * read at, not a new guess. The gaps the wires cross stay wide enough to read
 * as connections (22 across, 16 down).
 */
export const COMPACT: Geometry = {
  name: "compact",
  nodeW: 188, nodeH: 114,
  colPitch: 210, rowPitch: 130,
  outH: OUT_H, scopeH: 114 - NODE_CHROME_H,
};

/**
 * What sits above the diagram: the sticky bar (57) plus the macro row (72),
 * plus the workspace's 20 top / 32 bottom padding. Measured the same at 1536
 * and 1366 wide — the bar does not wrap at either.
 */
export const CHROME_H = 57 + 72 + 20 + 32;
/** The flowsheet's own side padding (20 + 20) plus room for a vertical scrollbar. */
export const COLUMN_INSET = 40 + 16;

/** The widest and tallest any algorithm gets under a geometry. */
export function extentsOf(geo: Geometry): { width: number; height: number } {
  let width = 0;
  let height = 0;
  for (let a = 1; a <= 32; ++a) {
    const l = layoutAlgorithm(a, geo);
    width = Math.max(width, l.width);
    height = Math.max(height, l.height);
  }
  return { width, height };
}

let standardExtents: { width: number; height: number } | null = null;

/**
 * Pick the proportions for a viewport. Standard whenever every algorithm fits
 * the screen at standard size — so a 1536×864 laptop and anything bigger look
 * exactly as they did — and compact otherwise.
 *
 * Chosen per *window*, never per algorithm: node size changing as you step
 * through voices would make the one comparison this view exists for, "how is
 * this algorithm shaped differently from the last", harder rather than easier.
 */
export function geometryFor(viewportW: number, viewportH: number): Geometry {
  standardExtents ??= extentsOf(STANDARD);
  const fits =
    standardExtents.width <= viewportW - COLUMN_INSET &&
    standardExtents.height + CHROME_H <= viewportH;
  return fits ? STANDARD : COMPACT;
}

/**
 * Above this overall diagram width, the view stops putting the output and
 * spectrum in a column beside the diagram and stacks them underneath instead.
 *
 * Why a width and not a media query: the diagram's width is a property of the
 * *algorithm*, not of the window. `width` here is `248 + maxSlot * COL_PITCH`,
 * so a two-column algorithm is 488 px and algorithm 32 — all six operators as
 * carriers in one row — is 1448. Beside a 1448 px diagram there is no column
 * left worth having, and the summaries are better full-width below.
 *
 * Set from the actual distribution rather than from a round number. Diagram
 * widths across the 32 algorithms are 488 (×4), 728 (×14), 968 (×10), 1208 (×3)
 * and 1448 (×1), and on a 1536 px screen the side column gets 1468 − width:
 *
 *   width  968 → side 500 px — narrower than today but a trace still reads
 *   width 1208 → side 260 px — useless
 *
 * So the cliff is between those two, and 1000 sits in it. That stacks 4 of 32
 * algorithms and leaves the other 28 side by side. Keeping the flip rare
 * matters: the view changing shape as you page through voices is its own kind
 * of hard-to-read, and a threshold that caught half the corpus would trade one
 * legibility problem for another.
 */
export const STACK_SUMMARIES_ABOVE = 1000;

export interface FlowNode {
  /** Panel operator number, 1..6. */
  op: number;
  /** 0 = carrier row, counting upward. */
  row: number;
  /** Horizontal slot; fractional when an operator is centred over several. */
  slot: number;
  /** Top-left of the node box, CSS pixels, within the layout's own box. */
  x: number;
  y: number;
  /** True if this operator's output reaches the audio output directly. */
  carrier: boolean;
  /** True if the algorithm loops this operator back into itself. */
  feedback: boolean;
}

export interface FlowEdge {
  from: number;
  to: number;
  /** Centre-bottom of the source node and centre-top of the target, for the wire. */
  x1: number; y1: number;
  x2: number; y2: number;
}

export interface FlowLayout {
  algorithm: number;
  nodes: FlowNode[];
  edges: FlowEdge[];
  /** Node lookup by operator number. */
  byOp: Map<number, FlowNode>;
  /** Overall box, CSS pixels, including padding and the output node's band. */
  width: number;
  height: number;
  /** Centre of the output node. */
  outX: number;
  outY: number;
  /** Number of rows of operators. */
  rows: number;
  /** The proportions this layout was built with. */
  geo: Geometry;
}

const OPS = [1, 2, 3, 4, 5, 6];

/** Rows: 0 for carriers, else one above the highest-placed operator fed. */
function rowsOf(wires: ReadonlyArray<readonly [number, number]>, carriers: Set<number>): Map<number, number> {
  const row = new Map<number, number>();
  const targetsOf = (op: number) => wires.filter(([m]) => m === op).map(([, c]) => c);
  const resolve = (op: number, guard: Set<number>): number => {
    const cached = row.get(op);
    if (cached !== undefined) return cached;
    // The wiring is acyclic, but guard anyway: a future re-vendoring that broke
    // that assumption should produce a flat diagram, not a stack overflow.
    if (guard.has(op)) return 0;
    guard.add(op);
    const targets = targetsOf(op);
    const r = carriers.has(op) || targets.length === 0
      ? 0
      : 1 + Math.max(...targets.map((t) => resolve(t, guard)));
    guard.delete(op);
    row.set(op, r);
    return r;
  };
  for (const op of OPS) resolve(op, new Set());
  return row;
}

/** Push a row's operators apart to at least one slot, keeping their order. */
function spread(entries: Array<{ op: number; slot: number }>): void {
  entries.sort((a, b) => a.slot - b.slot || a.op - b.op);
  for (let i = 1; i < entries.length; ++i) {
    const min = entries[i - 1].slot + 1;
    if (entries[i].slot < min) entries[i].slot = min;
  }
}

export function layoutAlgorithm(algorithm: number, geo: Geometry = STANDARD): FlowLayout {
  const { nodeW, nodeH, colPitch, rowPitch, outH } = geo;
  const roles = algorithmRoles(algorithm);
  const wires = roles.wires;
  const carriers = new Set(roles.carriers);
  const row = rowsOf(wires, carriers);
  const rows = Math.max(...OPS.map((op) => row.get(op) ?? 0)) + 1;

  // Slots, row by row from the bottom, so a modulator can be centred over
  // targets that are already placed.
  const slot = new Map<number, number>();
  for (let r = 0; r < rows; ++r) {
    const here = OPS.filter((op) => (row.get(op) ?? 0) === r);
    const entries = here.map((op) => {
      if (r === 0) return { op, slot: 0 };          // seeded below, in operator order
      const targets = wires.filter(([m]) => m === op).map(([, c]) => slot.get(c));
      const known = targets.filter((v): v is number => v !== undefined);
      return { op, slot: known.length ? known.reduce((a, b) => a + b, 0) / known.length : 0 };
    });
    if (r === 0) {
      // Carriers left to right in operator order — the reading order of the
      // panel, and the order the output sums them in.
      entries.sort((a, b) => a.op - b.op);
      entries.forEach((e, i) => { e.slot = i; });
    } else {
      spread(entries);
    }
    for (const e of entries) slot.set(e.op, e.slot);
  }

  // Normalise so the leftmost slot is 0, then measure.
  const minSlot = Math.min(...OPS.map((op) => slot.get(op) ?? 0));
  const maxSlot = Math.max(...OPS.map((op) => (slot.get(op) ?? 0) - minSlot));
  const width = PAD * 2 + maxSlot * colPitch + nodeW;
  const height = PAD * 2 + (rows - 1) * rowPitch + nodeH + outH;

  const nodes: FlowNode[] = OPS.map((op) => {
    const s = (slot.get(op) ?? 0) - minSlot;
    const r = row.get(op) ?? 0;
    return {
      op,
      row: r,
      slot: s,
      x: PAD + s * colPitch,
      // Row 0 sits at the bottom of the operator area, above the output band.
      y: PAD + (rows - 1 - r) * rowPitch,
      carrier: carriers.has(op),
      feedback: roles.feedbackOp === op,
    };
  });
  const byOp = new Map(nodes.map((n) => [n.op, n]));

  const edges: FlowEdge[] = wires.map(([from, to]) => {
    const a = byOp.get(from) as FlowNode;
    const b = byOp.get(to) as FlowNode;
    return {
      from, to,
      x1: a.x + nodeW / 2, y1: a.y + nodeH,
      x2: b.x + nodeW / 2, y2: b.y,
    };
  });

  // The output node sits under the centre of the carriers it sums.
  const carrierNodes = nodes.filter((n) => n.carrier);
  const outX = carrierNodes.reduce((sum, n) => sum + n.x + nodeW / 2, 0) / carrierNodes.length;

  return {
    algorithm, nodes, edges, byOp, width, height, rows, geo,
    outX,
    outY: PAD + (rows - 1) * rowPitch + nodeH + outH / 2,
  };
}
