<script lang="ts">
  import { onDestroy } from "svelte";
  import TapToStart from "./ui/TapToStart.svelte";
  import EnginePicker from "./ui/EnginePicker.svelte";
  import ModelPicker from "./ui/ModelPicker.svelte";
  import ParamPanel from "./ui/ParamPanel.svelte";
  import ExplainPanel from "./ui/ExplainPanel.svelte";
  import PatchToolbar from "./ui/PatchToolbar.svelte";
  import ToolsMenu from "./ui/ToolsMenu.svelte";
  import KeyboardHarness from "./ui/KeyboardHarness.svelte";
  import MidiInput from "./ui/MidiInput.svelte";
  import NoteStrip from "./ui/NoteStrip.svelte";
  import MatchPanel from "./ui/MatchPanel.svelte";
  import PwaToast from "./ui/PwaToast.svelte";
  import Oscilloscope from "./viz/Oscilloscope.svelte";
  import Spectrum from "./viz/Spectrum.svelte";
  import StaffEditor from "./notation/StaffEditor.svelte";
  import GridEditor from "./notation/GridEditor.svelte";
  import KeyScalePicker from "./notation/KeyScalePicker.svelte";
  import StaffToolbar from "./notation/StaffToolbar.svelte";
  import { audioReadyStore, isPlayingStore, melodyStore } from "./state/stores";
  import { playTransport, stopTransport, loadDemoMelody, clearMelody } from "./sequencer";
  import { surfaceStore, setSurface, type Surface } from "./notation/editorMode";
  import { surpriseMe } from "./state/surprise";

  // Store subscriptions — captured and torn down in onDestroy. App is the root
  // (never unmounts in practice), but the unsubscribe-on-destroy rule is uniform
  // across every component so a conditionally-mounted one can't regress (A1).
  const unsubs: Array<() => void> = [];

  let ready = $state(false);
  unsubs.push(audioReadyStore.subscribe((v) => { ready = v; }));
  let viz = $state<"scope" | "spectrum">("scope");
  let matchOpen = $state(false);
  let surface = $state<Surface>(surfaceStore.get());
  unsubs.push(surfaceStore.subscribe((v) => { surface = v; }));

  let playing = $state(false);
  unsubs.push(isPlayingStore.subscribe((v) => { playing = v; }));
  let tempo = $state(melodyStore.get().tempo);
  let eventCount = $state(melodyStore.get().events.length);
  unsubs.push(melodyStore.subscribe((m) => { tempo = m.tempo; eventCount = m.events.length; }));

  onDestroy(() => unsubs.forEach((u) => u()));

  function toggleTransport() {
    if (playing) stopTransport();
    else playTransport();
  }

  let rolling = $state(false);
  async function roll() {
    if (rolling || !ready) return;
    rolling = true;
    try { await surpriseMe(); }
    catch (e) { console.error("[surprise] roll failed", e); }
    finally { rolling = false; }
  }
</script>

