import type {
  ISynthEngine, EngineManifest, ParameterDescriptor,
  NoteOnOpts, NoteOffOpts, MidiNote,
} from "../types";
import { FM_MODELS, FM_PATCHES } from "../../data/fm-models";
import { applyMacros, FM_MACRO_DEFAULTS, type FmMacros } from "../../data/fm-macros";

/**
 * FmEngine — wraps the six-operator FM WASM AudioWorklet behind ISynthEngine.
 *
 * Based on the open-source music-synthesizer-for-android DSP (Apache-2.0); see
 * LICENSE-msfa.txt and NOTICE. Factual attribution only.
 *
 * Two things make this engine different from the other four:
 *
 * **It is a keyboard voice, not a macro-oscillator or a resonator.** A note is
 * a held gate: note-on builds the voice's operator state and note-off starts
 * the envelopes' release stage. Velocity is real — key velocity sensitivity is
 * a per-operator patch field the engine reads — so unlike Rings we pass it.
 *
 * **Its "model" is data, not a firmware enum.** Each FM model is 156 bytes of
 * our own patch, held in src/data/fm-models.ts and posted to the worklet on
 * selection. The wasm knows nothing about the corpus.
 *
 * Pitch needs no calibration trim: MIDI 48/60/69/84 measure 130.8/261.6/440.0/
 * 1046.5 Hz straight out of the binary (src/audio/fm-wasm.test.ts). That holds
 * because the engine runs at its calibrated 44.1 kHz and the worklet resamples
 * — see dsp/shim/fm_shim.cc before changing any rate.
 */

/**
 * Make-up gain, in linear amplitude, applied on top of the user's gain knob.
 *
 * A normal FM voice sits well below full scale by design — msfa's own int32 ->
 * int16 conversion reserves headroom for algorithm 32's six simultaneous
 * carriers. Measured against Rings over identical 2-second windows at C4, the
 * boot patch is 3.9 dB quieter in attack RMS (-27.1 vs -23.2 dBFS) and its peak
 * is flat within 0.5 dB from MIDI 36 to 84, so the correction is one constant.
 *
 * x2.0 is +6 dB. Two measurements bracket it: offline, +4.1 dB matches Rings'
 * attack RMS exactly; in-app, playing the same demo melody through each engine
 * and sampling the master analyser, FM at x1.6 still sat 2.9 dB under Rings
 * (-37.9 vs -35.0 dBFS RMS). x2.0 splits that, and leaves FM's peak around
 * 0.10-0.13 against Braids' 0.22, so there is headroom left over.
 *
 * (Do not read the "-17 dBFS" figure in the spec as the gap to close — that is
 * the distance to full scale, and closing it would make FM by far the loudest
 * engine in the app. For reference, the four engines are not level-matched with
 * each other today either: Braids runs about 15 dB hotter than Rings on the
 * same melody. Matching Rings is the right target because it is the engine FM
 * most resembles — struck, decaying, velocity-shaped.)
 */
const FM_MAKEUP_GAIN = 2.0;

/** msfa hardcodes the bend range inside Dx7Note::compute. */
const FM_BEND_RANGE = 3;

