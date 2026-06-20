<script lang="ts">
  import { onMount, onDestroy } from "svelte";
  import { audioEngine } from "../audio/AudioEngine";
  import { patchStore, engineIdStore } from "../state/stores";
  import { getEngineEntry } from "../audio/registry";
  import type { ParameterDescriptor } from "../audio/types";
  import { analyzeRegion, type RegionAnalysis } from "../audio/sample-analysis";
  import { suggestPatches, type PatchSuggestion } from "../audio/suggest";
  import { startEngine } from "../state/engine-control";
  import { recordSound } from "../state/lineage";
  import Spectrum from "../viz/Spectrum.svelte";
  import Knob from "./Knob.svelte";
  import { trapFocus } from "./trapFocus";

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

  // ── Detection (Increment 2): pitch / brightness / envelope of the region ──
  let analysis = $state<RegionAnalysis | null>(null);
  function runAnalysis() {
    const buf = audioEngine.loadedSample;
    if (!buf) { analysis = null; return; }
    try { analysis = analyzeRegion(buf, region.start, region.end); }
    catch { analysis = null; }
  }

  // ── Suggestion (Increment 3): rank engine·model from the detected features ──
  let suggestions = $derived(analysis ? suggestPatches(analysis) : []);
  let applying = $state(false);

  // Swap engine if needed (re-seeds the patch with that engine's defaults), then
  // overlay the suggested model + macro nudges and push via the store binding.
  async function applySuggestion(s: PatchSuggestion) {
    applying = true;
    error = "";
    try {
      recordSound("match");   // snapshot the outgoing sound for the Recent trail
      if (s.engineId !== engineIdStore.get()) await startEngine(s.engineId);
      const eng = audioEngine.currentEngine;
      const byId = new Map((eng?.getParameterSchema() ?? []).map((d) => [d.id, d]));
      const params = { ...patchStore.get().params };
      for (const [id, frac] of Object.entries(s.macros)) {
        const d = byId.get(id);
        if (d) params[id] = d.min + frac * (d.max - d.min);   // 0..1 → knob range
      }
      patchStore.set({ version: 1, engineId: s.engineId, modelId: s.modelId, params });
    } catch {
      error = "Couldn't apply that patch (engine failed to load). Try another.";
    } finally {
      applying = false;
    }
  }

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
      runAnalysis();
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
    runAnalysis();
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
  const cap = (s: string) => s.charAt(0).toUpperCase() + s.slice(1);
  const fmtHz = (hz: number) => (hz >= 1000 ? `${(hz / 1000).toFixed(1)} kHz` : `${Math.round(hz)} Hz`);
</script>

