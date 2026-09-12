// The §6.3 gate, in the one form that can be automated: **a trace shown next to
// a claim has to demonstrate that claim.**
//
// The spec calls a scope that disagrees with its own caption the worst failure
// mode this feature has, and it is worth being precise about why. The audio is
// already guarded — `fm-voices.test.ts` renders all fourteen voices and asserts
// the comparative prose against real sound. What that cannot catch is a mismatch
// between the sound and the *picture*: the flowsheet reads the patch through
// `readout.ts`, draws through `trace.ts` and analyses through `fft.ts`, none of
// which the corpus tests touch. A wrong byte offset, a mirrored operator order
// or a stale ratio formula would print a confident number beside a trace that is
// doing something else, and every existing test would still pass.
//
// So the assertions here all have the same shape: **take what the view would
// display, and check it against the signal the view would draw.** Both sides
// come from the running engine through the committed `public/fm.wasm`.
//
// The sharpest of them is the ratio: an operator whose trace still has a single
// clean cycle has a measurable frequency, and the number the node prints beside
// it is a prediction of that frequency. Measured by zero crossings, which for a
// sine is exact no matter what its envelope is doing.

import { describe, it, expect, beforeAll } from "vitest";
import { readFileSync } from "node:fs";
import { pathToFileURL } from "node:url";
import { resolve } from "node:path";
import { FM_VOICES, FM_MODELS, FM_PATCHES } from "../../data/fm-models";
import {
  applyMacros, FM_MACRO_DEFAULTS, ratioOf as macroRatioOf,
} from "../../data/fm-macros";
import { algorithmRoles } from "../../data/fm-algorithms";
import { readPatch, formatRatio, ratioOf as readoutRatioOf } from "./readout";
import { peak, findTrigger } from "../../viz/trace";
import { spectrumDb, fftWork } from "../../viz/fft";

const SR = 44100;
/** The snapshot window the view draws, so the analysis sees what the pane sees. */
const WINDOW = 1024;
const WIRE_TAP = 6;
const OUT_TAP = 7;
/** Middle C, the note every measurement here is taken at. */
const F0 = 440 * Math.pow(2, (60 - 69) / 12);

type FmModule = {
  _fm_init(sampleRate: number): void;
  _fm_block_size(): number;
  _fm_alloc(n: number): number;
  _fm_set_patch(ptr: number, len: number): void;
  _fm_note_on(note: number, velocity: number): void;
  _fm_note_off(): void;
  _fm_render(ptr: number, n: number): void;
  _fm_tap_count(): number;
  _fm_tap_alloc(): number;
  _fm_set_tap_buffer(ptr: number): void;
  _malloc(n: number): number;
  HEAPU8: Uint8Array;
  HEAPF32: Float32Array;
};

let M: FmModule;
let N = 0;
let TAPS = 0;
let tapPtr = 0;
let audioPtr = 0;
let patchPtr = 0;

beforeAll(async () => {
  const root = resolve(__dirname, "../../..");
  const glue = pathToFileURL(resolve(root, "public/fm.js")).href;
  const wasmBinary = readFileSync(resolve(root, "public/fm.wasm"));
  const { default: createFmModule } = await import(/* @vite-ignore */ glue);
  M = await createFmModule({ wasmBinary });
  M._fm_init(SR);
  N = M._fm_block_size();
  TAPS = M._fm_tap_count();
  tapPtr = M._fm_tap_alloc();
  audioPtr = M._fm_alloc(N);
  patchPtr = M._malloc(156);
  M._fm_set_tap_buffer(tapPtr);
});

/** Load a patch and start the note. Leaves the voice sounding. */
function start(patch: Uint8Array, note = 60, velocity = 110): void {
  M.HEAPU8.set(patch, patchPtr);
  M._fm_set_patch(patchPtr, patch.length);
  M._fm_note_on(note, velocity);
}

/** Release and let the envelopes finish, so the next render starts clean. */
function finish(): void {
  M._fm_note_off();
  for (let b = 0; b < 64; ++b) M._fm_render(audioPtr, N);
}

/**
 * Fill one frame in the view's own layout — `TAPS * WINDOW` floats, tap-major —
 * so an index into it means the same thing here as it does in `Flowsheet.svelte`.
 *
 * A tap buffer holds one engine block, so a frame is sixteen consecutive blocks
 * stitched together, which is what the worklet's ring does.
 */
