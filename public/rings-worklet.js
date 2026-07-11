// rings-worklet.js — AudioWorkletProcessor that runs the Rings WASM engine.
//
// Loaded by the main thread via:
//     await ctx.audioWorklet.addModule('/rings-worklet.js');
// then new AudioWorkletNode(ctx, 'rings', { processorOptions: { wasmBinary } }).
//
// Hand-maintained plain JS (stays out of the Vite bundle). The TypeScript
// engine wrapper lives in src/audio/engines/RingsEngine.ts. Mirrors
// plaits-worklet.js; differences are noted inline.
//
// Rings specifics:
//  - Native 48 kHz, rendered in fixed 24-sample blocks (kMaxBlockSize).
//  - Rings is a resonator: a note is a STRUM (one-shot strike), not a held
//    gate. There is no note-off — DAMPING is the release. gateOff is accepted
//    for protocol parity with the other engines and does nothing.
//  - No retrig-gap machinery (Plaits needs a low→high trigger edge; a strum
//    is already a discrete event the shim consumes once per block).

import createRingsModule from "./rings.js";

const RINGS_RATE = 48000;
const RINGS_BLOCK = 24;
const RB_BLOCKS = 64;             // ring-buffer capacity (stays near-empty in practice)

const clamp01 = (x) => (x < 0 ? 0 : x > 1 ? 1 : x);

class RingsProcessor extends AudioWorkletProcessor {
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
    this.rbRead = 0;
    this.rbWrite = 0;
    this.rbCount = 0;

    this.srcRatio = RINGS_RATE / sampleRate;
    this.srcPhase = 0;
    this.srcPrev = 0;
    this.srcCurr = 0;

    this.pendingModel = 0;

    // Scheduled strums { t }, sorted ascending by time.
    this.pendingStrums = [];

    this.port.onmessage = (e) => this.onMessage(e.data);

    const wasmBinary = options.processorOptions?.wasmBinary;
    const seed = options.processorOptions?.seed ?? 0x5eed12;
    this.init(wasmBinary, seed).catch((err) => {
      this.port.postMessage({ type: "error", message: String(err?.message || err) });
    });
  }

  async init(wasmBinary, seed) {
    this.module = await createRingsModule({
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
    this.bufPtr = this.module._rings_alloc(RINGS_BLOCK);
    if (!this.bufPtr) throw new Error("rings_alloc returned NULL");
    this.bufView = new Int16Array(this.module.HEAP16.buffer, this.bufPtr, RINGS_BLOCK);
    this.module._rings_init(seed >>> 0);
    this.module._rings_set_model(this.pendingModel);
    this.ready = true;
    this.port.postMessage({ type: "ready" });
  }

  onMessage(msg) {
    const m = this.module;
    switch (msg.type) {
      case "setModel":
        this.pendingModel = msg.value | 0;
        if (this.ready) m._rings_set_model(this.pendingModel);
        break;
      case "gateOn": {
        const when = typeof msg.time === "number" ? msg.time : currentTime;
        this.queueStrum(when);
        break;
      }
      case "gateOff":
        // Resonator rings out on its own; DAMPING is the release. No-op.
        break;
      case "clearStrikes":
        // Panic: drop scheduled strums. The current ring-out is left to decay —
        // there is no gate to close on a resonator.
        this.pendingStrums.length = 0;
        break;
      case "dispose":
        // Engine swap: stop rendering and free the WASM heap buffer (see the
        // plaits-worklet note — without this the processor leaks per swap).
        this.disposed = true;
        if (this.module && this.bufPtr) {
          try { this.module._rings_free(this.bufPtr); } catch {}
          this.bufPtr = 0;
          this.bufView = null;
        }
        break;
    }
  }

  queueStrum(t) {
    const q = this.pendingStrums;
    let i = q.length;
    while (i > 0 && q[i - 1].t > t) i--;
    q.splice(i, 0, { t });
  }

  // Fire every strum whose time has arrived. The shim latches one pending
  // strum per rendered block, so back-to-back strums in one quantum coalesce —
  // same behaviour as strumming the hardware faster than a block.
  applyDueStrums() {
    const q = this.pendingStrums;
    while (q.length && q[0].t <= currentTime) {
      q.shift();
      this.module._rings_strum();
    }
  }

  // Render one 24-sample block at 48 kHz into the ring buffer.
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

    // Fire due strums at the quantum boundary, then push the k-rate params
    // into the WASM globals (read by renderBlock() during this quantum).
    this.applyDueStrums();
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
    return true;
  }
}

registerProcessor("rings", RingsProcessor);
