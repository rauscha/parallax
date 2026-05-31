import type { ISynthEngine, EngineManifest, ParameterDescriptor, NoteOnOpts, NoteOffOpts, MidiNote } from "../types";

/**
 * Placeholder engine for M0 — a single mono OscillatorNode + short ADSR-ish gain
 * envelope. Implements ISynthEngine so the rest of the app stays engine-agnostic.
 * Replaced by BraidsEngine in M1; do not extend.
 */
export class TestToneEngine implements ISynthEngine {
  manifest: EngineManifest = {
    id: "test-tone",
    name: "Test Tone",
    description: "Plain sine — M0 placeholder. Replaced by Braids in M1.",
    capabilities: {
      polyphony: 1,
      producesAudio: true,
      supportsPitchBend: false,
      supportsGlide: false,
      modelEnumerable: false,
    },
  };

  private ctx: AudioContext | null = null;
  private out: GainNode | null = null;
  private osc: OscillatorNode | null = null;
  private env: GainNode | null = null;
  private activeMidi: number | null = null;
  private params: Record<string, number> = { gain: 0.4, attack: 0.005, release: 0.18 };

  get output(): AudioNode | null { return this.out; }

  async init(ctx: AudioContext): Promise<void> {
    this.ctx = ctx;
    this.out = ctx.createGain();
    this.out.gain.value = this.params.gain;
  }

  noteOn(midi: MidiNote, opts: NoteOnOpts = {}): void {
    if (!this.ctx || !this.out) return;
    this.stopVoice(opts.time ?? this.ctx.currentTime);

    const t = opts.time ?? this.ctx.currentTime;
    const freq = 440 * Math.pow(2, (midi - 69) / 12);
    const v = opts.velocity ?? 0.8;

    const osc = this.ctx.createOscillator();
    osc.type = "sine";
    osc.frequency.value = freq;

    const env = this.ctx.createGain();
    env.gain.setValueAtTime(0, t);
    env.gain.linearRampToValueAtTime(v, t + this.params.attack);

    osc.connect(env);
    env.connect(this.out);
    osc.start(t);

    this.osc = osc;
    this.env = env;
    this.activeMidi = midi;
  }

  noteOff(midi: MidiNote, opts: NoteOffOpts = {}): void {
    if (!this.ctx) return;
    if (this.activeMidi !== midi) return;
    this.stopVoice(opts.time ?? this.ctx.currentTime);
  }

  allNotesOff(): void {
    if (this.ctx) this.stopVoice(this.ctx.currentTime);
  }

  private stopVoice(t: number): void {
    if (!this.env || !this.osc) return;
    const env = this.env, osc = this.osc;
    env.gain.cancelScheduledValues(t);
    env.gain.setValueAtTime(env.gain.value, t);
    env.gain.linearRampToValueAtTime(0, t + this.params.release);
    osc.stop(t + this.params.release + 0.01);
    this.env = null;
    this.osc = null;
    this.activeMidi = null;
  }

  getParameterSchema(): ParameterDescriptor[] {
    return [
      {
        id: "gain", label: "Gain", group: "output",
        type: "continuous", min: 0, max: 1, default: 0.4,
        apply: "audioparam",
      },
    ];
  }

  setParameter(id: string, value: number): void {
    this.params[id] = value;
    if (id === "gain" && this.out && this.ctx) {
      this.out.gain.setTargetAtTime(value, this.ctx.currentTime, 0.01);
    }
  }

  getParameter(id: string): number { return this.params[id] ?? 0; }

  async dispose(): Promise<void> {
    this.allNotesOff();
    if (this.out) try { this.out.disconnect(); } catch { /* ok */ }
    this.out = null;
    this.ctx = null;
  }
}
