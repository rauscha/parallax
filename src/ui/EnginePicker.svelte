<script lang="ts">
  /**
   * Engine picker — choose which synth engine is live (Braids, Plaits, …).
   * Sits above the model picker: an engine has many models, so engine is the
   * coarser choice. Swapping hot-reloads the engine's WASM/worklet and re-seeds
   * the patch with that engine's defaults; the melody + transport keep playing.
   */
  import { onDestroy } from "svelte";
  import { ENGINES } from "../audio/registry";
  import { startEngine } from "../state/engine-control";
  import { audioReadyStore, engineIdStore } from "../state/stores";

  let ready = $state(false);
  let engineId = $state<string>(engineIdStore.get());
  let swapping = $state<string | null>(null);   // id being swapped to, or null
  let error = $state<string | null>(null);
  const unsubs: Array<() => void> = [];
  unsubs.push(audioReadyStore.subscribe((v) => { ready = v; }));
  unsubs.push(engineIdStore.subscribe((v) => { engineId = v; }));
  onDestroy(() => unsubs.forEach((u) => u()));

  async function choose(id: string) {
    if (!ready || swapping || id === engineId) return;
    swapping = id;
    error = null;
    try {
      await startEngine(id);
    } catch (e) {
      error = e instanceof Error ? e.message : String(e);
    } finally {
      swapping = null;
    }
  }
</script>

<div class="engine-picker" role="group" aria-label="Synth engine">
  <span class="label">Engine</span>
  <div class="options">
    {#each ENGINES as e (e.id)}
      <button
        class="opt"
        class:selected={e.id === engineId}
        class:loading={swapping === e.id}
        aria-current={e.id === engineId ? "true" : undefined}
        onclick={() => choose(e.id)}
        disabled={!ready || swapping !== null}
      >{swapping === e.id ? "Loading…" : e.name}</button>
    {/each}
  </div>
  {#if error}<span class="err" role="alert">{error}</span>{/if}
</div>

<style>
  .engine-picker {
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
  .options {
    display: flex;
    gap: 4px;
    padding: 3px;
    background: var(--surface-sunken);
    border: var(--hairline-w) solid var(--hairline);
    border-radius: var(--radius-md);
  }
  .opt {
    padding: 5px 12px;
    background: transparent;
    border: var(--hairline-w) solid transparent;
    border-radius: var(--radius-sm);
    color: var(--text-muted);
    font-family: var(--font-mono);
    font-size: 0.72rem;
    letter-spacing: 0.03em;
    transition: background var(--t-fast), color var(--t-fast), border-color var(--t-fast);
  }
  .opt:hover:not(:disabled):not(.selected) {
    color: var(--text);
    background: var(--surface-raised);
  }
  .opt.selected {
    background: var(--signal-deep);
    border-color: var(--signal);
    color: var(--signal-ink);
    font-weight: 600;
  }
  .opt.loading { color: var(--text-dim); cursor: progress; }
  .opt:disabled:not(.selected):not(.loading) { opacity: 0.4; cursor: not-allowed; }
  .err {
    font-family: var(--font-mono);
    font-size: 0.7rem;
    color: var(--danger);
  }

  /* Touch sizing — keep the pills tappable. */
  @media (pointer: coarse) {
    .opt { padding: 10px 14px; min-height: 44px; }
  }
</style>
