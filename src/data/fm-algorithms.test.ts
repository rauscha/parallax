// Guard on the algorithm wiring the flowsheet draws (spec §4.1).
//
// `FM_ALGORITHMS[].wires` is the graph — "operator m's output is summed into
// operator c's phase" — and it is the one piece of data in this feature that can
// be wrong in a way nothing else notices. A wrong wire does not throw, does not
// change a sound, and does not fail a type check. It draws a confident diagram
// of a signal path the engine does not have, which is precisely the dishonesty
// this whole feature exists to avoid. So it is not asserted structurally against
// itself; it is asserted against the engine.
//
// **The prediction.** Silence one operator and every other operator's tap trace
// either changes or does not. The wiring says which: a trace changes exactly
// when the silenced operator can reach it along the wires. That follows from how
// FmCore::compute's buses work, and it is sharp in both directions —
//
//   - it must change downstream, however many hops away (the wires are a graph,
//     not a list of pairs), and
//   - it must NOT change anywhere else, which is the half that catches a wire
//     drawn between two operators that have nothing to do with each other.
//
// Every algorithm is checked with every operator silenced in turn: 32 × 6
// predictions about the real DSP, each one bit-exact.
//
// Runs against the committed public/fm.wasm, like fm-taps.test.ts.

import { describe, it, expect, beforeAll } from "vitest";
import { readFileSync } from "node:fs";
import { pathToFileURL } from "node:url";
import { resolve } from "node:path";
import { FM_ALGORITHMS, algorithmRoles, modulatorsOf } from "./fm-algorithms";
import { buildPatch, SILENT_OP, type FmOperator, type FmPatchSpec } from "./fm-patch";

const SR = 44100;

type FmModule = {
  _fm_init(sampleRate: number): void;
  _fm_block_size(): number;
  _fm_alloc(n: number): number;
  _fm_free(ptr: number): void;
  _fm_set_patch(ptr: number, len: number): void;
  _fm_note_on(note: number, velocity: number): void;
  _fm_note_off(): void;
  _fm_render(ptr: number, n: number): void;
  _fm_tap_count(): number;
  _fm_tap_alloc(): number;
  _fm_set_tap_buffer(ptr: number): void;
  _malloc(n: number): number;
  _free(ptr: number): void;
  HEAPU8: Uint8Array;
  HEAPF32: Float32Array;
};

let M: FmModule;
let N = 0;
let tapPtr = 0;
let audioPtr = 0;
let patchPtr = 0;

beforeAll(async () => {
  const root = resolve(__dirname, "../..");
  const glue = pathToFileURL(resolve(root, "public/fm.js")).href;
  const wasmBinary = readFileSync(resolve(root, "public/fm.wasm"));
  const { default: createFmModule } = await import(/* @vite-ignore */ glue);
  M = await createFmModule({ wasmBinary });
  M._fm_init(SR);
  N = M._fm_block_size();
  tapPtr = M._fm_tap_alloc();
  audioPtr = M._fm_alloc(N);
  patchPtr = M._malloc(156);
  M._fm_set_tap_buffer(tapPtr);
});

/**
 * An operator that sounds hard and flat: instant attack, no decay, full output.
 * A flat envelope is what makes the comparison bit-exact — anything still moving
 * would differ between renders for reasons that have nothing to do with wiring.
 * Distinct ratios per operator so no two contributions can coincide by accident.
 */
function loudOp(coarse: number): FmOperator {
  return {
    rates: [99, 99, 99, 99],
    levels: [99, 99, 99, 99],
    outLevel: 99,
    coarse,
  };
}

const RATIOS = [1, 2, 3, 5, 7, 11];   // coprime-ish, so every operator is distinguishable

/**
 * Render one note of `algorithm` with every operator sounding except those in
 * `silenced`, and return the eight tap traces of a settled block.
 *
 * Feedback is left at 0 throughout: the self-loop is not a wire (it has its own
 * trace and its own column in the data), and `Dx7Note::init` does not clear
 * `fb_buf_`, so a running feedback loop would leak state between renders and
 * make a bit-exact comparison meaningless.
 */
function traces(algorithm: number, silenced: number[] = []): Float32Array[] {
  const ops = RATIOS.map((r, i) =>
    silenced.includes(i + 1) ? SILENT_OP : loudOp(r),
  ) as FmPatchSpec["ops"];
  const bytes = buildPatch({ name: "WIRETEST", algorithm, feedback: 0, ops });
  M.HEAPU8.set(bytes, patchPtr);
  M._fm_set_patch(patchPtr, bytes.length);
  M._fm_note_on(60, 100);
  // A few blocks so the envelopes are parked, then keep the last one. Rates of
  // 99 settle almost immediately; this is margin, not a guess.
  for (let b = 0; b < 8; ++b) M._fm_render(audioPtr, N);
  const count = M._fm_tap_count();
  const out: Float32Array[] = [];
  for (let k = 0; k < count; ++k) {
    out.push(M.HEAPF32.slice(tapPtr / 4 + k * N, tapPtr / 4 + (k + 1) * N));
  }
  M._fm_note_off();
  for (let b = 0; b < 64; ++b) M._fm_render(audioPtr, N);   // let the voice finish
  return out;
}

