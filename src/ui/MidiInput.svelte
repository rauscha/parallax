<script lang="ts">
  /**
   * Live MIDI input control (Controls column). Enable Web MIDI, pick a device,
   * watch incoming activity, and panic. Graceful message where Web MIDI isn't
   * available (Safari / iOS). Logic lives in state/midi-input.ts.
   */
  import { onDestroy } from "svelte";
  import {
    midiSupported, midiStateStore, midiActivityStore,
    enableMidi, selectMidiInput, disableMidi, midiPanic,
  } from "../state/midi-input";

  const unsubs: Array<() => void> = [];

  let midi = $state(midiStateStore.get());
  unsubs.push(midiStateStore.subscribe((v) => { midi = v; }));

  // Activity blip — flash the dot for ~150ms after each message.
  let active = $state(false);
  let blipTimer = 0;
  unsubs.push(midiActivityStore.subscribe((t) => {
    if (!t) return;
    active = true;
    clearTimeout(blipTimer);
    blipTimer = window.setTimeout(() => { active = false; }, 150);
  }));

  onDestroy(() => { clearTimeout(blipTimer); unsubs.forEach((u) => u()); });

  function onSelect(e: Event) {
    selectMidiInput((e.currentTarget as HTMLSelectElement).value);
  }
</script>

<div class="midi-in" role="group" aria-label="MIDI input">
  <span class="label">MIDI In</span>

  {#if !midiSupported}
    <span class="note">Not supported in this browser (try Chrome / Android).</span>
  {:else if !midi.enabled}
    <button class="enable" onclick={() => enableMidi()}>Enable</button>
  {:else}
    {#if midi.inputs.length === 0}
      <span class="note">No devices — plug one in.</span>
    {:else}
      <label class="field">
        <select value={midi.selectedId ?? ""} onchange={onSelect} aria-label="MIDI device">
          {#each midi.inputs as inp (inp.id)}
            <option value={inp.id}>{inp.name}</option>
          {/each}
        </select>
      </label>
      <span class="dot" class:active aria-hidden="true">●</span>
    {/if}
    <button class="ghost" onclick={() => midiPanic()} title="Stop all notes">Panic</button>
    <button class="ghost" onclick={() => disableMidi()} title="Turn MIDI input off" aria-label="Disable MIDI input">×</button>
  {/if}

  {#if midi.error}<span class="err" role="alert">{midi.error}</span>{/if}
</div>

<style>
  .midi-in {
    display: flex;
    align-items: center;
    gap: 10px;
    flex-wrap: wrap;
  }
  .label {
    font-family: var(--font-mono);
    font-size: 0.62rem;
    text-transform: var(--label-case);
    letter-spacing: 0.1em;
    color: var(--text-dim);
  }
  .note {
    font-family: var(--font-mono);
    font-size: 0.68rem;
    color: var(--text-dim);
  }
  .enable {
    font-family: var(--font-mono);
    font-size: 0.7rem;
    letter-spacing: 0.04em;
    padding: 5px 12px;
    color: var(--on-signal);
    background: var(--signal);
    border: var(--hairline-w) solid var(--signal);
    border-radius: var(--radius-sm);
    cursor: pointer;
    font-weight: 600;
    transition: filter var(--t-fast);
  }
  .enable:hover { filter: brightness(1.08); }
  .field { display: inline-flex; min-width: 0; }
  select {
    font-family: var(--font-mono);
    font-size: 0.72rem;
    max-width: 11rem;
    padding: 3px 6px;
    color: var(--text);
    background: var(--surface-raised);
    border: var(--hairline-w) solid var(--hairline);
    border-radius: var(--radius-sm);
    cursor: pointer;
  }
  .dot {
    font-size: 0.7rem;
    color: var(--text-dim);
    transition: color var(--t-fast), text-shadow var(--t-fast);
  }
  .dot.active {
    color: var(--signal);
    text-shadow: 0 0 6px var(--signal-glow);
  }
  .ghost {
    font-family: var(--font-mono);
    font-size: 0.66rem;
    letter-spacing: 0.04em;
    padding: 3px 8px;
    color: var(--text-muted);
    background: transparent;
    border: var(--hairline-w) solid var(--hairline);
    border-radius: var(--radius-sm);
    cursor: pointer;
    transition: color var(--t-fast), border-color var(--t-fast);
  }
  .ghost:hover { color: var(--text); border-color: var(--text-dim); }
  .err {
    font-family: var(--font-mono);
    font-size: 0.66rem;
    color: var(--accent);
    flex-basis: 100%;
  }
  @media (pointer: coarse) {
    .enable { padding: 8px 12px; min-height: 36px; }
    select { padding: 7px 8px; min-height: 36px; }
    .ghost { padding: 7px 10px; min-height: 36px; }
  }
</style>
