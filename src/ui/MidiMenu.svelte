<script lang="ts">
  /**
   * MIDI file in/out popover (M5 increment C). Export the current 4-bar melody
   * as a Standard MIDI File, or import a .mid and quantize it onto the grid.
   * Files never leave the browser. Import is lossy by design — it reduces to a
   * 4-bar monophonic grid and reports how many source notes were dropped.
   */
  import { onDestroy } from "svelte";
  import { trapFocus } from "./trapFocus";
  import { melodyStore } from "../state/stores";
  import { exportMelodyToFile, importMelodyFromFile } from "../sequencer/midi";

  let eventCount = $state(melodyStore.get().events.length);
  const unsubCount = melodyStore.subscribe((m) => { eventCount = m.events.length; });
  onDestroy(unsubCount);

  let open = $state(false);
  let busy = $state(false);
  let status = $state<string | null>(null);
  let rootEl: HTMLElement;
  let fileInput = $state<HTMLInputElement | null>(null);

  $effect(() => {
    if (!open) return;
    const onPointer = (e: PointerEvent) => {
      if (rootEl && !rootEl.contains(e.target as Node)) open = false;
    };
    const onKey = (e: KeyboardEvent) => { if (e.key === "Escape") open = false; };
    document.addEventListener("pointerdown", onPointer);
    document.addEventListener("keydown", onKey);
    return () => {
      document.removeEventListener("pointerdown", onPointer);
      document.removeEventListener("keydown", onKey);
    };
  });

  function onExport() {
    exportMelodyToFile(melodyStore.get());
    status = "Exported parallax.mid";
  }

  async function onFile(e: Event) {
    const input = e.currentTarget as HTMLInputElement;
    const file = input.files?.[0];
    input.value = ""; // allow re-importing the same file
    if (!file) return;
    busy = true;
    status = null;
    try {
      const res = await importMelodyFromFile(file);
      const cur = melodyStore.get();
      // Replace the melody (events + tempo); keep the user's key/scale choice.
      melodyStore.set({ ...cur, tempo: res.tempo, events: res.events });
      status =
        res.events.length === 0
          ? "No notes found in the first 4 bars"
          : `Imported ${res.events.length} note${res.events.length === 1 ? "" : "s"}` +
            (res.dropped > 0 ? ` · ${res.dropped} dropped (past bar 4 / overlaps)` : "");
    } catch (err) {
      status = `Couldn't read that file (${err instanceof Error ? err.message : "invalid MIDI"})`;
    } finally {
      busy = false;
    }
  }
</script>

<div class="midi-menu" bind:this={rootEl}>
  <button
    class="io-btn"
    class:active={open}
    onclick={() => (open = !open)}
    aria-haspopup="true"
    aria-expanded={open}
    title="Import or export a MIDI file"
  >♪ MIDI</button>

  {#if open}
    <div class="panel" role="dialog" aria-label="MIDI file import and export" tabindex="-1" use:trapFocus>
      <button class="row-btn" onclick={() => fileInput?.click()} disabled={busy}>
        ⤒ Import .mid…
      </button>
      <button class="row-btn" onclick={onExport} disabled={eventCount === 0}>
        ⤓ Export .mid
      </button>
      <input
        bind:this={fileInput}
        type="file"
        accept=".mid,.midi,audio/midi,audio/x-midi"
        class="hidden-file"
        onchange={onFile}
        aria-hidden="true"
        tabindex="-1"
      />
      {#if status}<p class="status" role="status">{status}</p>{/if}
      <p class="note">Import quantizes to the 4-bar monophonic grid.</p>
    </div>
  {/if}
</div>

<style>
  .midi-menu { position: relative; display: inline-flex; }
  .io-btn {
    font-family: var(--font-mono);
    font-size: 0.7rem;
    letter-spacing: 0.04em;
    padding: 5px 12px;
    color: var(--text);
    background: var(--surface-raised);
    border: var(--hairline-w) solid var(--hairline);
    border-radius: var(--radius-sm);
    cursor: pointer;
    white-space: nowrap;
    transition: filter var(--t-fast), border-color var(--t-fast);
  }
  .io-btn:hover:not(:disabled) { filter: brightness(1.1); border-color: var(--signal); }
  .io-btn:focus-visible { outline: 2px solid var(--signal); outline-offset: 1px; }
  .io-btn.active { border-color: var(--signal); color: var(--signal-ink); }

  .panel {
    position: absolute;
    top: calc(100% + 6px);
    right: 0;
    z-index: 20;
    width: 240px;
    max-width: 86vw;
    padding: 10px;
    background: var(--surface);
    border: var(--hairline-w) solid var(--hairline);
    border-radius: var(--radius-md);
    box-shadow: 0 14px 40px rgba(0, 0, 0, 0.36);
    display: flex;
    flex-direction: column;
    gap: 6px;
  }
  .row-btn {
    font-family: var(--font-mono);
    font-size: 0.74rem;
    text-align: left;
    padding: 8px 10px;
    color: var(--text);
    background: var(--surface-sunken);
    border: var(--hairline-w) solid var(--hairline);
    border-radius: var(--radius-sm);
    cursor: pointer;
    transition: border-color var(--t-fast), background var(--t-fast);
  }
  .row-btn:hover:not(:disabled) { border-color: var(--signal); background: var(--signal-deep); }
  .row-btn:disabled { opacity: 0.4; cursor: not-allowed; }
  .hidden-file { display: none; }
  .status {
    margin: 2px 0 0;
    font-family: var(--font-mono);
    font-size: 0.66rem;
    color: var(--signal-ink);
    line-height: 1.4;
  }
  .note {
    margin: 0;
    font-family: var(--font-mono);
    font-size: 0.62rem;
    color: var(--text-dim);
    line-height: 1.4;
  }
  @media (pointer: coarse) {
    .io-btn { padding: 8px 12px; min-height: 36px; }
    .row-btn { min-height: 38px; }
  }
</style>
