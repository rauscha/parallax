import type {
  ISynthEngine, EngineManifest, ParameterDescriptor,
  NoteOnOpts, NoteOffOpts, MidiNote,
} from "../types";
import { BRAIDS_MODELS, type BraidsModel } from "../../data/braids-models";

/**
 * BraidsEngine — wraps the Braids WASM AudioWorklet behind the ISynthEngine
 * interface. The worklet handles all DSP; this class manages the AudioNode
 * lifecycle, parameter mapping, and note-on/off semantics (which Braids' own
 * API doesn't have — Braids has a "strike" trigger and an envelope, so we
 * gate amplitude in JS via an output gain ramp).
 */
export class BraidsEngine implements ISynthEngine {
  manifest: EngineManifest = {
    id: "braids",
    name: "Braids",
    description: "Authentic Mutable Instruments Braids — Émilie Gillet's MIT firmware compiled to WASM.",
    capabilities: {
      polyphony: 1,
      producesAudio: true,
      supportsPitchBend: true,
      supportsGlide: false,
      modelEnumerable: true,
    },
  };

  private ctx: AudioContext | null = null;
  private node: AudioWorkletNode | null = null;
  private gainNode: GainNode | null = null;
  private activeMidi: number | null = null;

  // Mirror of param values for getParameter().
  private params: Record<string, number> = {
    pitch: 60, timbre: 0.5, color: 0.5, fm: 0,
    attack: 0.005, decay: 0.6, release: 0.18,
    bits: 16, sampleRateKhz: 96, signature: 0, drift: 0,
    gain: 0.4,
  };

  private currentModelIndex = 0;     // CSAW by default

  get output(): AudioNode | null { return this.gainNode; }

  async init(ctx: AudioContext): Promise<void> {
    this.ctx = ctx;

    // Fetch the wasm binary on the main thread and hand it to the worklet via
    // processorOptions — sidesteps URL resolution quirks inside the worklet.
    await ctx.audioWorklet.addModule("/braids-worklet.js");
    const wasmResp = await fetch("/braids.wasm");
    if (!wasmResp.ok) throw new Error(`Failed to load braids.wasm: ${wasmResp.status}`);
    const wasmBinary = await wasmResp.arrayBuffer();

    this.node = new AudioWorkletNode(ctx, "braids", {
      numberOfInputs: 0,
      numberOfOutputs: 1,
      outputChannelCount: [1],
      processorOptions: { wasmBinary, signatureSeed: 0xC0FFEE },
    });

    // Wait for the worklet's "ready" message so we know WASM is up before any
    // shape changes go through.
    await new Promise<void>((resolve, reject) => {
      const onMsg = (e: MessageEvent) => {
        if (e.data?.type === "ready") { this.node!.port.removeEventListener("message", onMsg); resolve(); }
        if (e.data?.type === "error") { this.node!.port.removeEventListener("message", onMsg); reject(new Error(e.data.message)); }
      };
      this.node!.port.addEventListener("message", onMsg);
      this.node!.port.start();
    });

    // Output gain — silenced at rest; ramped up on noteOn, ramped down on noteOff.
    // This is how we get "MIDI noteOff" semantics for a synth (Braids) that
    // natively only has a strike trigger.
    this.gainNode = ctx.createGain();
    this.gainNode.gain.value = 0;
    this.node.connect(this.gainNode);

    // Push initial param values into the worklet.
    this.setShape(this.currentModelIndex);
    this.setParameter("timbre", this.params.timbre);
    this.setParameter("color",  this.params.color);
    this.setParameter("pitch",  this.params.pitch);
    this.setParameter("fm",     this.params.fm);
  }

  noteOn(midi: MidiNote, opts: NoteOnOpts = {}): void {
    if (!this.ctx || !this.node || !this.gainNode) return;
    const t = opts.time ?? this.ctx.currentTime;
    const v = opts.velocity ?? 0.8;
    this.activeMidi = midi;

    // Pitch
    const pitchParam = this.node.parameters.get("pitch");
    if (pitchParam) pitchParam.setValueAtTime(midi, t);
    this.params.pitch = midi;

    // Strike the engine
    this.node.port.postMessage({ type: "gateOn" });

    // Envelope: short attack ramp to (v * gain), then optional decay sustain.
    const target = v * this.params.gain;
    const g = this.gainNode.gain;
    g.cancelScheduledValues(t);
    g.setValueAtTime(g.value, t);
    g.linearRampToValueAtTime(target, t + this.params.attack);
    // Hold until noteOff. (For drum/percussion models we may want auto-release
    // — handled in M2 once the AD envelope wiring is exposed.)
  }

  noteOff(midi: MidiNote, opts: NoteOffOpts = {}): void {
    if (!this.ctx || !this.gainNode) return;
    if (this.activeMidi !== null && this.activeMidi !== midi) return;
    const t = opts.time ?? this.ctx.currentTime;
    const g = this.gainNode.gain;
    g.cancelScheduledValues(t);
    g.setValueAtTime(g.value, t);
    g.linearRampToValueAtTime(0, t + this.params.release);
    this.activeMidi = null;
    if (this.node) this.node.port.postMessage({ type: "gateOff" });
  }

