// laxsynth-worklet.js — AudioWorkletProcessor for Laxsynth, Parallax's original
// WavSynth-style engine. UNLIKE braids/plaits this is hand-written DSP in plain
// JS — there is NO WASM, no ring buffer, and no native-rate resampler: we render
// directly at the context sampleRate, one sample at a time, in process().
//
// Because it's not a WASM port it's also not in the Vite bundle — edit this file
// and refresh to retune any curve, shape or coefficient. No build step.
//
// Signal chain per sample:  oscillator → drive/limiter → crush → filter → ADSR.
//
// Oscillator = a single-cycle wavetable (rebuilt only when SHAPE or SIZE change),
// read with three operators applied at read-time:
//   MULT   — read the cycle N times per note period (hard-sync-like brightness)
//   WARP   — phase distortion: a moving breakpoint speeds up part of the read
//            (Casio-CZ-style resonant/formant character) without a filter
//   MIRROR — fold/reflect the read phase; on a PULSE this becomes PWM
// The two NOISE shapes bypass the table: a sample-&-hold (pitched noise) and a
// 15-bit LFSR (the NES/Game-Boy metallic noise channel), both clocked off pitch
// with SIZE setting the grain.
//
// A note is a scheduled gate: gateOn starts the ADSR attack (from the *current*
// envelope level, so retriggers don't click), gateOff starts the release. There's
// no amplitude at rest, so the voice is silent until played.

const SHAPE_SINE = 0, SHAPE_TRI = 1, SHAPE_SAW = 2, SHAPE_RAMP = 3,
      SHAPE_PULSE = 4, SHAPE_OVFL = 5, SHAPE_HSIN = 6,
      SHAPE_PNZ = 7, SHAPE_LFSR = 8;
const FIRST_NOISE_SHAPE = SHAPE_PNZ;

// SIZE index → single-cycle table length (samples). Smaller = coarser/aliased
// "8-bit" grit; larger = smoother. Also sets the noise-clock grain.
const SIZE_TABLE = [64, 128, 256, 512, 1024, 2048, 4096];

const TWO_PI = Math.PI * 2;
const clamp01 = (x) => (x < 0 ? 0 : x > 1 ? 1 : x);
const frac = (x) => x - Math.floor(x);

class LaxsynthProcessor extends AudioWorkletProcessor {
  static get parameterDescriptors() {
    // k-rate macro params, read once per render quantum (like plaits). Anything
    // routed via node.parameters.get(id) in the engine MUST be declared here.
    return [
      { name: "note",      defaultValue: 60,  minValue: 0, maxValue: 127, automationRate: "k-rate" },
      { name: "mult",      defaultValue: 1,   minValue: 1, maxValue: 16,  automationRate: "k-rate" },
      { name: "warp",      defaultValue: 0,   minValue: 0, maxValue: 1,   automationRate: "k-rate" },
      { name: "mirror",    defaultValue: 0,   minValue: 0, maxValue: 1,   automationRate: "k-rate" },
      { name: "cutoff",    defaultValue: 1,   minValue: 0, maxValue: 1,   automationRate: "k-rate" },
      { name: "resonance", defaultValue: 0.1, minValue: 0, maxValue: 1,   automationRate: "k-rate" },
      { name: "drive",     defaultValue: 0,   minValue: 0, maxValue: 1,   automationRate: "k-rate" },
      { name: "crush",     defaultValue: 0,   minValue: 0, maxValue: 1,   automationRate: "k-rate" },
    ];
  }

