<script lang="ts">
  /**
   * Explain panel — surfaces what the current Braids model actually is and what
   * its two macro knobs (TIMBRE, COLOR) do *for this model*. Per-model knob
   * meaning is the whole reason this app exists (see data/braids-models.ts), so
   * the text comes straight from that table; the % readouts mirror the live
   * patch so the words line up with what you're hearing.
   *
   * M4 groundwork: this is the data/text layer. The animated mini-diagrams, the
   * knob↔card highlight, and the "show me" sweep are deliberately deferred to an
   * interactive design pass.
   */
  import { BRAIDS_MODELS, BRAIDS_FAMILIES, type BraidsModel } from "../data/braids-models";
  import { patchStore } from "../state/stores";

  let modelId = $state<string | null>(patchStore.get().modelId);
  let params  = $state<Record<string, number>>(patchStore.get().params);
  patchStore.subscribe((p) => { modelId = p.modelId; params = p.params; });

  // patchStore.modelId is the source of truth (a lowercase code like "csaw").
  let model = $derived.by((): BraidsModel => {
    if (!modelId) return BRAIDS_MODELS[0];
    const i = BRAIDS_MODELS.findIndex((m) => m.code.toLowerCase() === modelId!.toLowerCase());
    return BRAIDS_MODELS[i >= 0 ? i : 0];
  });
  let familyLabel = $derived(BRAIDS_FAMILIES.find((f) => f.id === model.family)?.label ?? "");

  // Live macro values (fall back to the schema defaults before the patch seeds).
  let timbrePct = $derived(Math.round((params.timbre ?? 0.5) * 100));
  let colorPct  = $derived(Math.round((params.color  ?? 0.5) * 100));
</script>

<div class="explain-panel">
  <div class="head">
    <span class="code">{model.code}</span>
    <div class="titles">
      <span class="name">{model.name}</span>
      <span class="family">{familyLabel}</span>
    </div>
  </div>

  <p class="desc">{model.description}</p>

  {#if model.detail}
    <p class="detail">{model.detail}</p>
  {/if}

  <div class="cards">
    <div class="card">
      <div class="card-top">
        <span class="knob">Timbre</span>
        <span class="val">{timbrePct}%</span>
      </div>
      <p class="card-text">{model.timbre}</p>
    </div>

    <div class="card">
      <div class="card-top">
        <span class="knob">Color</span>
        <span class="val">{colorPct}%</span>
      </div>
      <p class="card-text">{model.color}</p>
    </div>
  </div>
</div>

<style>
  .explain-panel {
    display: flex;
    flex-direction: column;
    gap: 10px;
    min-height: 0;
    overflow-y: auto;
    font-family: var(--font-mono);
  }

  .head {
    display: flex;
    align-items: center;
    gap: 10px;
  }
  .code {
    flex: 0 0 auto;
    font-size: 1.05rem;
    font-weight: 600;
    letter-spacing: 0.06em;
    color: var(--signal);
    padding: 3px 8px;
    background: var(--surface-sunken);
    border: var(--hairline-w) solid var(--hairline);
    border-radius: var(--radius-sm);
  }
  .titles {
    display: flex;
    flex-direction: column;
    gap: 1px;
    min-width: 0;
  }
  .name {
    font-size: 0.82rem;
    color: var(--text);
    line-height: 1.2;
  }
  .family {
    font-size: 0.6rem;
    letter-spacing: 0.08em;
    text-transform: var(--label-case);
    color: var(--text-dim);
  }

  .desc {
    margin: 0;
    font-size: 0.74rem;
    line-height: 1.5;
    color: var(--text-dim);
  }

  /* Deeper explanation — only present for the complex models. Set off from the
     one-line description with a left rule so it reads as "the longer story." */
  .detail {
    margin: 0;
    padding-left: 9px;
    border-left: 2px solid var(--hairline);
    font-size: 0.72rem;
    line-height: 1.55;
    color: var(--text-dim);
  }

  .cards {
    display: flex;
    flex-direction: column;
    gap: 8px;
  }
  .card {
    background: var(--surface-sunken);
    border: var(--hairline-w) solid var(--hairline);
    border-radius: var(--radius-sm);
    padding: 8px 10px;
  }
  .card-top {
    display: flex;
    align-items: baseline;
    justify-content: space-between;
    margin-bottom: 4px;
  }
  .knob {
    font-size: 0.62rem;
    letter-spacing: 0.1em;
    text-transform: var(--label-case);
    color: var(--text);
    font-weight: 600;
  }
  .val {
    font-size: 0.66rem;
    color: var(--signal);
    font-variant-numeric: tabular-nums;
  }
  .card-text {
    margin: 0;
    font-size: 0.72rem;
    line-height: 1.45;
    color: var(--text-dim);
  }
</style>
