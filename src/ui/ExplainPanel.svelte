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
  import type { EngineModel } from "../audio/types";
  import { engineEntryOrDefault } from "../audio/registry";
  import { activeParamStore, patchStore, engineIdStore, audioReadyStore } from "../state/stores";
  import { sweepingParamStore, startSweep, stopSweep } from "../state/show-me";

  const unsubs: Array<() => void> = [];
  let engineId = $state<string>(engineIdStore.get());
  let modelId  = $state<string | null>(patchStore.get().modelId);
  let params   = $state<Record<string, number>>(patchStore.get().params);
  unsubs.push(engineIdStore.subscribe((v) => { engineId = v; }));
  unsubs.push(patchStore.subscribe((p) => { modelId = p.modelId; params = p.params; }));

  // "Show me" sweep state: which knob is being demonstrated, and whether audio
  // is up (the button is dead until the engine can make sound).
  let ready = $state(audioReadyStore.get());
  unsubs.push(audioReadyStore.subscribe((v) => { ready = v; }));
  let sweepingId = $state<string | null>(sweepingParamStore.get());
  const unsubSweep = sweepingParamStore.subscribe((v) => { sweepingId = v; });

  // Models/families come from the registry for the *active* engine, so this
  // panel adapts to Braids or Plaits (or anything future) without code changes.
  let entry = $derived(engineEntryOrDefault(engineId));

  // patchStore.modelId is the source of truth (a lowercase code like "csaw").
  let model = $derived.by((): EngineModel | null => {
    const models = entry.models;
    if (models.length === 0) return null;
    if (!modelId) return models[0];
    const i = models.findIndex((m) => m.code.toLowerCase() === modelId!.toLowerCase());
    return models[i >= 0 ? i : 0];
  });
  let familyLabel = $derived(
    model ? (entry.families.find((f) => f.id === model.family)?.label ?? "") : ""
  );

  // Live macro value for a knob card, as a percent (macro knobs are 0..1 in both
  // engines). Falls back to 50% before the patch seeds.
  function pct(id: string): number { return Math.round((params[id] ?? 0.5) * 100); }

  // Knob ↔ card highlight: mirror the shared "engaged param" store so the card
  // lights when its knob is touched, and hovering the card lights the knob.
  // Pointer events only (cards aren't focusable controls) — on touch the knob's
  // drag still drives the card direction, which is the case that matters there.
  let activeId = $state<string | null>(activeParamStore.get());
  const unsub = activeParamStore.subscribe((v) => { activeId = v; });
  onDestroy(() => { unsub(); unsubSweep(); unsubs.forEach((u) => u()); stopSweep(); });

  function lift(id: string) { activeParamStore.set(id); }
  function drop(id: string) {
    // Don't drop the highlight out from under an in-progress sweep — it keeps
    // the swept knob + card lit even if the pointer wanders off the card.
    if (sweepingId === id) return;
    if (activeParamStore.get() === id) activeParamStore.set(null);
  }
</script>

<div class="explain-panel">
  {#if model}
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
      <!-- One card per macro knob (Braids: Timbre/Color; Plaits: Harmonics/
           Timbre/Morph). Pointer-only highlight cue: hovering the card lights
           its knob. It's a progressive enhancement, not a control — the knob is
           the real (keyboard-accessible) input — so no ARIA role is warranted. -->
      {#each model.knobs as knob (knob.id)}
        <!-- svelte-ignore a11y_no_static_element_interactions -->
        <div
          class="card"
          class:active={activeId === knob.id}
          onpointerenter={() => lift(knob.id)}
          onpointerleave={() => drop(knob.id)}
        >
          <div class="card-top">
            <span class="knob">{knob.label}</span>
            <span class="val">{pct(knob.id)}%</span>
          </div>
          <p class="card-text">{knob.text}</p>
          <div class="card-actions">
            <button
              class="show-me"
              class:sweeping={sweepingId === knob.id}
              disabled={!ready}
              onclick={() => startSweep(knob.id)}
              title={`Hear what ${knob.label} does on this model — sweeps the knob across its range`}
            >{sweepingId === knob.id ? "■ Stop" : "▸ Show me"}</button>
          </div>
        </div>
      {/each}
    </div>
  {/if}
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
    color: var(--signal-ink);
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
    color: var(--signal-ink);
    font-variant-numeric: tabular-nums;
  }
  .card-text {
    margin: 0;
    font-size: 0.72rem;
    line-height: 1.45;
    color: var(--text-dim);
  }

  .card-actions {
    display: flex;
    justify-content: flex-end;
    margin-top: 6px;
  }
  /* "Show me" — demonstrates the knob by sweeping it live. Quiet by default so
     it doesn't compete with the text; lights up to the signal colour while it's
     running (and the label flips to ■ Stop, so the state reads without hue). */
  .show-me {
    font-family: var(--font-mono);
    font-size: 0.62rem;
    letter-spacing: 0.04em;
    padding: 3px 9px;
    color: var(--text-muted);
    background: var(--surface-raised);
    border: var(--hairline-w) solid var(--hairline);
    border-radius: var(--radius-sm);
    cursor: pointer;
    transition: color var(--t-fast), border-color var(--t-fast), background var(--t-fast);
  }
  .show-me:hover:not(:disabled) { color: var(--text); border-color: var(--signal); }
  .show-me:focus-visible { outline: 2px solid var(--signal); outline-offset: 1px; }
  .show-me.sweeping {
    color: var(--signal-ink);
    background: var(--signal-deep);
    border-color: var(--signal);
  }
  .show-me:disabled { opacity: 0.4; cursor: not-allowed; }
  @media (pointer: coarse) {
    .show-me { padding: 8px 14px; min-height: 36px; }
  }
</style>