  allNotesOff(): void {
    if (!this.ctx || !this.gainNode) return;
    const t = this.ctx.currentTime;
    const g = this.gainNode.gain;
    g.cancelScheduledValues(t);
    g.setValueAtTime(g.value, t);
    g.linearRampToValueAtTime(0, t + 0.04);
    this.activeMidi = null;
  }

  setPitchBend(semitones: number): void {
    if (!this.node) return;
    const pitchParam = this.node.parameters.get("pitch");
    if (!pitchParam || !this.ctx) return;
    pitchParam.setTargetAtTime(this.params.pitch + semitones, this.ctx.currentTime, 0.005);
  }

  /** Switch the active synthesis model (0..46). */
  setShape(index: number): void {
    index = Math.max(0, Math.min(46, index | 0));
    this.currentModelIndex = index;
    if (this.node) this.node.port.postMessage({ type: "setShape", value: index });
  }

  /** Current Braids model (for the explain panel / model picker). */
  get currentModel(): BraidsModel { return BRAIDS_MODELS[this.currentModelIndex]; }

  getParameterSchema(): ParameterDescriptor[] {
    return [
      { id: "model",  label: "Model",  group: "shape",     type: "discrete",   min: 0, max: 46, step: 1,
        default: 0, apply: "message",
        description: "Synthesis algorithm — TIMBRE and COLOR change meaning per model." },
      { id: "timbre", label: "Timbre", group: "shape",     type: "continuous", min: 0, max: 1, default: 0.5,
        apply: "audioparam",
        describe: (ctx) => {
          const m = ctx as BraidsModel;
          return m?.timbre ? { description: m.timbre } : {};
        } },
      { id: "color",  label: "Color",  group: "shape",     type: "continuous", min: 0, max: 1, default: 0.5,
        apply: "audioparam",
        describe: (ctx) => {
          const m = ctx as BraidsModel;
          return m?.color ? { description: m.color } : {};
        } },
      { id: "fm",     label: "FM",     group: "pitch",     type: "continuous", min: -12, max: 12, default: 0,
        unit: "semi", apply: "audioparam" },
      { id: "attack", label: "Attack", group: "envelope",  type: "continuous", min: 0.001, max: 2, default: 0.005,
        unit: "s",   apply: "audioparam" },
      { id: "release",label: "Release",group: "envelope",  type: "continuous", min: 0.01, max: 4, default: 0.18,
        unit: "s",   apply: "audioparam" },
      { id: "bits",   label: "Bits",   group: "lofi",      type: "discrete",   min: 2, max: 16, step: 1, default: 16,
        unit: "bit", apply: "message",
        description: "Bit-depth reduction — the Braids 'crunch'." },
      { id: "sampleRateKhz", label: "Rate", group: "lofi", type: "discrete",   min: 4, max: 96, step: 1, default: 96,
        unit: "kHz", apply: "message",
        description: "Sample-rate reduction — softer, more lo-fi." },
      { id: "signature", label: "Sign", group: "lofi", type: "continuous", min: 0, max: 255, default: 0,
        apply: "message",
        description: "Signature waveshaping — adds the Braids unit-to-unit character." },
      { id: "drift", label: "Drift", group: "lofi", type: "continuous", min: 0, max: 255, default: 0,
        apply: "message",
        description: "VCO drift simulation." },
      { id: "gain", label: "Gain", group: "output", type: "continuous", min: 0, max: 1, default: 0.4,
        apply: "audioparam" },
    ];
  }

  setParameter(id: string, value: number, time?: number): void {
    if (!this.ctx || !this.node) return;
    this.params[id] = value;
    const t = time ?? this.ctx.currentTime;

    switch (id) {
      case "model":
        this.setShape(value | 0);
        return;
      case "pitch":
      case "timbre":
      case "color":
      case "fm": {
        const p = this.node.parameters.get(id);
        if (p) p.setTargetAtTime(value, t, 0.005);
        return;
      }
      case "bits":
        this.node.port.postMessage({ type: "setBits", value: value | 0 });
        return;
      case "sampleRateKhz":
        this.node.port.postMessage({ type: "setSampleRateKhz", value: value | 0 });
        return;
      case "signature":
        this.node.port.postMessage({ type: "setSignature", value: value | 0 });
        return;
      case "drift":
        this.node.port.postMessage({ type: "setDrift", value: value | 0 });
        return;
      case "gain":
        // Envelope target — applies on the next noteOn.
        return;
      case "attack":
      case "release":
        // Stored, used by noteOn/noteOff.
        return;
    }
  }

  getParameter(id: string): number {
    return this.params[id] ?? 0;
  }

  async dispose(): Promise<void> {
    this.allNotesOff();
    if (this.node) { try { this.node.disconnect(); } catch { /* */ } this.node = null; }
    if (this.gainNode) { try { this.gainNode.disconnect(); } catch { /* */ } this.gainNode = null; }
    this.ctx = null;
  }
}