function fill(frame: Float32Array): void {
  for (let b = 0; b < WINDOW / N; ++b) {
    M._fm_render(audioPtr, N);
    for (let k = 0; k < TAPS; ++k) {
      frame.set(
        M.HEAPF32.subarray(tapPtr / 4 + k * N, tapPtr / 4 + (k + 1) * N),
        k * WINDOW + b * N,
      );
    }
  }
}

/**
 * One frame of one note. `skip` blocks are rendered and discarded first, which is
 * how a measurement lands on the part of the note the prose is talking about:
 * 2 blocks in for an attack claim, 40 for a settled one.
 */
function frameOf(patch: Uint8Array, skip = 2, note = 60, velocity = 110): Float32Array {
  start(patch, note, velocity);
  for (let b = 0; b < skip; ++b) M._fm_render(audioPtr, N);
  const frame = new Float32Array(TAPS * WINDOW);
  fill(frame);
  finish();
  return frame;
}

/** One trace out of a frame. */
const traceOf = (frame: Float32Array, tap: number): Float32Array =>
  frame.subarray(tap * WINDOW, (tap + 1) * WINDOW);

/** Interpolated upward zero crossings, armed below the negative gate. */
function crossings(buf: Float32Array): number[] {
  const amp = peak(buf);
  if (amp <= 0) return [];
  const gate = amp * 0.05;
  const out: number[] = [];
  let armed = false;
  for (let i = 1; i < buf.length; ++i) {
    if (buf[i - 1] < -gate) armed = true;
    if (armed && buf[i - 1] <= 0 && buf[i] > 0) {
      out.push(i - 1 + buf[i - 1] / (buf[i - 1] - buf[i]));
      armed = false;
    }
  }
  return out;
}

/**
 * Frequency of a trace, or 0 when the trace has no single period to report.
 *
 * Measured between the FIRST and LAST crossing rather than counted per window,
 * so the answer does not depend on where the window starts, and amplitude —
 * including a collapsing envelope — cancels out entirely.
 *
 * The uniformity check is what keeps this honest. A trace with a wide-open
 * feedback loop, or one being modulated hard, has crossings that are not evenly
 * spaced, and its "frequency" would be an artefact. Returning 0 there is the
 * correct answer: those are exactly the traces whose cards say the pitch is hard
 * to hear. 5 % is loose enough for a lightly fed-back sine and tight enough to
 * reject a trace that has stopped being one.
 */
function measureHz(buf: Float32Array): number {
  const cross = crossings(buf);
  if (cross.length < 3) return 0;
  let lo = Infinity, hi = 0;
  for (let i = 1; i < cross.length; ++i) {
    const d = cross[i] - cross[i - 1];
    lo = Math.min(lo, d);
    hi = Math.max(hi, d);
  }
  if (hi / lo > 1.05) return 0;
  return ((cross.length - 1) * SR) / (cross[cross.length - 1] - cross[0]);
}

/** The patch the view is captioning: corpus bytes with the macros at their detents. */
const displayed = (i: number) => applyMacros(FM_PATCHES[i], FM_MACRO_DEFAULTS);
const byCode = (code: string) => FM_MODELS.findIndex((m) => m.code === code);

/**
 * Operators nothing is modulating **in this voice** — the wire has to exist AND
 * the operator on the far end has to be sounding. That distinction matters: a
 * silent modulator still has a wire drawn in the algorithm, and Bronze Gong's
 * operator 4 is a bare partial for exactly that reason.
 */
function unmodulated(voiceIndex: number): number[] {
  const ro = readPatch(displayed(voiceIndex));
  const roles = algorithmRoles(FM_VOICES[voiceIndex].spec.algorithm);
  const driven = new Set(
    roles.wires.filter(([m]) => ro.ops[m - 1].outLevel > 0).map(([, to]) => to),
  );
  return [1, 2, 3, 4, 5, 6].filter((op) => !driven.has(op));
}

