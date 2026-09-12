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
// --- Taps: the snapshot protocol (spec §2) ---------------------------
// Off by default. Nothing below runs, and nothing is allocated, until the main
// thread sends { type: "taps", on: true } -- which only the flowsheet view does.
//
// While on: every engine block that is rendered also drops eight traces
// (operators 1-6 in PANEL numbering, the feedback wire, the voice output) into
// eight capture rings. The rings share ONE write pointer, so all eight always
// hold the same time span -- phase coherence between traces is the pedagogy
// ("watch them lock at 2:1 and drift at 2.01:1"), and it only works if every
// trace is sampled at identical offsets.
//
// Roughly once per display frame, one window from each ring is packed into a
// pooled ArrayBuffer and posted as a TRANSFERABLE. The main thread reads it and
// transfers the emptied buffer back, so the same few buffers circulate forever.
// Capture is at the engine's own 44.1 kHz, before the resampler -- the true
// signal in msfa's block domain, not the 128-sample render quantum.
//
// What allocates, honestly: nothing per sample and no buffers, but postMessage
// needs a message object, so there is one small short-lived object per frame
// (~60/s). The sample data itself never allocates after the first enable.
//
// Not done here, on purpose: no decimation (naive decimation aliases, and an
// aliased modulator trace would be a lie about the signal) and no triggering.
// Both are draw-time concerns and belong on the main thread.

import createFmModule from "./fm.js";

const FM_RATE = 44100;
const RB_BLOCKS = 64;             // ring-buffer capacity in engine blocks

const TAP_WINDOW = 1024;          // samples per trace in one snapshot (~23 ms)
const TAP_RING = 2048;            // capture ring per trace: a window plus slack
const TAP_POOL = 3;               // snapshot buffers in circulation
const TAP_FRAME = Math.round(FM_RATE / 60);   // emit cadence, in engine samples

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

    // Taps. `tapsOn` gates the capture; `taps` holds everything it needs and
    // stays null until the first enable, so the default app path allocates
    // nothing for a view it never opens.
    this.tapsOn = false;
    this.taps = null;
    this.pendingTaps = false;     // enable arriving before the wasm is up

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

    if (this.pendingTaps) {
      this.pendingTaps = false;
      this.setTaps(true);
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

  /**
   * Turn tap capture on or off.
   *
   * Everything is allocated on the FIRST enable and then kept: the wasm-side
   * float block, the eight capture rings, and the snapshot pool. That happens
   * here, on a message, never inside process() -- which is the one hard rule
   * this protocol has. Turning taps off afterwards only clears the shim's
   * pointer (so not one extra instruction runs inside the engine) and keeps the
   * memory, because the flowsheet gets opened and closed repeatedly and
   * re-allocating each time would be churn for nothing.
   */
  setTaps(on) {
    const m = this.module;
    if (!m) { this.pendingTaps = !!on; return; }

    if (!on) {
      this.tapsOn = false;
      m._fm_set_tap_buffer(0);
      return;
    }

    if (!this.taps) {
      const count = m._fm_tap_count() | 0;
      const ptr = m._fm_tap_alloc();
      if (!ptr || count <= 0) {
        this.port.postMessage({ type: "error", message: "fm_tap_alloc failed" });
        return;
      }
      const rings = [];
      for (let t = 0; t < count; ++t) rings.push(new Float32Array(TAP_RING));
      const pool = [];
      for (let i = 0; i < TAP_POOL; ++i) {
        const buf = new ArrayBuffer(count * TAP_WINDOW * 4);
        pool.push({ buf, view: new Float32Array(buf) });
      }
      this.taps = {
        count,
        ptr,
        // One view over the shim's tap block for all `count` traces. The heap
        // cannot move (ALLOW_MEMORY_GROWTH=0), so caching this is safe.
        view: new Float32Array(m.HEAPF32.buffer, ptr, count * this.block),
        rings,
        w: 0,          // shared write cursor: every trace holds the same span
        filled: 0,     // samples captured since enable, capped at TAP_RING
        acc: 0,        // engine samples since the last snapshot
        pool,
        frame: 0,
        dropped: 0,    // frames skipped because the pool was empty
      };
    }

    const t = this.taps;
    t.w = 0;
    t.filled = 0;
    t.acc = 0;
    m._fm_set_tap_buffer(t.ptr);
    this.tapsOn = true;
  }

  /** Copy this block's traces into the rings. Called once per engine block. */
  captureTaps() {
    const t = this.taps;
    const n = this.block;
    const view = t.view;
    const rings = t.rings;
    for (let k = 0; k < t.count; ++k) {
      const ring = rings[k];
      const src = k * n;
      let w = t.w;
      for (let i = 0; i < n; ++i) {
        ring[w] = view[src + i];
        w = w + 1 === TAP_RING ? 0 : w + 1;
      }
      if (k === t.count - 1) t.w = w;
    }
    t.filled = Math.min(TAP_RING, t.filled + n);
    t.acc += n;
    if (t.acc >= TAP_FRAME && t.filled >= TAP_WINDOW) {
      t.acc = 0;
      this.emitTapSnapshot();
    }
  }

  /**
   * Pack the most recent window of every trace into a pooled buffer and hand it
   * over. Copied with explicit loops rather than subarray/set: a subarray is a
   * small allocation, and this runs inside process().
   *
   * If the pool is empty the main thread has not returned a buffer yet, so the
   * frame is dropped. Dropping a frame of a 60 Hz display refresh is invisible;
   * allocating a new buffer on the audio thread to avoid it would not be.
   */
  emitTapSnapshot() {
    const t = this.taps;
    const slot = t.pool.pop();
    if (!slot) { t.dropped++; return; }

    const view = slot.view;
    let start = t.w - TAP_WINDOW;
    if (start < 0) start += TAP_RING;
    for (let k = 0; k < t.count; ++k) {
      const ring = t.rings[k];
      const out = k * TAP_WINDOW;
      let r = start;
      for (let i = 0; i < TAP_WINDOW; ++i) {
        view[out + i] = ring[r];
        r = r + 1 === TAP_RING ? 0 : r + 1;
      }
    }

    this.port.postMessage({
      type: "taps",
      frame: t.frame++,
      time: currentTime,
      rate: FM_RATE,
      count: t.count,
      window: TAP_WINDOW,
      dropped: t.dropped,
      buffer: slot.buf,
    }, [slot.buf]);
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
      case "taps":
        // { on: true } only from the flowsheet view; everything else pays nothing.
        this.setTaps(!!msg.on);
        break;
      case "tapReturn": {
        // The emptied snapshot buffer, transferred back. Its view died with the
        // transfer, so a fresh one is made here -- on the message path, never in
        // process().
        const t = this.taps;
        const buf = msg.buffer;
        if (t && buf && buf.byteLength === t.count * TAP_WINDOW * 4 && t.pool.length < TAP_POOL) {
          t.pool.push({ buf, view: new Float32Array(buf) });
        }
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
        this.tapsOn = false;
        if (this.module) {
          try { this.module._fm_set_tap_buffer(0); } catch {}
          if (this.taps?.ptr) { try { this.module._fm_tap_free(this.taps.ptr); } catch {} }
          if (this.bufPtr) { try { this.module._fm_free(this.bufPtr); } catch {} this.bufPtr = 0; }
          if (this.patchPtr) { try { this.module._free(this.patchPtr); } catch {} this.patchPtr = 0; }
          this.bufView = null;
          this.taps = null;
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
    // Captured here, one engine block at a time, because that is the only place
    // the shim's tap buffer is guaranteed fresh -- it holds exactly one block.
    if (this.tapsOn) this.captureTaps();
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
