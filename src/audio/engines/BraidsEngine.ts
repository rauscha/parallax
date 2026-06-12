import type {
  ISynthEngine, EngineManifest, ParameterDescriptor,
  NoteOnOpts, NoteOffOpts, MidiNote,
} from "../types";
import { BRAIDS_MODELS, type BraidsModel } from "../../data/braids-models";
import { getBraidsEnvelope } from "../../data/braids-envelopes";

// Anchor an AudioParam at its current scheduled value at time `t`, then clear
// future automation. Native cancelAndHoldAtTime preserves the ramp value
// exactly at `t`; without it (Firefox), a fast retrigger could snap to a stale
// snapshot of .value, causing audible clicks. The fallback matches the old
// behaviour, so this is a strict no-regression upgrade.
function cancelAndHold(param: AudioParam, t: number): void {
  const p = param as AudioParam & { cancelAndHoldAtTime?: (t: number) => void };
  if (typeof p.cancelAndHoldAtTime === "function") {
    p.cancelAndHoldAtTime(t);
  } else {
    const v = param.value;
    param.cancelScheduledValues(t);
    param.setValueAtTime(v, t);
  }
}

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
  private pitchBend = 0;             // semitones — persists across notes (re-applied on each noteOn)
  // True for the unpitched drum models (KICK, SNAR, CYMB, DRUM): one-shots whose
  // AD envelope shapes the whole amplitude decay, so noteOff must NOT ramp the JS
  // gate down — that would truncate the tail (a quick tap should still play the
  // full hit). The voice silences itself when the AD decay completes; the gate
  // just stays open. Pitched models leave this false so the Release knob works
  // and successive notes don't pile up into discordant overlapping rings.
  private letRing = false;

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

    await ctx.audioWorklet.addModule(import.meta.env.BASE_URL + "braids-worklet.js");

    // Fetch the wasm binary on the main thread and hand it to the worklet via
    // processorOptions — sidesteps URL resolution quirks inside the worklet.
    // AbortController guards against a hung connection (the file is ~150KB; if
    // it isn't here in 5s something is structurally wrong, not just slow).
    const fetchCtl = new AbortController();
    const fetchTimer = setTimeout(() => fetchCtl.abort(), 5000);
    let wasmBinary: ArrayBuffer;
    // Base-relative so it resolves under a sub-path deploy (e.g. /parallax/) as
    // well as at the domain root. BASE_URL is "/" in dev, Vite's `base` in build.
    const wasmUrl = import.meta.env.BASE_URL + "braids.wasm";
    try {
      const wasmResp = await fetch(wasmUrl, { signal: fetchCtl.signal });
      if (!wasmResp.ok) throw new Error(`Failed to load braids.wasm: HTTP ${wasmResp.status}`);
      wasmBinary = await wasmResp.arrayBuffer();
    } catch (e) {
      if ((e as Error).name === "AbortError") throw new Error(`Timed out fetching ${wasmUrl} after 5s. Is the file deployed and reachable?`);
      throw e;
    } finally {
      clearTimeout(fetchTimer);
    }

    this.node = new AudioWorkletNode(ctx, "braids", {
      numberOfInputs: 0,
      numberOfOutputs: 1,
      outputChannelCount: [1],
      processorOptions: { wasmBinary, signatureSeed: 0xC0FFEE },
    });

    // Wait for the worklet's "ready" message so we know WASM is up before any
    // shape changes go through. Race against a timeout so a silent worklet
    // failure surfaces an error instead of hanging the Tap-to-start screen.
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
        finish(() => reject(new Error("Braids WASM did not signal ready within 10s — the audio worklet failed to initialise silently. Reload to retry.")));
      }, 10_000);
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

    // Pitch — re-apply any active pitch-bend on top of the new note, so a held
    // bend survives a note change instead of being overwritten. params.pitch
    // stays the *unbent* base, which setPitchBend() bends relative to.
    const pitchParam = this.node.parameters.get("pitch");
    if (pitchParam) pitchParam.setValueAtTime(midi + this.pitchBend, t);
    this.params.pitch = midi;

    // Strike the engine — scheduled at the note's audio time `t`, NOT on
    // message-receipt. A bare strike fired the instant the worklet got the
    // message, which is up to one scheduler look-ahead (~100 ms) before `t`.
    // That early strike re-articulated the OLD pitch for the look-ahead window —
    // the "grace note into the real note" bug. We also send the note's pitch so
    // the worklet can apply it on the exact strike quantum: the k-rate `pitch`
    // param can lag the strike by one quantum at the boundary, which otherwise
    // re-articulates the stale prior pitch (e.g. the A4 tap-blip before note 1).
    this.node.port.postMessage({ type: "gateOn", time: t, pitch: midi + this.pitchBend });

    // Envelope: short attack ramp to (v * gain), then optional decay sustain.
    const target = v * this.params.gain;
    const g = this.gainNode.gain;
    // Pin the attack ramp's START to `t`. cancelAndHold alone isn't enough: when
    // the most recent gain event is in the past (e.g. the release ramp from a
    // prior stop/noteOff), linearRampToValueAtTime interpolates the attack from
    // THAT stale event, so the gate begins opening well before `t` — uncovering
    // the pitch still sitting in the param (the previous note) as an audible
    // grace note before the new pitch lands at `t`. An explicit setValueAtTime
    // anchors the ramp at `t` so volume and pitch open together.
    cancelAndHold(g, t);
    g.setValueAtTime(g.value, t);
    g.linearRampToValueAtTime(target, t + this.params.attack);
    // Hold until noteOff. (For drum/percussion models we may want auto-release
    // — handled in M2 once the AD envelope wiring is exposed.)
  }

  noteOff(midi: MidiNote, opts: NoteOffOpts = {}): void {
    if (!this.ctx || !this.gainNode) return;
    if (this.activeMidi !== null && this.activeMidi !== midi) return;
    this.activeMidi = null;
    if (this.node) this.node.port.postMessage({ type: "gateOff" });
    // Let-ring drum models silence themselves via the WASM AD envelope; ramping
    // the JS gate down here would clip the decay tail short, so leave it open.
    // The gate is harmless once the WASM VCA reaches zero (gate × 0 = silence),
    // and the next strike re-triggers the envelope. Panic/allNotesOff still closes
    // it for a hard stop.
    if (this.letRing) return;
    const t = opts.time ?? this.ctx.currentTime;
    const g = this.gainNode.gain;
    cancelAndHold(g, t);
    g.linearRampToValueAtTime(0, t + this.params.release);
  }

  allNotesOff(): void {
    if (!this.ctx || !this.gainNode) return;
    const t = this.ctx.currentTime;
    const g = this.gainNode.gain;
    // Drop any future-scheduled gain automation (a sequencer may have queued
    // ramps ahead), hold the current value, then ramp to silence.
    cancelAndHold(g, t);
    g.linearRampToValueAtTime(0, t + 0.04);
    // Also cancel future pitch automation and reset the worklet's gate so a
    // panic fully disarms the engine — not just the output level.
    this.node?.parameters.get("pitch")?.cancelScheduledValues(t);
    this.node?.port.postMessage({ type: "gateOff" });
    // Drop any strikes the sequencer queued ahead of the panic, so a stop
    // doesn't fire a stray re-trigger a fraction of a second later.
    this.node?.port.postMessage({ type: "clearStrikes" });
    this.activeMidi = null;
  }

  setPitchBend(semitones: number): void {
    if (!this.node) return;
    const pitchParam = this.node.parameters.get("pitch");
    if (!pitchParam || !this.ctx) return;
    this.pitchBend = semitones;   // remembered so the next noteOn re-applies it
    pitchParam.setTargetAtTime(this.params.pitch + semitones, this.ctx.currentTime, 0.005);
  }

  /** Switch the active synthesis model (0..46). */
  setShape(index: number): void {
    index = Math.max(0, Math.min(46, index | 0));
    this.currentModelIndex = index;
    if (!this.node) return;
    this.node.port.postMessage({ type: "setShape", value: index });
    this.applyEnvelope(index);
  }

  // Push the model's built-in AD envelope into the worklet alongside the shape.
  // The unpitched drum models (KICK, SNAR, CYMB, DRUM) get a one-shot VCA decay;
  // every other model — including the self-decaying pitched ones (PLUK, BELL) —
  // resolves to an all-zero envelope that leaves the VCA wide open and gates
  // normally, identical to the pre-envelope behaviour.
  // Values are clamped to the firmware-faithful ranges (attack/decay 0..15 so
  // the LUT index stays in bounds, vca 0..1, depths 0..15) so a bad table entry
  // can never push the DSP's envelope LUT read out of bounds.
  private applyEnvelope(index: number): void {
    if (!this.node) return;
    const env = getBraidsEnvelope(index);
    this.letRing = env.letRing;
    const c = (x: number, hi: number) => Math.max(0, Math.min(hi, x | 0));
    this.node.port.postMessage({
      type: "setEnvelopeShape",
      attack: c(env.attack, 15),
      decay: c(env.decay, 15),
    });
    this.node.port.postMessage({
      type: "setAdAmounts",
      vca: c(env.vca, 1),
      timbre: c(env.timbre, 15),
      color: c(env.color, 15),
      fm: c(env.fm, 15),
    });

    // If we switch models while no note is held, close the gate. A one-shot
    // percussion model leaves the JS gate open (so its decay tail rings out);
    // without this, switching from that to a *sustained* model — whose WASM VCA
    // is wide open — would drone instantly through the still-open gate. Only do
    // this when idle; a mid-note switch (live model sweep) keeps continuity.
    if (this.activeMidi === null && this.ctx && this.gainNode) {
      const t = this.ctx.currentTime;
      cancelAndHold(this.gainNode.gain, t);
      this.gainNode.gain.linearRampToValueAtTime(0, t + 0.01);
    }
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
    // Tell the worklet to stop: it sets disposed = true, frees its WASM heap
    // buffer, and returns false from process() so the processor is collected
    // instead of rendering forever on the audio thread (one leak per swap).
    // Posted before disconnect; AudioEngine defers this whole call past the
    // fade so allNotesOff's ramp is heard first (A3).
    if (this.node) { try { this.node.port.postMessage({ type: "dispose" }); } catch { /* */ } }
    if (this.node) { try { this.node.disconnect(); } catch { /* */ } this.node = null; }
    if (this.gainNode) { try { this.gainNode.disconnect(); } catch { /* */ } this.gainNode = null; }
    this.ctx = null;
  }
}
