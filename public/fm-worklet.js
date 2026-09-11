// fm-worklet.js — AudioWorkletProcessor that runs the FM (msfa) WASM engine.
//
// Loaded by the main thread via:
//     await ctx.audioWorklet.addModule('/fm-worklet.js');
// then new AudioWorkletNode(ctx, 'fm', { processorOptions: { wasmBinary } }).
//
// Hand-maintained plain JS (stays out of the Vite bundle). The TypeScript
// engine wrapper lives in src/audio/engines/FmEngine.ts. Mirrors
// rings-worklet.js; the differences are all consequences of FM being a
// keyboard voice rather than a resonator:
//
//  - Native rate is 44100, NOT 48000. msfa's Env has no sample-rate input —
//    its increments are per-block constants calibrated at 44.1 kHz — so the
//    engine runs at its calibration rate and this worklet resamples to the
//    context rate. See dsp/shim/fm_shim.cc and spec §1. Do not "fix" this.
//  - Render block is 64 samples (msfa's compile-time N), read from the wasm
//    via _fm_block_size() rather than hardcoded, so a rebuild with a different
//    LG_N cannot silently desynchronise the ring buffer.
//  - A note is a HELD GATE: gateOn/gateOff both matter, and note-off is what
//    starts the operator envelopes' release stage.
//  - The patch is data, not a wasm-side enum: the model corpus lives in TS
//    (src/data/fm-models.ts) and arrives here as 156 unpacked bytes.
//
// Phase 7 will add the tap snapshot loop (spec §2) to this file. It is not
// here yet, and nothing in the default app path pays for it.

import createFmModule from "./fm.js";

const FM_RATE = 44100;
const RB_BLOCKS = 64;             // ring-buffer capacity in engine blocks

class FmProcessor extends AudioWorkletProcessor {
  static get parameterDescriptors() {
    return [
      // Pitch bend in semitones. msfa hardcodes a +/-3 semitone range inside
      // Dx7Note::compute, so the shim maps onto that; the bounds here match it
      // instead of pretending to a wider range we cannot deliver.
      { name: "bend", defaultValue: 0, minValue: -3, maxValue: 3, automationRate: "k-rate" },
    ];
  }

  constructor(options) {
    super();
    this.ready = false;
    this.disposed = false;
    this.module = null;
    this.bufPtr = 0;
    this.bufView = null;
    this.patchPtr = 0;
    this.block = 64;              // replaced by _fm_block_size() at init

    this.rb = null;               // allocated at init, once block size is known
    this.rbRead = 0;
    this.rbWrite = 0;
    this.rbCount = 0;

    this.srcRatio = FM_RATE / sampleRate;
    this.srcPhase = 0;
    this.srcPrev = 0;
    this.srcCurr = 0;

    this.lastBend = 0;

    // A patch posted before the wasm is up (the engine seeds its initial model
    // during init) is held here and applied as soon as the module exists.
    this.pendingPatch = null;

    // Scheduled note events { t, on, midi, vel }, sorted ascending by time.
    this.pendingEvents = [];

    this.port.onmessage = (e) => this.onMessage(e.data);

    const wasmBinary = options.processorOptions?.wasmBinary;
    this.init(wasmBinary).catch((err) => {
      this.port.postMessage({ type: "error", message: String(err?.message || err) });
    });
  }

  async init(wasmBinary) {
    this.module = await createFmModule({
      wasmBinary,
      locateFile: (p) => p,
      instantiateWasm: (imports, callback) => {
        WebAssembly.instantiate(wasmBinary, imports)
          .then((result) => callback(result.instance, result.module))
          .catch((err) => {
            this.port.postMessage({ type: "error", message: "WASM instantiate failed: " + (err?.message || err) });
          });
        return {};
      },
    });

    const m = this.module;

    // The engine is initialised at its calibrated rate, not the context rate.
    m._fm_init(FM_RATE);

    this.block = m._fm_block_size() | 0;
    if (this.block <= 0) throw new Error("fm_block_size returned " + this.block);

    this.bufPtr = m._fm_alloc(this.block);
    if (!this.bufPtr) throw new Error("fm_alloc returned NULL");
    this.bufView = new Int16Array(m.HEAP16.buffer, this.bufPtr, this.block);

    // 156 bytes: one unpacked patch. Allocated once — setPatch must not
    // allocate, because it can arrive while audio is running.
    this.patchPtr = m._malloc(156);
    if (!this.patchPtr) throw new Error("malloc(156) returned NULL for the patch buffer");

    this.rb = new Float32Array(this.block * RB_BLOCKS);

    if (this.pendingPatch) {
      this.writePatch(this.pendingPatch);
      this.pendingPatch = null;
    }

    this.ready = true;
    this.port.postMessage({ type: "ready", blockSize: this.block });
  }

