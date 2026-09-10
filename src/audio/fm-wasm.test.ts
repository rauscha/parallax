// Regression guard on the committed FM engine binary (public/fm.wasm).
//
// The .wasm and its Emscripten glue are committed prebuilt so GitHub Pages CI
// can ship without a toolchain (see dsp/PROVENANCE.md), which means nothing
// else in the repo would notice a bad rebuild. These assertions are the notice:
// they render real audio through the real binary and check the three things a
// broken build would break first — block size, pitch calibration, and level.
//
// Numbers here were measured at phase 2 of the FM port (2026-09-10) against
// emcc 5.0.7. If a rebuild moves them, that is a finding, not a test to relax.

import { describe, it, expect, beforeAll } from "vitest";
import { readFileSync } from "node:fs";
import { pathToFileURL } from "node:url";
import { resolve } from "node:path";

const SR = 44100;

type FmModule = {
  _fm_init(sampleRate: number): void;
  _fm_block_size(): number;
  _fm_alloc(n: number): number;
  _fm_free(ptr: number): void;
  _fm_note_on(note: number, velocity: number): void;
  _fm_note_off(): void;
  _fm_render(ptr: number, n: number): void;
  HEAP16: Int16Array;
};

let M: FmModule;
let N: number;

beforeAll(async () => {
  const root = resolve(__dirname, "../..");
  const glue = pathToFileURL(resolve(root, "public/fm.js")).href;
  const wasmBinary = readFileSync(resolve(root, "public/fm.wasm"));
  const { default: createFmModule } = await import(/* @vite-ignore */ glue);
  M = await createFmModule({ wasmBinary });
  M._fm_init(SR);
  N = M._fm_block_size();
});

/** Render `seconds` of one note and copy it out of the wasm heap. */
function render(seconds: number, note: number, velocity: number, noteOffAt?: number): Int16Array {
  const n = Math.floor((SR * seconds) / N) * N;
  const ptr = M._fm_alloc(n);
  M._fm_note_on(note, velocity);
  if (noteOffAt === undefined) {
    M._fm_render(ptr, n);
  } else {
    const held = Math.floor((SR * noteOffAt) / N) * N;
    M._fm_render(ptr, held);
    M._fm_note_off();
    M._fm_render(ptr + held * 2, n - held);
  }
  const out = Int16Array.from(M.HEAP16.subarray(ptr >> 1, (ptr >> 1) + n));
  M._fm_free(ptr);
  return out;
}

const peak = (b: Int16Array, from = 0, to = b.length): number => {
  let m = 0;
  for (let i = from; i < to; ++i) m = Math.max(m, Math.abs(b[i]));
  return m;
};

/** Rising-zero-crossing rate — crude, but exact enough to catch a pitch shift. */
function fundamental(b: Int16Array, from: number, len: number): number {
  let crossings = 0;
  let prev = 0;
  for (let i = from; i < from + len; ++i) {
    const v = b[i];
    if (prev <= 0 && v > 0) crossings++;
    prev = v;
  }
  return (crossings * SR) / len;
}

describe("FM engine binary", () => {
  it("reports msfa's compile-time render block of 64 samples", () => {
    expect(N).toBe(64);
  });

  it("renders audible output from the boot patch", () => {
    expect(peak(render(0.4, 60, 100))).toBeGreaterThan(1000);
  });

  // The engine runs at its calibrated 44.1 kHz precisely so this holds; a
  // rate change without the matching envelope work would show up here first.
  it.each([
    [48, 130.8],
    [60, 261.6],
    [69, 440.0],
    [84, 1046.5],
  ])("plays MIDI %i at its true pitch (%f Hz)", (note, expected) => {
    const measured = fundamental(render(0.6, note, 100), 2205, 22050);
    expect(measured).toBeGreaterThan(expected * 0.99);
    expect(measured).toBeLessThan(expected * 1.01);
  });

  it("scales with velocity", () => {
    const quiet = peak(render(0.4, 60, 30));
    const loud = peak(render(0.4, 60, 127));
    expect(loud).toBeGreaterThan(quiet * 1.5);
  });

  // msfa's own int32 -> int16 conversion is >>13 with a clip at +/-(1<<24).
  // A single-carrier voice lands well below full scale by design; the make-up
  // gain lives in the engine's GainNode, not in the DSP.
  it("keeps a loud single-carrier voice inside int16 without clipping", () => {
    const p = peak(render(0.4, 60, 127));
    expect(p).toBeLessThan(32767);
    expect(p).toBeGreaterThan(3000);
  });

  it("releases to silence after note off", () => {
    const b = render(2.0, 60, 100, 0.5);
    expect(peak(b, 0, SR * 0.4)).toBeGreaterThan(1000);
    expect(peak(b, SR * 1.5)).toBe(0);
  });
});
