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

  // Reference-sample path (the "Match a sound" tool): a decoded audio file plays
  // through its own gain → analyser → destination, parallel to the synth. Kept
  // separate so the loaded track is audible + scope-able WITHOUT routing through
  // the engine, and so its spectrum can be drawn next to the live patch's.
  private sampleGain: GainNode | null = null;
  private sampleAnalyser: AnalyserNode | null = null;
  private sampleSource: AudioBufferSourceNode | null = null;
  private sampleBuffer: AudioBuffer | null = null;

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

    // Parallel reference-sample chain (silent until a file is played).
    this.sampleGain = this.ctx.createGain();
    this.sampleGain.gain.value = 0.85;
    this.sampleAnalyser = this.ctx.createAnalyser();
    this.sampleAnalyser.fftSize = 2048;
    this.sampleAnalyser.smoothingTimeConstant = 0;   // match the synth analyser
    this.sampleGain.connect(this.sampleAnalyser);
    this.sampleAnalyser.connect(this.ctx.destination);

    if (this.ctx.state === "suspended") await this.ctx.resume();
    this._started = true;

    // Some browsers (Chrome/Edge on backgrounded tabs, iOS Safari, etc.) auto-
    // suspend the AudioContext when the tab is hidden. Without this listener
    // the user comes back to a silent app even after the page is visible again.
    document.addEventListener("visibilitychange", this.onVisibility);
  }

  private onVisibility = () => {
    if (!this.ctx) return;
    if (document.visibilityState === "visible" && this.ctx.state === "suspended") {
      this.ctx.resume().catch(() => { /* user gesture may be required — TapToStart will retry */ });
    }
  };

  /** Hot-swap the active engine. Old engine is disposed after the new one is
   *  in place; both connections are routed through masterGain. */
  async useEngine(next: ISynthEngine): Promise<void> {
    if (!this.ctx || !this.masterGain) throw new Error("AudioEngine not started — call start() first.");

    try {
      await next.init(this.ctx);
    } catch (err) {
      // A failed init can leave a half-built engine still holding an
      // AudioWorkletNode and its message-port listener — they outlive the
      // doomed engine reference otherwise. Dispose so the resources don't
      // leak, then re-throw so the caller (TapToStart) surfaces the error.
      try { await next.dispose(); } catch { /* best-effort on a broken engine */ }
      throw err;
    }

    const prev = this._engine;
    if (prev) prev.allNotesOff();   // schedules a 40 ms gain ramp to silence

    if (next.output) next.output.connect(this.masterGain);
    this._engine = next;

    if (prev) {
      // Defer the old engine's disconnect + dispose past its fade. Disconnecting
      // synchronously here removed the node before the 40 ms ramp played a single
      // quantum, hard-cutting any ringing note → an audible pop on swap. The new
      // engine is already connected, so this delay is inaudible; the old one
      // finishes its fade first, then dispose() posts the worklet kill message.
      setTimeout(() => {
        if (prev.output) try { prev.output.disconnect(); } catch { /* already gone */ }
        void prev.dispose();
      }, 60);
    }
  }

  get currentEngine(): ISynthEngine | null { return this._engine; }
  get audioContext(): AudioContext | null { return this.ctx; }
  get analyserNode(): AnalyserNode | null { return this.analyser; }
  get sampleAnalyserNode(): AnalyserNode | null { return this.sampleAnalyser; }
  get loadedSample(): AudioBuffer | null { return this.sampleBuffer; }
  get sampleRate(): number { return this.ctx?.sampleRate ?? 0; }
  get isStarted(): boolean { return this._started; }

  /** Master output (0..1). */
  setMasterGain(v: number): void {
    if (!this.masterGain || !this.ctx) return;
    this.masterGain.gain.setTargetAtTime(v, this.ctx.currentTime, 0.01);
  }

  // ── Reference-sample (the "Match a sound" tool) ──

  /** Decode an audio file into a buffer at the context's sample rate. The buffer
   *  is retained (read via `loadedSample`) for offline analysis + playback. */
  async loadSampleFile(file: File): Promise<AudioBuffer> {
    if (!this.ctx) throw new Error("AudioEngine not started — call start() first.");
    this.stopSample();
    const arr = await file.arrayBuffer();
    // decodeAudioData resamples to ctx.sampleRate, so analysis can assume it.
    const buf = await this.ctx.decodeAudioData(arr);
    this.sampleBuffer = buf;
    return buf;
  }

  /** (Re)start playback of the loaded sample, looping the given region (seconds).
   *  Any prior playback is stopped first. No-op if nothing is loaded. */
  playSample(opts?: { loopStart?: number; loopEnd?: number; loop?: boolean }): void {
    if (!this.ctx || !this.sampleGain || !this.sampleBuffer) return;
    this.stopSample();
    const src = this.ctx.createBufferSource();
    src.buffer = this.sampleBuffer;
    src.loop = opts?.loop ?? true;
    let offset = 0;
    const dur = this.sampleBuffer.duration;
    const s = Math.max(0, Math.min(dur, opts?.loopStart ?? 0));
    const e = Math.max(0, Math.min(dur, opts?.loopEnd ?? dur));
    if (e > s) { src.loopStart = s; src.loopEnd = e; offset = s; }
    src.connect(this.sampleGain);
    src.start(0, offset);
    this.sampleSource = src;
  }

  /** Stop reference-sample playback (leaves the decoded buffer loaded). */
  stopSample(): void {
    if (!this.sampleSource) return;
    try { this.sampleSource.stop(); } catch { /* not started / already stopped */ }
    try { this.sampleSource.disconnect(); } catch { /* already gone */ }
    this.sampleSource = null;
  }

  async dispose(): Promise<void> {
    document.removeEventListener("visibilitychange", this.onVisibility);
    this.stopSample();
    this.sampleBuffer = null;
    this.sampleGain = null;
    this.sampleAnalyser = null;
    if (this._engine) await this._engine.dispose();
    this._engine = null;
    if (this.ctx) await this.ctx.close();
    this.ctx = null;
    this._started = false;
  }
}

export const audioEngine = new AudioEngine();
