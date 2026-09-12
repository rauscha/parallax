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

/** Node box, CSS pixels. Sized for a legible scope inside, per spec §4.4. */
export const NODE_W = 160;
export const NODE_H = 132;
/** Distance between slot centres, and between row centres. */
export const COL_PITCH = 184;
export const ROW_PITCH = 164;
/** Space reserved under row 0 for the output sum node. */
export const OUT_H = 92;
export const PAD = 16;

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

export function layoutAlgorithm(algorithm: number): FlowLayout {
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
  const width = PAD * 2 + maxSlot * COL_PITCH + NODE_W;
  const height = PAD * 2 + (rows - 1) * ROW_PITCH + NODE_H + OUT_H;

  const nodes: FlowNode[] = OPS.map((op) => {
    const s = (slot.get(op) ?? 0) - minSlot;
    const r = row.get(op) ?? 0;
    return {
      op,
      row: r,
      slot: s,
      x: PAD + s * COL_PITCH,
      // Row 0 sits at the bottom of the operator area, above the output band.
      y: PAD + (rows - 1 - r) * ROW_PITCH,
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
      x1: a.x + NODE_W / 2, y1: a.y + NODE_H,
      x2: b.x + NODE_W / 2, y2: b.y,
    };
  });

  // The output node sits under the centre of the carriers it sums.
  const carrierNodes = nodes.filter((n) => n.carrier);
  const outX = carrierNodes.reduce((sum, n) => sum + n.x + NODE_W / 2, 0) / carrierNodes.length;

  return {
    algorithm, nodes, edges, byOp, width, height, rows,
    outX,
    outY: PAD + (rows - 1) * ROW_PITCH + NODE_H + OUT_H / 2,
  };
}
