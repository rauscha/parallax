// Guard on the FM tap exports (spec §2) and on the vendored patch that makes
// them possible.
//
// Two different things are being protected here.
//
// **That taps are transparent.** Reading per-operator signal needed a fourth
// local modification to the vendored msfa engine: an optional tap pointer on
// `FmCore::compute`, which makes each operator render into its own block and
// then merges that block into the bus explicitly. The merge is the kernel's own
// `add` folded out by hand, so the arithmetic should be the same arithmetic in
// the same order — and "should be" is not good enough for a patch to someone
// else's DSP. The first test renders the same note twice, taps off and taps on,
// and requires the audio to be bit-for-bit equal.
//
// **That the traces are the real signal.** A flowsheet that draws a plausible
// picture instead of the actual one would be the exact dishonesty this product
// exists to avoid. So: a silenced operator must read as silence, the voice-
// output trace must match the audio the engine hands the worklet, and the
// feedback wire must be non-zero exactly when a feedback path is taken.
//
// Runs against the committed public/fm.wasm, like src/audio/fm-wasm.test.ts.

import { describe, it, expect, beforeAll } from "vitest";
import { readFileSync } from "node:fs";
import { pathToFileURL } from "node:url";
import { resolve } from "node:path";

const SR = 44100;

/** Tap slots, in panel numbering — the order the shim writes them. */
const TAP_OP1 = 0;
const TAP_OP2 = 1;
const TAP_OP6 = 5;
const TAP_WIRE = 6;
const TAP_OUT = 7;

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
  _fm_tap_free(ptr: number): void;
  _fm_set_tap_buffer(ptr: number): void;
  _malloc(n: number): number;
  _free(ptr: number): void;
  HEAP16: Int16Array;
  HEAPU8: Uint8Array;
  HEAPF32: Float32Array;
};

let M: FmModule;
let N: number;
let TAPS: number;

beforeAll(async () => {
  const root = resolve(__dirname, "../..");
  const glue = pathToFileURL(resolve(root, "public/fm.js")).href;
  const wasmBinary = readFileSync(resolve(root, "public/fm.wasm"));
  const { default: createFmModule } = await import(/* @vite-ignore */ glue);
  M = await createFmModule({ wasmBinary });
  M._fm_init(SR);
  N = M._fm_block_size();
  TAPS = M._fm_tap_count();
});

/** Render `blocks` engine blocks of one note; taps optional. */
function render(blocks: number, note: number, velocity: number, tapPtr = 0): Int16Array {
  const n = blocks * N;
  const ptr = M._fm_alloc(n);
  M._fm_set_tap_buffer(tapPtr);
  M._fm_note_on(note, velocity);
  // One block per call, because a tap buffer holds one block at a time — and
  // rendering the same way in both cases keeps the comparison honest.
  for (let b = 0; b < blocks; ++b) M._fm_render(ptr + b * N * 2, N);
  M._fm_set_tap_buffer(0);
  const out = Int16Array.from(M.HEAP16.subarray(ptr >> 1, (ptr >> 1) + n));
  M._fm_free(ptr);
  return out;
}

/** Read one tap's current block out of the wasm heap. */
function tap(tapPtr: number, slot: number): Float32Array {
  const base = (tapPtr >> 2) + slot * N;
  return Float32Array.from(M.HEAPF32.subarray(base, base + N));
}

const peakOf = (b: Float32Array | Int16Array): number => {
  let m = 0;
  for (let i = 0; i < b.length; ++i) m = Math.max(m, Math.abs(b[i]));
  return m;
};

/**
 * A minimal hand-built 156-byte patch, so the feedback test exercises a known
 * routing instead of hoping a corpus voice happens to have one. Algorithm 32 is
 * six independent carriers with the feedback flag on msfa index 0 — panel
 * operator 6 — which makes it the one algorithm where a single sounding
 * operator is both the carrier and the feedback loop.
 */
function algo32Patch(feedback: number, outLevel = 99): Uint8Array {
  const p = new Uint8Array(156);
  for (let op = 0; op < 6; ++op) {
    const o = op * 21;
    p[o + 0] = 99; p[o + 1] = 99; p[o + 2] = 99; p[o + 3] = 99;  // EG rates
    p[o + 4] = 99; p[o + 5] = 99; p[o + 6] = 99; p[o + 7] = 0;   // EG levels
    p[o + 16] = op === 0 ? outLevel : 0;   // only msfa index 0 sounds
    p[o + 18] = 1;                          // coarse ratio 1:1
    p[o + 20] = 7;                          // no detune
  }
  for (let i = 0; i < 4; ++i) { p[126 + i] = 99; p[130 + i] = 50; }
  p[134] = 31;         // algorithm 32
  p[135] = feedback;   // 0 = off (msfa turns the fb path off entirely at 0)
  p[136] = 1;          // osc key sync
  p[144] = 24;
  p[155] = 0x3f;
  return p;
}