  /**
   * Copy 156 unpacked patch bytes into the wasm heap and hand them to the shim.
   *
   * Always via _fm_update_patch, which applies the new patch to the note
   * already sounding instead of waiting for the next note-on, and degrades to a
   * plain load when nothing is playing. That live path exists because of a
   * local addition to the vendored engine (Dx7Note::update) — see
   * dsp/shim/fm_shim.cc and dsp/vendor/msfa/README.md.
   */
  writePatch(bytes) {
    const m = this.module;
    if (!m || !this.patchPtr) return;
    const n = Math.min(156, bytes.length);
    m.HEAPU8.set(bytes.subarray(0, n), this.patchPtr);
    m._fm_update_patch(this.patchPtr, n);
  }

  onMessage(msg) {
    switch (msg.type) {
      case "setPatch": {
        // Applied to the note already sounding, if there is one.
        const bytes = msg.bytes instanceof Uint8Array ? msg.bytes : new Uint8Array(msg.bytes);
        if (this.ready) this.writePatch(bytes);
        else this.pendingPatch = bytes;
        break;
      }
      case "gateOn": {
        const when = typeof msg.time === "number" ? msg.time : currentTime;
        this.queueEvent({ t: when, on: true, midi: msg.midi | 0, vel: msg.velocity | 0 });
        break;
      }
      case "gateOff": {
        const when = typeof msg.time === "number" ? msg.time : currentTime;
        this.queueEvent({ t: when, on: false, midi: 0, vel: 0 });
        break;
      }
      case "allNotesOff":
        // Panic: drop everything queued and release now. Unlike Rings (whose
        // panic is ring-out), FM has a real gate to close, so closing it is
        // the honest behaviour — the operator envelopes' release still runs,
        // so it is a release, not a hard cut.
        this.pendingEvents.length = 0;
        if (this.ready) this.module._fm_note_off();
        break;
      case "dispose":
        // Engine swap: stop rendering and free both heap buffers (see the
        // plaits-worklet note — without this the processor leaks per swap).
        this.disposed = true;
        if (this.module) {
          if (this.bufPtr) { try { this.module._fm_free(this.bufPtr); } catch {} this.bufPtr = 0; }
          if (this.patchPtr) { try { this.module._free(this.patchPtr); } catch {} this.patchPtr = 0; }
          this.bufView = null;
        }
        break;
    }
  }

  queueEvent(ev) {
    const q = this.pendingEvents;
    let i = q.length;
    while (i > 0 && q[i - 1].t > ev.t) i--;
    q.splice(i, 0, ev);
  }

  // Fire every event whose time has arrived, in order. Monophonic: a note-on
  // while a note is sounding retriggers the voice, which is what msfa's
  // Dx7Note::init does and what a mono keyboard does.
  applyDueEvents() {
    const m = this.module;
    const q = this.pendingEvents;
    while (q.length && q[0].t <= currentTime) {
      const ev = q.shift();
      if (ev.on) m._fm_note_on(ev.midi, ev.vel);
      else m._fm_note_off();
    }
  }

  /** Render one engine block at 44.1 kHz into the ring buffer. */
  renderBlock() {
    const m = this.module;
    const n = this.block;
    m._fm_render(this.bufPtr, n);
    const rb = this.rb, cap = rb.length;
    let w = this.rbWrite;
    for (let i = 0; i < n; ++i) {
      rb[w] = this.bufView[i] / 32768;
      w = (w + 1) % cap;
    }
    this.rbWrite = w;
    this.rbCount += n;
  }

  nextSourceSample() {
    if (this.rbCount === 0) this.renderBlock();
    const s = this.rb[this.rbRead];
    this.rbRead = (this.rbRead + 1) % this.rb.length;
    this.rbCount -= 1;
    return s;
  }

  process(_inputs, outputs, parameters) {
    if (this.disposed) return false;
    const output = outputs[0][0];
    if (!output) return true;
    if (!this.ready) { output.fill(0); return true; }

    this.applyDueEvents();

    // Pitch bend is the one k-rate param this phase has. Only push it when it
    // moves — the shim's setter is cheap but not free, and bend sits at 0 for
    // the overwhelming majority of quanta.
    const bend = parameters.bend[0];
    if (bend !== this.lastBend) {
      this.lastBend = bend;
      this.module._fm_set_pitch_bend(bend);
    }

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
    return true;
  }
}

registerProcessor("fm", FmProcessor);
