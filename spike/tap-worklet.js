// spike/tap-worklet.js — THROWAWAY measurement rig for the FM flowsheet taps.
//
// Phase 0 of docs/superpowers/specs/2026-09-10-fm-engine-and-flowsheet.md §6.1.
// This is a copy of public/rings-worklet.js with the tap-capture path bolted on,
// so the shipped worklet is not touched. It runs the REAL Rings WASM engine so
// the per-quantum DSP cost under the taps is real, not simulated.
//
// What it measures:
//   - process() duration distribution vs the 2.67 ms quantum budget
//   - "late" callbacks (wall-clock gap between quanta >> quantum duration)
//   - steady-state allocation on the audio thread (counted, not guessed)
//   - snapshot delivery rate and pool starvation
//
// Tap design under test (spec §2): a pre-allocated capture ring inside the
// worklet, written every quantum, packed once per display frame into a POOLED
// ArrayBuffer and posted as a TRANSFERABLE. The main thread transfers the empty
// buffer back. No per-quantum postMessage, no per-quantum allocation.

import createRingsModule from "./rings.js";

const RINGS_RATE = 48000;
const RINGS_BLOCK = 24;
const RB_BLOCKS = 64;

const WINDOW = 1024;   // samples per tap in one snapshot (what a scope draws)
const RING = 2048;     // per-tap capture ring; >= WINDOW + a frame of slack
const POOL = 3;        // snapshot buffers in flight

const clamp01 = (x) => (x < 0 ? 0 : x > 1 ? 1 : x);

// performance.now() is not guaranteed in AudioWorkletGlobalScope. Probe once.
const HAS_PERF = typeof performance !== "undefined" && typeof performance.now === "function";

class TapSpikeProcessor extends AudioWorkletProcessor {
  static get parameterDescriptors() {
    return [
      { name: "note",       defaultValue: 48,   minValue: 0, maxValue: 127, automationRate: "k-rate" },
      { name: "structure",  defaultValue: 0.4,  minValue: 0, maxValue: 1,   automationRate: "k-rate" },
      { name: "brightness", defaultValue: 0.6,  minValue: 0, maxValue: 1,   automationRate: "k-rate" },
      { name: "damping",    defaultValue: 0.55, minValue: 0, maxValue: 1,   automationRate: "k-rate" },
      { name: "position",   defaultValue: 0.3,  minValue: 0, maxValue: 1,   automationRate: "k-rate" },
    ];
  }

  constructor(options) {
    super();
    this.ready = false;
    this.disposed = false;
    this.module = null;
    this.bufPtr = 0;
    this.bufView = null;

    this.rb = new Float32Array(RINGS_BLOCK * RB_BLOCKS);
    this.rbRead = 0; this.rbWrite = 0; this.rbCount = 0;

    this.srcRatio = RINGS_RATE / sampleRate;
    this.srcPhase = 0; this.srcPrev = 0; this.srcCurr = 0;
    this.pendingStrums = [];

    // ---- taps -------------------------------------------------------------
    this.tapCount = options.processorOptions?.tapCount | 0;
    // Offline CPU-cost mode: pack the snapshot but skip the transfer, because
    // an OfflineAudioContext's main thread is blocked and can never hand the
    // pooled buffer back. Measures capture + pack only; the transfer path is
    // measured by the realtime run instead.
    this.skipPost = !!options.processorOptions?.skipPost;
    // One flat capture ring for all taps, ONE shared write index — that shared
    // index is what makes every tap phase-coherent (spec §2).
    this.taps = this.tapCount > 0 ? new Float32Array(this.tapCount * RING) : null;
    this.tapWrite = 0;

    // Pre-allocated snapshot pool. Each entry is an ArrayBuffer; `views` caches
    // the Float32Array over it while we hold it (a view must be recreated after
    // the buffer is transferred and returned — that is the ONE allocation the
    // design cannot avoid, and it is counted below).
    this.pool = [];
    for (let i = 0; i < POOL; ++i) this.pool.push(new Float32Array(this.tapCount * WINDOW || 1));
    this.viewAllocs = 0;

    this.snapInterval = Math.max(1, Math.round(sampleRate / 60)); // ~60 Hz
    this.sinceSnap = 0;
    this.snapsSent = 0;
    this.poolStarved = 0;

    // ---- instrumentation --------------------------------------------------
    this.quanta = 0;
    this.durSum = 0;
    this.durMax = 0;
    this.overBudget = 0;      // process() took > 50% of the quantum budget
    this.late = 0;            // gap between callbacks > 1.5x quantum duration
    this.lastCallbackAt = 0;
    this.quantumMs = (128 / sampleRate) * 1000;
    this.buckets = new Uint32Array(20); // duration histogram, 0.1 ms buckets

    this.port.onmessage = (e) => this.onMessage(e.data);

    const wasmBinary = options.processorOptions?.wasmBinary;
    this.init(wasmBinary, options.processorOptions?.seed ?? 0x5eed12).catch((err) => {
      this.port.postMessage({ type: "error", message: String(err?.message || err) });
    });
  }

