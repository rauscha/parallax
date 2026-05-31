<script lang="ts">
  import { BRAIDS_MODELS } from "../data/braids-models";
  import { audioEngine } from "../audio/AudioEngine";
  import { audioReadyStore } from "../state/stores";
  import type { BraidsEngine } from "../audio/engines/BraidsEngine";

  let ready = $state(false);
  let modelIndex = $state(0);
  audioReadyStore.subscribe((v) => { ready = v; });

  function setModel(idx: number) {
    modelIndex = Math.max(0, Math.min(46, idx));
    const eng = audioEngine.currentEngine as BraidsEngine | null;
    if (eng && "setShape" in eng) eng.setShape(modelIndex);
  }

  $effect(() => {
    if (ready) setModel(modelIndex);
  });

  let current = $derived(BRAIDS_MODELS[modelIndex]);
</script>

<div class="picker">
  <div class="header">
    <div class="code-pill">
      <span class="code">{current.code}</span>
      <span class="idx">{String(modelIndex).padStart(2, '0')} / 46</span>
    </div>
    <div class="steppers">
      <button class="step" onclick={() => setModel(modelIndex - 1)} disabled={!ready || modelIndex === 0}>◀</button>
      <button class="step" onclick={() => setModel(modelIndex + 1)} disabled={!ready || modelIndex === 46}>▶</button>
    </div>
  </div>
  <div class="name">{current.name}</div>
  <div class="desc">{current.description}</div>
  <select class="dropdown" bind:value={modelIndex} onchange={() => setModel(modelIndex)} disabled={!ready}>
    {#each BRAIDS_MODELS as m (m.index)}
      <option value={m.index}>{m.code} — {m.name}</option>
    {/each}
  </select>
</div>

<style>
  .picker {
    display: flex;
    flex-direction: column;
    gap: 8px;
  }
  .header {
    display: flex;
    justify-content: space-between;
    align-items: center;
    gap: 8px;
  }
  .code-pill {
    display: flex;
    align-items: baseline;
    gap: 10px;
    padding: 6px 12px;
    background: var(--surface-raised);
    border: var(--hairline-w) solid var(--hairline);
    border-radius: var(--radius-md);
  }
  .code {
    font-family: var(--font-mono);
    font-size: 1.1rem;
    font-weight: 600;
    color: var(--signal);
    letter-spacing: 0.05em;
  }
  .idx {
    font-family: var(--font-mono);
    font-size: 0.7rem;
    color: var(--text-dim);
    font-variant-numeric: tabular-nums;
  }
  .steppers { display: flex; gap: 4px; }
  .step {
    width: 32px; height: 32px;
    background: var(--surface);
    border: var(--hairline-w) solid var(--hairline);
    border-radius: var(--radius-md);
    color: var(--text);
    transition: border-color var(--t-fast), color var(--t-fast);
  }
  .step:hover:not(:disabled) { border-color: var(--signal); color: var(--signal); }
  .step:disabled { opacity: 0.3; cursor: not-allowed; }
  .name {
    font-family: var(--font-heading);
    color: var(--text);
    font-size: 0.95rem;
  }
  .desc {
    font-family: var(--font-sans);
    font-size: 0.78rem;
    color: var(--text-muted);
    line-height: 1.4;
  }
  .dropdown {
    width: 100%;
    padding: 6px 8px;
    background: var(--surface);
    border: var(--hairline-w) solid var(--hairline);
    border-radius: var(--radius-md);
    color: var(--text);
    font-family: var(--font-mono);
    font-size: 0.78rem;
  }
</style>