describe("the number beside a trace is that trace's frequency", () => {
  // The ratio readout is the caption most able to be quietly wrong: it comes
  // from its own copy of the engine's coarse table and its own byte offsets, and
  // "coarse 3" reading as 3.0 proves nothing about "coarse 0" reading as 0.5 or
  // about operator 1 being read out of block 5. Asserting it against the
  // measured frequency of the very trace it sits beside closes all of that at
  // once — offsets, table and panel order included.
  it("holds for every readable operator trace in the corpus", () => {
    let checked = 0;
    for (let i = 0; i < FM_VOICES.length; ++i) {
      const patch = displayed(i);
      const ro = readPatch(patch);
      const frame = frameOf(patch);
      for (const op of unmodulated(i)) {
        const shown = ro.ops[op - 1];
        if (shown.outLevel === 0 || shown.ratio === null) continue;
        const hz = measureHz(traceOf(frame, op - 1));
        if (hz === 0) continue;                  // no single period to read
        const label = `${FM_MODELS[i].name} op ${op} (node shows x${formatRatio(shown.ratio)})`;
        // Absolute rather than relative, which makes it stricter the higher the
        // ratio goes: 0.05 is 5 % of Bronze Gong's 1.41 but 0.4 % of Tine's 14.
        expect(hz / F0, label).toBeCloseTo(shown.ratio, 1);
        checked++;
      }
    }
    // Guard the guard. A bug that narrowed `unmodulated` or over-tightened the
    // uniformity check would leave this green while asserting almost nothing.
    expect(checked, "operator traces with a checkable ratio").toBeGreaterThan(15);
  });

  it("holds for the ratios the prose quotes by name", () => {
    // The specific numbers a reader can put next to the screen.
    const quoted: Array<[string, number, number]> = [
      ["PLX1", 2, 2],        // "Two operators at a 2:1 ratio"
      ["GLAS", 2, 7],        // "at 7:1, 11:1 and 14:1"
      ["GLAS", 4, 11],
      ["GLAS", 6, 14],
      ["GONG", 3, 1.41],     // "Deliberately non-integer ratios - 3.48 and 1.41"
      ["TINE", 3, 14],       // "A 14:1 modulator"
      ["REED", 2, 3],        // "A 3:1 modulator"
      ["CLNK", 3, 9.17],     // "4.59 and 9.17"
    ];
    for (const [code, op, ratio] of quoted) {
      const i = byCode(code);
      expect(i, code).toBeGreaterThanOrEqual(0);
      const frame = frameOf(displayed(i));
      const hz = measureHz(traceOf(frame, op - 1));
      expect(hz, `${code} op ${op} should have a readable trace`).toBeGreaterThan(0);
      expect(hz / F0, `${code} op ${op}`).toBeCloseTo(ratio, 1);
    }
  });

  it("agrees with the ratio arithmetic the corpus and the macros use", () => {
    // There are two ratio formulas in the app: `fm-macros.ratioOf`, the plain
    // `coarse x (1 + fine/100)` that authors a voice and drives the Ratio knob,
    // and `readout.ratioOf`, the engine's own log-table version that captions a
    // node. They are allowed to be different code; they are not allowed to
    // disagree, or the prose would quote one number and the node print another.
    for (let coarse = 0; coarse <= 31; ++coarse) {
      for (const fine of [0, 1, 17, 31, 50, 53, 99]) {
        const authored = macroRatioOf(coarse, fine);
        const captioned = readoutRatioOf(coarse, fine, 7);
        expect(
          Math.abs(authored - captioned) / authored,
          `coarse ${coarse} fine ${fine}: authored ${authored}, captioned ${captioned}`,
        ).toBeLessThan(0.0005);
      }
    }
  });
});

describe("the silent tag and the trace agree", () => {
  // The node prints "silent" when the readout's output level is 0 and sinks its
  // background. If that disagreed with the trace, the diagram would either label
  // a working operator dead or draw a live scope under the word silent.
  it("marks exactly the operators whose trace is flat", () => {
    for (let i = 0; i < FM_VOICES.length; ++i) {
      const patch = displayed(i);
      const ro = readPatch(patch);
      const frame = frameOf(patch);
      for (let op = 1; op <= 6; ++op) {
        const tagged = ro.ops[op - 1].outLevel === 0;
        const moving = peak(traceOf(frame, op - 1)) > 0;
        expect(moving, `${FM_MODELS[i].name} op ${op} tagged silent=${tagged}`).toBe(!tagged);
      }
    }
  });

  it("draws something on the output and on every sounding carrier", () => {
    for (let i = 0; i < FM_VOICES.length; ++i) {
      const ro = readPatch(displayed(i));
      const frame = frameOf(displayed(i));
      expect(peak(traceOf(frame, OUT_TAP)), FM_MODELS[i].name).toBeGreaterThan(0);
      for (const c of algorithmRoles(FM_VOICES[i].spec.algorithm).carriers) {
        if (ro.ops[c - 1].outLevel === 0) continue;
        expect(peak(traceOf(frame, c - 1)), `${FM_MODELS[i].name} carrier ${c}`)
          .toBeGreaterThan(0);
      }
    }
  });

  it("shows a feedback wire only where the voice has one running", () => {
    // The wire pane is captioned with the feedback operator. A voice whose card
    // says the loop starts at zero must draw a flat wire; one whose card says it
    // starts at maximum must not.
    const flat = byCode("2OPS");     // "Starts at zero on this voice"
    const open = byCode("GRWL");     // "Starts at maximum"
    expect(peak(traceOf(frameOf(displayed(flat)), WIRE_TAP))).toBe(0);
    expect(peak(traceOf(frameOf(displayed(open)), WIRE_TAP))).toBeGreaterThan(0);
  });
});

