// braids-worklet.js — AudioWorkletProcessor that runs the Braids WASM engine.
//
// Loaded by the main thread via:
//     await ctx.audioWorklet.addModule('/braids-worklet.js');
// then a new AudioWorkletNode(ctx, 'braids', { processorOptions: { wasmBinary } })
// passes the pre-fetched WASM binary, so we don't depend on URL resolution
// inside the worklet (which is fussy across browsers).
//
// This file is hand-maintained plain JS so it stays out of the Vite bundle
// pipeline. The TypeScript engine wrapper lives in src/audio/engines/BraidsEngine.ts.

import createBraidsModule from "./braids.js";

const BRAIDS_RATE = 96000;
const BRAIDS_BLOCK = 24;
const RB_BLOCKS = 64;                 // ring buffer = 1536 samples ≈ 16 ms

const clamp01 = (x) => x < 0 ? 0 : x > 1 ? 1 : x;

class BraidsProcessor extends AudioWorkletProcessor {
  static get parameterDescriptors() {
    return [
      { name: "pitch",  defaultValue: 60,   minValue: 0,   maxValue: 127, automationRate: "k-rate" },
      { name: "timbre", defaultValue: 0.5,  minValue: 0,   maxValue: 1,   automationRate: "k-rate" },
      { name: "color",  defaultValue: 0.5,  minValue: 0,   maxValue: 1,   automationRate: "k-rate" },
      { name: "fm",     defaultValue: 0,    minValue: -12, maxValue: 12,  automationRate: "k-rate" },
    ];
  }

  constructor(options) {
    super();
    this.ready = false;
    this.disposed = false;
    this.module = null;
    this.bufPtr = 0;
    this.bufView = null;

    this.rb = new Float32Array(BRAIDS_BLOCK * RB_BLOCKS);
    this.rbRead = 0;
    this.rbWrite = 0;
    this.rbCount = 0;

    this.srcRatio = BRAIDS_RATE / sampleRate;
    this.srcPhase = 0;
    this.srcPrev = 0;
    this.srcCurr = 0;

    this.activeShape = 0;
    this.pendingShape = 0;

    // Strikes scheduled for a future AudioContext time, kept sorted ascending.
    // Each entry is { t, pitchQ7 }: the scheduled time and the note's pitch in
    // Q7 (midi << 7). Drained in process() when the render clock reaches the
    // entry — see process() for why the strike carries its own pitch instead of
    // trusting the k-rate `pitch` param to be current (the grace-note race).
    this.pendingStrikes = [];

    this.port.onmessage = (e) => this.onMessage(e.data);

    const wasmBinary = options.processorOptions?.wasmBinary;
    const seed = options.processorOptions?.signatureSeed ?? 0xC0FFEE;
    this.init(wasmBinary, seed).catch((err) => {
      this.port.postMessage({ type: "error", message: String(err?.message || err) });
    });
  }

  async init(wasmBinary, seed) {
    // Bypass emscripten's URL/fetch pipeline entirely — AudioWorkletGlobalScope
    // is too restricted for it. We pre-compile the binary ourselves and hand
    // the instance back to emscripten via instantiateWasm.
    this.module = await createBraidsModule({
      wasmBinary,
      locateFile: (p) => p,
      instantiateWasm: (imports, callback) => {
        WebAssembly.instantiate(wasmBinary, imports)
          .then((result) => callback(result.instance, result.module))
          .catch((err) => {
            this.port.postMessage({ type: "error", message: "WASM instantiate failed: " + (err?.message || err) });
          });
        return {}; // synchronous return — instance arrives via callback
      },
    });
    this.bufPtr = this.module._braids_alloc(BRAIDS_BLOCK);
    if (!this.bufPtr) throw new Error("braids_alloc returned NULL");
    this.bufView = new Int16Array(this.module.HEAP16.buffer, this.bufPtr, BRAIDS_BLOCK);
    this.module._braids_init(seed >>> 0);
    this.module._braids_set_shape(this.pendingShape);
    this.activeShape = this.pendingShape;
    this.module._braids_set_pitch(69 << 7);                  // A4
    this.module._braids_set_parameters(16384, 16384);
    this.ready = true;
    this.port.postMessage({ type: "ready" });
  }

