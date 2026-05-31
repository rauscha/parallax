<script lang="ts">
  import ThemeSwitcher from "./ui/ThemeSwitcher.svelte";
  import TapToStart from "./ui/TapToStart.svelte";
  import { audioReadyStore } from "./state/stores";
  import { audioEngine } from "./audio/AudioEngine";

  let ready = $state(false);
  audioReadyStore.subscribe((v) => { ready = v; });

  function tapNote(midi: number) {
    const e = audioEngine.currentEngine;
    if (!e) return;
    e.noteOn(midi, { velocity: 0.7 });
    setTimeout(() => e.noteOff(midi), 280);
  }
</script>

{#if !ready}
  <TapToStart />
{/if}

<header class="topbar">
  <div class="brand">
    <span class="logo">◐</span>
    <span class="brand-name">Macroscope</span>
    <span class="brand-sub">M0 scaffold</span>
  </div>
  <ThemeSwitcher />
</header>

<main class="grid">
  <section class="region scope" aria-label="Oscilloscope">
    <div class="region-label">Scope</div>
    <div class="placeholder">Waveform appears here (M1)</div>
  </section>

  <section class="region controls" aria-label="Synth controls">
    <div class="region-label">Controls</div>
    <div class="placeholder">
      <p>Model picker, TIMBRE/COLOR, envelope, lo-fi (M2)</p>
      <div class="test-buttons">
        <span class="label">Test:</span>
        <button class="key" onclick={() => tapNote(60)} disabled={!ready}>C4</button>
        <button class="key" onclick={() => tapNote(64)} disabled={!ready}>E4</button>
        <button class="key" onclick={() => tapNote(67)} disabled={!ready}>G4</button>
        <button class="key" onclick={() => tapNote(69)} disabled={!ready}>A4</button>
      </div>
    </div>
  </section>

  <section class="region explain" aria-label="Explain panel">
    <div class="region-label">Explain</div>
    <div class="placeholder">Per-model TIMBRE/COLOR explanation (M4)</div>
  </section>

  <section class="region staff" aria-label="Melody staff">
    <div class="region-label">Staff</div>
    <div class="placeholder">4-bar / 4-4 click-to-place melody (M3)</div>
  </section>
</main>

<footer class="transport">
  <span class="readout">— BPM</span>
  <span class="status">audio: <strong class:on={ready}>{ready ? "ready" : "idle"}</strong></span>
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
      "staff    staff";
  }

  .region {
    background: var(--bg);
    padding: 14px 18px;
    overflow: auto;
    position: relative;
  }
  .scope    { grid-area: scope; background: var(--scope-bg); }
  .controls { grid-area: controls; }
  .explain  { grid-area: explain; }
  .staff    { grid-area: staff; }

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
  .scope .placeholder { color: var(--signal-dim); }

  .test-buttons {
    display: flex;
    gap: 6px;
    flex-wrap: wrap;
    align-items: center;
  }
  .key {
    padding: 6px 12px;
    background: var(--surface);
    border: var(--hairline-w) solid var(--hairline);
    border-radius: var(--radius-md);
    font-family: var(--font-mono);
    font-size: 0.78rem;
    color: var(--text);
    transition: background var(--t-fast), border-color var(--t-fast), transform var(--t-fast);
  }
  .key:hover:not(:disabled) { border-color: var(--signal); color: var(--signal); }
  .key:active:not(:disabled) { transform: scale(0.96); }
  .key:disabled { opacity: 0.45; cursor: not-allowed; }

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
  .status strong { color: var(--text-dim); }
  .status strong.on { color: var(--signal); }

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
