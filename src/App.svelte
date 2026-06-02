<script lang="ts">
  import ThemeSwitcher from "./ui/ThemeSwitcher.svelte";
  import TapToStart from "./ui/TapToStart.svelte";
  import ModelPicker from "./ui/ModelPicker.svelte";
  import ParamPanel from "./ui/ParamPanel.svelte";
  import KeyboardHarness from "./ui/KeyboardHarness.svelte";
  import NoteStrip from "./ui/NoteStrip.svelte";
  import Oscilloscope from "./viz/Oscilloscope.svelte";
  import Spectrum from "./viz/Spectrum.svelte";
  import StaffEditor from "./notation/StaffEditor.svelte";
  import { audioReadyStore, isPlayingStore, melodyStore } from "./state/stores";
  import { playTransport, stopTransport, loadDemoMelody, clearMelody } from "./sequencer";

  let ready = $state(false);
  audioReadyStore.subscribe((v) => { ready = v; });
  let viz = $state<"scope" | "spectrum">("scope");

  // M3 first-slice scratch UI — Play/Stop + Load demo. Replaced when the
  // real staff editor lands.
  let playing = $state(false);
  isPlayingStore.subscribe((v) => { playing = v; });
  let tempo = $state(melodyStore.get().tempo);
  let eventCount = $state(melodyStore.get().events.length);
  melodyStore.subscribe((m) => { tempo = m.tempo; eventCount = m.events.length; });

  function toggleTransport() {
    if (playing) stopTransport();
    else playTransport();
  }
</script>

