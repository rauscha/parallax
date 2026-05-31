<script lang="ts">
  import ThemeSwitcher from "./ui/ThemeSwitcher.svelte";
  import TapToStart from "./ui/TapToStart.svelte";
  import ModelPicker from "./ui/ModelPicker.svelte";
  import BasicParamPanel from "./ui/BasicParamPanel.svelte";
  import KeyboardHarness from "./ui/KeyboardHarness.svelte";
  import Oscilloscope from "./viz/Oscilloscope.svelte";
  import { audioReadyStore } from "./state/stores";

  let ready = $state(false);
  audioReadyStore.subscribe((v) => { ready = v; });
</script>

{#if !ready}
  <TapToStart />
{/if}

<header class="topbar">
  <div class="brand">
    <span class="logo">◐</span>
    <span class="brand-name">Macroscope</span>
    <span class="brand-sub">M1 — Braids engine</span>
  </div>
  <ThemeSwitcher />
</header>

<main class="grid">
  <section class="region scope" aria-label="Oscilloscope">
    <Oscilloscope />
  </section>

  <section class="region controls" aria-label="Synth controls">
    <div class="region-label">Controls</div>
    <ModelPicker />
    <div class="divider"></div>
    <BasicParamPanel />
    <div class="divider"></div>
    <KeyboardHarness />
  </section>

  <section class="region explain" aria-label="Explain panel">
    <div class="region-label">Explain</div>
    <div class="placeholder">Per-model TIMBRE/COLOR explanation lands here in M4.</div>
  </section>

  <section class="region staff" aria-label="Melody staff">
    <div class="region-label">Staff</div>
    <div class="placeholder">4-bar / 4-4 click-to-place melody lands here in M3.</div>
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
  .scope    { grid-area: scope; background: var(--scope-bg); padding: 0; overflow: hidden; }
  .controls { grid-area: controls; display: flex; flex-direction: column; gap: 12px; }
  .divider  { height: 1px; background: var(--hairline-soft); margin: 4px 0; }
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
