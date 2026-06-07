import type {
  ISynthEngine, EngineManifest, ParameterDescriptor,
  NoteOnOpts, NoteOffOpts, MidiNote,
} from "../types";

/**
 * LaxsynthEngine — wraps the Laxsynth AudioWorklet behind ISynthEngine.
 *
 * Laxsynth is Parallax's ORIGINAL WavSynth-style voice (a single-cycle wavetable
 * oscillator with size/mult/warp/mirror operators → filter → drive → ADSR). It is
 * NOT a WASM port: the DSP is hand-written plain JS in public/laxsynth-worklet.js.
 * So this wrapper is much simpler than Braids/Plaits — there's no .wasm to fetch
 * and no async "ready" handshake; the worklet is usable the moment it's added.
 *
 * The amp envelope lives in the worklet, so (like Plaits) the GainNode here is
 * only the master level. Pitch is MIDI-direct via the k-rate `note` param.
 */

// SIZE index → table length (samples), mirrored from the worklet for readouts.
const SIZE_SAMPLES = [64, 128, 256, 512, 1024, 2048, 4096];
const FILTER_TYPES = ["LP", "HP", "BP"];
const DRIVE_MODES = ["Clip", "Fold", "Wrap"];

const pct = (v: number) => `${Math.round(v * 100)}%`;
const secs = (v: number) => (v < 1 ? `${Math.round(v * 1000)} ms` : `${v.toFixed(2)} s`);
const hz = (v: number) => {
  const f = 20 * Math.pow(900, v);
  return f >= 1000 ? `${(f / 1000).toFixed(1)} kHz` : `${Math.round(f)} Hz`;
};