{#if !ready}
  <TapToStart />
{/if}

<header class="topbar">
  <div class="brand">
    <span class="logo">◐</span>
    <span class="brand-name">Parallax</span>
    <span class="brand-sub">M1 — Braids engine</span>
  </div>
  <ThemeSwitcher />
</header>

<main class="grid">
  <section class="region scope" aria-label="Visualizer">
    <div class="viz-toggle" role="group" aria-label="Visualizer mode">
      <button class="viz-btn" class:active={viz === "scope"} aria-pressed={viz === "scope"}
        onclick={(e) => { viz = "scope"; e.currentTarget.blur(); }}>SCOPE</button>
      <button class="viz-btn" class:active={viz === "spectrum"} aria-pressed={viz === "spectrum"}
        onclick={(e) => { viz = "spectrum"; e.currentTarget.blur(); }}>SPECTRUM</button>
    </div>
    {#if viz === "scope"}
      <Oscilloscope />
    {:else}
      <Spectrum />
    {/if}
  </section>

  <section class="region controls" aria-label="Synth controls">
    <div class="region-label">Controls</div>
    <ModelPicker />
    <div class="divider"></div>
    <ParamPanel />
    <div class="divider"></div>
    <KeyboardHarness />
  </section>

  <section class="region explain" aria-label="Explain panel">
    <div class="region-label">Explain</div>
    <div class="placeholder">Per-model TIMBRE/COLOR explanation lands here in M4.</div>
  </section>

  <section class="region staff" aria-label="Melody staff">
    <div class="region-label">Staff</div>
    <div class="staff-frame">
      <StaffEditor />
    </div>
    <div class="staff-scratch">
      <div class="scratch-row">
        <button class="scratch-btn" onclick={loadDemoMelody} disabled={!ready}>
          Load demo melody
        </button>
        <button class="scratch-btn" onclick={clearMelody} disabled={!ready || eventCount === 0}>
          Clear
        </button>
        <span class="scratch-meta">{eventCount} note{eventCount === 1 ? "" : "s"}</span>
      </div>
    </div>
  </section>
</main>

<NoteStrip />

<footer class="transport">
  <div class="transport-left">
    <button class="play-btn" onclick={toggleTransport} disabled={!ready || eventCount === 0}
      aria-pressed={playing} aria-label={playing ? "Stop" : "Play"}>
      {playing ? "■ STOP" : "▶ PLAY"}
    </button>
    <span class="readout">{tempo} BPM</span>
  </div>
  <span class="status">audio <span class="dot" aria-hidden="true">{ready ? "●" : "○"}</span> <strong>{ready ? "READY" : "idle"}</strong></span>
</footer>

<style>
  .topbar {
    display: flex;
    justify-content: space-between;
    align-items: center;
    padding: 10px 16px;
    border-bottom: var(--hairline-w) solid var(--hairline);
    background: var(--surface);
    flex: 0 0 auto;
  }
  .brand {
    display: flex;
    align-items: baseline;
    gap: 10px;
  }
  .logo {
    color: var(--signal);
    font-size: 18px;
  }
  .brand-name {
    font-family: var(--font-heading);
    font-weight: 600;
    color: var(--text);
    letter-spacing: -0.01em;
  }
  .brand-sub {
    font-family: var(--font-mono);
    font-size: 0.7rem;
    color: var(--text-dim);
    text-transform: var(--label-case);
    letter-spacing: var(--label-tracking);
  }

  .grid {
    flex: 1 1 auto;
    display: grid;
    gap: 1px;
    padding: 1px;
    background: var(--hairline);
    overflow: hidden;

    grid-template-columns: 2fr 1fr;
    grid-template-rows: 1.4fr 1fr 1.6fr;
    grid-template-areas:
      "scope    controls"
      "explain  controls"
      "staff    controls";
  }

  .region {
    background: var(--bg);
    padding: 14px 18px;
    overflow: auto;
    position: relative;
  }
  .scope    { grid-area: scope; background: var(--scope-bg); padding: 0; overflow: hidden; }
  .viz-toggle {
    position: absolute; top: 8px; right: 8px; z-index: 2;
    display: flex; gap: 2px;
    background: var(--surface-raised);
    border: var(--hairline-w) solid var(--hairline);
    border-radius: var(--radius-sm);
    padding: 2px;
  }
  .viz-btn {
    font-family: var(--font-mono);
    font-size: 0.62rem;
    letter-spacing: 0.08em;
    padding: 3px 8px;
    border-radius: calc(var(--radius-sm) - 2px);
    color: var(--text-dim);
    transition: color var(--t-fast), background var(--t-fast);
  }
  .viz-btn.active {
    background: var(--signal);
    color: var(--bg);
    font-weight: 600;
  }
  /* Finger-class targets need at least 44px to be reliably tappable. */
  @media (pointer: coarse) {
    .viz-btn {
      padding: 10px 14px;
      font-size: 0.72rem;
      min-height: 44px;
    }
  }
  .controls { grid-area: controls; display: flex; flex-direction: column; gap: 12px; }
  .divider  { height: 1px; background: var(--hairline-soft); margin: 4px 0; }
  .explain  { grid-area: explain; }
  .staff    { grid-area: staff; display: flex; flex-direction: column; }

  .region-label {
    font-family: var(--font-mono);
    font-size: 0.7rem;
    text-transform: uppercase;
    letter-spacing: 0.1em;
    color: var(--text-dim);
    margin-bottom: 8px;
  }
  .placeholder {
    font-family: var(--font-mono);
    font-size: 0.85rem;
    color: var(--text-muted);
    display: flex;
    flex-direction: column;
    gap: 12px;
  }

  .transport {
    flex: 0 0 auto;
    display: flex;
    justify-content: space-between;
    align-items: center;
    padding: 8px 16px;
    border-top: var(--hairline-w) solid var(--hairline);
    background: var(--surface);
    font-family: var(--font-mono);
    font-size: 0.75rem;
    color: var(--text-muted);
  }
  .transport-left {
    display: inline-flex;
    align-items: center;
    gap: 14px;
  }
  .play-btn {
    font-family: var(--font-mono);
    font-size: 0.72rem;
    letter-spacing: 0.08em;
    padding: 5px 12px;
    color: var(--text);
    background: var(--surface-raised);
    border: var(--hairline-w) solid var(--hairline);
    border-radius: var(--radius-sm);
    transition: filter var(--t-fast), background var(--t-fast);
  }
  .play-btn:hover:not(:disabled) { filter: brightness(1.1); }
  .play-btn[aria-pressed="true"] {
    background: var(--signal);
    color: var(--bg);
    border-color: var(--signal);
  }
  .play-btn:disabled { opacity: 0.4; cursor: not-allowed; }
  .readout {
    font-family: var(--font-mono);
    color: var(--text);
  }

  .staff-frame {
    flex: 1 1 auto;
    min-height: 0;
    display: flex;
    align-items: center;
    justify-content: center;
    padding: 4px 0 8px;
  }
  .staff-scratch {
    display: flex;
    flex-direction: column;
    gap: 10px;
    flex: 0 0 auto;
  }
  .scratch-row {
    display: flex;
    align-items: center;
    gap: 10px;
    flex-wrap: wrap;
  }
  .scratch-btn {
    font-family: var(--font-mono);
    font-size: 0.72rem;
    letter-spacing: 0.06em;
    padding: 6px 12px;
    color: var(--text);
    background: var(--surface-raised);
    border: var(--hairline-w) solid var(--hairline);
    border-radius: var(--radius-sm);
    transition: filter var(--t-fast);
  }
  .scratch-btn:hover:not(:disabled) { filter: brightness(1.1); }
  .scratch-btn:disabled { opacity: 0.4; cursor: not-allowed; }
  .scratch-meta {
    font-family: var(--font-mono);
    font-size: 0.7rem;
    color: var(--text-dim);
  }
  /* Status uses shape + text-case + weight, not color alone — ready/idle is
     readable in greyscale and remains accessible for colorblind users. */
  .status { display: inline-flex; align-items: baseline; gap: 6px; }
  .status .dot {
    font-family: var(--font-mono);
    font-size: 0.8em;
    color: var(--text);   /* same colour both states; the glyph carries the meaning */
  }
  .status strong {
    font-family: var(--font-mono);
    font-weight: 500;
    color: var(--text);
  }

  @media (max-width: 720px) {
    .grid {
      grid-template-columns: 1fr;
      grid-template-rows: minmax(180px, 1fr) auto auto auto;
      grid-template-areas:
        "scope"
        "controls"
        "explain"
        "staff";
    }
  }
</style>
