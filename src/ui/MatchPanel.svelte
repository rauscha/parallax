<script lang="ts">
  import { onMount, onDestroy } from "svelte";
  import { audioEngine } from "../audio/AudioEngine";
  import { patchStore, engineIdStore } from "../state/stores";
  import { getEngineEntry } from "../audio/registry";
  import type { ParameterDescriptor } from "../audio/types";
  import Spectrum from "../viz/Spectrum.svelte";
  import Knob from "./Knob.svelte";

  // "Match a sound from a song" — load a track, loop a region, and compare its
  // spectrum side-by-side with the live patch. Foundation tier: load + region +
  // dual spectrum + macro-knob refine. Detection + suggestion land in later steps.
  let { open = $bindable(false) }: { open?: boolean } = $props();

  // ── Loaded sample state ──
  let fileName = $state("");
  let duration = $state(0);
  let hasSample = $state(false);
  let looping = $state(false);
  let error = $state("");
  let region = $state<{ start: number; end: number }>({ start: 0, end: 0 });
  let peaks: Float32Array | null = $state(null);

  // The reference sample's analyser (parallel to the synth's). Captured when the
  // overlay opens — it's created at audio start, and the overlay only opens once
  // audio is ready, so it's non-null by then.
  let sampleAnalyser = $state<AnalyserNode | null>(null);
  $effect(() => { if (open) sampleAnalyser = audioEngine.sampleAnalyserNode; });

  // ── Live patch state, for the macro-knob refine strip ──
  let engineId = $state<string>(engineIdStore.get());
  let modelId = $state<string | null>(patchStore.get().modelId);
  let params = $state<Record<string, number>>(patchStore.get().params);
  const unsubs = [
    engineIdStore.subscribe((v) => { engineId = v; }),
    patchStore.subscribe((p) => { modelId = p.modelId; params = p.params; }),
  ];

  // The macro knobs = the current model's knob ids resolved against the live
  // engine schema (Timbre/Color, Harmonics/Timbre/Morph, …). Falls back to the
  // first few continuous params if a model declares no knob cards.
  let macroSpecs = $state<ParameterDescriptor[]>([]);
  $effect(() => {
    void engineId; void modelId;   // re-resolve on engine/model change
    const eng = audioEngine.currentEngine;
    if (!eng) { macroSpecs = []; return; }
    const schema = eng.getParameterSchema().filter((d) => d.id !== "model");
    const model = getEngineEntry(engineId)?.models.find(
      (m) => m.code.toLowerCase() === (modelId ?? "").toLowerCase(),
    );
    const ids = model?.knobs.map((k) => k.id) ?? [];
    if (ids.length) {
      const byId = new Map(schema.map((s) => [s.id, s]));
      macroSpecs = ids.map((id) => byId.get(id)).filter((s): s is ParameterDescriptor => !!s);
    } else {
      macroSpecs = schema.filter((s) => s.type === "continuous").slice(0, 3);
    }
  });

  function onKnob(id: string, v: number) {
    patchStore.setKey("params", { ...patchStore.get().params, [id]: v });
  }

  // ── File load ──
  let fileInput = $state<HTMLInputElement | undefined>();
  const AUDIO_EXT = /\.(wav|mp3|ogg|oga|flac|m4a|aac|webm|aif|aiff)$/i;

  async function loadFile(file: File) {
    if (!file) return;
    const looksAudio = file.type.startsWith("audio") || AUDIO_EXT.test(file.name);
    if (!looksAudio) { error = "Please choose an audio file (wav, mp3, ogg, flac, m4a)."; return; }
    if (!audioEngine.isStarted) { error = "Start audio first (tap the screen), then try again."; return; }
    error = "";
    try {
      const buf = await audioEngine.loadSampleFile(file);
      fileName = file.name;
      duration = buf.duration;
      peaks = computePeaks(buf, 600);
      region = { start: 0, end: Math.min(buf.duration, 2) };   // default: first ~2s
      hasSample = true;
      if (looping) startLoop();
    } catch {
      error = "Couldn't decode that file. Try a .wav or .mp3.";
      hasSample = false;
    }
  }

  function pickFile() { fileInput?.click(); }
  function onFileChange(e: Event) {
    const f = (e.currentTarget as HTMLInputElement).files?.[0];
    if (f) loadFile(f);
    (e.currentTarget as HTMLInputElement).value = "";   // allow re-picking same file
  }

  // Max-abs peaks per bucket from channel 0 — cheap waveform overview.
  function computePeaks(buf: AudioBuffer, buckets: number): Float32Array {
    const ch = buf.getChannelData(0);
    const n = ch.length;
    const out = new Float32Array(buckets);
    const per = Math.max(1, Math.floor(n / buckets));
    for (let b = 0; b < buckets; b++) {
      let mx = 0;
      const s = b * per, e = Math.min(n, s + per);
      for (let i = s; i < e; i++) { const a = Math.abs(ch[i]); if (a > mx) mx = a; }
      out[b] = mx;
    }
    return out;
  }

  // ── Region playback ──
  function startLoop() {
    audioEngine.playSample({ loopStart: region.start, loopEnd: region.end, loop: true });
    looping = true;
  }
  function stopLoop() { audioEngine.stopSample(); looping = false; }
  function toggleLoop() { looping ? stopLoop() : startLoop(); }

  // ── Waveform canvas + drag-select region ──
  let waveCanvas: HTMLCanvasElement | undefined = $state();
  let selecting = false;
  let selAnchor = 0;

  function xToSec(clientX: number): number {
    if (!waveCanvas || !duration) return 0;
    const r = waveCanvas.getBoundingClientRect();
    const t = (clientX - r.left) / r.width;
    return Math.max(0, Math.min(duration, t * duration));
  }
  function onWaveDown(e: PointerEvent) {
    if (!waveCanvas || !duration) return;
    waveCanvas.setPointerCapture(e.pointerId);
    selecting = true;
    selAnchor = xToSec(e.clientX);
    region = { start: selAnchor, end: selAnchor };
  }
  function onWaveMove(e: PointerEvent) {
    if (!selecting) return;
    const x = xToSec(e.clientX);
    region = { start: Math.min(selAnchor, x), end: Math.max(selAnchor, x) };
  }
  function onWaveUp(e: PointerEvent) {
    if (!selecting) return;
    selecting = false;
    try { waveCanvas?.releasePointerCapture(e.pointerId); } catch { /* */ }
    if (region.end - region.start < 0.05) region = { start: 0, end: duration };   // tiny → whole file
    if (looping) startLoop();
  }

  function drawWave() {
    if (!waveCanvas || !peaks) return;
    const ratio = Math.min(window.devicePixelRatio || 1, 2);
    const rect = waveCanvas.getBoundingClientRect();
    const W = Math.max(1, Math.floor(rect.width * ratio));
    const H = Math.max(1, Math.floor(rect.height * ratio));
    if (waveCanvas.width !== W || waveCanvas.height !== H) { waveCanvas.width = W; waveCanvas.height = H; }
    const ctx = waveCanvas.getContext("2d");
    if (!ctx) return;
    const cs = getComputedStyle(waveCanvas);
    const bg = cs.getPropertyValue("--scope-bg").trim() || "#07090B";
    const trace = cs.getPropertyValue("--signal").trim() || "#34E1C4";
    const dim = cs.getPropertyValue("--text-dim").trim() || "#8A95A0";

    ctx.fillStyle = bg;
    ctx.fillRect(0, 0, W, H);

    const mid = H / 2;
    ctx.strokeStyle = dim;
    ctx.lineWidth = 1;
    ctx.beginPath();
    const n = peaks.length;
    for (let i = 0; i < n; i++) {
      const x = (i / (n - 1)) * W;
      const h = peaks[i] * mid * 0.95;
      ctx.moveTo(x, mid - h);
      ctx.lineTo(x, mid + h);
    }
    ctx.stroke();

    if (duration > 0) {
      const x0 = (region.start / duration) * W;
      const x1 = (region.end / duration) * W;
      ctx.fillStyle = trace.startsWith("#") && trace.length === 7 ? trace + "22" : "rgba(52,225,196,0.13)";
      ctx.fillRect(x0, 0, Math.max(1, x1 - x0), H);
      ctx.strokeStyle = trace;
      ctx.lineWidth = 1.5;
      ctx.beginPath();
      ctx.moveTo(x0, 0); ctx.lineTo(x0, H);
      ctx.moveTo(x1, 0); ctx.lineTo(x1, H);
      ctx.stroke();
    }
  }

  // Redraw on data change; (re)attach a resize observer while the canvas exists.
  $effect(() => { void peaks; void region; if (open && waveCanvas) drawWave(); });
  $effect(() => {
    if (!open || !waveCanvas) return;
    drawWave();
    const ro = new ResizeObserver(() => drawWave());
    ro.observe(waveCanvas);
    return () => ro.disconnect();
  });

  // ── Open / close + global drag-drop ──
  function close() { stopLoop(); open = false; }

  function onKeyDown(e: KeyboardEvent) { if (open && e.key === "Escape") close(); }
  function onWindowDragOver(e: DragEvent) {
    if (e.dataTransfer && Array.from(e.dataTransfer.types).includes("Files")) e.preventDefault();
  }
  function onWindowDrop(e: DragEvent) {
    const file = e.dataTransfer?.files?.[0];
    if (!file || !audioEngine.isStarted) return;
    e.preventDefault();
    open = true;
    loadFile(file);
  }

  onMount(() => {
    window.addEventListener("keydown", onKeyDown);
    window.addEventListener("dragover", onWindowDragOver);
    window.addEventListener("drop", onWindowDrop);
  });
  onDestroy(() => {
    window.removeEventListener("keydown", onKeyDown);
    window.removeEventListener("dragover", onWindowDragOver);
    window.removeEventListener("drop", onWindowDrop);
    unsubs.forEach((u) => u());
    audioEngine.stopSample();
  });

  const fmt = (s: number) => s.toFixed(2);