  constructor(options) {
    super();
    const seed = (options?.processorOptions?.seed ?? 0xC0FFEE) >>> 0;

    // Oscillator state.
    this.phase = 0;                 // table-shape phase, 0..1
    this.shape = SHAPE_SINE;
    this.sizeIndex = 4;             // → SIZE_TABLE[4] = 1024
    this.table = null;
    this.tableN = 0;
    this.tableDirty = true;

    // Noise state.
    this.noisePhase = 0;            // clocks the S&H / LFSR re-sample
    this.shVal = 0;                 // held noise sample
    this.rng = seed || 0xC0FFEE;    // xorshift32 for pitched noise
    this.lfsr = (seed & 0x7fff) || 1;

    // Structural params (message port, not k-rate).
    this.filterType = 0;            // 0 LP, 1 HP, 2 BP
    this.driveMode = 0;             // 0 clip, 1 fold, 2 wrap
    this.attackTime = 0.005;
    this.decayTime = 0.12;
    this.sustainLevel = 0.8;
    this.releaseTime = 0.2;

    // Envelope state. stage: 0 idle, 1 attack, 2 decay, 3 sustain, 4 release.
    this.env = 0;
    this.stage = 0;
    this.velocity = 1;
    this.relInc = 0;                // linear release step, fixed at gateOff

    // Filter state (TPT/Zavalishin SVF — unconditionally stable).
    this.ic1eq = 0;
    this.ic2eq = 0;

    // Crush (rate-reduce) state.
    this.crushHold = 0;
    this.crushCount = 0;

    // Scheduled gate events { t, on, velocity }, sorted ascending by time.
    this.pendingGates = [];

    this.port.onmessage = (e) => this.onMessage(e.data);
  }

  onMessage(msg) {
    switch (msg.type) {
      case "setShape":
        this.shape = msg.value | 0;
        if (this.shape < FIRST_NOISE_SHAPE) this.tableDirty = true;
        break;
      case "setSize":
        this.sizeIndex = Math.max(0, Math.min(SIZE_TABLE.length - 1, msg.value | 0));
        this.tableDirty = true;     // changes table length (and noise grain)
        break;
      case "setFilterType": this.filterType = msg.value | 0; break;
      case "setDriveMode":  this.driveMode = msg.value | 0; break;
      case "setAttack":     this.attackTime = Math.max(0, msg.value); break;
      case "setDecay":      this.decayTime = Math.max(0, msg.value); break;
      case "setSustain":    this.sustainLevel = clamp01(msg.value); break;
      case "setRelease":    this.releaseTime = Math.max(0, msg.value); break;
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
        // Panic: drop scheduled gates and close the voice with a short fade.
        this.pendingGates.length = 0;
        if (this.env > 0) {
          this.stage = 4;
          this.relInc = this.env / Math.max(sampleRate * 0.005, 1);
        } else {
          this.stage = 0;
        }
        break;
    }
  }

  queueGate(t, on, velocity) {
    const q = this.pendingGates;
    let i = q.length;
    while (i > 0 && q[i - 1].t > t) i--;
    q.splice(i, 0, { t, on, velocity });
  }

  // Apply every gate whose time has arrived, in order. gateOn ramps the attack
  // from the CURRENT envelope level (anti-click on retrigger); gateOff fixes a
  // linear release step from wherever the envelope currently sits.
  applyDueGates() {
    const q = this.pendingGates;
    while (q.length && q[0].t <= currentTime) {
      const ev = q.shift();
      if (ev.on) {
        this.velocity = ev.velocity;
        this.stage = 1;             // attack (env keeps its current value)
      } else {
        this.stage = 4;             // release
        this.relInc = this.env / Math.max(this.releaseTime * sampleRate, sampleRate * 0.003);
      }
    }
  }

  // Build one single-cycle, ~8-bit-quantised period of the current SHAPE.
  buildTable(shape, n) {
    const t = new Float32Array(n);
    for (let i = 0; i < n; ++i) {
      const p = i / n;             // 0..1
      let v;
      switch (shape) {
        case SHAPE_SINE: v = Math.sin(TWO_PI * p); break;
        case SHAPE_TRI:  v = p < 0.5 ? (4 * p - 1) : (3 - 4 * p); break;
        case SHAPE_SAW:  v = 2 * p - 1; break;
        case SHAPE_RAMP: v = 1 - 2 * p; break;
        case SHAPE_PULSE: v = p < 0.5 ? 1 : -1; break;
        case SHAPE_OVFL: {          // amplitude-overflow saw: jagged digital wrap
          let x = 4 * p;
          x = ((x + 1) % 2 + 2) % 2 - 1;
          v = x;
          break;
        }
        case SHAPE_HSIN: {          // half-rectified sine, DC-removed → formant-rich
          const s = Math.sin(TWO_PI * p);
          let h = s > 0 ? s : 0;
          h -= 1 / Math.PI;         // remove the half-rect DC offset
          v = h * 2;
          break;
        }
        default: v = Math.sin(TWO_PI * p); break;
      }
      if (v > 1) v = 1; else if (v < -1) v = -1;
      t[i] = Math.round(v * 127) / 127;   // ~8-bit quantise for grit
    }
    this.table = t;
    this.tableN = n;
    this.tableDirty = false;
  }

