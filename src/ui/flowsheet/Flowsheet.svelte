<script lang="ts">
  /**
   * The flowsheet teacher (spec §4) — the algorithm as a diagram, with the real
   * signal on every node.
   *
   * What makes this honest rather than decorative:
   *
   * - **Every trace is tap data.** Six operators, the feedback wire and the voice
   *   output, read inside the engine's render at 44.1 kHz before the resampler.
   *   No model of FM runs on this thread.
   * - **One trigger for all eight traces.** The offset is found once, on the
   *   output, and every trace is drawn from that same sample index. That is what
   *   makes the ratio readable *as motion*: an operator at exactly 2x the note
   *   stands still frame after frame, and one at 2.01x visibly walks. Triggering
   *   each trace separately would lock every one of them and destroy the single
   *   most useful thing on the screen.
   * - **The spectrum is the same samples.** It is the FFT of the output trace
   *   drawn above it, not a separate AnalyserNode at the context rate.
   * - **The numbers come from the patch bytes the engine got**, macros included —
   *   not from the voice as authored.
   *
   * Accessibility, which spec §5 calls the hardest case in the app: no meaning is
   * carried by hue. Modulation wires are dashed and audio wires are solid; every
   * node states its role in words; the feedback loop is labelled as well as
   * drawn; and nothing is a translucent fill.
   */
  import { onDestroy } from "svelte";
  import { audioEngine } from "../../audio/AudioEngine";
  import {
    FM_TAP_LABELS,
    type FmEngine,
    type FmTapSnapshot,
  } from "../../audio/engines/FmEngine";
  import { activeParamStore, audioReadyStore, engineIdStore, patchStore } from "../../state/stores";
  import { indexForCode } from "../../audio/registry";
  import { setView } from "../../state/route";
  import { isPlayingStore } from "../../state/stores";
  import { playTransport, stopTransport } from "../../sequencer";
  import { FM_PATCHES, FM_MODELS } from "../../data/fm-models";
  import { applyMacros, FM_MACRO_DEFAULTS, type FmMacros } from "../../data/fm-macros";
  import { modulatorsOf } from "../../data/fm-algorithms";
  import { readPatch, formatRatio } from "./readout";
  import { layoutAlgorithm, geometryFor, STACK_SUMMARIES_ABOVE } from "./layout";
  import { drawTrace, findTrigger, fitCanvas, peak, readToken, tokenFloat } from "../../viz/trace";
  import { traceGain } from "../../viz/trace-gain";
  import { spectrumDb, fftWork } from "../../viz/fft";
  import Knob from "../Knob.svelte";
  import type { ParameterDescriptor } from "../../audio/types";

  const TAPS = 8;
  const OP_TAPS = 6;
  const WIRE_TAP = 6;
  const OUT_TAP = 7;

  /**
   * Operator scope sizes come from the node geometry (layout.ts), which changes
   * with the viewport: 200×60 at standard size, 172×46 on a 1366×768 laptop.
   */
  const ENV_H = 16;
  const OUT_SCOPE_H = 96;
  const SPEC_H = 132;

  /** Window choices for "slow" — fewer samples of the same capture, magnified. */
  const WINDOWS = [1024, 512, 256, 128] as const;
  /** Envelope strip history, in frames (~60/s), so ~3 seconds of shape. */
  const ENV_FRAMES = 180;
  /** Below this viewport width the diagram cannot be drawn honestly (spec §4.4). */
  const MIN_WIDTH = 1024;

  // ---------------------------------------------------------------- app state
  const unsubs: Array<() => void> = [];
  let ready = $state(false);
  let engineId = $state(engineIdStore.get());
  let params = $state<Record<string, number>>(patchStore.get().params);
  let modelId = $state<string | null>(patchStore.get().modelId);
  let activeParam = $state<string | null>(activeParamStore.get());
  let playing = $state(false);
  unsubs.push(isPlayingStore.subscribe((v) => { playing = v; }));
  unsubs.push(audioReadyStore.subscribe((v) => { ready = v; }));
  unsubs.push(engineIdStore.subscribe((v) => { engineId = v; }));
  unsubs.push(patchStore.subscribe((p) => { params = p.params; modelId = p.modelId; }));
  unsubs.push(activeParamStore.subscribe((v) => { activeParam = v; }));

  // Bound to the window rather than driven by a matchMedia 'change' listener:
  // the gate also turns the taps off, so "the listener did not fire" is not an
  // acceptable failure mode. A bound innerWidth is re-read on every resize and
  // is correct on first render too.
  let innerWidth = $state(typeof window === "undefined" ? 1280 : window.innerWidth);
  let innerHeight = $state(typeof window === "undefined" ? 800 : window.innerHeight);
  const wideEnough = $derived(innerWidth >= MIN_WIDTH);
  /** Node proportions for this window — standard, or compact where standard would not fit. */
  const geo = $derived(geometryFor(innerWidth, innerHeight));
  const SCOPE_W = $derived(geo.nodeW - 16);
  const SCOPE_H = $derived(geo.scopeH);
  const ENV_W = $derived(SCOPE_W);

  // ------------------------------------------------------------- the patch
  /**
   * Which voice is loaded. It comes from `patchStore.modelId` — the lowercase
   * model *code* — resolved the same way `bindings.ts` resolves it, and NOT from
   * `params.model`. That field is deliberately skipped by the bindings ("modelId
   * lives on its own field"), so reading it gives whatever happened to be there
   * last and the flowsheet ends up captioning one voice while the engine plays
   * another. Caught exactly that way in testing.
   */
  const modelIndex = $derived.by(() => {
    const i = modelId ? indexForCode("fm", modelId) : -1;
    return i >= 0 ? i : 0;
  });
  const macros = $derived<FmMacros>({
    brightness: params.brightness ?? FM_MACRO_DEFAULTS.brightness,
    ratio: params.ratio ?? FM_MACRO_DEFAULTS.ratio,
    feedback: params.feedback ?? FM_MACRO_DEFAULTS.feedback,
    envelope: params.envelope ?? FM_MACRO_DEFAULTS.envelope,
  });
  /** The bytes the engine is actually running — base voice plus macro positions. */
  const effective = $derived(applyMacros(FM_PATCHES[modelIndex], macros));
  const patch = $derived(readPatch(effective));
  const layout = $derived(layoutAlgorithm(patch.algorithm, geo));
  /**
   * Wide algorithms put the output and spectrum UNDER the diagram rather than
   * beside it. Keyed on the diagram's own width, which is a property of the
   * algorithm rather than of the window — see STACK_SUMMARIES_ABOVE. Algorithm
   * 32 is 1448 px wide and leaves no column worth having next to it.
   */
  const stacked = $derived(layout.width > STACK_SUMMARIES_ABOVE);
  const model = $derived(FM_MODELS[modelIndex]);
  const modulators = $derived(new Set(modulatorsOf(patch.algorithm)));

  /** Wires from each carrier down into the output sum. */
  const outEdges = $derived(
    layout.nodes.filter((n) => n.carrier).map((n) => ({
      x1: n.x + layout.geo.nodeW / 2, y1: n.y + layout.geo.nodeH,
      x2: layout.outX, y2: layout.outY - layout.geo.outH / 2 + 10,
      from: n.op,
    })),
  );

  // ---------------------------------------------------------------- controls
  let frozen = $state(false);
  let windowIdx = $state(0);
  const win = $derived(WINDOWS[windowIdx]);
  /**
   * How the traces are scaled. Default is ONE SHARED gain across all eight,
   * normalised to the loudest of them, so trace heights stay comparable — a
   * modulator that is 30 dB under its carrier looks 30 dB under it, which is
   * information. A fixed +/-1 scale would be equally honest and useless: a
   * single carrier peaks around 0.015 of full scale, so every trace would be a
   * flat line. "Fit each" normalises per trace instead, for reading the shape of
   * something quiet, and says so on the button.
   *
   * "Fit each" is the DEFAULT, after measuring: on a bell voice two seconds in,
   * the modulator is ~30 dB under its carrier, so on a shared scale it is under
   * one pixel of a 46-pixel box — honest, and a picture of nothing. Shape is
   * what a node is here to show. The level that auto-scaling hides is therefore
   * not hidden: every node prints its trace's measured peak in dB relative to
   * the loudest trace on the sheet, so "this one is small because it is quiet"
   * stays on the screen as a number even when it is not on the screen as a size.
   */
  let fitEach = $state(true);
  /** The long "how to read this" note, behind the ? in the bar. Off by default. */
  let showHelp = $state(false);
  let hoverOp = $state<number | null>(null);

  // -------------------------------------------------------- tap frame buffers
  // Deliberately NOT $state: these change 60 times a second and nothing in the
  // template reads them. Making them reactive would re-render the whole diagram
  // every frame to draw into canvases that Svelte does not manage.
  let frame: Float32Array | null = null;      // the last snapshot, copied
  let haveFrame = false;
  let trigger = 0;
  const envRings: Float32Array[] = Array.from({ length: TAPS }, () => new Float32Array(ENV_FRAMES));
  let envWrite = 0;
  /** Decaying peak follower for the shared scale, so the picture does not breathe. */
  let scaleRef = 0.02;
  let specOut: Float32Array | null = null;
  let specWork: { re: Float32Array; im: Float32Array } | null = null;
  let colScratch: Float32Array | null = null;

  // Canvases, by tap index; plus the output pair and the spectrum.
  const opCanvas: Array<HTMLCanvasElement | undefined> = [];
  const envCanvas: Array<HTMLCanvasElement | undefined> = [];
  let wireCanvas: HTMLCanvasElement | undefined = $state();
  let outCanvas: HTMLCanvasElement | undefined = $state();
  let specCanvas: HTMLCanvasElement | undefined = $state();
  let sheet: HTMLElement | undefined = $state();
  /** Measured width of the right-hand column, so its canvases fill it. */
  let paneW = $state(480);

  // Readouts that are cheap enough to publish, throttled so they don't drive a
  // 60 Hz re-render of the whole component.
  let fps = $state(0);
  let dropped = $state(0);
  /**
   * Measured peak of each trace, in dB relative to the loudest trace. This is a
   * measurement of the signal, not a patch byte — it is the honest companion to
   * the node's IDX/VOL readout, which says what the patch asked for.
   */
  let relDb = $state<number[]>(new Array(TAPS).fill(-Infinity));
  let lastPeaks = new Float32Array(TAPS);
  let statFrames = 0;
  let statSince = 0;

  // A held note, so the diagram has something on it without going back to the
  // staff. The instrument view is still mounted underneath, so the staff, the
  // computer keyboard and MIDI all keep working from here too.
  let held = $state(false);
  const HOLD_NOTE = 60;
  function toggleHold(): void {
    const eng = audioEngine.currentEngine;
    if (!eng) return;
    if (held) eng.noteOff(HOLD_NOTE);
    else eng.noteOn(HOLD_NOTE, { velocity: 0.85 });
    held = !held;
  }

  function fmEngine(): FmEngine | null {
    const eng = audioEngine.currentEngine as FmEngine | null;
    if (!eng || engineId !== "fm") return null;
    return typeof eng.onTapSnapshot === "function" ? eng : null;
  }

  // ------------------------------------------------------------------ drawing
  function ctxOf(c: HTMLCanvasElement | undefined, w: number, h: number): CanvasRenderingContext2D | null {
    if (!c) return null;
    if (c.width === 0 || c.dataset.w !== `${w}x${h}`) {
      fitCanvas(c, w, h);
      c.dataset.w = `${w}x${h}`;
    }
    return c.getContext("2d");
  }

  /** Colours, read from the theme once per draw (cheap, and follows a swap). */
  function palette() {
    const el = sheet ?? document.body;
    return {
      signal: readToken(el, "--scope-trace", "#0072B2"),
      accent: readToken(el, "--accent", "#B54600"),
      grid: readToken(el, "--scope-grid", "rgba(20,22,26,0.13)"),
      dim: readToken(el, "--text-dim", "#5A626F"),
      hairline: readToken(el, "--hairline", "#A8B0BC"),
      lineW: tokenFloat(el, "--scope-trace-w", 1.6),
    };
  }

  function drawAll(): void {
    if (!frame || !haveFrame) return;
    const p = palette();
    const start = Math.min(trigger, 1024 - win);

    for (let k = 0; k < TAPS; ++k) {
      const w = k === OUT_TAP ? paneW : SCOPE_W;
      const h = k === OUT_TAP ? OUT_SCOPE_H : SCOPE_H;
      const canvas = k === OUT_TAP ? outCanvas : opCanvas[k];
      const ctx = ctxOf(canvas, w, h);
      if (!ctx) continue;
      const base = k * 1024;
      const gain = traceGain(peak(frame, base, 1024), scaleRef, fitEach);
      // The feedback wire is a control signal, not audio: dashed and vermillion,
      // matching the wires it corresponds to. Everything else is the audio path.
      const isControl = k === WIRE_TAP;
      if (!colScratch || colScratch.length < ctx.canvas.width * 2) {
        colScratch = new Float32Array(ctx.canvas.width * 2);
      }
      drawTrace(ctx, frame, base + start, win, {
        color: isControl ? p.accent : p.signal,
        lineWidth: k === OUT_TAP ? p.lineW : p.lineW * 0.8,
        dash: isControl ? [4, 3] : undefined,
        gain: gain * 0.92,
        midline: p.grid,
      }, colScratch);
    }

    for (let k = 0; k < TAPS; ++k) drawEnvelope(k, p);
    drawSpectrum(p);
    drawWires(p);
  }

  /**
   * The envelope strip: measured peak per frame over the last ~3 seconds. This is
   * not the EG's parameters redrawn — it is the amplitude of the operator's own
   * trace over time, which is the envelope *as it actually came out*, including
   * whatever the macros did to it.
   *
   * Scaled to the strip's own recent maximum, because its subject is shape rather
   * than level: a modulator 40 dB down still has a legible attack here, and its
   * level is printed as a number two lines below.
   */
  function drawEnvelope(k: number, p: ReturnType<typeof palette>): void {
    const ctx = ctxOf(envCanvas[k], ENV_W, ENV_H);
    if (!ctx) return;
    const W = ctx.canvas.width;
    const H = ctx.canvas.height;
    const ring = envRings[k];
    ctx.clearRect(0, 0, W, H);
    let max = 0;
    for (const v of ring) if (v > max) max = v;
    ctx.strokeStyle = p.grid;
    ctx.lineWidth = 1;
    ctx.beginPath();
    ctx.moveTo(0, H - 0.5);
    ctx.lineTo(W, H - 0.5);
    ctx.stroke();
    if (max <= 0) return;
    ctx.strokeStyle = k === WIRE_TAP ? p.accent : p.signal;
    ctx.lineWidth = Math.max(1, p.lineW * 0.7 * (ctx.canvas.width / ENV_W));
    ctx.beginPath();
    for (let i = 0; i < ENV_FRAMES; ++i) {
      // Oldest on the left, newest on the right.
      const v = ring[(envWrite + i) % ENV_FRAMES] / max;
      const x = (i / (ENV_FRAMES - 1)) * W;
      const y = H - v * (H - 1);
      if (i === 0) ctx.moveTo(x, y);
      else ctx.lineTo(x, y);
    }
    ctx.stroke();
  }

  function drawSpectrum(p: ReturnType<typeof palette>): void {
    const ctx = ctxOf(specCanvas, paneW, SPEC_H);
    if (!ctx || !frame) return;
    const W = ctx.canvas.width;
    const H = ctx.canvas.height;
    const n = 1024;
    if (!specOut) specOut = new Float32Array(n / 2);
    if (!specWork) specWork = fftWork(n);
    spectrumDb(frame, OUT_TAP * 1024, n, specOut, specWork, FLOOR_DB);

    ctx.clearRect(0, 0, W, H);

    // Log frequency axis with labelled octave rules — a spectrum without a
    // frequency scale cannot be read against a ratio.
    const rate = 44100;
    const bins = n / 2;
    ctx.strokeStyle = p.grid;
    ctx.fillStyle = p.dim;
    ctx.lineWidth = 1;
    const scale = ctx.canvas.width / paneW;
    ctx.font = `${Math.round(9 * scale)}px ui-monospace, monospace`;
    for (const hz of [100, 250, 500, 1000, 2500, 5000, 10000]) {
      const x = Math.round(xOfHz(hz, W));
      ctx.beginPath();
      ctx.moveTo(x + 0.5, 0);
      ctx.lineTo(x + 0.5, H - 12 * scale);
      ctx.stroke();
      ctx.fillText(hz >= 1000 ? `${hz / 1000}k` : `${hz}`, x + 2 * scale, H - 3 * scale);
    }

    ctx.strokeStyle = p.signal;
    ctx.lineWidth = p.lineW * scale;
    ctx.beginPath();
    let started = false;
    for (let x = 0; x < W; ++x) {
      // Peak-hold across the bins that land in this column, so a single-bin
      // sideband is never averaged away into the noise beside it.
      const f0 = hzOfX(x, W);
      const f1 = hzOfX(x + 1, W);
      const b0 = Math.max(1, Math.floor((f0 * n) / rate));
      const b1 = Math.max(b0 + 1, Math.ceil((f1 * n) / rate));
      let db = FLOOR_DB;
      for (let b = b0; b < b1 && b < bins; ++b) if (specOut[b] > db) db = specOut[b];
      const y = (1 - (db - FLOOR_DB) / (0 - FLOOR_DB)) * (H - 14 * scale);
      if (!started) { ctx.moveTo(x, y); started = true; } else ctx.lineTo(x, y);
    }
    ctx.stroke();
  }

  const FLOOR_DB = -84;
  const F_MIN = 60;
  const F_MAX = 16000;
  const xOfHz = (hz: number, W: number) => (Math.log2(hz / F_MIN) / Math.log2(F_MAX / F_MIN)) * W;
  const hzOfX = (x: number, W: number) => F_MIN * Math.pow(F_MAX / F_MIN, x / W);

  /**
   * The wires. Drawn on a canvas rather than as SVG paths purely so the
   * highlight can be repainted without Svelte re-rendering the diagram; the
   * accessible description of the routing lives in the node text and in the
   * summary below the sheet, not in this canvas.
   */
  function drawWires(p: ReturnType<typeof palette>): void {
    const ctx = ctxOf(wireCanvas, layout.width, layout.height);
    if (!ctx) return;
    const scale = ctx.canvas.width / layout.width;
    ctx.clearRect(0, 0, ctx.canvas.width, ctx.canvas.height);
    ctx.save();
    ctx.scale(scale, scale);

    const lit = (a: number, b?: number) =>
      hoverOp !== null && (hoverOp === a || hoverOp === b);

    /**
     * Is this path actually carrying anything? A modulator at index 0 and a
     * carrier at volume 0 both contribute nothing, and roughly two thirds of
     * the wires on a typical voice are in that state — on Parallax Bell, four
     * of six operators are silent. Drawing them identically to the live ones
     * made "which operators make this sound" a thing you had to reconstruct by
     * reading six IDX labels in sequence.
     *
     * A dead path is drawn as structure rather than as signal: hairline grey,
     * thinner, and on a tighter dash. Three channels, not one — the user is
     * colourblind, so hue never carries this alone, and the node's own
     * "IDX 0 / silent" text remains the fourth.
     */
    const sounding = (op: number) => (patch.ops[op - 1]?.outLevel ?? 0) > 0;

    // Modulation wires: dashed, control colour. Dash is the channel that
    // survives when colour does not.
    for (const e of layout.edges) {
      const on = lit(e.from, e.to);
      const live = sounding(e.from);
      ctx.strokeStyle = live ? p.accent : p.hairline;
      ctx.globalAlpha = (hoverOp === null || on ? 1 : 0.25) * (live ? 1 : 0.75);
      ctx.lineWidth = live ? (on ? 2.6 : 1.6) : 1;
      ctx.setLineDash(live ? [5, 4] : [3, 3]);
      wirePath(ctx, e.x1, e.y1, e.x2, e.y2);
    }

    // Audio wires into the output sum: solid, signal colour. A carrier at
    // volume 0 reaches the output on paper and contributes nothing in fact,
    // so its wire ghosts too — that is the whole of what makes OP 3 on
    // Parallax Bell different from a silent modulator.
    for (const e of outEdges) {
      const on = lit(e.from);
      const live = sounding(e.from);
      ctx.strokeStyle = live ? p.signal : p.hairline;
      ctx.globalAlpha = (hoverOp === null || on ? 1 : 0.25) * (live ? 1 : 0.75);
      ctx.lineWidth = live ? (on ? 2.8 : 1.8) : 1;
      ctx.setLineDash(live ? [] : [3, 3]);
      wirePath(ctx, e.x1, e.y1, e.x2, e.y2);
    }

    // The feedback loop: a small return arc on its own node, dotted. Ghosted at
    // zero feedback, which is what the summary line under the sheet has always
    // said in words — "at zero, so this path is not taken" — while the diagram
    // went on drawing it as live.
    const fb = layout.nodes.find((n) => n.feedback);
    if (fb) {
      const live = patch.feedback > 0 && sounding(fb.op);
      ctx.globalAlpha = (hoverOp === null || hoverOp === fb.op ? 1 : 0.25) * (live ? 1 : 0.75);
      ctx.strokeStyle = live ? p.accent : p.hairline;
      ctx.lineWidth = live ? 1.6 : 1;
      ctx.setLineDash(live ? [2, 3] : [3, 3]);
      const r = 16;
      const x = fb.x + layout.geo.nodeW;
      const yTop = fb.y + 14;
      const yBot = fb.y + layout.geo.nodeH - 14;
      ctx.beginPath();
      ctx.moveTo(x - 2, yBot);
      ctx.bezierCurveTo(x + r, yBot, x + r, yTop, x - 2, yTop);
      ctx.stroke();
    }

    ctx.globalAlpha = 1;
    ctx.setLineDash([]);
    ctx.restore();
  }

  function wirePath(ctx: CanvasRenderingContext2D, x1: number, y1: number, x2: number, y2: number): void {
    const mid = (y1 + y2) / 2;
    ctx.beginPath();
    ctx.moveTo(x1, y1);
    ctx.bezierCurveTo(x1, mid, x2, mid, x2, y2);
    ctx.stroke();
  }

  function sheetWidth(): number {
    return layout.width;
  }

  // ---------------------------------------------------------- the frame pump
  function onSnapshot(snap: FmTapSnapshot): void {
    // The snapshot's Float32Array is only valid for this call (it goes straight
    // back to the worklet's pool), so it is copied before anything else happens.
    // Copying also makes Freeze trivial: freezing is simply not copying.
    if (!frame || frame.length !== snap.count * snap.window) {
      frame = new Float32Array(snap.count * snap.window);
    }
    statFrames++;
    const now = snap.time;
    if (statSince === 0) statSince = now;
    if (now - statSince >= 1) {
      fps = Math.round(statFrames / (now - statSince));
      dropped = snap.dropped;
      // Published a couple of times a second, not 60: these are readouts, and
      // re-rendering the diagram every frame to update a number would cost more
      // than everything else on this thread put together.
      let top = 0;
      for (const p of lastPeaks) if (p > top) top = p;
      relDb = Array.from(lastPeaks, (p) =>
        p > 0 && top > 0 ? 20 * Math.log10(p / top) : -Infinity);
      statFrames = 0;
      statSince = now;
    }
    if (frozen) return;

    frame.set(snap.data);
    haveFrame = true;

    // One trigger, taken on the output, shared by all eight traces. See the
    // component header: this is what makes ratio legible as motion.
    const t = findTrigger(frame, OUT_TAP * snap.window, snap.window);
    trigger = t < 0 ? 0 : Math.floor(t) - OUT_TAP * snap.window;
    if (trigger < 0) trigger = 0;

    // Envelope history: one peak per tap per frame, and the shared scale.
    let loudest = 0;
    for (let k = 0; k < snap.count; ++k) {
      const p = peak(frame, k * snap.window, snap.window);
      envRings[k][envWrite] = p;
      lastPeaks[k] = p;
      if (p > loudest) loudest = p;
    }
    // Rise instantly, fall slowly: a note's attack must not overshoot the box,
    // and its decay must not pump the whole diagram larger as it fades.
    scaleRef = loudest > scaleRef ? loudest : Math.max(0.002, scaleRef * 0.992);
    envWrite = (envWrite + 1) % ENV_FRAMES;

    drawAll();
  }

  // Gating (spec §2): taps are off unless this view is mounted AND the FM engine
  // is the live one AND the screen can carry the diagram. The default app path
  // pays nothing, and leaving this view turns them off again.
  $effect(() => {
    if (!ready || !wideEnough) return;
    const eng = fmEngine();
    if (!eng) return;
    eng.setTapsEnabled(true);
    eng.onTapSnapshot(onSnapshot);
    return () => {
      eng.onTapSnapshot(null);
      eng.setTapsEnabled(false);
      haveFrame = false;
    };
  });

  // Redraw on anything that changes the picture without a new frame arriving —
  // a different window, the fit toggle, a highlight, a new algorithm, or a
  // frozen frame being re-examined.
  $effect(() => {
    void win; void fitEach; void hoverOp; void layout; void frozen; void paneW;
    if (haveFrame) drawAll();
  });

  onDestroy(() => {
    // Never leave a note sounding behind a view that is gone.
    if (held) { try { audioEngine.currentEngine?.noteOff(HOLD_NOTE); } catch { /* */ } }
    unsubs.forEach((u) => u());
    // Belt and braces: the $effect cleanup above already does this, but a view
    // that leaves taps running would cost the whole app for nothing.
    const eng = fmEngine();
    if (eng) { eng.onTapSnapshot(null); eng.setTapsEnabled(false); }
  });

  // ------------------------------------------------------------- macro knobs
  // The four macros, live, so the diagram can be driven while it is watched —
  // turning Brightness here is the "watch the sidebands bloom" gesture. Knob
  // publishes to activeParamStore, which is what lights the nodes a macro acts
  // on, so the knob <-> trace link is the same link the Explain panel uses.
  const MACRO_IDS = ["brightness", "ratio", "feedback", "envelope"] as const;
  const macroSpecs = $derived.by<ParameterDescriptor[]>(() => {
    const eng = audioEngine.currentEngine;
    if (!eng || engineId !== "fm") return [];
    return eng.getParameterSchema().filter((d) => (MACRO_IDS as readonly string[]).includes(d.id));
  });

  function setParam(id: string, v: number): void {
    patchStore.setKey("params", { ...patchStore.get().params, [id]: v });
  }

  /** Which operators the currently-engaged macro acts on — the highlight link. */
  const litByMacro = $derived.by<Set<number>>(() => {
    if (activeParam === "brightness" || activeParam === "ratio") return modulators;
    if (activeParam === "feedback") {
      const fb = layout.nodes.find((n) => n.feedback);
      return new Set(fb ? [fb.op] : []);
    }
    if (activeParam === "envelope") return new Set([1, 2, 3, 4, 5, 6]);
    return new Set();
  });

  /**
   * Why the ratio reads "1" on one node and "1.00" on another. That difference
   * is the whole lesson, so the tooltip says it in words rather than leaving it
   * to be noticed.
   */
  function ratioTitle(r: number | null): string {
    if (r === null) return "Fixed frequency — this operator ignores the played note.";
    const near = Math.round(r);
    if (near > 0 && Math.abs(r - near) < 0.0005) {
      return `Exactly ${near}x the played note. A whole-number ratio locks to the `
        + `carrier, so this trace stands still and the result sounds harmonic.`;
    }
    return `${r.toFixed(4)}x the played note — not a whole number, so this `
      + `operator drifts against the carrier instead of locking to it. That is `
      + `what you are seeing when the trace walks sideways.`;
  }

  /** Relative peak, or an em dash when the trace is silent. */
  function formatDb(db: number): string {
    if (!Number.isFinite(db)) return "—";
    if (db > -0.5) return "0 dB";
    return `${Math.round(db)} dB`;
  }

  const roleOf = (op: number) => (modulators.has(op) ? "Modulator" : "Carrier");

  /**
   * The corpus, grouped for the voice picker, in FM_MODELS order within each
   * family. Built once — the model list is a compile-time constant, not state.
   */
  const VOICE_GROUPS: Array<{ family: string; models: typeof FM_MODELS }> = (() => {
    const byFamily = new Map<string, typeof FM_MODELS>();
    for (const m of FM_MODELS) {
      const g = byFamily.get(m.family);
      if (g) g.push(m);
      else byFamily.set(m.family, [m]);
    }
    return [...byFamily].map(([family, models]) => ({ family, models }));
  })();

  /**
   * Load another voice. Lowercase, because that is the case `bindings.ts` and
   * ModelPicker both write and `indexForCode` matches on — writing the code as
   * authored looks like it works and silently changes nothing.
   *
   * Everything downstream is already derived from `modelId`: the patch bytes,
   * the readout, the layout, the wires and every trace. The instrument stays
   * mounted offstage reading the same store, so its own picker follows along.
   */
  function pickVoice(code: string): void {
    if (!code) return;
    patchStore.setKey("modelId", code.toLowerCase());
  }

  /** Plain-language routing, for the summary line and for screen readers. */
  const routingText = $derived.by(() => {
    const parts: string[] = [];
    for (const op of [6, 5, 4, 3, 2, 1]) {
      const targets = layout.edges.filter((e) => e.from === op).map((e) => e.to);
      if (targets.length) parts.push(`${op} modulates ${targets.join(" and ")}`);
    }
    const carriers = layout.nodes.filter((n) => n.carrier).map((n) => n.op);
    parts.push(`${carriers.length === 1 ? "Operator" : "Operators"} ${carriers.join(", ")} reach the output`);
    const fb = layout.nodes.find((n) => n.feedback);
    if (fb) parts.push(`operator ${fb.op} feeds back into itself`);
    return parts.join("; ") + ".";
  });