{#if open}
  <div class="overlay">
    <button class="backdrop" aria-label="Close match panel" onclick={close}></button>
    <div class="panel" role="dialog" aria-modal="true" aria-label="Match a sound" tabindex="-1" use:trapFocus>
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

          <!-- Detected (Increment 2) -->
          <div class="match-section">
            <div class="section-label">Detected <span class="muted">— from the selected region</span></div>
            {#if analysis}
              <div class="detect-grid">
                <div class="detect-cell">
                  <div class="detect-key">Pitch</div>
                  {#if analysis.note}
                    <div class="detect-val">{analysis.note}</div>
                    <div class="detect-sub">{analysis.freq ? Math.round(analysis.freq) : "—"} Hz</div>
                  {:else}
                    <div class="detect-val muted-val">—</div>
                    <div class="detect-sub">no clear pitch (noisy / percussive)</div>
                  {/if}
                </div>
                <div class="detect-cell">
                  <div class="detect-key">Brightness</div>
                  <div class="detect-val">{cap(analysis.brightness)}</div>
                  <div class="detect-sub">centroid {fmtHz(analysis.centroidHz)}</div>
                </div>
                <div class="detect-cell">
                  <div class="detect-key">Envelope</div>
                  <div class="detect-val">{cap(analysis.decayChar)}</div>
                  <div class="detect-sub">{Math.round(analysis.attackMs)} ms attack</div>
                </div>
              </div>
            {:else}
              <p class="hint">Select a region to detect its pitch, brightness and envelope.</p>
            {/if}
          </div>

          <!-- Suggestion + Apply (Increment 3) -->
          <div class="match-section">
            <div class="section-label">Suggest a patch <span class="muted">— ranked from the detected features</span></div>
            {#if suggestions.length}
              {@const top = suggestions[0]}
              <div class="suggest-top">
                <div class="suggest-head">
                  <div class="suggest-name">
                    <span class="eng">{top.engineName}</span>
                    <span class="sep">·</span>
                    <span class="mdl">{top.modelCode}</span>
                    <span class="mdl-name">{top.modelName}</span>
                  </div>
                  <button class="apply-btn" onclick={() => applySuggestion(top)} disabled={applying}>
                    {applying ? "Applying…" : "Apply starting patch"}
                  </button>
                </div>
                {#if top.why}<p class="suggest-why">{top.why}</p>{/if}
              </div>
              {#if suggestions.length > 1}
                <div class="suggest-alts">
                  <span class="alts-label">Also try</span>
                  {#each suggestions.slice(1, 3) as alt (alt.engineId + alt.modelId)}
                    <button class="alt-chip" onclick={() => applySuggestion(alt)} disabled={applying}>
                      {alt.engineName} · {alt.modelCode}
                    </button>
                  {/each}
                </div>
              {/if}
              <p class="hint">Sets the engine + model and nudges the macros — a launch point you refine with the knobs and spectra above.</p>
            {:else}
              <p class="hint">Select a region to get a suggested engine and model.</p>
            {/if}
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
    color: var(--on-signal);
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
  .error { margin: 0; font-family: var(--font-mono); font-size: 0.72rem; color: var(--danger); }

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
  .loop-btn.active { background: var(--signal); color: var(--on-signal); border-color: var(--signal); }
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

  .detect-grid {
    display: grid;
    grid-template-columns: repeat(3, 1fr);
    gap: 8px;
  }
  .detect-cell {
    display: flex;
    flex-direction: column;
    gap: 2px;
    padding: 10px 12px;
    background: var(--surface-raised);
    border: var(--hairline-w) solid var(--hairline);
    border-radius: var(--radius-sm);
  }
  .detect-key {
    font-family: var(--font-mono);
    font-size: 0.62rem;
    text-transform: uppercase;
    letter-spacing: 0.08em;
    color: var(--text-dim);
  }
  .detect-val {
    font-family: var(--font-heading);
    font-size: 1.15rem;
    font-weight: 600;
    color: var(--signal-ink);
    line-height: 1.1;
  }
  .detect-val.muted-val { color: var(--text-dim); }
  .detect-sub {
    font-family: var(--font-mono);
    font-size: 0.66rem;
    color: var(--text-muted);
    font-variant-numeric: tabular-nums;
  }

  .suggest-top {
    display: flex;
    flex-direction: column;
    gap: 6px;
    padding: 10px 12px;
    background: var(--surface-raised);
    border: var(--hairline-w) solid var(--hairline);
    border-left: 2px solid var(--signal);
    border-radius: var(--radius-sm);
  }
  .suggest-head {
    display: flex;
    align-items: center;
    justify-content: space-between;
    gap: 12px;
    flex-wrap: wrap;
  }
  .suggest-name {
    display: flex;
    align-items: baseline;
    gap: 6px;
    flex-wrap: wrap;
  }
  .suggest-name .eng {
    font-family: var(--font-mono);
    font-size: 0.68rem;
    text-transform: uppercase;
    letter-spacing: 0.08em;
    color: var(--text-dim);
  }
  .suggest-name .sep { color: var(--text-dim); }
  .suggest-name .mdl {
    font-family: var(--font-heading);
    font-size: 1rem;
    font-weight: 600;
    color: var(--signal-ink);
  }
  .suggest-name .mdl-name {
    font-family: var(--font-mono);
    font-size: 0.72rem;
    color: var(--text-muted);
  }
  .apply-btn {
    font-family: var(--font-mono);
    font-size: 0.72rem;
    letter-spacing: 0.06em;
    padding: 7px 14px;
    color: var(--on-signal);
    background: var(--signal);
    border: var(--hairline-w) solid var(--signal);
    border-radius: var(--radius-sm);
    cursor: pointer;
    transition: filter var(--t-fast);
    white-space: nowrap;
  }
  .apply-btn:hover:not(:disabled) { filter: brightness(1.08); }
  .apply-btn:disabled { opacity: 0.6; cursor: default; }
  .suggest-why {
    margin: 0;
    font-family: var(--font-mono);
    font-size: 0.7rem;
    line-height: 1.5;
    color: var(--text-dim);
  }
  .suggest-alts {
    display: flex;
    align-items: center;
    gap: 8px;
    flex-wrap: wrap;
  }
  .alts-label {
    font-family: var(--font-mono);
    font-size: 0.62rem;
    text-transform: uppercase;
    letter-spacing: 0.08em;
    color: var(--text-dim);
  }
  .alt-chip {
    font-family: var(--font-mono);
    font-size: 0.68rem;
    padding: 4px 10px;
    color: var(--text);
    background: var(--surface-sunken);
    border: var(--hairline-w) solid var(--hairline);
    border-radius: var(--radius-sm);
    cursor: pointer;
    transition: background var(--t-fast), color var(--t-fast);
  }
  .alt-chip:hover:not(:disabled) { background: var(--surface-raised); color: var(--signal); }
  .alt-chip:disabled { opacity: 0.6; cursor: default; }

  @media (max-width: 720px) {
    .overlay { padding: 0; }
    .panel { width: 100vw; max-height: 100vh; height: 100vh; border-radius: 0; }
    .dual { grid-template-columns: 1fr; }
  }
</style>