export class FmEngine implements ISynthEngine {
  manifest: EngineManifest = {
    id: "fm",
    name: "FM",
    description: "Six-operator FM — the open-source music-synthesizer-for-android DSP (Apache-2.0) compiled to WASM, playing our own patches.",
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
  private currentModelIndex = 0;

  // Mirror of param values for getParameter().
  private params: Record<string, number> = {
    model: 0,
    brightness: FM_MACRO_DEFAULTS.brightness,
    ratio: FM_MACRO_DEFAULTS.ratio,
    feedback: FM_MACRO_DEFAULTS.feedback,
    envelope: FM_MACRO_DEFAULTS.envelope,
    gain: 0.6,
  };

  private get macros(): FmMacros {
    return {
      brightness: this.params.brightness,
      ratio: this.params.ratio,
      feedback: this.params.feedback,
      envelope: this.params.envelope,
    };
  }

  get output(): AudioNode | null { return this.gainNode; }

  async init(ctx: AudioContext): Promise<void> {
    this.ctx = ctx;

    await ctx.audioWorklet.addModule(import.meta.env.BASE_URL + "fm-worklet.js");

    // Fetch the wasm on the main thread and hand it to the worklet via
    // processorOptions (sidesteps URL resolution quirks inside the worklet).
    const fetchCtl = new AbortController();
    const fetchTimer = setTimeout(() => fetchCtl.abort(), 6000);
    let wasmBinary: ArrayBuffer;
    const wasmUrl = import.meta.env.BASE_URL + "fm.wasm";
    try {
      const wasmResp = await fetch(wasmUrl, { signal: fetchCtl.signal });
      if (!wasmResp.ok) throw new Error(`Failed to load fm.wasm: HTTP ${wasmResp.status}`);
      wasmBinary = await wasmResp.arrayBuffer();
    } catch (e) {
      if ((e as Error).name === "AbortError") throw new Error(`Timed out fetching ${wasmUrl} after 6s. Is the file deployed and reachable?`);
      throw e;
    } finally {
      clearTimeout(fetchTimer);
    }

    this.node = new AudioWorkletNode(ctx, "fm", {
      numberOfInputs: 0,
      numberOfOutputs: 1,
      outputChannelCount: [1],
      processorOptions: { wasmBinary },
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
        finish(() => reject(new Error("FM WASM did not signal ready within 10s — the audio worklet failed to initialise silently. Reload to retry.")));
      }, 10_000);
    });

    // Master output level. The operator envelopes shape each note themselves,
    // so this node is level only — plus the fixed make-up factor above.
    this.gainNode = ctx.createGain();
    this.gainNode.gain.value = this.params.gain * FM_MAKEUP_GAIN;
    this.node.connect(this.gainNode);