  async init(wasmBinary, seed) {
    this.module = await createRingsModule({
      wasmBinary,
      locateFile: (p) => p,
      instantiateWasm: (imports, callback) => {
        WebAssembly.instantiate(wasmBinary, imports)
          .then((r) => callback(r.instance, r.module))
          .catch((err) => this.port.postMessage({ type: "error", message: "WASM instantiate failed: " + err }));
        return {};
      },
    });
    this.bufPtr = this.module._rings_alloc(RINGS_BLOCK);
    this.bufView = new Int16Array(this.module.HEAP16.buffer, this.bufPtr, RINGS_BLOCK);
    this.module._rings_init(seed >>> 0);
    this.module._rings_set_model(0);
    this.ready = true;
    this.port.postMessage({ type: "ready", hasPerf: HAS_PERF, quantumMs: this.quantumMs });
  }

  onMessage(msg) {
    switch (msg.type) {
      case "gateOn":
        this.pendingStrums.push({ t: typeof msg.time === "number" ? msg.time : currentTime });
        break;
      case "returnBuffer":
        // Main thread handing the emptied snapshot buffer back. Recreate the
        // view (unavoidable: the old one detached on transfer) and re-pool it.
        this.pool.push(new Float32Array(msg.buffer));
        this.viewAllocs++;
        break;
      case "metrics":
        this.reportMetrics();
        break;
      case "reset":
        this.resetMetrics();
        break;
      case "dispose":
        this.disposed = true;
        if (this.module && this.bufPtr) { try { this.module._rings_free(this.bufPtr); } catch {} this.bufPtr = 0; }
        break;
    }
  }

  resetMetrics() {
    this.quanta = 0; this.durSum = 0; this.durMax = 0; this.overBudget = 0;
    this.late = 0; this.snapsSent = 0; this.poolStarved = 0; this.viewAllocs = 0;
    this.buckets.fill(0);
    this.lastCallbackAt = 0;
  }

  reportMetrics() {
    this.port.postMessage({
      type: "metrics",
      tapCount: this.tapCount,
      quanta: this.quanta,
      quantumMs: this.quantumMs,
      meanMs: this.quanta ? this.durSum / this.quanta : 0,
      maxMs: this.durMax,
      overBudget: this.overBudget,
      late: this.late,
      snapsSent: this.snapsSent,
      poolStarved: this.poolStarved,
      viewAllocs: this.viewAllocs,
      buckets: Array.from(this.buckets),
      hasPerf: HAS_PERF,
    });
  }

