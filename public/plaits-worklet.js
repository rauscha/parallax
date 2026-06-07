// plaits-worklet.js — AudioWorkletProcessor that runs the Plaits WASM engine.
//
// Loaded by the main thread via:
//     await ctx.audioWorklet.addModule('/plaits-worklet.js');
// then new AudioWorkletNode(ctx, 'plaits', { processorOptions: { wasmBinary } }).
//
// Hand-maintained plain JS (stays out of the Vite bundle). The TypeScript engine
// wrapper lives in src/audio/engines/PlaitsEngine.ts. Mirrors braids-worklet.js;
// differences are noted inline.
//
// Plaits specifics:
//  - Native 48 kHz, rendered in fixed 12-sample blocks (kBlockSize). The shim's
//    envelope/trigger timing assumes exactly one block per Voice::Render call.
//  - Amplitude is handled INSIDE Plaits (its low-pass gate), not by a JS gain
//    ramp — so there's no drone at rest and no separate envelope to manage here.
//  - A note is a TRIGGER edge + a held LEVEL. Percussive engines only strike on
//    a clean low→high trigger edge, so a note-on that interrupts a held note
//    forces a brief trigger-low "gap" to manufacture that edge (RETRIG_BLOCKS).

import createPlaitsModule from "./plaits.js";

const PLAITS_RATE = 48000;
const PLAITS_BLOCK = 12;
const RB_BLOCKS = 128;            // ring-buffer capacity (stays near-empty in practice)
const RETRIG_BLOCKS = 6;          // hold trigger low this many blocks to force a strike edge
const CHIPTUNE_ENGINE = 7;        // the one engine whose note-decay we drive (see applyChiptuneEnv)

const clamp01 = (x) => (x < 0 ? 0 : x > 1 ? 1 : x);

class PlaitsProcessor extends AudioWorkletProcessor {
  static get parameterDescriptors() {
    return [
      { name: "note",      defaultValue: 48,  minValue: 0, maxValue: 127, automationRate: "k-rate" },
      { name: "harmonics", defaultValue: 0.5, minValue: 0, maxValue: 1,   automationRate: "k-rate" },
      { name: "timbre",    defaultValue: 0.5, minValue: 0, maxValue: 1,   automationRate: "k-rate" },
      { name: "morph",     defaultValue: 0.5, minValue: 0, maxValue: 1,   automationRate: "k-rate" },
    ];
  }

  constructor(options) {
    super();
    this.ready = false;
    this.module = null;
    this.bufPtr = 0;
    this.bufView = null;

    this.rb = new Float32Array(PLAITS_BLOCK * RB_BLOCKS);
    this.rbRead = 0;
    this.rbWrite = 0;
    this.rbCount = 0;

    this.srcRatio = PLAITS_RATE / sampleRate;
    this.srcPhase = 0;
    this.srcPrev = 0;
    this.srcCurr = 0;

    this.pendingEngine = 0;
    this.decayValue = 0.5;            // mirrors PlaitsEngine's Decay default; drives Chiptune's note-decay

    // Gate state. gateLevel = held velocity (0 = note off). triggerHigh tracks
    // the last trigger value we wrote, so a new note knows whether it must force
    // a low gap to re-strike. retrigCountdown = blocks left to hold trigger low.
    this.gateLevel = 0;
    this.triggerHigh = false;
    this.retrigCountdown = 0;

    // Scheduled gate events { t, on, velocity }, sorted ascending by time.
    this.pendingGates = [];

    this.port.onmessage = (e) => this.onMessage(e.data);

    const wasmBinary = options.processorOptions?.wasmBinary;
    const seed = options.processorOptions?.seed ?? 0xC0FFEE;
    this.init(wasmBinary, seed).catch((err) => {
      this.port.postMessage({ type: "error", message: String(err?.message || err) });
    });
  }

