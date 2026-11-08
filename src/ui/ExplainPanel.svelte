<script lang="ts">
  /**
   * Explain panel — what the current model's macro knobs do *for this model*,
   * plus its "listen for / good for" notes. The model's code, name, family and
   * one-line description live in the Controls column (ModelPicker), so they are
   * not repeated here; only a visually hidden heading names the model. Per-model knob
   * meaning is the whole reason this app exists (see data/braids-models.ts), so
   * the text comes straight from that table; the % readouts mirror the live
   * patch so the words line up with what you're hearing.
   *
   * Each card carries a ruler: a needle at the knob's live value, with the two
   * ends (and any spot the text pins down) named in the card's own words, so
   * "where it sits" reads as a place, not a percent. Cards follow the order of
   * the knobs in the Controls column, light up with their knob, and offer
   * "Show me" (state/show-me.ts), which turns the knob for you.
   */
  import { onDestroy } from "svelte";
  import type { EngineModel, EngineKnobMeaning, ParameterDescriptor } from "../audio/types";
  import { formatReadout } from "./readout";
  import { audioEngine } from "../audio/AudioEngine";
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

  // Cards follow the knobs: order them by the live engine's parameter schema
  // (the order the Controls column draws knobs in), falling back to the
  // corpus order before audio is up. Rings' corpus lists Damping before
  // Position, the knobs the other way round.
  let schemaOrder = $state<string[]>([]);
  let schema = $state<ParameterDescriptor[]>([]);
  $effect(() => {
    if (!ready) return;
    void engineId;   // re-read on engine swap
    // Knobs are drawn grouped (ParamPanel: groups in first-seen order), so
    // order by group first, then by position within the schema.
    const live = audioEngine.currentEngine?.getParameterSchema() ?? [];
    const groups: string[] = [];
    for (const d of live) if (!groups.includes(d.group)) groups.push(d.group);
    schemaOrder = groups.flatMap((g) => live.filter((d) => d.group === g).map((d) => d.id));
    schema = live;
  });

  // Knobs with no card of their own (FM, the envelope, Bits/Rate/Sign/Drift,
  // Gain…) still say what they are: their schema description shows in a slim
  // card while engaged, and every one is the knob's accessible description.
  let plainKnobs = $derived(
    schema.filter((d) => d.id !== "model" && d.description && !knobs.some((k) => k.id === d.id)),
  );
  let engagedPlain = $derived(plainKnobs.find((d) => d.id === activeId) ?? null);
  let knobs = $derived.by((): EngineKnobMeaning[] => {
    if (!model) return [];
    const rank = (id: string) => {
      const i = schemaOrder.indexOf(id);
      return i < 0 ? Number.MAX_SAFE_INTEGER : i;
    };
    return [...model.knobs].sort((a, b) => rank(a.id) - rank(b.id));
  });

  // The ruler's label nearest the needle is set heavier, so you can read which
  // end (or named spot) you're on without colour.
  type RulerLabel = { at: number; text: string; kind: "lo" | "hi" | "mark" };
  function rulerLabels(knob: EngineKnobMeaning): RulerLabel[] {
    const r = knob.range;
    if (!r) return [];
    const out: RulerLabel[] = [];
    if (r.lo) out.push({ at: 0, text: r.lo, kind: "lo" });
    for (const m of r.marks ?? []) out.push({ at: m.at, text: m.label, kind: "mark" });
    if (r.hi) out.push({ at: 1, text: r.hi, kind: "hi" });
    return out;
  }
  // Bold a word only when the needle is actually near it: at 50% a filter is
  // half open, not "dark, closed", so between labels nothing is bold.
  const NEAR = 0.2;
  function nearest(labels: RulerLabel[], v: number): RulerLabel | null {
    let best: RulerLabel | null = null;
    for (const l of labels) if (!best || Math.abs(l.at - v) < Math.abs(best.at - v)) best = l;
    return best && Math.abs(best.at - v) <= NEAR ? best : null;
  }

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
    <h3 class="sr-only">{model.name}</h3>


    <div class="cards">
      <!-- One card per macro knob (Braids: Timbre/Color; Plaits: Harmonics/
           Timbre/Morph). Pointer-only highlight cue: hovering the card lights
           its knob. It's a progressive enhancement, not a control — the knob is
           the real (keyboard-accessible) input — so no ARIA role is warranted. -->
      {#each knobs as knob (knob.id)}
        {@const v = pct(knob.id) / 100}
        {@const labels = rulerLabels(knob)}
        {@const near = nearest(labels, v)}
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
            <button
              class="show-me"
              class:sweeping={sweepingId === knob.id}
              aria-pressed={sweepingId === knob.id}
              disabled={!ready}
              onclick={() => startSweep(knob.id)}
              title={`Hear what ${knob.label} does on this model — sweeps the knob across its range`}
            >{sweepingId === knob.id ? "■ Stop" : "▸ Show me"}</button>
          </div>
          <div class="ruler" aria-hidden="true">
            {#each labels.filter((l) => l.kind === "mark") as m (m.text)}
              <span class="mark-label" class:near={near === m} style:left="{m.at * 100}%">{m.text}</span>
            {/each}
            <div class="track">
              <div class="fill" style:width="{v * 100}%"></div>
              {#each labels.filter((l) => l.kind === "mark") as m (m.text)}
                <span class="mark-tick" style:left="{m.at * 100}%"></span>
              {/each}
              <span class="needle" style:left="{v * 100}%"></span>
            </div>
            {#if labels.some((l) => l.kind !== "mark")}
              <div class="ends">
                <span class:near={near?.kind === "lo"}>{knob.range?.lo ?? ""}</span>
                <span class:near={near?.kind === "hi"}>{knob.range?.hi ?? ""}</span>
              </div>
            {/if}
          </div>
          <p class="card-text" id="explain-{knob.id}">{knob.text}</p>
        </div>
      {/each}
    </div>

    {#if engagedPlain}
      <div class="plain-card" aria-hidden="true">
        <span class="knob">{engagedPlain.label}</span>
        <span class="val">{formatReadout(engagedPlain, params[engagedPlain.id] ?? engagedPlain.default)}</span>
        <p class="plain-text">{engagedPlain.description}</p>
      </div>
    {/if}
    {#each plainKnobs as d (d.id)}
      <p class="sr-only" id="explain-{d.id}">{d.description}</p>
    {/each}

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
  {/if}
</div>

<style>
  .explain-panel {
    display: flex;
    flex-direction: column;
    gap: 8px;
    min-height: 0;
    overflow-y: auto;
    font-family: var(--font-mono);
  }

  /* "Listen for" / "Good for" — the model's longer story, set off by a rule. */
  .detail {
    max-width: 80ch;
    margin-top: 4px;
    display: flex;
    flex-direction: column;
    gap: 5px;
    padding-left: 9px;
    border-left: 2px solid var(--hairline);
  }
  .detail-line {
    margin: 0;
    font-size: var(--fs-prose);
    line-height: 1.55;
    letter-spacing: 0;      /* prose, not a label: the skin's label tracking stays off it */
    color: var(--text-muted);
  }
  .detail-label {
    display: inline-block;
    margin-right: 6px;
    font-size: var(--fs-label);
    letter-spacing: 0.08em;
    text-transform: var(--label-case);
    font-weight: 600;
    color: var(--text);
  }

  /* One card per macro knob, side by side like the knobs they explain. Stacked,
     a third card sat below the fold on a 900px-tall laptop, Show me included;
     in a row all of them fit, and the row collapses to one column on a phone. */
  .cards {
    display: grid;
    grid-template-columns: repeat(auto-fit, minmax(220px, 1fr));
    gap: 8px;
  }
  .card {
    display: flex;
    flex-direction: column;
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
    box-shadow: inset 0 0 0 1px var(--signal);   /* 2px edge: reads in grayscale on every skin */
  }
  /* A solid marker before the lit card's name: the cue that survives
     desaturation even where the wash and border are close in luminance
     (Sandbox's orange on cream). */
  .card.active .card-top .knob::before {
    content: "";
    display: inline-block;
    width: 7px;
    height: 7px;
    margin-right: 6px;
    background: var(--text);
    vertical-align: 0.05em;
  }
  /* Header: name, live value, then Show me. Show me sits with the value it
     will move rather than at the card foot, which cost Rings' four cards
     their last row at 1440×900. */
  .card-top {
    display: flex;
    align-items: center;
    gap: 8px;
    margin-bottom: 6px;
  }
  .card-top .val { margin-left: auto; }
  .knob {
    font-size: var(--fs-label);
    letter-spacing: 0.1em;
    text-transform: var(--label-case);
    color: var(--text);
    font-weight: 600;
  }
  .val {
    font-size: var(--fs-label);
    color: var(--signal-ink);
    font-variant-numeric: tabular-nums;
  }
  .card-text {
    margin: 0;
    font-size: var(--fs-prose);
    line-height: 1.45;
    letter-spacing: 0;
    text-wrap: pretty;      /* no one-word last lines */
    color: var(--text);     /* the knob's meaning is the point of the card: full-strength text */
  }

  /* Slim card for a knob without its own card (FM, envelope, lo-fi, gain):
     name, value and its one-line description, while it's engaged. */
  .plain-card {
    display: flex;
    flex-wrap: wrap;
    align-items: baseline;
    column-gap: 10px;
    row-gap: 2px;
    padding: 6px 10px;
    background: var(--signal-deep);
    border: var(--hairline-w) solid var(--signal);
    box-shadow: inset 0 0 0 1px var(--signal);
    border-radius: var(--radius-sm);
  }
  .plain-text {
    flex-basis: 100%;
    margin: 0;
    font-size: var(--fs-prose);
    line-height: 1.45;
    letter-spacing: 0;
    color: var(--text);
  }

  /* Ruler: where the knob sits, as a place. A filled run up to a solid needle
     (position, not hue, carries the value), tick marks for the spots the text
     names, and the end words underneath; the word nearest the needle is set
     heavier. Decorative for assistive tech: the knob itself is the slider. */
  .ruler {
    position: relative;
    margin: 2px 0 8px;
  }
  .ruler:has(.mark-label) { padding-top: calc(var(--fs-label) * 1.5); }
  .track {
    position: relative;
    height: 4px;
    background: var(--knob-track);
    border-radius: var(--radius-sm);
  }
  .fill {
    position: absolute;
    inset: 0 auto 0 0;
    background: var(--knob-fill);
    border-radius: var(--radius-sm);
  }
  .needle {
    position: absolute;
    top: -4px;
    width: 3px;
    height: 12px;
    margin-left: -1.5px;
    background: var(--knob-pointer);
    border-radius: var(--radius-sm);
    box-shadow: 0 0 0 1px var(--surface-sunken);
  }
  .mark-tick {
    position: absolute;
    top: -3px;
    width: 1px;
    height: 10px;
    background: var(--knob-tick);
  }
  .mark-label {
    position: absolute;
    top: 0;
    transform: translateX(-50%);
    white-space: nowrap;
  }
  .ends {
    display: flex;
    justify-content: space-between;
    gap: 8px;
    margin-top: 5px;
  }
  .mark-label, .ends span {
    font-size: var(--fs-label);
    letter-spacing: 0;
    color: var(--text-muted);
    font-weight: 400;
  }
  .mark-label.near, .ends span.near {
    color: var(--text);
    font-weight: 700;
  }

  /* "Show me" — demonstrates the knob by sweeping it live. Quiet by default so
     it doesn't compete with the text; lights up to the signal colour while it's
     running (and the label flips to ■ Stop, so the state reads without hue). */
  .show-me {
    font-family: var(--font-mono);
    font-size: var(--fs-label);
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
