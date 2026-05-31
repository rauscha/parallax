import type { ISynthEngine } from "./types";

/**
 * Owns the AudioContext and the master signal chain. The synth engine plugs in
 * here; everything else (sequencer, keyboard harness, MIDI input later) talks
 * to AudioEngine.currentEngine through the ISynthEngine interface.
 *
 * Chain:  currentEngine.output → masterGain → analyser → destination
 *
 * (Insert FX slot will live between masterGain and analyser when added in v1+.)
 */
export class AudioEngine {
  private ctx: AudioContext | null = null;
  private masterGain: GainNode | null = null;
  private analyser: AnalyserNode | null = null;

  private _engine: ISynthEngine | null = null;
  private _started = false;

  /** Lazily create the AudioContext. Browsers require a user gesture before
   *  the context can start producing sound — call `start()` from a click. */
  async start(): Promise<void> {
    if (this._started) {
      if (this.ctx && this.ctx.state === "suspended") await this.ctx.resume();
      return;
    }

    const Ctor = window.AudioContext ?? (window as unknown as { webkitAudioContext: typeof AudioContext }).webkitAudioContext;
    this.ctx = new Ctor({ latencyHint: "interactive" });

    this.masterGain = this.ctx.createGain();
    this.masterGain.gain.value = 0.8;

    this.analyser = this.ctx.createAnalyser();
    this.analyser.fftSize = 2048;
    this.analyser.smoothingTimeConstant = 0;   // raw time-domain for the scope trigger

    this.masterGain.connect(this.analyser);
    this.analyser.connect(this.ctx.destination);

    if (this.ctx.state === "suspended") await this.ctx.resume();
    this._started = true;
  }

  /** Hot-swap the active engine. Old engine is disposed after the new one is
   *  in place; both connections are routed through masterGain. */
  async useEngine(next: ISynthEngine): Promise<void> {
    if (!this.ctx || !this.masterGain) throw new Error("AudioEngine not started — call start() first.");

    await next.init(this.ctx);

    const prev = this._engine;
    if (prev) prev.allNotesOff();

    if (next.output) next.output.connect(this.masterGain);
    this._engine = next;

    if (prev) {
      if (prev.output) try { prev.output.disconnect(); } catch { /* already gone */ }
      await prev.dispose();
    }
  }

  get currentEngine(): ISynthEngine | null { return this._engine; }
  get audioContext(): AudioContext | null { return this.ctx; }
  get analyserNode(): AnalyserNode | null { return this.analyser; }
  get sampleRate(): number { return this.ctx?.sampleRate ?? 0; }
  get isStarted(): boolean { return this._started; }

  /** Master output (0..1). */
  setMasterGain(v: number): void {
    if (!this.masterGain || !this.ctx) return;
    this.masterGain.gain.setTargetAtTime(v, this.ctx.currentTime, 0.01);
  }

  async dispose(): Promise<void> {
    if (this._engine) await this._engine.dispose();
    this._engine = null;
    if (this.ctx) await this.ctx.close();
    this.ctx = null;
    this._started = false;
  }
}

export const audioEngine = new AudioEngine();
