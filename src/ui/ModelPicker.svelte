<script lang="ts">
  import { BRAIDS_MODELS, BRAIDS_FAMILIES, type BraidsModel } from "../data/braids-models";
  import { audioEngine } from "../audio/AudioEngine";
  import { audioReadyStore } from "../state/stores";
  import type { BraidsEngine } from "../audio/engines/BraidsEngine";

  let ready = $state(false);
  let modelIndex = $state(0);
  let query = $state("");
  audioReadyStore.subscribe((v) => { ready = v; });

  const LAST = BRAIDS_MODELS.length - 1;

  function setModel(idx: number) {
    modelIndex = Math.max(0, Math.min(LAST, idx));
    const eng = audioEngine.currentEngine as BraidsEngine | null;
    if (eng && "setShape" in eng) eng.setShape(modelIndex);
  }

  $effect(() => {
    if (ready) setModel(modelIndex);
  });

  let current = $derived(BRAIDS_MODELS[modelIndex]);
  let currentFamily = $derived(BRAIDS_FAMILIES.find((f) => f.id === current.family)?.label ?? "");

  // Family-grouped, filtered list. Search matches code, name, family or blurb.
  let grouped = $derived.by(() => {
    const q = query.trim().toLowerCase();
    const hit = (m: BraidsModel) =>
      !q ||
      m.code.toLowerCase().includes(q) ||
      m.name.toLowerCase().includes(q) ||
      m.family.toLowerCase().includes(q) ||
      m.description.toLowerCase().includes(q);
    return BRAIDS_FAMILIES
      .map((f) => ({ id: f.id, label: f.label, models: BRAIDS_MODELS.filter((m) => m.family === f.id && hit(m)) }))
      .filter((g) => g.models.length > 0);
  });

  function pick(idx: number) {
    setModel(idx);
    query = "";
    // Hand the keyboard back to note-playing (a focused control swallows keys).
    (document.activeElement as HTMLElement | null)?.blur();
  }
</script>

<div class="picker">
  <div class="header">
    <div class="code-pill">
      <span class="code">{current.code}</span>
      <span class="idx">{String(modelIndex).padStart(2, "0")} / {String(LAST).padStart(2, "0")}</span>
    </div>
    <div class="steppers">
      <button class="step" aria-label="Previous model"
        onclick={() => setModel(modelIndex - 1)} disabled={!ready || modelIndex === 0}>◀</button>
      <button class="step" aria-label="Next model"
        onclick={() => setModel(modelIndex + 1)} disabled={!ready || modelIndex === LAST}>▶</button>
    </div>
  </div>

  <div class="name">{current.name}</div>
  <div class="family-tag">{currentFamily}</div>
  <div class="desc">{current.description}</div>

  <input
    class="search"
    type="search"
    placeholder="Search models — try “bell”, “fm”, “noise”…"
    bind:value={query}
    disabled={!ready}
    aria-label="Search synthesis models"
  />

  <div class="list">
    {#each grouped as group (group.id)}
      <div class="family">
        <div class="family-label">{group.label}</div>
        {#each group.models as m (m.index)}
          <button
            class="item"
            class:selected={m.index === modelIndex}
            aria-current={m.index === modelIndex ? "true" : undefined}
            onclick={() => pick(m.index)}
            disabled={!ready}
          >
            <span class="item-code">{m.code}</span>
            <span class="item-name">{m.name}</span>
          </button>
        {/each}
      </div>
    {/each}
    {#if grouped.length === 0}
      <div class="empty">No models match “{query}”.</div>
    {/if}
  </div>
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
  .family-tag {
    font-family: var(--font-mono);
    font-size: 0.62rem;
    text-transform: uppercase;
    letter-spacing: 0.08em;
    color: var(--text-dim);
  }
  .desc {
    font-family: var(--font-sans);
    font-size: 0.78rem;
    color: var(--text-muted);
    line-height: 1.4;
  }

  .search {
    width: 100%;
    padding: 7px 10px;
    background: var(--surface-sunken);
    border: var(--hairline-w) solid var(--hairline);
    border-radius: var(--radius-md);
    color: var(--text);
    font-family: var(--font-mono);
    font-size: 0.78rem;
  }
  .search:focus-visible {
    outline: none;
    border-color: var(--signal);
  }
  .search:disabled { opacity: 0.4; }

  .list {
    max-height: 220px;
    overflow-y: auto;
    border: var(--hairline-w) solid var(--hairline-soft);
    border-radius: var(--radius-md);
    background: var(--surface-sunken);
  }
  .family + .family { border-top: var(--hairline-w) solid var(--hairline-soft); }
  .family-label {
    position: sticky;
    top: 0;
    padding: 4px 10px;
    background: var(--surface);
    font-family: var(--font-mono);
    font-size: 0.6rem;
    text-transform: uppercase;
    letter-spacing: 0.1em;
    color: var(--text-dim);
  }
  .item {
    display: flex;
    align-items: baseline;
    gap: 10px;
    width: 100%;
    padding: 5px 10px;
    text-align: left;
    color: var(--text-muted);
    transition: background var(--t-fast), color var(--t-fast);
  }
  .item:hover:not(:disabled) { background: var(--surface-raised); color: var(--text); }
  /* Selected row: filled bar + bold code + a leading marker — not colour alone. */
  .item.selected {
    background: var(--signal-deep);
    color: var(--text);
  }
  .item.selected .item-code {
    color: var(--signal);
    font-weight: 600;
  }
  .item.selected .item-code::before {
    content: "▸ ";
  }
  .item:disabled { opacity: 0.4; cursor: not-allowed; }
  .item-code {
    font-family: var(--font-mono);
    font-size: 0.74rem;
    min-width: 3.4em;
  }
  .item-name {
    font-family: var(--font-sans);
    font-size: 0.74rem;
  }
  .empty {
    padding: 10px;
    font-family: var(--font-mono);
    font-size: 0.72rem;
    color: var(--text-dim);
  }
</style>