describe("the shared trigger shows ratio as motion", () => {
  // The load-bearing claim of the whole view, and the reason all eight traces
  // are triggered once on the output rather than each on itself: a whole-number
  // ratio stands still frame after frame, a near-miss walks. Every Ratio knob
  // card in the corpus describes that behaviour — "on the detent the partials
  // are whole-number multiples and it reads as a bell; away from it they stop
  // lining up" — so it is a claim about the picture, not about the sound.
  //
  // Measured as where in its own cycle an operator sits at the moment the output
  // triggers, over consecutive frames of one held note. Standing still means
  // that number does not change.
  function phasesAtTrigger(voiceIndex: number, op: number, frames = 6): number[] {
    start(displayed(voiceIndex));
    const win = new Float32Array(TAPS * WINDOW);
    const out: number[] = [];
    for (let f = 0; f < frames; ++f) {
      fill(win);
      const t = findTrigger(win, OUT_TAP * WINDOW, WINDOW);
      if (t < 0) continue;
      const at = t - OUT_TAP * WINDOW;      // trigger, in frame coordinates
      const trace = traceOf(win, op - 1);
      const hz = measureHz(trace);
      const cross = crossings(trace);
      if (hz === 0 || cross.length === 0) continue;
      const period = SR / hz;
      const phase = ((at - cross[0]) / period) % 1;
      out.push(phase < 0 ? phase + 1 : phase);
    }
    finish();
    return out;
  }

  /** Largest wrap-aware step between consecutive phases, in cycles. */
  const drift = (ph: number[]): number => {
    let worst = 0;
    for (let i = 1; i < ph.length; ++i) {
      const d = Math.abs(ph[i] - ph[i - 1]) % 1;
      worst = Math.max(worst, Math.min(d, 1 - d));
    }
    return worst;
  };

  it("holds a whole-number ratio still and lets a non-integer one walk", () => {
    const still = phasesAtTrigger(byCode("PLX1"), 2);      // 2:1 — locked
    const walks = phasesAtTrigger(byCode("GONG"), 3);      // 1.41:1 — drifting
    expect(still.length, "PLX1 frames").toBeGreaterThan(3);
    expect(walks.length, "GONG frames").toBeGreaterThan(3);
    expect(drift(still), "the 2:1 modulator should hold its phase").toBeLessThan(0.05);
    expect(drift(walks), "the 1.41:1 modulator should visibly walk").toBeGreaterThan(0.1);
  });
});

