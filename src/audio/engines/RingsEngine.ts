import type {
  ISynthEngine, EngineManifest, ParameterDescriptor,
  NoteOnOpts, NoteOffOpts, MidiNote,
} from "../types";

/**
 * RingsEngine — wraps the Rings WASM AudioWorklet behind ISynthEngine.
 *
 * Rings is a RESONATOR: a note is a one-shot STRUM into the physical model,
 * which then rings out on its own — there is no held gate and no release
 * phase to trigger. noteOn sets the pitch param and posts a strum; noteOff is
 * accepted (and tracked) but intentionally does nothing: DAMPING is the
 * release. Amplitude lives inside the model, so the GainNode here is only the
 * master level knob — exactly like PlaitsEngine.
 *
 * Pitch is MIDI-direct: performance_state.note = MIDI number (69 → 440 Hz;
 * verified in-app in the integration pass — if it lands a constant interval
 * off, add the offset in the worklet's note push, not here).
 */
export class RingsEngine implements ISynthEngine {
  manifest: EngineManifest = {
    id: "rings",
    name: "Rings",
    description: "Authentic Mutable Instruments Rings — Émilie Gillet's MIT resonator firmware compiled to WASM.",
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
  private currentModelIndex = 0;     // 0 = modal resonator

  // Mirror of param values for getParameter().
  private params: Record<string, number> = {
    note: 48, structure: 0.4, brightness: 0.6, damping: 0.55, position: 0.3,
    gain: 0.6,
  };

  get output(): AudioNode | null { return this.gainNode; }

  async init(ctx: AudioContext): Promise<void> {
    this.ctx = ctx;

    await ctx.audioWorklet.addModule(import.meta.env.BASE_URL + "rings-worklet.js");

    // Fetch the wasm on the main thread; hand it to the worklet via
    // processorOptions (sidesteps URL resolution quirks inside the worklet).
    const fetchCtl = new AbortController();
    const fetchTimer = setTimeout(() => fetchCtl.abort(), 6000);
    let wasmBinary: ArrayBuffer;
    const wasmUrl = import.meta.env.BASE_URL + "rings.wasm";
    try {
      const wasmResp = await fetch(wasmUrl, { signal: fetchCtl.signal });
      if (!wasmResp.ok) throw new Error(`Failed to load rings.wasm: HTTP ${wasmResp.status}`);
      wasmBinary = await wasmResp.arrayBuffer();
    } catch (e) {
      if ((e as Error).name === "AbortError") throw new Error(`Timed out fetching ${wasmUrl} after 6s. Is the file deployed and reachable?`);
      throw e;
    } finally {
      clearTimeout(fetchTimer);
    }

    this.node = new AudioWorkletNode(ctx, "rings", {
      numberOfInputs: 0,
      numberOfOutputs: 1,
      outputChannelCount: [1],
      processorOptions: { wasmBinary, seed: 0x5eed12 },
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
        finish(() => reject(new Error("Rings WASM did not signal ready within 10s — the audio worklet failed to initialise silently. Reload to retry.")));
      }, 10_000);
    });

    // Master output level (the resonator shapes each note's envelope itself).
    this.gainNode = ctx.createGain();
    this.gainNode.gain.value = this.params.gain;
    this.node.connect(this.gainNode);