</script>

{#if open}
  <div class="overlay">
    <button class="backdrop" aria-label="Close match panel" onclick={close}></button>
    <div class="panel" role="dialog" aria-modal="true" aria-label="Match a sound">
      <header class="match-header">
        <h2>Match a sound</h2>
        <button class="close" onclick={close} aria-label="Close">×</button>
      </header>

      <div class="match-body">
        <!-- Load -->
        <div class="match-section">
          <div class="load-row">
            <button class="primary-btn" onclick={pickFile}>Choose audio file…</button>
            <span class="filename">{fileName || "or drop a track anywhere on the page"}</span>
          </div>
          <input
            class="hidden-file"
            type="file"
            accept="audio/*"
            bind:this={fileInput}
            onchange={onFileChange}
          />
          {#if error}<p class="error">{error}</p>{/if}
        </div>

        {#if hasSample}
          <!-- Region -->
          <div class="match-section">
            <div class="section-label">Region <span class="muted">— drag to select · loops while you compare</span></div>
            <canvas
              class="wave"
              bind:this={waveCanvas}
              onpointerdown={onWaveDown}
              onpointermove={onWaveMove}
              onpointerup={onWaveUp}
              onpointercancel={onWaveUp}
            ></canvas>
            <div class="region-controls">
              <button class="loop-btn" class:active={looping} onclick={toggleLoop}>
                {looping ? "■ Stop" : "▶ Loop region"}
              </button>
              <span class="region-readout">{fmt(region.start)}–{fmt(region.end)} s</span>
              <span class="hint">Works best on a solo or exposed passage.</span>
            </div>
          </div>

          <!-- Compare -->
          <div class="match-section">
            <div class="section-label">Compare</div>
            <div class="dual">
              <div class="pane">
                <div class="pane-label">TARGET</div>
                <div class="spec"><Spectrum analyser={sampleAnalyser} /></div>
              </div>
              <div class="pane">
                <div class="pane-label">YOUR PATCH</div>
                <div class="spec"><Spectrum /></div>
              </div>
            </div>
            <p class="hint">Play notes with Z–M to audition your patch against the loop.</p>
          </div>

          <!-- Refine -->
          {#if macroSpecs.length}
            <div class="match-section">
              <div class="section-label">Refine <span class="muted">— nudge until the spectra line up</span></div>
              <div class="knob-row">
                {#each macroSpecs as spec (spec.id)}
                  <Knob {spec} value={params[spec.id] ?? spec.default} onchange={(v) => onKnob(spec.id, v)} />
                {/each}
              </div>
            </div>
          {/if}

          <!-- Detection + suggestion land next (foundation-first build) -->
          <div class="match-section next">
            <div class="section-label">Detect &amp; suggest</div>
            <p class="placeholder">
              Next step: auto-detect the clip's pitch, brightness and envelope, then
              suggest an engine · model and a starting patch you can apply in one click.
            </p>
          </div>
        {/if}
      </div>
    </div>
  </div>
{/if}

<style>
  .overlay {
    position: fixed;
    inset: 0;
    z-index: 50;
    display: flex;
    align-items: center;
    justify-content: center;
    padding: 24px;
  }
  .backdrop {
    position: absolute;
    inset: 0;
    border: none;
    padding: 0;
    background: rgba(0, 0, 0, 0.55);
    cursor: default;
  }
  .panel {
    position: relative;
    z-index: 1;
    width: min(960px, 96vw);
    max-height: 88vh;
    overflow: auto;
    display: flex;
    flex-direction: column;
    background: var(--surface);
    border: var(--hairline-w) solid var(--hairline);
    border-radius: var(--radius-lg);
    box-shadow: 0 24px 64px rgba(0, 0, 0, 0.5);
  }
  .match-header {
    position: sticky;
    top: 0;
    z-index: 2;
    display: flex;
    align-items: center;
    justify-content: space-between;
    padding: 12px 16px;
    border-bottom: var(--hairline-w) solid var(--hairline);
    background: var(--surface-raised);
  }
  .match-header h2 {
    margin: 0;
    font-family: var(--font-heading);
    font-size: 0.95rem;
    font-weight: 600;
    color: var(--text);
    text-transform: var(--label-case);
    letter-spacing: var(--label-tracking);
  }
  .close {
    font-size: 1.3rem;
    line-height: 1;
    padding: 2px 8px;
    color: var(--text-dim);
    background: transparent;
    border: var(--hairline-w) solid var(--hairline);
    border-radius: var(--radius-sm);
    cursor: pointer;
    transition: color var(--t-fast), border-color var(--t-fast);
  }
  .close:hover { color: var(--text); border-color: var(--text-dim); }

  .match-body {
    display: flex;
    flex-direction: column;
    gap: 14px;
    padding: 16px;
  }
  .match-section { display: flex; flex-direction: column; gap: 8px; }
  .section-label {
    font-family: var(--font-mono);
    font-size: 0.7rem;
    text-transform: uppercase;
    letter-spacing: 0.1em;
    color: var(--text-dim);
  }
  .section-label .muted { text-transform: none; letter-spacing: 0; color: var(--text-dim); opacity: 0.8; }

  .load-row { display: flex; align-items: center; gap: 12px; flex-wrap: wrap; }
  .primary-btn {
    font-family: var(--font-mono);
    font-size: 0.72rem;
    letter-spacing: 0.06em;
    padding: 7px 14px;
    color: var(--bg);
    background: var(--signal);
    border: var(--hairline-w) solid var(--signal);
    border-radius: var(--radius-sm);
    cursor: pointer;
    transition: filter var(--t-fast);
  }
  .primary-btn:hover { filter: brightness(1.08); }
  .filename {
    font-family: var(--font-mono);
    font-size: 0.72rem;
    color: var(--text-muted);
  }
  .hidden-file { display: none; }
  .error { margin: 0; font-family: var(--font-mono); font-size: 0.72rem; color: var(--accent); }

  .wave {
    width: 100%;
    height: 96px;
    display: block;
    background: var(--scope-bg);
    border: var(--hairline-w) solid var(--hairline);
    border-radius: var(--radius-sm);
    touch-action: none;     /* drag-select must not scroll the panel */
    cursor: ew-resize;
  }
  .region-controls { display: flex; align-items: center; gap: 12px; flex-wrap: wrap; }
  .loop-btn {
    font-family: var(--font-mono);
    font-size: 0.72rem;
    letter-spacing: 0.06em;
    padding: 5px 12px;
    color: var(--text);
    background: var(--surface-raised);
    border: var(--hairline-w) solid var(--hairline);
    border-radius: var(--radius-sm);
    cursor: pointer;
    transition: background var(--t-fast), color var(--t-fast);
  }
  .loop-btn.active { background: var(--signal); color: var(--bg); border-color: var(--signal); }
  .region-readout {
    font-family: var(--font-mono);
    font-size: 0.72rem;
    color: var(--text);
    font-variant-numeric: tabular-nums;
  }
  .hint { margin: 0; font-family: var(--font-mono); font-size: 0.68rem; color: var(--text-dim); }

  .dual { display: grid; grid-template-columns: 1fr 1fr; gap: 10px; }
  .pane { display: flex; flex-direction: column; gap: 4px; }
  .pane-label {
    font-family: var(--font-mono);
    font-size: 0.62rem;
    letter-spacing: 0.08em;
    color: var(--text-dim);
  }
  .spec {
    height: 180px;
    border: var(--hairline-w) solid var(--hairline);
    border-radius: var(--radius-sm);
    overflow: hidden;
  }

  .knob-row { display: flex; flex-wrap: wrap; gap: 0.4rem; }

  .next .placeholder {
    margin: 0;
    font-family: var(--font-mono);
    font-size: 0.7rem;
    line-height: 1.5;
    color: var(--text-dim);
    padding: 10px 12px;
    background: var(--surface-sunken);
    border-left: 2px solid var(--signal-dim);
    border-radius: var(--radius-sm);
  }

  @media (max-width: 720px) {
    .overlay { padding: 0; }
    .panel { width: 100vw; max-height: 100vh; height: 100vh; border-radius: 0; }
    .dual { grid-template-columns: 1fr; }
  }
</style>