  // Phase distortion: a breakpoint slides from 0.5 toward 0 as warp rises, so the
  // early part of the cycle is read faster — a resonant/formant bend, no filter.
  warpPhase(p, w) {
    if (w <= 0) return p;
    const d = 0.5 * (1 - w * 0.98);   // breakpoint 0.5 → ~0.01
    return p < d ? (0.5 * p / d) : (0.5 + 0.5 * (p - d) / (1 - d));
  }

  // Fold/reflect the read phase. mirror 0 = identity; up to 1 reflects at 200%
  // (a triangle fold of the phase). On a PULSE this moves the transition = PWM.
  mirrorPhase(p, m) {
    if (m <= 0) return p;
    let q = p * (1 + m);              // 0..2
    q %= 2;
    return q > 1 ? 2 - q : q;
  }

  // Drive/limiter shapers (input pre-scaled by drive). Transparent at unity.
  shape_clip(x) { return x > 1 ? 1 : x < -1 ? -1 : x; }
  shape_fold(x) {
    while (x > 1 || x < -1) { if (x > 1) x = 2 - x; else x = -2 - x; }
    return x;
  }
  shape_wrap(x) { return ((x + 1) % 2 + 2) % 2 - 1; }

  // Advance the ADSR one sample, return its level. Increments passed in per block.
  stepEnv(atkInc, decInc) {
    switch (this.stage) {
      case 1: // attack
        this.env += atkInc;
        if (this.env >= 1) { this.env = 1; this.stage = 2; }
        break;
      case 2: // decay → sustain
        this.env -= decInc;
        if (this.env <= this.sustainLevel) { this.env = this.sustainLevel; this.stage = 3; }
        break;
      case 3: // sustain (held)
        this.env = this.sustainLevel;
        break;
      case 4: // release
        this.env -= this.relInc;
        if (this.env <= 0) { this.env = 0; this.stage = 0; }
        break;
      default:
        this.env = 0;
    }
    return this.env;
  }