export class LaxsynthEngine implements ISynthEngine {
  manifest: EngineManifest = {
    id: "laxsynth",
    name: "Laxsynth",
    description: "Parallax's own 8-bit wavetable voice — a single-cycle oscillator with size, multiply, warp and mirror operators, in the WavSynth tradition.",
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
  private pitchBend = 0;             // semitones — persists across notes
  private currentModelIndex = 0;     // SHAPE 0 (Sine) by default

  // Mirror of param values for getParameter(). MUST match the descriptor
  // defaults below — bindings.ts seeds the UI from getParameter(), not the
  // descriptor, so a mismatch makes the knob and the sound disagree.
  private params: Record<string, number> = {
    model: 0, size: 4, mult: 1, warp: 0, mirror: 0,
    filterType: 0, cutoff: 1, resonance: 0.1,
    drive: 0, driveMode: 0, crush: 0,
    attack: 0.005, decay: 0.12, sustain: 0.8, release: 0.2,
    gain: 0.5,
  };

  get output(): AudioNode | null { return this.gainNode; }

  async init(ctx: AudioContext): Promise<void> {
    this.ctx = ctx;

    try {
      await ctx.audioWorklet.addModule(import.meta.env.BASE_URL + "laxsynth-worklet.js");
    } catch (e) {
      throw new Error(`Failed to load laxsynth-worklet.js: ${(e as Error).message}`);
    }

    // Pure-JS processor: no wasm binary, no ready-wait — usable immediately.
    this.node = new AudioWorkletNode(ctx, "laxsynth", {
      numberOfInputs: 0,
      numberOfOutputs: 1,
      outputChannelCount: [1],
      processorOptions: { seed: 0xC0FFEE },
    });

    this.gainNode = ctx.createGain();
    this.gainNode.gain.value = this.params.gain;
    this.node.connect(this.gainNode);

    // Seed the worklet with current param values.
    this.setShape(this.currentModelIndex);
    this.pushK("mult", this.params.mult, false);
    this.pushK("warp", this.params.warp);
    this.pushK("mirror", this.params.mirror);
    this.pushK("cutoff", this.params.cutoff);
    this.pushK("resonance", this.params.resonance);
    this.pushK("drive", this.params.drive);
    this.pushK("crush", this.params.crush);
    this.node.port.postMessage({ type: "setSize", value: this.params.size });
    this.node.port.postMessage({ type: "setFilterType", value: this.params.filterType });
    this.node.port.postMessage({ type: "setDriveMode", value: this.params.driveMode });
    this.node.port.postMessage({ type: "setAttack", value: this.params.attack });
    this.node.port.postMessage({ type: "setDecay", value: this.params.decay });
    this.node.port.postMessage({ type: "setSustain", value: this.params.sustain });
    this.node.port.postMessage({ type: "setRelease", value: this.params.release });
  }

  noteOn(midi: MidiNote, opts: NoteOnOpts = {}): void {
    if (!this.ctx || !this.node) return;
    const t = opts.time ?? this.ctx.currentTime;
    const v = opts.velocity ?? 0.8;
    this.activeMidi = midi;
    this.params.note = midi;

    const noteParam = this.node.parameters.get("note");
    if (noteParam) noteParam.setValueAtTime(midi + this.pitchBend, t);

    this.node.port.postMessage({ type: "gateOn", time: t, velocity: v });
  }

  noteOff(midi: MidiNote, opts: NoteOffOpts = {}): void {
    if (!this.node) return;
    if (this.activeMidi !== null && this.activeMidi !== midi) return;
    this.activeMidi = null;
    const t = opts.time ?? this.ctx?.currentTime;
    this.node.port.postMessage({ type: "gateOff", time: t });
  }

  allNotesOff(): void {
    if (!this.node) return;
    this.node.port.postMessage({ type: "clearStrikes" });
    this.node.port.postMessage({ type: "gateOff" });
    if (this.ctx) this.node.parameters.get("note")?.cancelScheduledValues(this.ctx.currentTime);
    this.activeMidi = null;
  }

  setPitchBend(semitones: number): void {
    if (!this.node || !this.ctx) return;
    this.pitchBend = semitones;
    const noteParam = this.node.parameters.get("note");
    if (noteParam) noteParam.setTargetAtTime(this.params.note + semitones, this.ctx.currentTime, 0.005);
  }

  /** Switch the active SHAPE (0..8). */
  private setShape(index: number): void {
    index = Math.max(0, Math.min(8, index | 0));
    this.currentModelIndex = index;
    this.node?.port.postMessage({ type: "setShape", value: index });
  }

  /** Push a k-rate AudioParam. Continuous params ramp; discrete ones snap. */
  private pushK(id: string, value: number, smooth = true, time?: number): void {
    if (!this.node || !this.ctx) return;
    const p = this.node.parameters.get(id);
    if (!p) return;
    const t = time ?? this.ctx.currentTime;
    if (smooth) p.setTargetAtTime(value, t, 0.005);
    else p.setValueAtTime(value, t);
  }

  getParameterSchema(): ParameterDescriptor[] {
    return [
      { id: "model", label: "Shape", group: "shape", type: "discrete", min: 0, max: 8, step: 1,
        default: 0, apply: "message",
        description: "Base waveform — the operators below reshape whichever shape you pick." },
      { id: "size", label: "Size", group: "shape", type: "discrete", min: 0, max: 6, step: 1,
        default: 4, apply: "message", format: (v) => `${SIZE_SAMPLES[v] ?? "?"} smp`,
        description: "Single-cycle resolution — small is gritty and aliased, large is smooth. Also sets noise grain." },
      { id: "mult", label: "Mult", group: "shape", type: "discrete", min: 1, max: 16, step: 1,
        default: 1, apply: "audioparam", format: (v) => `×${Math.round(v)}`,
        description: "Repeats the cycle N times per note — a hard-sync-like brightening." },
      { id: "warp", label: "Warp", group: "shape", type: "continuous", min: 0, max: 1, default: 0,
        apply: "audioparam", format: pct,
        description: "Phase distortion — bends the wave for a resonant, formant-like edge (no filter needed)." },
      { id: "mirror", label: "Mirror", group: "shape", type: "continuous", min: 0, max: 1, default: 0,
        apply: "audioparam", format: pct,
        description: "Folds/reflects the wave. On a pulse this sets the width (PWM)." },

      { id: "filterType", label: "Filter", group: "filter", type: "discrete", min: 0, max: 2, step: 1,
        default: 0, apply: "message", format: (v) => FILTER_TYPES[Math.round(v)] ?? "LP",
        description: "Filter mode — low-pass, high-pass or band-pass." },
      { id: "cutoff", label: "Cutoff", group: "filter", type: "continuous", min: 0, max: 1, default: 1,
        apply: "audioparam", format: hz,
        description: "Filter cutoff frequency." },
      { id: "resonance", label: "Resonance", group: "filter", type: "continuous", min: 0, max: 1, default: 0.1,
        apply: "audioparam", format: pct,
        description: "Filter resonance — emphasis at the cutoff, up to a near-whistle." },

      { id: "drive", label: "Drive", group: "drive", type: "continuous", min: 0, max: 1, default: 0,
        apply: "audioparam", format: pct,
        description: "Overdrive into the limiter — adds harmonics and punch." },
      { id: "driveMode", label: "Limiter", group: "drive", type: "discrete", min: 0, max: 2, step: 1,
        default: 0, apply: "message", format: (v) => DRIVE_MODES[Math.round(v)] ?? "Clip",
        description: "How Drive limits — hard clip, wavefold, or wrap-around." },
      { id: "crush", label: "Crush", group: "drive", type: "continuous", min: 0, max: 1, default: 0,
        apply: "audioparam", format: pct,
        description: "Bit- and sample-rate reduction — the 8-bit digital crunch." },

      { id: "attack", label: "Attack", group: "envelope", type: "continuous", min: 0.001, max: 2, default: 0.005,
        apply: "message", format: secs, description: "Amp envelope attack time." },
      { id: "decay", label: "Decay", group: "envelope", type: "continuous", min: 0.001, max: 2, default: 0.12,
        apply: "message", format: secs, description: "Amp envelope decay time to the sustain level." },
      { id: "sustain", label: "Sustain", group: "envelope", type: "continuous", min: 0, max: 1, default: 0.8,
        apply: "message", format: pct, description: "Amp envelope sustain level while a note is held." },
      { id: "release", label: "Release", group: "envelope", type: "continuous", min: 0.005, max: 4, default: 0.2,
        apply: "message", format: secs, description: "Amp envelope release time after note-off." },

      { id: "gain", label: "Gain", group: "output", type: "continuous", min: 0, max: 1, default: 0.5,
        apply: "audioparam", format: pct, description: "Master output level." },
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
      case "mult":
        this.pushK("mult", value, false, t);
        return;
      case "warp":
      case "mirror":
      case "cutoff":
      case "resonance":
      case "drive":
      case "crush":
        this.pushK(id, value, true, t);
        return;
      case "size":
        this.node.port.postMessage({ type: "setSize", value: value | 0 });
        return;
      case "filterType":
        this.node.port.postMessage({ type: "setFilterType", value: value | 0 });
        return;
      case "driveMode":
        this.node.port.postMessage({ type: "setDriveMode", value: value | 0 });
        return;
      case "attack":
        this.node.port.postMessage({ type: "setAttack", value });
        return;
      case "decay":
        this.node.port.postMessage({ type: "setDecay", value });
        return;
      case "sustain":
        this.node.port.postMessage({ type: "setSustain", value });
        return;
      case "release":
        this.node.port.postMessage({ type: "setRelease", value });
        return;
      case "gain":
        if (this.gainNode) this.gainNode.gain.setTargetAtTime(value, t, 0.01);
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
