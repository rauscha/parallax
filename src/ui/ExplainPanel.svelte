<script lang="ts">
  /**
   * Explain panel — surfaces what the current Braids model actually is and what
   * its two macro knobs (TIMBRE, COLOR) do *for this model*. Per-model knob
   * meaning is the whole reason this app exists (see data/braids-models.ts), so
   * the text comes straight from that table; the % readouts mirror the live
   * patch so the words line up with what you're hearing.
   *
   * M4 groundwork: this is the data/text layer. The animated mini-diagrams and
   * the "show me" sweep are deferred to an interactive design pass; the knob ↔
   * card highlight (below) is the first interactive piece to land.
   */
  import { onDestroy } from "svelte";
  import { BRAIDS_MODELS, BRAIDS_FAMILIES, type BraidsModel } from "../data/braids-models";
  import { activeParamStore, patchStore } from "../state/stores";

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

  // Knob ↔ card highlight: mirror the shared "engaged param" store so the card
  // lights when its knob is touched, and hovering the card lights the knob.
  // Pointer events only (cards aren't focusable controls) — on touch the knob's
  // drag still drives the card direction, which is the case that matters there.
  let activeId = $state<string | null>(activeParamStore.get());
  const unsub = activeParamStore.subscribe((v) => { activeId = v; });
  onDestroy(unsub);

  function lift(id: string) { activeParamStore.set(id); }
  function drop(id: string) { if (activeParamStore.get() === id) activeParamStore.set(null); }
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
    <div class="detail">
      <p class="detail-line">
        <span class="detail-label">Listen for</span>{model.detail.listenFor}
      </p>
      <p class="detail-line">
        <span class="detail-label">Good for</span>{model.detail.goodFor}
      </p>
    </div>
  {/if}

  <div class="cards">
    <!-- Pointer-only highlight cue: hovering the card lights its knob. It's a
         progressive enhancement, not a control — the knob is the real (keyboard-
         accessible) input — so no ARIA role is warranted. -->
    <!-- svelte-ignore a11y_no_static_element_interactions -->
    <div
      class="card"
      class:active={activeId === "timbre"}
      onpointerenter={() => lift("timbre")}
      onpointerleave={() => drop("timbre")}
    >
      <div class="card-top">
        <span class="knob">Timbre</span>
        <span class="val">{timbrePct}%</span>
      </div>
      <p class="card-text">{model.timbre}</p>
    </div>

    <!-- svelte-ignore a11y_no_static_element_interactions -->
    <div
      class="card"
      class:active={activeId === "color"}
      onpointerenter={() => lift("color")}
      onpointerleave={() => drop("color")}
    >
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

  /* Deeper explanation — split into "Listen for" / "Good for" lines. Set off
     from the one-line description with a left rule so it reads as "the longer
     story." */
  .detail {
    display: flex;
    flex-direction: column;
    gap: 5px;
    padding-left: 9px;
    border-left: 2px solid var(--hairline);
  }
  .detail-line {
    margin: 0;
    font-size: 0.72rem;
    line-height: 1.55;
    color: var(--text-dim);
  }
  .detail-label {
    display: inline-block;
    margin-right: 6px;
    font-size: 0.6rem;
    letter-spacing: 0.08em;
    text-transform: var(--label-case);
    font-weight: 600;
    color: var(--text);
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
    transition: background 120ms ease, border-color 120ms ease;
  }
  /* Lit when its knob is engaged (or the card itself is hovered). --signal-deep
     is the same wash used for selected rows, so the cue reads as "this is the
     active control" without shouting. */
  .card.active {
    background: var(--signal-deep);
    border-color: var(--signal);
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