function setPatch(bytes: Uint8Array): void {
  const ptr = M._malloc(bytes.length);
  M.HEAPU8.set(bytes, ptr);
  M._fm_set_patch(ptr, bytes.length);
  M._free(ptr);
}

describe("FM taps — the vendored tap patch is transparent", () => {
  it("exports eight traces", () => {
    expect(TAPS).toBe(8);
  });

  // The whole justification for patching someone else's DSP in place rather
  // than reimplementing the routing: it cannot change the sound. If this ever
  // fails, the patch is wrong — do not relax the comparison.
  it("renders bit-for-bit identical audio with taps on and off", () => {
    const tapPtr = M._fm_tap_alloc();
    const off = render(64, 60, 100, 0);
    const on = render(64, 60, 100, tapPtr);
    M._fm_tap_free(tapPtr);
    expect(on.length).toBe(off.length);
    let firstDiff = -1;
    for (let i = 0; i < off.length; ++i) {
      if (on[i] !== off[i]) { firstDiff = i; break; }
    }
    expect(firstDiff, `first differing sample at ${firstDiff}`).toBe(-1);
  });
});

describe("FM taps — the traces are the real signal", () => {
  it("reads the boot voice's two live operators and nothing else", () => {
    const tapPtr = M._fm_tap_alloc();
    render(32, 60, 110, tapPtr);          // boot patch: op2 -> op1, ops 3-6 off

    expect(peakOf(tap(tapPtr, TAP_OP1))).toBeGreaterThan(0);   // carrier
    expect(peakOf(tap(tapPtr, TAP_OP2))).toBeGreaterThan(0);   // modulator
    for (const slot of [2, 3, 4, 5]) {
      expect(peakOf(tap(tapPtr, slot)), `panel operator ${slot + 1}`).toBe(0);
    }
    M._fm_tap_free(tapPtr);
  });

  // The boot voice has one sounding carrier (panel operator 1), so the voice
  // output is that operator's output and nothing else. A mirrored tap order
  // would fail here, which is the point — msfa indexes operators backwards
  // from the panel and getting that wrong flips every diagram.
  it("matches the voice-output trace to the sounding carrier", () => {
    const tapPtr = M._fm_tap_alloc();
    render(32, 60, 110, tapPtr);
    const carrier = tap(tapPtr, TAP_OP1);
    const out = tap(tapPtr, TAP_OUT);
    for (let i = 0; i < N; ++i) expect(out[i]).toBe(carrier[i]);
    M._fm_tap_free(tapPtr);
  });

  // Taps are normalised against the same full scale msfa's int16 conversion
  // uses (>>13 with a clip), so trace * 32768 is the audio sample, to within
  // the truncation that conversion does.
  it("puts the output trace on the same scale as the audio", () => {
    const tapPtr = M._fm_tap_alloc();
    const audio = render(32, 60, 110, tapPtr);
    const out = tap(tapPtr, TAP_OUT);
    const lastBlock = audio.subarray(audio.length - N);
    expect(peakOf(out)).toBeGreaterThan(0);
    for (let i = 0; i < N; ++i) {
      expect(Math.abs(out[i] * 32768 - lastBlock[i])).toBeLessThan(1.5);
    }
    M._fm_tap_free(tapPtr);
  });

  it("reads the feedback wire only when a feedback path is taken", () => {
    const tapPtr = M._fm_tap_alloc();

    setPatch(algo32Patch(0));
    render(32, 60, 110, tapPtr);
    expect(peakOf(tap(tapPtr, TAP_OP6))).toBeGreaterThan(0);   // it is sounding
    expect(peakOf(tap(tapPtr, TAP_WIRE))).toBe(0);             // but not fed back

    setPatch(algo32Patch(7));
    render(32, 60, 110, tapPtr);
    expect(peakOf(tap(tapPtr, TAP_OP6))).toBeGreaterThan(0);
    expect(peakOf(tap(tapPtr, TAP_WIRE))).toBeGreaterThan(0);

    M._fm_tap_free(tapPtr);
  });

  it("reads silence once the note has finished, not the last live block", () => {
    const tapPtr = M._fm_tap_alloc();
    setPatch(algo32Patch(0, 99));
    const ptr = M._fm_alloc(N);
    M._fm_set_tap_buffer(tapPtr);
    M._fm_note_on(60, 110);
    M._fm_render(ptr, N);
    expect(peakOf(tap(tapPtr, TAP_OP6))).toBeGreaterThan(0);

    // Release and run long enough for the envelopes to reach zero. The traces
    // then read silence because the engine really is silent — and because the
    // shim clears them rather than leaving the last live block behind.
    M._fm_note_off();
    for (let i = 0; i < 4000; ++i) M._fm_render(ptr, N);
    for (let slot = 0; slot < TAPS; ++slot) {
      expect(peakOf(tap(tapPtr, slot)), `tap ${slot}`).toBe(0);
    }

    M._fm_set_tap_buffer(0);
    M._fm_free(ptr);
    M._fm_tap_free(tapPtr);
  });
});
