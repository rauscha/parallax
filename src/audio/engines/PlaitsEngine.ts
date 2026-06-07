import type {
  ISynthEngine, EngineManifest, ParameterDescriptor,
  NoteOnOpts, NoteOffOpts, MidiNote,
} from "../types";

/**
 * PlaitsEngine — wraps the Plaits WASM AudioWorklet behind ISynthEngine.
 *
 * Unlike Braids, Plaits has a real note model: a TRIGGER edge strikes the voice
 * and a held LEVEL drives its built-in low-pass gate, so amplitude (attack,
 * sustain, release tail, and the drums' one-shot ring) is shaped INSIDE the
 * WASM. We therefore do NOT gate amplitude with a JS gain ramp the way Braids
 * does — the output GainNode here is only the master level knob. noteOn/noteOff
 * just set the pitch param and post gate events to the worklet, which
 * manufactures clean strike edges (see plaits-worklet.js).
 *
 * Pitch is MIDI-direct: patch.note = MIDI number (verified note 69 → 440 Hz).
 */
export class PlaitsEngine implements ISynthEngine {
  manifest: EngineManifest = {
    id: "plaits",
    name: "Plaits",
    description: "Authentic Mutable Instruments Plaits — Émilie Gillet's MIT firmware compiled to WASM.",
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
  private currentModelIndex = 0;     // engine 0 by default (virtual-analog VCF)

  // Mirror of param values for getParameter().
  private params: Record<string, number> = {
    note: 60, harmonics: 0.5, timbre: 0.5, morph: 0.5,
    decay: 0.5, lpgColour: 0.5, gain: 0.6,
  };

  get output(): AudioNode | null { return this.gainNode; }

  async init(ctx: AudioContext): Promise<void> {
    this.ctx = ctx;

    await ctx.audioWorklet.addModule(import.meta.env.BASE_URL + "plaits-worklet.js");

    // Fetch the wasm on the main thread; hand it to the worklet via
    // processorOptions (sidesteps URL resolution quirks inside the worklet).
    // Plaits' wasm is ~190 KB; 6s is generous-but-bounded.
    const fetchCtl = new AbortController();
    const fetchTimer = setTimeout(() => fetchCtl.abort(), 6000);
    let wasmBinary: ArrayBuffer;
    const wasmUrl = import.meta.env.BASE_URL + "plaits.wasm";
    try {
      const wasmResp = await fetch(wasmUrl, { signal: fetchCtl.signal });
      if (!wasmResp.ok) throw new Error(`Failed to load plaits.wasm: HTTP ${wasmResp.status}`);
      wasmBinary = await wasmResp.arrayBuffer();
    } catch (e) {
      if ((e as Error).name === "AbortError") throw new Error(`Timed out fetching ${wasmUrl} after 6s. Is the file deployed and reachable?`);
      throw e;
    } finally {
      clearTimeout(fetchTimer);
    }

    this.node = new AudioWorkletNode(ctx, "plaits", {
      numberOfInputs: 0,
      numberOfOutputs: 1,
      outputChannelCount: [1],
      processorOptions: { wasmBinary, seed: 0xC0FFEE },
    });

    // Wait for the worklet's "ready" (WASM up) or surface an init error/timeout.
    await new Promise<void>((resolve, reject) => {
      const port = this.node!.port;
      let settled = false;
      const finish = (fn: () => void) => {
        if (settled) return;
        settled = true;
        port.removeEventListener("message", onMsg);
        clearTimeout(readyTimer);
        fn();
      };
      const onMsg = (e: MessageEvent) => {
        if (e.data?.type === "ready") finish(() => resolve());
        else if (e.data?.type === "error") finish(() => reject(new Error(e.data.message)));
      };
      port.addEventListener("message", onMsg);
      port.start();
      const readyTimer = setTimeout(() => {
        finish(() => reject(new Error("Plaits WASM did not signal ready within 10s — the audio worklet failed to initialise silently. Reload to retry.")));
      }, 10_000);
    });

    // Master output level (Plaits' own LPG shapes the per-note envelope).
    this.gainNode = ctx.createGain();
    this.gainNode.gain.value = this.params.gain;
    this.node.connect(this.gainNode);

    // Seed the worklet with current param values.
    this.setEngineIndex(this.currentModelIndex);
    this.pushParam("harmonics", this.params.harmonics);
    this.pushParam("timbre", this.params.timbre);
    this.pushParam("morph", this.params.morph);
    this.node.port.postMessage({ type: "setDecay", value: this.params.decay });
    this.node.port.postMessage({ type: "setLpgColour", value: this.params.lpgColour });
  }

  noteOn(midi: MidiNote, opts: NoteOnOpts = {}): void {
    if (!this.ctx || !this.node) return;
    const t = opts.time ?? this.ctx.currentTime;
    const v = opts.velocity ?? 0.8;
    this.activeMidi = midi;
    this.params.note = midi;

    // Pitch via the k-rate `note` param (re-apply any held pitch-bend on top).
    const noteParam = this.node.parameters.get("note");
    if (noteParam) noteParam.setValueAtTime(midi + this.pitchBend, t);

    // Strike: scheduled at the note's audio time, NOT message-receipt. Velocity
    // drives the LEVEL (VCA) + accent. The worklet supplies the clean trigger
    // edge that percussive engines need.
    this.node.port.postMessage({ type: "gateOn", time: t, velocity: v });
  }

  noteOff(midi: MidiNote, opts: NoteOffOpts = {}): void {
    if (!this.node) return;
    if (this.activeMidi !== null && this.activeMidi !== midi) return;
    this.activeMidi = null;
    const t = opts.time ?? this.ctx?.currentTime;
    // Close the gate — Plaits' LPG handles the release tail; self-enveloped
    // drums ignore it and ring out on their own.
    this.node.port.postMessage({ type: "gateOff", time: t });
  }

  allNotesOff(): void {
    if (!this.node) return;
    // Hard stop: drop queued strikes and close the voice now.
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

  /** Switch the active synthesis engine (0..23). */
  private setEngineIndex(index: number): void {
    index = Math.max(0, Math.min(23, index | 0));
    this.currentModelIndex = index;
    this.node?.port.postMessage({ type: "setEngine", value: index });
  }

  // Push a k-rate macro param (harmonics/timbre/morph) into the worklet.
  private pushParam(id: string, value: number, time?: number): void {
    if (!this.node || !this.ctx) return;
    const p = this.node.parameters.get(id);
    if (p) p.setTargetAtTime(value, time ?? this.ctx.currentTime, 0.005);
  }

  getParameterSchema(): ParameterDescriptor[] {
    return [
      { id: "model", label: "Model", group: "shape", type: "discrete", min: 0, max: 23, step: 1,
        default: 0, apply: "message",
        description: "Synthesis model — HARMONICS, TIMBRE and MORPH change meaning per model." },
      { id: "harmonics", label: "Harmonics", group: "shape", type: "continuous", min: 0, max: 1, default: 0.5,
        apply: "audioparam" },
      { id: "timbre", label: "Timbre", group: "shape", type: "continuous", min: 0, max: 1, default: 0.5,
        apply: "audioparam" },
      { id: "morph", label: "Morph", group: "shape", type: "continuous", min: 0, max: 1, default: 0.5,
        apply: "audioparam" },
      { id: "decay", label: "Decay", group: "envelope", type: "continuous", min: 0, max: 1, default: 0.5,
        apply: "message",
        description: "Internal envelope / low-pass-gate decay time — how long a note rings." },
      { id: "lpgColour", label: "LPG Tone", group: "envelope", type: "continuous", min: 0, max: 1, default: 0.5,
        apply: "message",
        description: "Low-pass-gate colour — from a plucky, filtered close to a brighter VCA-like one." },
      { id: "gain", label: "Gain", group: "output", type: "continuous", min: 0, max: 1, default: 0.6,
        apply: "audioparam" },
    ];
  }

  setParameter(id: string, value: number, time?: number): void {
    if (!this.ctx || !this.node) return;
    this.params[id] = value;
    const t = time ?? this.ctx.currentTime;

    switch (id) {
      case "model":
        this.setEngineIndex(value | 0);
        return;
      case "harmonics":
      case "timbre":
      case "morph":
        this.pushParam(id, value, t);
        return;
      case "decay":
        this.node.port.postMessage({ type: "setDecay", value });
        return;
      case "lpgColour":
        this.node.port.postMessage({ type: "setLpgColour", value });
        return;
      case "gain":
        // Master output level — applied live (Plaits shapes the note envelope itself).
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