{#if !ready}
  <TapToStart />
{/if}

<header class="topbar">
  <div class="brand">
    <span class="logo">◐</span>
    <span class="brand-name">Parallax</span>
  </div>
  <div class="topbar-right">
    <!-- Surprise lives OUTSIDE ToolsMenu so it stays visible on phones — it's the
         hero "first move" for a first-time visitor and must not hide behind ⋯
         (ux-ui M5, fun §7.3). On ≤720px the label collapses to the bare ⚄ icon;
         Match/Share/Presets/MIDI still overflow into the menu. -->
    <button class="surprise-entry" onclick={roll} disabled={!ready || rolling}
      aria-label="Surprise me — roll a random engine, sound, and melody"
      title="Roll a random engine, sound, and melody"><span class="dice" aria-hidden="true">⚄</span><span class="surprise-label">{rolling ? " Rolling…" : " Surprise me"}</span></button>
    <ToolsMenu>
      <button class="match-entry" onclick={() => (matchOpen = true)} disabled={!ready}
        title="Load a track and recreate one of its sounds">◎ Match a sound</button>
      <PatchToolbar />
    </ToolsMenu>
  </div>
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
    <EnginePicker />
    <div class="divider"></div>
    <ModelPicker />
    <div class="divider"></div>
    <ParamPanel />
    <div class="divider"></div>
    <MidiInput />
    <div class="divider"></div>
    <KeyboardHarness />
  </section>

  <section class="region explain" aria-label="Explain panel">
    <div class="region-label">Explain</div>
    <ExplainPanel />
  </section>

  <section class="region staff" aria-label="Melody sequencer">
    <div class="staff-header">
      <div class="staff-header-left">
        <span class="region-label">Sequencer</span>
        <div class="surface-toggle" role="group" aria-label="Sequencer surface">
          <button
            class="surf-btn"
            class:active={surface === "staff"}
            onclick={() => setSurface("staff")}
            aria-pressed={surface === "staff"}
          >Staff</button>
          <button
            class="surf-btn"
            class:active={surface === "grid"}
            onclick={() => setSurface("grid")}
            aria-pressed={surface === "grid"}
          >Grid</button>
        </div>
      </div>
      <div class="staff-controls">
        <KeyScalePicker />
        {#if surface === "staff"}
          <StaffToolbar />
        {/if}
      </div>
    </div>
    <div class="staff-frame">
      {#if surface === "staff"}
        <StaffEditor />
      {:else}
        <GridEditor />
      {/if}
    </div>
    <div class="staff-footer">
      {#if eventCount === 0}
        <p class="hint">{surface === "staff" ? "Tap to place a note · drag right to extend · long-press to delete" : "Tap a cell to place a note · drag right to extend · tap again to delete"}</p>
        <button class="ghost-btn" onclick={loadDemoMelody} disabled={!ready}>Load demo</button>
      {:else}
        <span class="count">{eventCount} note{eventCount === 1 ? "" : "s"}</span>
        <button class="ghost-btn" onclick={clearMelody}>Clear</button>
      {/if}
    </div>
  </section>
</main>

<NoteStrip />

<MatchPanel bind:open={matchOpen} />

<PwaToast />

<footer class="transport">
  <div class="transport-left">
    <button class="play-btn" onclick={toggleTransport} disabled={!ready || eventCount === 0}
      aria-pressed={playing} aria-label={playing ? "Stop" : "Play"}>
      {playing ? "■ STOP" : "▶ PLAY"}
    </button>
    <label class="tempo-field">
      <input
        class="tempo-input"
        type="number"
        inputmode="numeric"
        enterkeyhint="done"
        min="40"
        max="240"
        step="1"
        value={tempo}
        onchange={(e) => { const v = Math.max(40, Math.min(240, Math.round(+e.currentTarget.value) || 120)); melodyStore.setKey("tempo", v); e.currentTarget.value = String(v); }}
        aria-label="Tempo (BPM)"
      />
      <span class="bpm-unit">BPM</span>
    </label>
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
  .topbar-right {
    display: inline-flex;
    align-items: center;
    gap: 12px;
    flex-wrap: wrap;
    justify-content: flex-end;
  }
  .match-entry {
    font-family: var(--font-mono);
    font-size: 0.7rem;
    letter-spacing: 0.04em;
    padding: 5px 12px;
    color: var(--text);
    background: var(--surface-raised);
    border: var(--hairline-w) solid var(--hairline);
    border-radius: var(--radius-sm);
    cursor: pointer;
    transition: filter var(--t-fast), border-color var(--t-fast);
  }
  .match-entry:hover:not(:disabled) { filter: brightness(1.1); border-color: var(--signal); }
  .match-entry:disabled { opacity: 0.4; cursor: not-allowed; }
  @media (pointer: coarse) {
    .match-entry { padding: 8px 12px; min-height: 36px; }
  }

  /* Surprise is the playful hero action — give it the signal accent so it pops. */
  .surprise-entry {
    display: inline-flex;
    align-items: center;
    font-family: var(--font-mono);
    font-size: 0.7rem;
    letter-spacing: 0.04em;
    padding: 5px 12px;
    color: var(--on-signal);
    background: var(--signal);
    border: var(--hairline-w) solid var(--signal);
    border-radius: var(--radius-sm);
    cursor: pointer;
    white-space: nowrap;
    font-weight: 600;
    transition: filter var(--t-fast);
  }
  .surprise-entry:hover:not(:disabled) { filter: brightness(1.08); }
  .surprise-entry:disabled { opacity: 0.5; cursor: progress; }
  @media (pointer: coarse) {
    .surprise-entry { padding: 8px 12px; min-height: 36px; }
  }

  .grid {
    flex: 1 1 auto;
    display: grid;
    gap: 1px;
    padding: 1px;
    background: var(--hairline);
    overflow: hidden;

    grid-template-columns: 2fr 1fr;
    /* Scope trimmed (1.4fr → 1.1fr) and that height handed to the Explain row
       (1fr → 1.4fr) so the richer per-model text has room without scrolling. */
    grid-template-rows: 1.1fr 1.4fr 1.6fr;
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
    color: var(--on-signal);
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
    color: var(--on-signal);
    border-color: var(--signal);
  }
  .play-btn:disabled { opacity: 0.4; cursor: not-allowed; }
  .tempo-field {
    display: inline-flex;
    align-items: baseline;
    gap: 4px;
    color: var(--text);
    font-family: var(--font-mono);
  }
  .tempo-input {
    width: 3em;
    text-align: right;
    font-family: var(--font-mono);
    font-variant-numeric: tabular-nums;
    font-size: inherit;
    color: var(--text);
    background: var(--surface-raised);
    border: var(--hairline-w) solid var(--hairline);
    border-radius: var(--radius-sm);
    padding: 2px 4px;
  }
  .tempo-input:focus { outline: 2px solid var(--signal); outline-offset: 1px; }
  /* Hide spinner arrows — they take space and look out of place at this size */
  .tempo-input::-webkit-outer-spin-button,
  .tempo-input::-webkit-inner-spin-button {
    -webkit-appearance: none;
    margin: 0;
  }
  .tempo-input { -moz-appearance: textfield; appearance: textfield; }
  .bpm-unit {
    font-size: 0.7rem;
    color: var(--text-dim);
    text-transform: var(--label-case);
    letter-spacing: var(--label-tracking);
  }
  @media (pointer: coarse) {
    /* 16px is the magic floor: a smaller font makes mobile browsers auto-zoom
       the whole page on focus (and that zoom is a pain to undo inside a PWA). */
    .tempo-input { padding: 6px 8px; min-height: 32px; width: 3.2em; font-size: 16px; }
  }

  .staff-header {
    display: flex;
    align-items: center;
    justify-content: space-between;
    gap: 12px;
    flex-wrap: wrap;
    margin-bottom: 4px;
  }
  .staff-header-left {
    display: inline-flex;
    align-items: center;
    gap: 10px;
  }
  .surface-toggle {
    display: inline-flex;
    background: var(--surface-sunken);
    border: var(--hairline-w) solid var(--hairline);
    border-radius: var(--radius-sm);
    padding: 2px;
    gap: 2px;
  }
  .surf-btn {
    font-family: var(--font-mono);
    font-size: 0.62rem;
    letter-spacing: 0.06em;
    padding: 3px 8px;
    color: var(--text-dim);
    background: transparent;
    border: none;
    border-radius: calc(var(--radius-sm) - 2px);
    cursor: pointer;
    transition: color var(--t-fast), background var(--t-fast);
  }
  .surf-btn:hover:not(.active) { color: var(--text); }
  .surf-btn.active {
    background: var(--signal);
    color: var(--on-signal);
    font-weight: 600;
  }
  @media (pointer: coarse) {
    .surf-btn { padding: 8px 12px; min-height: 36px; }
  }
  .staff-controls {
    display: inline-flex;
    align-items: center;
    gap: 14px;
    flex-wrap: wrap;
  }
  .staff-frame {
    flex: 1 1 auto;
    min-height: 0;
    display: flex;
    align-items: center;
    justify-content: center;
    padding: 4px 0 8px;
  }
  .staff-footer {
    display: flex;
    align-items: center;
    justify-content: space-between;
    gap: 12px;
    flex-wrap: wrap;
    flex: 0 0 auto;
    min-height: 28px;
  }
  .staff-footer .hint {
    font-family: var(--font-mono);
    font-size: 0.7rem;
    color: var(--text-dim);
    line-height: 1.4;
  }
  .staff-footer .count {
    font-family: var(--font-mono);
    font-size: 0.7rem;
    color: var(--text-dim);
  }
  .ghost-btn {
    font-family: var(--font-mono);
    font-size: 0.7rem;
    letter-spacing: 0.06em;
    padding: 4px 10px;
    color: var(--text-muted);
    background: transparent;
    border: var(--hairline-w) solid var(--hairline);
    border-radius: var(--radius-sm);
    transition: color var(--t-fast), border-color var(--t-fast);
  }
  .ghost-btn:hover:not(:disabled) { color: var(--text); border-color: var(--text-dim); }
  .ghost-btn:disabled { opacity: 0.4; cursor: not-allowed; }
  @media (pointer: coarse) {
    .ghost-btn { padding: 8px 14px; min-height: 36px; }
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
    /* Stacked on a phone, the four regions are far taller than the viewport.
       The desktop layout never scrolls (overflow:hidden) and lets a `1fr` scope
       row eat the remaining height — on mobile that clipped the bottom region
       (the sequencer) right off the screen with no way to reach it. Here we let
       the grid SCROLL between the fixed top bar and transport, and size every
       row to its content, with explicit heights for the two regions that have
       no intrinsic height of their own (the canvas viz and the editor). */
    .grid {
      grid-template-columns: 1fr;
      grid-template-rows: auto auto auto auto;
      grid-template-areas:
        "scope"
        "controls"
        "explain"
        "staff";
      overflow-y: auto;
      -webkit-overflow-scrolling: touch;
      /* Allow the grid to be shorter than its content so it scrolls within the
         remaining flex height instead of growing and pushing the transport off
         screen (the flexbox min-height:auto trap). */
      min-height: 0;
    }
    /* Let each region grow to its full content height; the GRID scrolls past
       them. Without this, the regions' own `overflow:auto` lets the grid shrink
       them to near-zero to fit the fixed height — which crushed Controls and
       Explain into unusable 46px slivers. */
    .region { overflow: visible; }
    .scope { height: 26vh; min-height: 160px; overflow: hidden; }
    /* No 340px floor: it over-allocated the staff, so the frame's flex share
       grew taller than the (short, single-octave) grid. Combined with the
       desktop frame's `align-items:center` + `overflow:visible`, the grid
       centred in that too-tall frame and spilled over the footer — the "covered
       text on the side". Size the staff to content, and make the frame plain
       block flow so the grid sits at its natural height with the footer right
       below it (no centering, no flex over-allocation, no overflow). */
    .staff { min-height: 0; }
    .staff-frame {
      display: block;
      flex: 0 0 auto;
      padding: 4px 0 8px;
    }

    /* Top bar stays a single tidy row on phones: brand on the left, everything
       else collapsed behind ToolsMenu's `⋯` button (which owns its own popover).
       No wrapping, no overflow. Honour the notch/status-bar inset when installed. */
    .topbar {
      gap: 10px;
      padding: 8px 12px;
      padding-top: calc(8px + env(safe-area-inset-top));
    }
    /* Surprise stays in the phone top bar but as the bare ⚄ icon, so it reads as
       a tidy single button next to ⋯ rather than a wide pill. */
    .surprise-label { display: none; }
    .surprise-entry {
      min-width: 40px;
      justify-content: center;
      font-size: 1.1rem;
      line-height: 1;
      padding: 6px 10px;
    }
    /* Fill the home-indicator / gesture-bar area with the transport's own
       surface so there's no mismatched colour band at the very bottom
       (viewport-fit=cover extends the page under the system bars). */
    .transport {
      padding-bottom: calc(8px + env(safe-area-inset-bottom));
    }
  }
</style>