</script>

<svelte:window bind:innerWidth bind:innerHeight />

<section class="flowsheet" aria-label="FM flowsheet">
  <header class="bar">
    <button class="back" onclick={() => setView("instrument")}>
      <span aria-hidden="true">←</span> Instrument
    </button>
    <div class="title">
      <h1>Flowsheet</h1>
      <p class="sub">
        <!-- The voice name IS the picker. Putting it here rather than adding a
             control to the bar costs no vertical space, which the sheet does
             not have — the tallest algorithms land within a pixel or two of
             864. A native select also steps with the arrow keys once focused,
             which is the "sweep the corpus and watch the algorithm change" move
             this view exists for, without two more buttons to do it. -->
        <label class="voice">
          <span class="sr-only">Voice</span>
          <select
            value={model?.code?.toLowerCase() ?? ""}
            onchange={(e) => pickVoice((e.currentTarget as HTMLSelectElement).value)}
            title="Load another FM voice without leaving the sheet"
          >
            {#each VOICE_GROUPS as group (group.family)}
              <optgroup label={group.family}>
                {#each group.models as m (m.code)}
                  <option value={m.code.toLowerCase()}>{m.name}</option>
                {/each}
              </optgroup>
            {/each}
          </select>
        </label>
        · Algorithm {patch.algorithm}
        · {patch.ops.filter((o) => o.outLevel > 0).length} of 6 operators sounding
      </p>
    </div>
    <div class="spacer"></div>
    {#if ready && engineId === "fm" && wideEnough}
      <div class="stats" aria-live="off">
        <span>{fps} fps</span>
        {#if dropped > 0}<span class="warn">{dropped} dropped</span>{/if}
      </div>
    {/if}
    <div class="controls">
      <button class:on={held} aria-pressed={held} onclick={toggleHold}
        title="Hold a note so there is always something to look at">
        {held ? "Holding C4" : "Hold a note"}
      </button>
      <button onclick={() => (playing ? stopTransport() : playTransport())}>
        {playing ? "Stop" : "Play"}
      </button>
      <button class:on={frozen} aria-pressed={frozen} onclick={() => (frozen = !frozen)}>
        {frozen ? "Frozen" : "Freeze"}
      </button>
      <label class="slow">
        <span>Window</span>
        <select bind:value={windowIdx}>
          {#each WINDOWS as w, i (w)}
            <option value={i}>{(w / 44.1).toFixed(1)} ms</option>
          {/each}
        </select>
      </label>
      <button class:on={fitEach} aria-pressed={fitEach} onclick={() => (fitEach = !fitEach)}
        title={fitEach
          ? "Each trace scaled to its own peak — shapes readable, heights not comparable"
          : "All traces share one scale — heights are comparable between operators"}>
        {fitEach ? "Fit each" : "Shared scale"}
      </button>
      <button class="help-toggle" class:on={showHelp} aria-pressed={showHelp}
        aria-label="How to read this sheet"
        title="How to read this sheet"
        onclick={() => (showHelp = !showHelp)}>?</button>
    </div>
  </header>

  {#if !wideEnough}
    <p class="gate">
      The flowsheet needs a wider screen — at least {MIN_WIDTH} pixels. Six
      operators, eight scopes and a spectrum shrunk to fit a phone would be
      illegible, and an illegible teaching diagram is as wrong as an inaccurate
      one. Everything else in the app works here.
    </p>
  {:else if engineId !== "fm"}
    <p class="gate">
      The flowsheet reads the FM engine's operators directly, so it needs FM to be
      the loaded engine. Pick <strong>FM</strong> in the engine picker and come back.
    </p>
  {:else if !ready}
    <p class="gate">Audio isn't running yet — press a key or hit play, then come back.</p>
  {:else}
    <div class="macros">
      {#each macroSpecs as spec (spec.id)}
        <Knob {spec} value={params[spec.id] ?? spec.default} onchange={(v) => setParam(spec.id, v)} />
      {/each}
      <p class="hint">Turn these and watch which traces move.</p>
    </div>

    <!-- The rest of that explanation, on request. It cost 142px of a 864px
         screen on every visit — enough to push the carriers off the bottom —
         for something read once. The one line that earns permanent space stays
         above; this is the part you come back for, not the part you re-read. -->
    {#if showHelp}
      <div class="help" role="note">
        <p>
          Every trace is read inside the engine, at its own 44.1&nbsp;kHz, on one
          shared trigger — so an operator at a whole-number ratio stands still and
          one a hair off it walks sideways.
        </p>
        <p>
          Each trace is scaled to its own peak so its shape is readable; the dB
          figure on each node is its real level against the loudest trace here.
          Switch to <em>Shared scale</em> to compare heights directly.
        </p>
      </div>
    {/if}

    <div class="workspace" class:stacked={stacked}>
    <div class="sheet-scroll">
      <div
        class="sheet"
        bind:this={sheet}
        style="width:{sheetWidth()}px; height:{layout.height}px"
      >
        <canvas class="wires" bind:this={wireCanvas} aria-hidden="true"></canvas>

        {#each layout.nodes as node (node.op)}
          {@const ro = patch.ops[node.op - 1]}
          <button
            type="button"
            class="node"
            class:carrier={node.carrier}
            class:silent={ro.outLevel === 0}
            class:lit={hoverOp === node.op || litByMacro.has(node.op)}
            style="left:{node.x}px; top:{node.y}px; width:{layout.geo.nodeW}px; height:{layout.geo.nodeH}px"
            onmouseenter={() => (hoverOp = node.op)}
            onmouseleave={() => (hoverOp = null)}
            onfocusin={() => (hoverOp = node.op)}
            onfocusout={() => (hoverOp = null)}
            aria-label={`Operator ${node.op}, ${roleOf(node.op)}${node.feedback ? ", with feedback" : ""}${ro.outLevel === 0 ? ", silent" : ""}. Ratio ${formatRatio(ro.ratio)}, level ${ro.outLevel}.`}
          >
            <div class="node-head">
              <span class="op">OP&nbsp;{node.op}</span>
              <span class="role">{node.carrier ? "CARRIER" : "MOD"}</span>
              {#if node.feedback}<span class="fb">FB&nbsp;{patch.feedback}</span>{/if}
            </div>
            <canvas
              class="scope"
              bind:this={opCanvas[node.op - 1]}
              aria-hidden="true"
            ></canvas>
            <canvas class="env" bind:this={envCanvas[node.op - 1]} aria-hidden="true"></canvas>
            <div class="node-foot">
              <span class="ratio" title={ratioTitle(ro.ratio)}>
                ×{formatRatio(ro.ratio)}
              </span>
              <span class="level" title={node.carrier ? "Output level from the patch — volume, for a carrier" : "Output level from the patch — the modulation index, for a modulator"}>
                {node.carrier ? "VOL" : "IDX"}&nbsp;{ro.outLevel}
              </span>
              <span class="meas" title="Measured peak of this trace, relative to the loudest trace on the sheet">
                {formatDb(relDb[node.op - 1])}
              </span>
            </div>
            <!-- Two operators can both be at zero for entirely different
                 reasons, and the difference is the useful part. A carrier at
                 volume 0 still reaches the output and adds nothing to it; a
                 modulator at index 0 leaves the operator below it running as a
                 bare sine. One word for both hid that. -->
            {#if ro.outLevel === 0}
              <span
                class="silent-tag"
                title={node.carrier
                  ? "This carrier reaches the output, but its volume is 0 — it adds nothing to the sound."
                  : "This modulator's index is 0 — the operator it feeds runs unmodulated, as a bare sine."}
              >{node.carrier ? "not sounding" : "not modulating"}</span>
            {/if}
          </button>
        {/each}

        <div
          class="out-node"
          style="left:{layout.outX}px; top:{layout.outY - layout.geo.outH / 2 + 10}px"
        >
          <span class="out-label">OUTPUT — SUM</span>
          <span class="out-sub">{layout.nodes.filter((n) => n.carrier).map((n) => n.op).join(" + ")}</span>
        </div>
      </div>
    </div>

    <div class="side">
    <p class="routing">
      <span class="key">
        <span class="swatch mod" aria-hidden="true"></span> dashed = modulation
        <span class="swatch aud" aria-hidden="true"></span> solid = audio to output
        <span class="swatch off" aria-hidden="true"></span> grey = path not taken
      </span>
      {routingText}
    </p>

    <div class="panes">
      <figure bind:clientWidth={paneW}>
        <figcaption>
          {FM_TAP_LABELS[OUT_TAP]} — the voice, before the resampler
        </figcaption>
        <canvas bind:this={outCanvas} aria-hidden="true"></canvas>
      </figure>
      <figure>
        <figcaption>
          Spectrum of that same trace — {FLOOR_DB} dB floor, {F_MIN} Hz to {F_MAX / 1000} kHz,
          logarithmic
        </figcaption>
        <canvas bind:this={specCanvas} aria-hidden="true"></canvas>
      </figure>
      <figure>
        <figcaption>
          {FM_TAP_LABELS[WIRE_TAP]} wire —
          {#if patch.feedback === 0}
            at zero, so this path is not taken
          {:else}
            operator {layout.nodes.find((n) => n.feedback)?.op ?? "—"}, depth {patch.feedback} of 7
          {/if}
        </figcaption>
        <canvas class="scope wire-scope" bind:this={opCanvas[WIRE_TAP]} aria-hidden="true"></canvas>
        <canvas class="env" bind:this={envCanvas[WIRE_TAP]} aria-hidden="true"></canvas>
      </figure>
    </div>
    </div>
    </div>
  {/if}
</section>

<style>
  /* The app is a fixed-viewport layout — html and body are `overflow: hidden`
     at 100vh, because the instrument is designed to fit the screen. The
     flowsheet does not fit the screen and should not pretend to, so it owns its
     own scrolling rather than trying to grow a page that cannot grow. */
  .flowsheet {
    flex: 1 1 auto;
    min-width: 0;
    height: 100vh;
    overflow-y: auto;
    overflow-x: hidden;
    /* 12px, not 32, at the bottom: with the re-proportioned nodes the tallest
       algorithm lands within a pixel or two of 864, and 20px of dead padding
       was the only thing still putting a scrollbar on the landing view. */
    padding: 16px 20px 12px;
    display: flex;
    flex-direction: column;
    gap: 14px;
    background: var(--bg);
  }

  /* Sticky, so the controls stay reachable while reading down the sheet. */
  .bar {
    position: sticky;
    top: -16px;
    z-index: 2;
    background: var(--bg);
    display: flex;
    align-items: flex-end;
    gap: 16px;
    padding-bottom: 10px;
    border-bottom: 1px solid var(--hairline);
  }
  .spacer { flex: 1; }

  h1 {
    margin: 0;
    font-size: 1.05rem;
    letter-spacing: var(--label-tracking, 0.04em);
    text-transform: var(--label-case, none);
    color: var(--text);
  }
  .sub {
    margin: 2px 0 0;
    font-size: 0.78rem;
    color: var(--text-muted);
  }

  /* The voice picker reads as the heading it replaced until you engage with it:
     no border or chrome at rest, a hairline and a caret on hover/focus. The
     name was already bold text here, so the resting state is unchanged from
     before it became a control — nothing moves when the sheet loads. */
  .voice { display: inline-flex; }
  .voice select {
    font: inherit;
    font-size: 0.78rem;
    font-weight: 700;
    color: var(--text);
    background: transparent;
    border: 1px solid transparent;
    border-radius: var(--radius-sm, 1px);
    padding: 1px 4px;
    margin: -1px 0;
    cursor: pointer;
    /* Keep the native caret — it is the affordance that says "this opens". */
  }
  .voice select:hover { border-color: var(--hairline); background: var(--surface); }
  .voice select:focus-visible {
    outline: none;
    border-color: var(--signal);
    box-shadow: 0 0 0 2px var(--signal-glow);
    background: var(--surface);
  }
  .voice select optgroup { font-style: normal; text-transform: capitalize; }

  .sr-only {
    position: absolute; width: 1px; height: 1px;
    padding: 0; margin: -1px; overflow: hidden;
    clip: rect(0 0 0 0); white-space: nowrap; border: 0;
  }

  button, select {
    font: inherit;
    font-size: 0.75rem;
    color: var(--text);
    background: var(--surface);
    border: 1px solid var(--hairline);
    border-radius: var(--radius-sm, 2px);
    padding: 5px 10px;
    cursor: pointer;
  }
  button:hover, select:hover { border-color: var(--signal); }
  button.on {
    background: var(--signal);
    color: var(--on-signal);
    border-color: var(--signal);
  }
  .back { align-self: center; }

  .controls { display: flex; align-items: center; gap: 8px; }
  .slow { display: flex; align-items: center; gap: 6px; font-size: 0.7rem; color: var(--text-muted); }
  .slow span { text-transform: var(--label-case, none); letter-spacing: var(--label-tracking, 0); }

  .stats {
    display: flex; gap: 10px;
    font: 0.7rem ui-monospace, monospace;
    color: var(--text-dim);
  }
  .stats .warn { color: var(--accent); font-weight: 600; }

  .gate {
    max-width: 46ch;
    margin: 40px auto;
    font-size: 0.9rem;
    line-height: 1.55;
    color: var(--text-muted);
    text-align: center;
  }

  .macros {
    display: flex;
    align-items: center;
    gap: 18px;
    flex-wrap: wrap;
  }
  .macros .hint {
    margin: 0;
    max-width: 52ch;
    font-size: 0.74rem;
    line-height: 1.5;
    color: var(--text-dim);
  }

  /* The long note. Two columns so it stays a band rather than a wall, and it
     never gets a scrollbar of its own — it is short enough to read at once. */
  .help {
    display: grid;
    grid-template-columns: repeat(auto-fit, minmax(320px, 1fr));
    gap: 6px 28px;
    padding: 10px 12px;
    border: 1px solid var(--hairline);
    border-radius: var(--radius-sm, 1px);
    background: var(--surface);
  }
  .help p {
    margin: 0;
    max-width: 62ch;
    font-size: 0.74rem;
    line-height: 1.5;
    color: var(--text-muted);
  }

  .help-toggle {
    width: 26px;
    padding: 5px 0;
    text-align: center;
  }

  /* flex: none matters. The column flexbox above will happily shrink this to
     fit the viewport, and with overflow-x:auto the vertical axis can no longer
     be `visible` (CSS forces it to auto/hidden), so a squeezed container clips
     the diagram instead of letting the page scroll — five of six nodes vanish
     while the DOM still says they are laid out correctly. */
  .flowsheet > * { flex: none; }

  /* Diagram left, the voice's own time and frequency views right — the layout a
     desktop screen is for (spec §4.4). The right column sticks so the output
     trace and the spectrum stay in view while reading down a tall algorithm. */
  .workspace {
    display: grid;
    grid-template-columns: auto minmax(360px, 1fr);
    gap: 28px;
    align-items: start;
  }
  /* A wide algorithm (see STACK_SUMMARIES_ABOVE) drops the summaries below the
     diagram and takes the full width, because beside a 1448px diagram there is
     no column left worth reading a trace in. Sticky comes off with it: a
     full-width band pinned under a tall diagram would cover the thing it is
     explaining. */
  .workspace.stacked { grid-template-columns: minmax(0, 1fr); }
  .workspace.stacked .side { position: static; }
  /* Full width is wide enough for the three summaries side by side, and a
     column of them under a stacked diagram pushed the feedback wire — the
     whole subject of Feedback Alone — below a 768 px fold. */
  .workspace.stacked .panes {
    display: grid;
    grid-template-columns: repeat(3, minmax(0, 1fr));
    gap: 12px 24px;
    align-items: start;
  }

  .side { position: sticky; top: 44px; display: flex; flex-direction: column; gap: 14px; min-width: 0; }
  .sheet-scroll { overflow-x: auto; overflow-y: hidden; padding-bottom: 4px; }
  .sheet { position: relative; }

  .wires {
    position: absolute;
    inset: 0;
    pointer-events: none;
  }

  .node {
    position: absolute;
    text-align: left;
    font: inherit;
    cursor: default;
    box-sizing: border-box;
    display: flex;
    flex-direction: column;
    gap: 3px;
    padding: 5px 7px;
    background: var(--surface);
    border: 1px solid var(--hairline);
    border-radius: var(--radius-md, 2px);
    outline: none;
  }
  /* A carrier is the operator you hear. Marked by a heavier left edge as well as
     by its CARRIER label — weight and text, never hue alone. */
  .node.carrier { border-left-width: 4px; border-left-color: var(--signal); }
  .node.lit { border-color: var(--signal); box-shadow: 0 0 0 2px var(--signal-glow); }
  .node:focus-visible { border-color: var(--signal); box-shadow: 0 0 0 2px var(--signal); }
  .node.silent { background: var(--surface-sunken); }

  .node-head {
    display: flex; align-items: baseline; gap: 6px;
    font-size: 0.66rem;
    letter-spacing: 0.05em;
  }
  .node-head .op { font-weight: 700; color: var(--text); }
  .node-head .role { color: var(--text-dim); }
  .node-head .fb {
    margin-left: auto;
    color: var(--accent);
    font-weight: 700;
  }

  canvas.scope, canvas.env { display: block; background: var(--scope-bg); }
  canvas.scope { box-shadow: inset 0 0 0 1px var(--hairline-soft); }

  .node-foot {
    display: flex; justify-content: space-between; gap: 4px;
    font: 0.66rem ui-monospace, monospace;
    color: var(--text-muted);
  }

  .node-foot .meas { color: var(--text-dim); }

  .silent-tag {
    position: absolute;
    right: 6px; bottom: 22px;
    font-size: 0.6rem;
    letter-spacing: 0.06em;
    text-transform: uppercase;
    color: var(--text-dim);
  }

  /* Centred on the carriers it sums by transform rather than by a fixed half
     width, so it can grow to hold "1 + 2 + 3 + 4 + 5 + 6" on one line. At a
     fixed 160 px that sum wrapped, and the extra line was the difference
     between the output being on a 1366×768 screen and not. */
  .out-node {
    position: absolute;
    min-width: 160px;
    transform: translateX(-50%);
    white-space: nowrap;
    box-sizing: border-box;
    display: flex; flex-direction: column; gap: 2px;
    padding: 8px 10px;
    text-align: center;
    background: var(--surface);
    border: 2px solid var(--signal);
    border-radius: var(--radius-md, 2px);
  }
  .out-label { font-size: 0.66rem; font-weight: 700; letter-spacing: 0.06em; color: var(--text); }
  .out-sub { font: 0.7rem ui-monospace, monospace; color: var(--text-muted); }

  .routing {
    margin: 0;
    font-size: 0.74rem;
    line-height: 1.5;
    color: var(--text-muted);
  }
  .key { display: inline-flex; align-items: center; gap: 6px; margin-right: 10px; }
  .swatch { display: inline-block; width: 22px; height: 0; border-top-width: 2px; }
  .swatch.mod { border-top: 2px dashed var(--accent); }
  .swatch.aud { border-top: 2px solid var(--signal); margin-left: 8px; }
  /* The third wire state, added with the ghosting. Thinner and on a tighter
     dash than either live style, so it reads as dead by weight and rhythm and
     not only by being grey. */
  .swatch.off { border-top: 1px dashed var(--hairline); margin-left: 8px; }

  .panes { display: flex; flex-direction: column; gap: 12px; }
  figure { margin: 0; display: flex; flex-direction: column; gap: 4px; }
  figcaption {
    font-size: 0.7rem;
    letter-spacing: var(--label-tracking, 0);
    text-transform: var(--label-case, none);
    color: var(--text-dim);
  }
  .wire-scope { height: 44px; }
</style>
