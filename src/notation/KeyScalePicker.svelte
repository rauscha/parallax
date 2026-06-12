<script lang="ts">
  import { onDestroy } from "svelte";
  import { melodyStore } from "../state/stores";

  const KEYS = ["C", "Db", "D", "Eb", "E", "F", "F#", "G", "Ab", "A", "Bb", "B"];
  const SCALES = ["major", "minor", "pentatonic", "chromatic"] as const;

  let key = $state(melodyStore.get().key);
  let scale = $state(melodyStore.get().scale);
  const unsubKey = melodyStore.subscribe((m) => { key = m.key; scale = m.scale; });
  onDestroy(unsubKey);

  function onKeyChange(e: Event) {
    const v = (e.currentTarget as HTMLSelectElement).value;
    melodyStore.setKey("key", v);
  }
  function onScaleChange(e: Event) {
    const v = (e.currentTarget as HTMLSelectElement).value as typeof SCALES[number];
    melodyStore.setKey("scale", v);
  }
</script>

<div class="key-scale">
  <label class="field">
    <span class="lbl">Key</span>
    <select onchange={onKeyChange} value={key}>
      {#each KEYS as k}
        <option value={k}>{k}</option>
      {/each}
    </select>
  </label>
  <label class="field">
    <span class="lbl">Scale</span>
    <select onchange={onScaleChange} value={scale}>
      {#each SCALES as s}
        <option value={s}>{s}</option>
      {/each}
    </select>
  </label>
</div>

<style>
  .key-scale {
    display: inline-flex;
    align-items: center;
    gap: 10px;
    font-family: var(--font-mono);
    font-size: 0.72rem;
  }
  .field {
    display: inline-flex;
    align-items: center;
    gap: 5px;
  }
  .lbl {
    text-transform: var(--label-case);
    letter-spacing: var(--label-tracking);
    color: var(--text-dim);
  }
  select {
    font-family: var(--font-mono);
    font-size: 0.72rem;
    padding: 3px 6px;
    color: var(--text);
    background: var(--surface-raised);
    border: var(--hairline-w) solid var(--hairline);
    border-radius: var(--radius-sm);
    cursor: pointer;
  }
  select:hover { filter: brightness(1.1); }
  @media (pointer: coarse) {
    select { padding: 8px 10px; min-height: 36px; }
  }
</style>