  async init(wasmBinary, seed) {
    this.module = await createPlaitsModule({
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
    this.bufPtr = this.module._plaits_alloc(PLAITS_BLOCK);
    if (!this.bufPtr) throw new Error("plaits_alloc returned NULL");
    this.bufView = new Int16Array(this.module.HEAP16.buffer, this.bufPtr, PLAITS_BLOCK);
    this.module._plaits_init(seed >>> 0);
    this.module._plaits_set_engine(this.pendingEngine);
    this.ready = true;
    this.applyChiptuneEnv();
    this.port.postMessage({ type: "ready" });
  }

  onMessage(msg) {
    const m = this.module;
    switch (msg.type) {
      case "setEngine":
        this.pendingEngine = msg.value | 0;
        if (this.ready) { m._plaits_set_engine(this.pendingEngine); this.applyChiptuneEnv(); }
        break;
      case "setHarmonics":   // (also available as a k-rate param; message kept for parity)
        if (this.ready) m._plaits_set_harmonics(clamp01(msg.value));
        break;
      case "setDecay":
        this.decayValue = clamp01(msg.value);
        if (this.ready) { m._plaits_set_decay(this.decayValue); this.applyChiptuneEnv(); }
        break;
      case "setLpgColour":
        if (this.ready) m._plaits_set_lpg_colour(clamp01(msg.value));
        break;
      case "gateOn": {
        const when = typeof msg.time === "number" ? msg.time : currentTime;
        const vel = typeof msg.velocity === "number" ? msg.velocity : 0.8;
        this.queueGate(when, true, vel);
        break;
      }
      case "gateOff": {
        const when = typeof msg.time === "number" ? msg.time : currentTime;
        this.queueGate(when, false, 0);
        break;
      }
      case "clearStrikes":
        // Panic: drop scheduled gates and hard-close the voice now.
        this.pendingGates.length = 0;
        this.gateLevel = 0;
        break;
    }
  }

  // Chiptune (engine 7) bypasses the low-pass gate, so note-off gives no release —
  // its amplitude comes from an internal one-shot decay whose time is set by
  // patch.timbre_modulation_amount (voice.cc repurposes that field for this engine
  // only). At 0 the decay coefficient is exactly 1.0, so the note drones forever;
  // we map the Decay knob onto it instead: knob down = short pluck, up = long-but-
  // finite ring. Every other engine keeps it at 0 (there it would sweep TIMBRE).
  applyChiptuneEnv() {
    if (!this.ready || !this.module) return;
    let shape = 0;
    if (this.pendingEngine === CHIPTUNE_ENGINE) {
      const inv = 1 - clamp01(this.decayValue);
      shape = 0.04 + inv * inv * 0.96;   // decay=1 -> 0.04 (~10s); decay=0 -> 1.0 (~16ms pluck)
    }
    this.module._plaits_set_timbre_mod_amount(shape);
  }

  queueGate(t, on, velocity) {
    const q = this.pendingGates;
    let i = q.length;
    while (i > 0 && q[i - 1].t > t) i--;
    q.splice(i, 0, { t, on, velocity });
  }

  // Apply every gate whose time has arrived, in order. A note-on that lands while
  // the trigger is (physically) still high forces a re-strike gap — this also
  // covers a note-off + note-on collapsing into the same render quantum.
  applyDueGates() {
    const q = this.pendingGates;
    while (q.length && q[0].t <= currentTime) {
      const ev = q.shift();
      if (ev.on) {
        if (this.triggerHigh) this.retrigCountdown = RETRIG_BLOCKS;
        this.gateLevel = ev.velocity;
      } else {
        this.gateLevel = 0;
      }
    }
  }

  // Render one 12-sample block at 48 kHz into the ring buffer.
  renderBlock() {
    const m = this.module;
    const trig = this.retrigCountdown > 0 ? 0 : this.gateLevel;
    if (this.retrigCountdown > 0) this.retrigCountdown--;
    this.triggerHigh = trig > 0.3;
    m._plaits_set_trigger(trig);
    m._plaits_set_level(this.gateLevel);
    m._plaits_render(this.bufPtr, PLAITS_BLOCK);
    const rb = this.rb, cap = rb.length;
    let w = this.rbWrite;
    for (let i = 0; i < PLAITS_BLOCK; ++i) {
      rb[w] = this.bufView[i] / 32768;
      w = (w + 1) % cap;
    }
    this.rbWrite = w;
    this.rbCount += PLAITS_BLOCK;
  }

  nextSourceSample() {
    if (this.rbCount === 0) this.renderBlock();
    const s = this.rb[this.rbRead];
    this.rbRead = (this.rbRead + 1) % this.rb.length;
    this.rbCount -= 1;
    return s;
  }

  process(_inputs, outputs, parameters) {
    const output = outputs[0][0];
    if (!output) return true;
    if (!this.ready) { output.fill(0); return true; }

    // Fire any gates due at this quantum boundary, then push the k-rate macro
    // params into the WASM globals (read by renderBlock() during this quantum).
    this.applyDueGates();
    const m = this.module;
    m._plaits_set_note(parameters.note[0]);
    m._plaits_set_harmonics(clamp01(parameters.harmonics[0]));
    m._plaits_set_timbre(clamp01(parameters.timbre[0]));
    m._plaits_set_morph(clamp01(parameters.morph[0]));

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

registerProcessor("plaits", PlaitsProcessor);
