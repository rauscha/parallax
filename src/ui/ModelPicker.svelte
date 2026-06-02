<script lang="ts">
  import { tick, onDestroy } from "svelte";
  import { BRAIDS_MODELS, BRAIDS_FAMILIES, type BraidsModel } from "../data/braids-models";
  import { audioReadyStore, patchStore } from "../state/stores";

  let ready = $state(false);
  let query = $state("");
  // Keyboard cursor through the filtered list (null = no cursor yet).
  let highlightIdx = $state<number | null>(null);
  // One-shot animation flag — re-added on every model change so the pill pulses.
  let pulsing = $state(false);
  let pulseTimer = 0;
  let pickerEl: HTMLDivElement | undefined = $state();
  let listEl: HTMLDivElement | undefined = $state();
  audioReadyStore.subscribe((v) => { ready = v; });

  // patchStore is the source of truth — modelIndex is derived from modelId.
  // Writes flow store → bindings → engine; the picker never touches the engine.
  let modelId = $state<string | null>(patchStore.get().modelId);
  patchStore.subscribe((p) => { modelId = p.modelId; });

  const LAST = BRAIDS_MODELS.length - 1;

  let modelIndex = $derived.by(() => {
    if (!modelId) return 0;
    const i = BRAIDS_MODELS.findIndex((m) => m.code.toLowerCase() === modelId!.toLowerCase());
    return i >= 0 ? i : 0;
  });

  function pulse() {
    pulsing = false;
    // Force a reflow gap before re-adding the class so the animation restarts.
    requestAnimationFrame(() => {
      pulsing = true;
      clearTimeout(pulseTimer);
      pulseTimer = window.setTimeout(() => { pulsing = false; }, 340);
    });
  }

  function setModel(idx: number) {
    const next = Math.max(0, Math.min(LAST, idx));
    patchStore.setKey("modelId", BRAIDS_MODELS[next].code.toLowerCase());
  }

  // Pulse on every model change — including external ones (share-URL loads,
  // presets later). Skip the initial run so mount doesn't flash.
  let pulseSeeded = false;
  $effect(() => {
    void modelIndex;
    if (!pulseSeeded) { pulseSeeded = true; return; }
    pulse();
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

  // Flat, ordered list of currently-visible models — drives keyboard navigation
  // through the filter without having to walk the grouped structure.
  let flatVisible = $derived(grouped.flatMap((g) => g.models));

  // Reset the cursor when the filter changes so it never points past the end.
  $effect(() => {
    void query;
    highlightIdx = null;
  });

  function pick(idx: number) {
    setModel(idx);
    query = "";
    highlightIdx = null;
    // Hand the keyboard back to note-playing (a focused control swallows keys).
    (document.activeElement as HTMLElement | null)?.blur();
  }

  async function moveHighlight(delta: number) {
    if (flatVisible.length === 0) return;
    if (highlightIdx === null) {
      // First arrow press: start from the current selection if it's still visible,
      // otherwise from the top — feels like the cursor "remembers" where we are.
      const currentInList = flatVisible.findIndex((m) => m.index === modelIndex);
      highlightIdx = currentInList >= 0 ? currentInList : 0;
    } else {
      highlightIdx = Math.max(0, Math.min(flatVisible.length - 1, highlightIdx + delta));
    }
    await tick();
    listEl?.querySelector(".item.highlight")?.scrollIntoView({ block: "nearest" });
  }

  function onKey(e: KeyboardEvent) {
    if (!ready) return;
    // Only act when focus is on the search input or a list item — the steppers
    // (and any future control inside .picker) get their native button behaviour
    // for Enter so they aren't hijacked.
    const t = e.target as HTMLElement | null;
    const onSearch = t?.tagName === "INPUT";
    const onItem = t?.classList?.contains("item") ?? false;
    if (!onSearch && !onItem) return;

    switch (e.key) {
      case "ArrowDown":
        e.preventDefault(); e.stopPropagation();
        moveHighlight(1);
        return;
      case "ArrowUp":
        e.preventDefault(); e.stopPropagation();
        moveHighlight(-1);
        return;
      case "Enter":
        // A focused list item handles Enter via its own onclick — let it fire
        // so the *focused* item is picked, not the highlight cursor.
        if (onItem) return;
        e.preventDefault(); e.stopPropagation();
        if (highlightIdx !== null && flatVisible[highlightIdx]) {
          pick(flatVisible[highlightIdx].index);
        } else if (query.trim() && flatVisible.length > 0) {
          // Typed-then-Enter without arrows: pick the first match (matches the
          // hint text's "type a vibe, hit Enter" mental model). Skip when the
          // query is empty so an accidental Enter doesn't clobber the selection.
          pick(flatVisible[0].index);
        }
        return;
      case "Escape":
        e.preventDefault(); e.stopPropagation();
        query = "";
        highlightIdx = null;
        (document.activeElement as HTMLElement | null)?.blur();
        return;
    }
  }

  onDestroy(() => clearTimeout(pulseTimer));
</script>

<!-- svelte-ignore a11y_no_noninteractive_element_interactions -->
<!-- The keydown handler intentionally lives on the group: it routes Arrow/Enter/Escape
     for whichever inner control (search input, list button) currently has focus. -->
<div class="picker" bind:this={pickerEl} onkeydown={onKey} role="group" aria-label="Synthesis model picker">
  <div class="header">
    <div class="code-pill" class:pulse={pulsing}>
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

  <div class="list" bind:this={listEl}>
    {#each grouped as group (group.id)}
      <div class="family">
        <div class="family-label">{group.label}</div>
        {#each group.models as m (m.index)}
          {@const flatI = flatVisible.findIndex((fm) => fm.index === m.index)}
          <button
            class="item"
            class:selected={m.index === modelIndex}
            class:highlight={flatI === highlightIdx}
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
    transform-origin: center;
  }
  /* Small tactile pulse whenever the model changes. The whole point of Braids
     is cycling through models, so the act of changing one earns a beat. */
  .code-pill.pulse {
    animation: pop 320ms cubic-bezier(0.34, 1.56, 0.64, 1);
  }
  @keyframes pop {
    0%   { transform: scale(1); }
    45%  { transform: scale(1.08); }
    100% { transform: scale(1); }
  }
  @media (prefers-reduced-motion: reduce) {
    .code-pill.pulse { animation: none; }
  }
  .code {
    font-family: var(--font-mono);
    font-size: 1.1rem;
    font-weight: 600;
    color: var(--signal-ink);
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
    max-height: 160px;
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
  /* Keyboard cursor — outline-style highlight that doesn't conflict with selection. */
  .item.highlight {
    background: var(--surface-raised);
    color: var(--text);
    box-shadow: inset 0 0 0 var(--hairline-w) var(--signal-dim);
  }
  /* Selected row: fill + bold code + leading marker + redundant left-edge accent
     so it survives even if the fill wash ever falls through (defence in depth). */
  .item.selected {
    background: var(--signal-deep);
    color: var(--text);
    box-shadow: inset 3px 0 0 var(--signal);
  }
  .item.selected.highlight {
    /* Combine both accents cleanly. */
    box-shadow: inset 3px 0 0 var(--signal), inset 0 0 0 var(--hairline-w) var(--signal-dim);
  }
  .item.selected .item-code {
    color: var(--signal-ink);
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

  /* Touch-device sizing: bump targets to ≥44px (WCAG minimum reliable tap).
     Desktop stays compact — pointer:coarse only fires for finger-class inputs. */
  @media (pointer: coarse) {
    .step {
      width: 44px;
      height: 44px;
      font-size: 1rem;
    }
    .item {
      padding: 12px 12px;
      min-height: 44px;
    }
    .search {
      padding: 12px 12px;
      font-size: 0.85rem;
      min-height: 44px;
    }
    .list { max-height: 240px; }
  }
</style>