  renderBlock() {
    const m = this.module;
    m._rings_render(this.bufPtr, RINGS_BLOCK);
    const rb = this.rb, cap = rb.length;
    let w = this.rbWrite;
    for (let i = 0; i < RINGS_BLOCK; ++i) {
      rb[w] = this.bufView[i] / 32768;
      w = (w + 1) % cap;
    }
    this.rbWrite = w;
    this.rbCount += RINGS_BLOCK;

    // TAP CAPTURE. In the real engine each tap is a different operator's block;
    // here every tap copies this block, which costs exactly the same as the real
    // thing (spec §6.1 step 1: dummy taps, real cost).
    const taps = this.taps;
    if (taps) {
      const n = this.tapCount;
      let tw = this.tapWrite;
      for (let i = 0; i < RINGS_BLOCK; ++i) {
        const s = this.bufView[i] / 32768;
        for (let t = 0; t < n; ++t) taps[t * RING + tw] = s;
        tw = (tw + 1) % RING;
      }
      this.tapWrite = tw;
    }
  }

  nextSourceSample() {
    if (this.rbCount === 0) this.renderBlock();
    const s = this.rb[this.rbRead];
    this.rbRead = (this.rbRead + 1) % this.rb.length;
    this.rbCount -= 1;
    return s;
  }

  // Pack one phase-coherent snapshot of every tap and transfer it out.
  // Manual copy loops on purpose: subarray()/set() would allocate view objects
  // per tap per frame, which is exactly what this design is trying to avoid.
  sendSnapshot() {
    if (this.tapCount === 0) return;
    const view = this.skipPost ? this.pool[0] : this.pool.pop();
    if (!view) { this.poolStarved++; return; }
    const taps = this.taps, n = this.tapCount;
    const end = this.tapWrite;
    for (let t = 0; t < n; ++t) {
      const src = t * RING, dst = t * WINDOW;
      let r = (end - WINDOW + RING) % RING;
      for (let i = 0; i < WINDOW; ++i) {
        view[dst + i] = taps[src + r];
        r = r + 1 === RING ? 0 : r + 1;
      }
    }
    this.snapsSent++;
    if (this.skipPost) return;
    this.port.postMessage({ type: "snapshot", buffer: view.buffer, taps: n, window: WINDOW }, [view.buffer]);
  }

  process(_inputs, outputs, parameters) {
    if (this.disposed) return false;
    const output = outputs[0][0];
    if (!output) return true;
    if (!this.ready) { output.fill(0); return true; }

    const t0 = HAS_PERF ? performance.now() : 0;
    if (HAS_PERF && this.lastCallbackAt) {
      const gap = t0 - this.lastCallbackAt;
      if (gap > this.quantumMs * 1.5) this.late++;
    }

    const q = this.pendingStrums;
    while (q.length && q[0].t <= currentTime) { q.shift(); this.module._rings_strum(); }

    const m = this.module;
    m._rings_set_note(parameters.note[0]);
    m._rings_set_structure(clamp01(parameters.structure[0]));
    m._rings_set_brightness(clamp01(parameters.brightness[0]));
    m._rings_set_damping(clamp01(parameters.damping[0]));
    m._rings_set_position(clamp01(parameters.position[0]));

    const ratio = this.srcRatio;
    for (let i = 0; i < output.length; ++i) {
      output[i] = this.srcPrev + (this.srcCurr - this.srcPrev) * this.srcPhase;
      this.srcPhase += ratio;
      while (this.srcPhase >= 1) {
        this.srcPhase -= 1;
        this.srcPrev = this.srcCurr;
        this.srcCurr = this.nextSourceSample();
      }
    }

    this.sinceSnap += output.length;
    if (this.sinceSnap >= this.snapInterval) { this.sinceSnap = 0; this.sendSnapshot(); }

    if (HAS_PERF) {
      const dt = performance.now() - t0;
      this.quanta++;
      this.durSum += dt;
      if (dt > this.durMax) this.durMax = dt;
      if (dt > this.quantumMs * 0.5) this.overBudget++;
      const b = Math.min(19, (dt * 10) | 0);
      this.buckets[b]++;
      this.lastCallbackAt = performance.now();
    } else {
      this.quanta++;
    }
    return true;
  }
}

registerProcessor("tap-spike", TapSpikeProcessor);