  process(_inputs, outputs, parameters) {
    const output = outputs[0][0];
    if (!output) return true;

    this.applyDueGates();

    // Idle fast-path: nothing scheduled and the envelope is closed → silence.
    if (this.stage === 0 && this.env <= 0 && this.pendingGates.length === 0) {
      output.fill(0);
      return true;
    }

    if (this.tableDirty && this.shape < FIRST_NOISE_SHAPE) {
      this.buildTable(this.shape, SIZE_TABLE[this.sizeIndex]);
    }

    // --- k-rate params, read once per block (engine ramps them via setTarget) ---
    const note = parameters.note[0];
    const mult = Math.max(1, Math.round(parameters.mult[0]));
    const warp = clamp01(parameters.warp[0]);
    const mirror = clamp01(parameters.mirror[0]);
    const cutoff = clamp01(parameters.cutoff[0]);
    const resonance = clamp01(parameters.resonance[0]);
    const drive = clamp01(parameters.drive[0]);
    const crush = clamp01(parameters.crush[0]);

    // Pitch → per-sample phase increment.
    const freq = 440 * Math.pow(2, (note - 69) / 12);
    const inc = freq / sampleRate;

    // Filter coefficients (TPT SVF), computed once per block.
    const fc = Math.min(20 * Math.pow(900, cutoff), sampleRate * 0.45);
    const g = Math.tan(Math.PI * fc / sampleRate);
    const q = 0.5 + resonance * 24.5;          // Q 0.5..25
    const kf = 1 / q;                           // damping
    const a1 = 1 / (1 + g * (g + kf));
    const a2 = g * a1;
    const a3 = g * a2;
    const ftype = this.filterType;

    // Drive pre-gain + crush params.
    const preGain = 1 + drive * 24;
    const bits = 16 - crush * 14;               // 16 → 2 bits
    const levels = Math.pow(2, bits);
    const decim = 1 + Math.floor(crush * 30);   // rate-reduce hold length

    // Envelope increments (per block).
    const atkInc = 1 / Math.max(this.attackTime * sampleRate, sampleRate * 0.001);
    const decInc = (1 - this.sustainLevel) / Math.max(this.decayTime * sampleRate, 1);

    const isNoise = this.shape >= FIRST_NOISE_SHAPE;
    const noiseClockMul = SIZE_TABLE[this.sizeIndex] / 64;   // SIZE → grain
    const table = this.table, N = this.tableN;

    for (let i = 0; i < output.length; ++i) {
      // --- oscillator ---
      let s;
      if (isNoise) {
        this.noisePhase += inc * noiseClockMul * mult;
        while (this.noisePhase >= 1) {
          this.noisePhase -= 1;
          if (this.shape === SHAPE_PNZ) {
            // xorshift32 → white sample, held until next clock.
            let r = this.rng;
            r ^= r << 13; r ^= r >>> 17; r ^= r << 5; r >>>= 0;
            this.rng = r;
            this.shVal = (r / 4294967296) * 2 - 1;
          } else {
            // 15-bit LFSR (taps 0,1) → ±1, NES/Game-Boy noise.
            const bit = (this.lfsr ^ (this.lfsr >> 1)) & 1;
            this.lfsr = (this.lfsr >> 1) | (bit << 14);
            this.shVal = (this.lfsr & 1) ? 1 : -1;
          }
        }
        s = this.shVal;
      } else {
        let p = frac(this.phase * mult);
        p = this.warpPhase(p, warp);
        p = this.mirrorPhase(p, mirror);
        const idx = p * N;
        const i0 = idx | 0;
        const fr = idx - i0;
        const a = table[i0];
        const b = table[i0 + 1 < N ? i0 + 1 : 0];
        s = a + (b - a) * fr;
      }
      this.phase += inc;
      if (this.phase >= 1) this.phase -= Math.floor(this.phase);

      // --- drive / limiter ---
      if (drive > 0) {
        const x = s * preGain;
        s = this.driveMode === 1 ? this.shape_fold(x)
          : this.driveMode === 2 ? this.shape_wrap(x)
          : this.shape_clip(x);
      }

      // --- crush (bit + rate reduction) ---
      if (crush > 0) {
        if (this.crushCount <= 0) {
          this.crushHold = Math.round(s * levels) / levels;
          this.crushCount = decim;
        }
        this.crushCount--;
        s = this.crushHold;
      }

      // --- TPT state-variable filter ---
      const v3 = s - this.ic2eq;
      const v1 = a1 * this.ic1eq + a2 * v3;
      const v2 = this.ic2eq + a2 * this.ic1eq + a3 * v3;
      this.ic1eq = 2 * v1 - this.ic1eq;
      this.ic2eq = 2 * v2 - this.ic2eq;
      // Flush denormals so decaying state doesn't stall the CPU.
      if (this.ic1eq < 1e-15 && this.ic1eq > -1e-15) this.ic1eq = 0;
      if (this.ic2eq < 1e-15 && this.ic2eq > -1e-15) this.ic2eq = 0;
      let filtered = ftype === 1 ? (s - kf * v1 - v2)   // high-pass
                   : ftype === 2 ? v1                    // band-pass
                   : v2;                                 // low-pass

      // --- amp envelope ---
      const e = this.stepEnv(atkInc, decInc);
      output[i] = filtered * e * this.velocity;
    }

    return true;
  }
}

registerProcessor("laxsynth", LaxsynthProcessor);