  onMessage(msg) {
    switch (msg.type) {
      case "setShape":
        this.pendingShape = msg.value | 0;
        if (this.ready) {
          this.module._braids_set_shape(this.pendingShape);
          this.activeShape = this.pendingShape;
        }
        break;
      case "gateOn": {
        if (!this.ready) break;
        // Queue every strike (even an already-due one) so process() fires it on
        // a render-quantum boundary with its own pitch applied. A bare/manual
        // trigger with no time defaults to "now" → fires on the next quantum
        // (<2.7 ms later, inaudible). pitchQ7 = midi << 7; null if unspecified.
        const when = typeof msg.time === "number" ? msg.time : currentTime;
        const pitchQ7 = typeof msg.pitch === "number" ? Math.round(msg.pitch * 128) : null;
        const q = this.pendingStrikes;
        let i = q.length;
        while (i > 0 && q[i - 1].t > when) i--;
        q.splice(i, 0, { t: when, pitchQ7 });
        break;
      }
      case "clearStrikes":
        this.pendingStrikes.length = 0;
        break;
      case "gateOff":
        // Voice silencing handled at the engine layer via output-gain ramp.
        break;
      case "setBits":
        if (this.ready) this.module._braids_set_bits(msg.value | 0);
        break;
      case "setSampleRateKhz":
        if (this.ready) this.module._braids_set_sample_rate_khz(msg.value | 0);
        break;
      case "setSignature":
        if (this.ready) this.module._braids_set_signature(msg.value | 0);
        break;
      case "setDrift":
        if (this.ready) this.module._braids_set_drift(msg.value | 0);
        break;
      case "setEnvelopeShape":
        // msg.attack and msg.decay are 0..127 (LUT indices).
        if (this.ready) this.module._braids_set_envelope_shape(msg.attack | 0, msg.decay | 0);
        break;
      case "setAdAmounts":
        // Each amount is 0..127, matching the firmware setting range.
        if (this.ready) {
          this.module._braids_set_ad_amounts(
            msg.vca | 0, msg.timbre | 0, msg.color | 0, msg.fm | 0
          );
        }
        break;
      case "dispose":
        // Engine swap: stop rendering and free the WASM heap buffer. Without
        // this, process() returns true forever and Chromium keeps this disposed
        // processor (+ its WASM instance) rendering on the audio thread — one
        // leaked DSP per engine swap (Surprise = one tap each).
        this.disposed = true;
        if (this.module && this.bufPtr) {
          try { this.module._braids_free(this.bufPtr); } catch {}
          this.bufPtr = 0;
          this.bufView = null;
        }
        break;
    }
  }

  // Render one 24-sample block at 96 kHz into the ring buffer.
  renderBlock(pitchQ7, timbre01, color01, fmSemi) {
    const m = this.module;
    const pitch = (pitchQ7 + (fmSemi * 128)) | 0;
    m._braids_set_pitch(pitch);
    m._braids_set_parameters(Math.round(timbre01 * 32767), Math.round(color01 * 32767));
    m._braids_render(this.bufPtr, BRAIDS_BLOCK);
    const rb = this.rb, cap = rb.length;
    let w = this.rbWrite;
    for (let i = 0; i < BRAIDS_BLOCK; ++i) {
      rb[w] = this.bufView[i] / 32768;
      w = (w + 1) % cap;
    }
    this.rbWrite = w;
    this.rbCount += BRAIDS_BLOCK;
  }

  // Pull one source sample, rendering more if the ring buffer is empty.
  nextSourceSample(pitchQ7, t, c, fm) {
    if (this.rbCount === 0) this.renderBlock(pitchQ7, t, c, fm);
    const s = this.rb[this.rbRead];
    this.rbRead = (this.rbRead + 1) % this.rb.length;
    this.rbCount -= 1;
    return s;
  }

  process(_inputs, outputs, parameters) {
    // Disposed → return false so the node loses its active-source flag and is
    // garbage-collected instead of rendering forever (engine-swap DSP leak).
    if (this.disposed) return false;

    const output = outputs[0][0];
    if (!output) return true;

    if (!this.ready) { output.fill(0); return true; }

    // Fire any strikes whose scheduled time has arrived. currentTime is the
    // start of this render quantum. We can't trust the k-rate `pitch` param to
    // already hold the new note's value here: the strike condition (queued time
    // ≤ currentTime, a JS double compare) and the param's own update (frame-based
    // inside the browser) can disagree by a sub-quantum margin at the boundary,
    // so the strike sometimes lands one quantum before the param flips — which
    // re-articulated the *previous* pitch (the grace note). So the strike
    // carries its own pitch and we override this quantum's render pitch with it.
    // Multiple due strikes collapse into one re-trigger (monophonic; the most
    // recent note's pitch wins).
    let strikePitchQ7 = null;
    const q = this.pendingStrikes;
    if (q.length && q[0].t <= currentTime) {
      let fired = null;
      while (q.length && q[0].t <= currentTime) fired = q.shift();
      this.module._braids_strike();
      if (fired && fired.pitchQ7 !== null) strikePitchQ7 = fired.pitchQ7;
    }

    const midi = parameters.pitch[0];
    // Use the strike's pitch on its own quantum; the k-rate param is authoritative
    // from the next quantum on (and for held-note pitch bend between strikes).
    const pitchQ7 = strikePitchQ7 !== null ? strikePitchQ7 : Math.round(midi * 128);
    const t = clamp01(parameters.timbre[0]);
    const c = clamp01(parameters.color[0]);
    const fm = parameters.fm[0];
    const ratio = this.srcRatio;

    for (let i = 0; i < output.length; ++i) {
      output[i] = this.srcPrev + (this.srcCurr - this.srcPrev) * this.srcPhase;
      this.srcPhase += ratio;
      while (this.srcPhase >= 1) {
        this.srcPhase -= 1;
        this.srcPrev = this.srcCurr;
        this.srcCurr = this.nextSourceSample(pitchQ7, t, c, fm);
      }
    }
    return true;
  }
}

registerProcessor("braids", BraidsProcessor);