const same = (a: Float32Array, b: Float32Array): boolean => {
  for (let i = 0; i < a.length; ++i) if (a[i] !== b[i]) return false;
  return true;
};

/** Operators reachable from `from` along the wiring, `from` itself included. */
function reachable(algorithm: number, from: number): Set<number> {
  const wires = algorithmRoles(algorithm).wires;
  const seen = new Set<number>([from]);
  const queue = [from];
  while (queue.length) {
    const cur = queue.shift() as number;
    for (const [m, c] of wires) {
      if (m === cur && !seen.has(c)) { seen.add(c); queue.push(c); }
    }
  }
  return seen;
}

describe("FM algorithm wiring — structure", () => {
  it("covers all 32 algorithms in order", () => {
    expect(FM_ALGORITHMS).toHaveLength(32);
    FM_ALGORITHMS.forEach((a, i) => expect(a.algorithm).toBe(i + 1));
  });

  it("wires run between real operators, never to themselves, never twice", () => {
    for (const a of FM_ALGORITHMS) {
      const seen = new Set<string>();
      for (const [m, c] of a.wires) {
        expect(m, `algo ${a.algorithm}`).toBeGreaterThanOrEqual(1);
        expect(m, `algo ${a.algorithm}`).toBeLessThanOrEqual(6);
        expect(c, `algo ${a.algorithm}`).toBeGreaterThanOrEqual(1);
        expect(c, `algo ${a.algorithm}`).toBeLessThanOrEqual(6);
        // A self-loop is feedback, which is `feedbackOp` and its own tap, not a wire.
        expect(m, `algo ${a.algorithm} self-wire`).not.toBe(c);
        const key = `${m}>${c}`;
        expect(seen.has(key), `algo ${a.algorithm} duplicate ${key}`).toBe(false);
        seen.add(key);
      }
    }
  });

  it("is acyclic — the only loop in this engine is single-operator feedback", () => {
    for (const a of FM_ALGORITHMS) {
      for (const op of [1, 2, 3, 4, 5, 6]) {
        const r = reachable(a.algorithm, op);
        r.delete(op);
        expect([...r].includes(op), `algo ${a.algorithm} cycle at ${op}`).toBe(false);
      }
    }
  });

  it("every modulator actually feeds something, and only carriers reach the output", () => {
    for (const a of FM_ALGORITHMS) {
      const sources = new Set(a.wires.map(([m]) => m));
      // A non-carrier that feeds nothing would be an operator rendering into a
      // bus nobody reads — inaudible, and a node with no wire to draw.
      for (const m of modulatorsOf(a.algorithm)) {
        expect(sources.has(m), `algo ${a.algorithm}: operator ${m} feeds nothing`).toBe(true);
      }
      // And the converse: a carrier is never a modulator in this engine, because
      // an operator writes one bus only.
      for (const c of a.carriers) {
        expect(sources.has(c), `algo ${a.algorithm}: carrier ${c} also modulates`).toBe(false);
      }
    }
  });

  it("reports no feedback operator for exactly algorithms 4 and 6", () => {
    // The documented engine limitation: those two loop a *pair* of operators on
    // the hardware and msfa implements only single-operator feedback. If this
    // ever changes, the dead-knob prose in fm-voices.ts must change with it.
    const none = FM_ALGORITHMS.filter((a) => a.feedbackOp === null).map((a) => a.algorithm);
    expect(none).toEqual([4, 6]);
  });
});

describe("FM algorithm wiring — against the engine", () => {
  it("silencing an operator changes exactly the traces downstream of it", () => {
    const failures: string[] = [];
    for (const { algorithm } of FM_ALGORITHMS) {
      const base = traces(algorithm);
      for (const m of [1, 2, 3, 4, 5, 6]) {
        const cut = traces(algorithm, [m]);
        const expected = reachable(algorithm, m);
        for (const c of [1, 2, 3, 4, 5, 6]) {
          const changed = !same(base[c - 1], cut[c - 1]);
          const predicted = expected.has(c);
          if (changed !== predicted) {
            failures.push(
              `algo ${algorithm}: silencing op ${m} ${changed ? "changed" : "left"} ` +
              `op ${c} ${changed ? "" : "unchanged"} — wiring predicts ` +
              `${predicted ? "downstream" : "independent"}`,
            );
          }
        }
      }
    }
    expect(failures).toEqual([]);
  });

  it("an operator with no incoming wire renders the same in every algorithm", () => {
    // A node the diagram draws with no arrow into it is claiming "this is a pure
    // sine at its own ratio". Two algorithms that both leave operator 1 bare must
    // therefore produce an identical operator-1 trace — same ratio, same level,
    // no modulation. If a wire is missing from the table, this is where a trace
    // that is secretly being modulated shows up.
    const bare = FM_ALGORITHMS
      .filter((a) => !a.wires.some(([, c]) => c === 1))
      .map((a) => a.algorithm);
    expect(bare.length, "expected several algorithms to leave operator 1 bare")
      .toBeGreaterThan(1);
    const ref = traces(bare[0])[0];
    // Not silence — a bare carrier at full level is a loud sine.
    expect(Math.max(...Array.from(ref, Math.abs))).toBeGreaterThan(0.01);
    for (const a of bare.slice(1)) {
      expect(same(traces(a)[0], ref), `algo ${a}: bare operator 1 differs`).toBe(true);
    }
  });
});