    // Seed the worklet with current param values.
    this.setModelIndex(this.currentModelIndex);
    this.pushParam("structure", this.params.structure);
    this.pushParam("brightness", this.params.brightness);
    this.pushParam("damping", this.params.damping);
    this.pushParam("position", this.params.position);
  }

  noteOn(midi: MidiNote, opts: NoteOnOpts = {}): void {
    if (!this.ctx || !this.node) return;
    const t = opts.time ?? this.ctx.currentTime;
    this.activeMidi = midi;
    this.params.note = midi;

    // Pitch via the k-rate `note` param (re-apply any held pitch-bend on top).
    const noteParam = this.node.parameters.get("note");
    if (noteParam) noteParam.setValueAtTime(midi + this.pitchBend, t);

    // Strike: a one-shot strum scheduled at the note's audio time. Velocity is
    // intentionally unused — the hardware's internal exciter has no velocity
    // input, and inventing one would break the "authentic firmware" promise.
    this.node.port.postMessage({ type: "gateOn", time: t });
  }

  noteOff(midi: MidiNote, opts: NoteOffOpts = {}): void {
    if (!this.node) return;
    if (this.activeMidi !== null && this.activeMidi !== midi) return;
    this.activeMidi = null;
    // Resonator identity: the note rings out its physical decay (DAMPING).
    // Sent anyway for protocol parity; the worklet no-ops it.
    this.node.port.postMessage({ type: "gateOff", time: opts.time });
  }

  allNotesOff(): void {
    if (!this.node) return;
    // Drop queued strikes. The current ring-out decays naturally — a resonator
    // has no gate to slam shut, and cutting the tail would sound broken.
    this.node.port.postMessage({ type: "clearStrikes" });
    if (this.ctx) this.node.parameters.get("note")?.cancelScheduledValues(this.ctx.currentTime);
    this.activeMidi = null;
  }

  setPitchBend(semitones: number): void {
    if (!this.node || !this.ctx) return;
    this.pitchBend = semitones;
    const noteParam = this.node.parameters.get("note");
    if (noteParam) noteParam.setTargetAtTime(this.params.note + semitones, this.ctx.currentTime, 0.005);
  }

  /** Switch the active resonator model (0..11; 6+ = the string-synth easter egg). */
  private setModelIndex(index: number): void {
    index = Math.max(0, Math.min(11, index | 0));
    this.currentModelIndex = index;
    this.node?.port.postMessage({ type: "setModel", value: index });
  }

  // Push a k-rate macro param into the worklet.
  private pushParam(id: string, value: number, time?: number): void {
    if (!this.node || !this.ctx) return;
    const p = this.node.parameters.get(id);
    if (p) p.setTargetAtTime(value, time ?? this.ctx.currentTime, 0.005);
  }

  getParameterSchema(): ParameterDescriptor[] {
    return [
      { id: "model", label: "Model", group: "shape", type: "discrete", min: 0, max: 11, step: 1,
        default: 0, apply: "message",
        description: "Resonator model — STRUCTURE, BRIGHTNESS, DAMPING and POSITION change meaning per model." },
      { id: "structure", label: "Structure", group: "shape", type: "continuous", min: 0, max: 1, default: 0.4,
        apply: "audioparam" },
      { id: "brightness", label: "Brightness", group: "shape", type: "continuous", min: 0, max: 1, default: 0.6,
        apply: "audioparam" },
      { id: "damping", label: "Damping", group: "envelope", type: "continuous", min: 0, max: 1, default: 0.55,
        apply: "audioparam",
        description: "Decay time — how long the resonator rings after each strike. This IS the release." },
      { id: "position", label: "Position", group: "shape", type: "continuous", min: 0, max: 1, default: 0.3,
        apply: "audioparam" },
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
        this.setModelIndex(value | 0);
        return;
      case "structure":
      case "brightness":
      case "damping":
      case "position":
        this.pushParam(id, value, t);
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
    // A resonator tail can ring for seconds at full amplitude. AudioEngine
    // swaps engines and disconnects the old one ~60ms later, which would
    // hard-cut an in-flight tail audibly (Braids instead fades via a gain
    // ramp on swap). Ramp gain to silence here before tearing down so an
    // engine swap doesn't click/cut. Panic (allNotesOff) intentionally does
    // NOT fade — the locked Rings panic semantics is RING-OUT: it drops
    // queued strikes and lets the current tail decay naturally.
    if (this.ctx && this.gainNode) {
      this.gainNode.gain.setTargetAtTime(0, this.ctx.currentTime, 0.01);
      await new Promise((r) => setTimeout(r, 50));
    }
    // Stop the worklet (free WASM buffer + return false from process()) so the
    // disposed processor is collected, not left rendering on the audio thread.
    if (this.node) { try { this.node.port.postMessage({ type: "dispose" }); } catch { /* */ } }
    if (this.node) { try { this.node.disconnect(); } catch { /* */ } this.node = null; }
    if (this.gainNode) { try { this.gainNode.disconnect(); } catch { /* */ } this.gainNode = null; }
    this.ctx = null;
  }
}