describe("the spectrum pane shows what the prose promises", () => {
  const work = fftWork(WINDOW);
  const out = new Float32Array(WINDOW / 2);
  const harmonic = (k: number) => Math.round((k * F0 * WINDOW) / SR);

  /** Peak dB within +-1 bin, so a small tuning offset does not read as absence. */
  function near(spec: Float32Array, bin: number): number {
    let best = -Infinity;
    for (let b = bin - 1; b <= bin + 1; ++b) {
      if (b >= 0 && b < spec.length) best = Math.max(best, spec[b]);
    }
    return best;
  }

  function spectrumOf(voiceIndex: number, skip = 2): Float32Array {
    const frame = frameOf(displayed(voiceIndex), skip);
    spectrumDb(frame, OUT_TAP * WINDOW, WINDOW, out, work, -96);
    return out;
  }

  it("leaves Hollow Reed's multiples of three empty", () => {
    // "Its sidebands land on every third harmonic either side of the carrier,
    // and the lower ones reflect back through zero, so what is actually missing
    // is every multiple of three." That sentence used to say the harmonics
    // *between* the sidebands stay thin, which the pane flatly contradicts:
    // f0 - 3f0 folds back onto 2f0 and f0 - 6f0 onto 5f0, so 2 and 5 are as
    // strong as 4 and 7. Measured here: the multiples of three sit around -60 dB
    // while everything else is between -26 and -39.
    const spec = spectrumOf(byCode("REED"));
    const present = [1, 2, 4, 5, 7, 8].map((k) => near(spec, harmonic(k)));
    const missing = [3, 6, 9].map((k) => near(spec, harmonic(k)));
    expect(Math.max(...missing), "the multiples of three")
      .toBeLessThan(Math.min(...present) - 15);
  });

  it("leaves Parallax Bell's even harmonics out", () => {
    // A 2:1 modulator on a 1:1 carrier puts sidebands on the odd harmonics only,
    // which is why the plainest voice in the corpus reads as hollow rather than
    // as a sawtooth. The knob card's "the partials are whole-number multiples"
    // is checkable to this level of detail, so it is checked.
    const spec = spectrumOf(byCode("PLX1"));
    const odd = [1, 3, 5].map((k) => near(spec, harmonic(k)));
    const even = [2, 4, 6].map((k) => near(spec, harmonic(k)));
    expect(Math.max(...even), "the even harmonics")
      .toBeLessThan(Math.min(...odd) - 30);
  });

  it("puts Glass's energy above the fundamental, not on it", () => {
    // "High ratios put the sidebands far from the fundamental, which is what
    // sounds like glass" — so the spectrum's centre of mass must sit well up.
    const spec = spectrumOf(byCode("GLAS"));
    let num = 0, den = 0;
    for (let b = 1; b < spec.length; ++b) {
      const lin = Math.pow(10, spec[b] / 20);
      num += b * lin;
      den += lin;
    }
    expect((num / den) * (SR / WINDOW), "Glass centroid").toBeGreaterThan(4 * F0);
  });

  it("leaves Growl Bass's fundamental standing under the noise", () => {
    // "The pitch is still exactly there under the noise - the carrier is
    // untouched. That is what separates FM growl from distortion."
    const spec = spectrumOf(byCode("GRWL"));
    const f = near(spec, harmonic(1));
    let sum = 0, n = 0;
    for (let b = harmonic(1) + 2; b < harmonic(24); ++b) { sum += spec[b]; n++; }
    expect(f, "Growl fundamental over its own mean spectrum")
      .toBeGreaterThan(sum / n + 10);
  });

  it("leaves One Operator with a fundamental and nothing else", () => {
    // The floor the engine is built on, and the first node the flowsheet draws.
    const spec = spectrumOf(byCode("SINE"));
    const f = near(spec, harmonic(1));
    for (let k = 2; k <= 8; ++k) {
      expect(near(spec, harmonic(k)), `One Operator harmonic ${k}`).toBeLessThan(f - 40);
    }
  });

  it("gives Feedback Alone the harmonics One Operator does not have", () => {
    // "Put this next to One Operator. They are the same patch except that this
    // one's operator listens to itself, and that single difference produces
    // every harmonic in it."
    const sine = Float32Array.from(spectrumOf(byCode("SINE")));
    const fdbk = spectrumOf(byCode("FDBK"));
    for (const k of [2, 3, 4]) {
      expect(near(fdbk, harmonic(k)), `Feedback Alone harmonic ${k}`)
        .toBeGreaterThan(near(sine, harmonic(k)) + 20);
    }
  });
});

describe("two traces side by side say what the caption says", () => {
  it("decays Parallax Bell's modulator faster than its carrier", () => {
    // "The bright overtones fade before the fundamental does" — and the two
    // traces are drawn one above the other, so this is a claim about the
    // picture. Same two traces, early and late in the note.
    const i = byCode("PLX1");
    const early = frameOf(displayed(i), 2);
    const late = frameOf(displayed(i), 40);
    const fall = (tap: number) =>
      peak(traceOf(late, tap)) / Math.max(peak(traceOf(early, tap)), 1e-12);
    expect(fall(1), "modulator op 2 against carrier op 1").toBeLessThan(fall(0));
  });

  it("keeps Bronze Gong's operator 4 a bare partial under the clangour", () => {
    // "Operator 4 sits underneath as a bare, unmodulated partial ... That clean
    // tone under the clangour is what keeps the voice from turning into noise."
    // A bare operator's trace is a sine, so its own harmonics must be far down.
    const frame = frameOf(displayed(byCode("GONG")), 4);
    const trace = Float32Array.from(traceOf(frame, 3));
    const work = fftWork(WINDOW);
    const spec = new Float32Array(WINDOW / 2);
    spectrumDb(trace, 0, WINDOW, spec, work, -96);
    const hz = measureHz(trace);
    expect(hz, "operator 4 should be sounding and readable").toBeGreaterThan(0);
    const bin = Math.round((hz * WINDOW) / SR);
    const at = (b: number) =>
      Math.max(spec[b - 1] ?? -96, spec[b] ?? -96, spec[b + 1] ?? -96);
    for (const k of [2, 3, 4]) {
      expect(at(k * bin), `operator 4 harmonic ${k}`).toBeLessThan(at(bin) - 30);
    }
  });
});