    // Seed the worklet with the current patch.
    this.setModelIndex(this.currentModelIndex);
  }

  noteOn(midi: MidiNote, opts: NoteOnOpts = {}): void {
    if (!this.ctx || !this.node) return;
    const t = opts.time ?? this.ctx.currentTime;
    this.activeMidi = midi;

    // Velocity is real here: every operator has a key-velocity-sensitivity
    // field the engine reads at note-on, so a soft note is not just quieter,
    // it is less bright. 0..1 in, 1..127 out (0 would be a note-off in MIDI).
    const v = opts.velocity ?? 0.8;
    const velocity = Math.max(1, Math.min(127, Math.round(v * 127)));

    this.node.port.postMessage({ type: "gateOn", time: t, midi, velocity });
  }

  noteOff(midi: MidiNote, opts: NoteOffOpts = {}): void {
    if (!this.node) return;
    // Monophonic: ignore the release of a note that has already been stolen.
    if (this.activeMidi !== null && this.activeMidi !== midi) return;
    this.activeMidi = null;
    this.node.port.postMessage({ type: "gateOff", time: opts.time });
  }

  allNotesOff(): void {
    if (!this.node) return;
    // FM has a real gate, so panic closes it. The operator envelopes' release
    // stage still runs, so this is a release and not an audible hard cut —
    // unlike Rings, whose panic semantics is ring-out because a resonator has
    // no gate to close.
    this.node.port.postMessage({ type: "allNotesOff" });
    this.activeMidi = null;
  }

  setPitchBend(semitones: number): void {
    if (!this.node || !this.ctx) return;
    // Clamped to the engine's own range rather than silently wrapping: msfa
    // hardcodes +/-3 semitones in Dx7Note::compute (widening it would mean
    // patching vendored DSP, deliberately not done — spec §9).
    const clamped = Math.max(-FM_BEND_RANGE, Math.min(FM_BEND_RANGE, semitones));
    const p = this.node.parameters.get("bend");
    if (p) p.setTargetAtTime(clamped, this.ctx.currentTime, 0.005);
  }

  /** Load the patch for a corpus index. Applies to the sounding note too. */
  private setModelIndex(index: number): void {
    const last = FM_PATCHES.length - 1;
    index = Math.max(0, Math.min(last, index | 0));
    this.currentModelIndex = index;
    this.params.model = index;
    this.pushPatch();
  }

  /**
   * Rebuild the working patch (corpus voice + current macro positions) and send
   * it to the worklet, which applies it to the note already sounding.
   *
   * Stock msfa cannot do that — it builds operator state inside Dx7Note::init
   * and exposes no route in afterwards, so macro moves used to land on the next
   * note-on. Dx7Note::update and Env::update are our own additions to the
   * vendored engine (2026-09-11): they recompute the same fields init() does
   * but re-aim the running envelopes instead of restarting them, and leave the
   * oscillator phases alone, so a knob turned against a held note changes that
   * note without a click. See dsp/vendor/msfa/README.md.
   */
  private pushPatch(): void {
    const base = FM_PATCHES[this.currentModelIndex];
    if (!base || !this.node) return;
    this.node.port.postMessage({ type: "setPatch", bytes: applyMacros(base, this.macros) });
  }

  getParameterSchema(): ParameterDescriptor[] {
    return [
      { id: "model", label: "Voice", group: "shape", type: "discrete",
        min: 0, max: Math.max(0, FM_MODELS.length - 1), step: 1, default: 0,
        apply: "message",
        description: "The loaded patch — six operators, their envelopes, and the algorithm wiring them together." },
      { id: "brightness", label: "Brightness", group: "shape", type: "continuous",
        min: 0, max: 1, default: 0.5, apply: "message",
        description: "Modulation index — the output level of every operator that modulates another, moved together. Centre is the voice as designed." },
      { id: "ratio", label: "Ratio", group: "shape", type: "continuous",
        min: 0, max: 1, default: 0.5, apply: "message",
        description: "Modulator frequency ratios, scaled together across an octave either side of the voice's own. Whole-number ratios sound harmonic; everything between them sounds like metal." },
      { id: "feedback", label: "Feedback", group: "shape", type: "continuous",
        min: 0, max: 1, default: 0.5, apply: "message",
        description: "The algorithm's feedback loop, from none to full. Adds progressively noisier harmonics." },
      { id: "envelope", label: "Envelope", group: "envelope", type: "continuous",
        min: 0, max: 1, default: 0.5, apply: "message",
        description: "Every operator's envelope rates together — left is a slow bloom, right is a sharp pluck." },
      { id: "gain", label: "Gain", group: "output", type: "continuous",
        min: 0, max: 1, default: 0.6, apply: "audioparam" },
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
      case "brightness":
      case "ratio":
      case "feedback":
      case "envelope":
        this.pushPatch();
        return;
      case "gain":
        if (this.gainNode) {
          this.gainNode.gain.setTargetAtTime(value * FM_MAKEUP_GAIN, t, 0.01);
        }
        return;
    }
  }

  getParameter(id: string): number {
    return this.params[id] ?? 0;
  }

  async dispose(): Promise<void> {
    this.allNotesOff();
    // Dispose owns the fade (the ordering fixed in 98075a2): AudioEngine swaps
    // engines and disconnects the old one ~60 ms later, so an FM note still in
    // its release stage would be hard-cut audibly. Ramp to silence first.
    // Panic (allNotesOff) deliberately does not fade — closing the gate is
    // already a musical release for this engine.
    if (this.ctx && this.gainNode) {
      this.gainNode.gain.setTargetAtTime(0, this.ctx.currentTime, 0.01);
      await new Promise((r) => setTimeout(r, 50));
    }
    // Stop the worklet (free the WASM buffers + return false from process())
    // so the disposed processor is collected, not left rendering.
    if (this.node) { try { this.node.port.postMessage({ type: "dispose" }); } catch { /* */ } }
    if (this.node) { try { this.node.disconnect(); } catch { /* */ } this.node = null; }
    if (this.gainNode) { try { this.gainNode.disconnect(); } catch { /* */ } this.gainNode = null; }
    this.ctx = null;
  }
}
