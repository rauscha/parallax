<script lang="ts">
  /**
   * "Recent sounds" popover. A short, persistent trail of the instruments you've
   * landed on via the generative actions (Surprise rolls + Match applies). Click a
   * row to step back to that sound (engine, model, knobs, melody — and its theme if
   * the engine differs). Restoring is itself reversible: the sound you leave is
   * recorded first.
   *
   * Mirrors the PresetMenu popover idiom (same io-btn + focus-trapped panel). The
   * one distinguishing touch is the per-row source glyph (⚄ roll / ◎ match / ↩
   * restored) — meaning carried by glyph + text, never colour alone (house rule).
   * Subtracts vs PresetMenu: no Save row, no per-row delete — just a Clear history
   * link, because the trail is automatic, not a curated library.
   */
  import { onDestroy } from "svelte";
  import { trapFocus } from "./trapFocus";
  import { audioReadyStore } from "../state/stores";
  import { lineageStore, restoreSound, clearLineage } from "../state/lineage";
  import type { LineageEntry, LineageSource } from "../state/lineage-core";

  let ready = $state(audioReadyStore.get());
  const unsubReady = audioReadyStore.subscribe((v) => { ready = v; });

  let entries = $state<readonly LineageEntry[]>(lineageStore.get());
  const unsubEntries = lineageStore.subscribe((v) => { entries = v; });

  onDestroy(() => { unsubReady(); unsubEntries(); });

  let open = $state(false);
  let busy = $state(false);
  let error = $state<string | null>(null);
  let rootEl: HTMLElement;

  // Outside-click + Escape to close — same behaviour as the Preset/MIDI menus.
  $effect(() => {
    if (!open) return;
    const onPointer = (e: PointerEvent) => {
      if (rootEl && !rootEl.contains(e.target as Node)) open = false;
    };
    const onKey = (e: KeyboardEvent) => { if (e.key === "Escape") open = false; };
    document.addEventListener("pointerdown", onPointer);
    document.addEventListener("keydown", onKey);
    return () => {
      document.removeEventListener("pointerdown", onPointer);
      document.removeEventListener("keydown", onKey);
    };
  });

  const GLYPH: Record<LineageSource, string> = { surprise: "⚄", match: "◎", restore: "↩" };
  const SOURCE_WORD: Record<LineageSource, string> = {
    surprise: "a Surprise roll",
    match: "a Match",
    restore: "a restored sound",
  };

  async function onRestore(entry: LineageEntry) {
    busy = true;
    error = null;
    try {
      const ok = await restoreSound(entry);
      if (!ok) { error = "That sound couldn't be restored."; return; }
      open = false;
    } catch (e) {
      error = e instanceof Error ? e.message : String(e);
    } finally {
      busy = false;
    }
  }

  async function onClear() {
    busy = true;
    try {
      await clearLineage();
    } finally {
      busy = false;
    }
  }

  function ago(ts: number): string {
    if (!ts) return "";
    const s = Math.max(0, Math.floor((Date.now() - ts) / 1000));
    if (s < 60) return "just now";
    const m = Math.floor(s / 60);
    if (m < 60) return `${m}m ago`;
    const h = Math.floor(m / 60);
    if (h < 24) return `${h}h ago`;
    return `${Math.floor(h / 24)}d ago`;
  }

  function label(e: LineageEntry): string {
    return `${e.engineId}${e.modelId ? ` · ${e.modelId}` : ""}`;
  }
</script>

<div class="recent-menu" bind:this={rootEl}>
  <button
    class="io-btn"
    class:active={open}
    onclick={() => (open = !open)}
    disabled={!ready}
    aria-haspopup="true"
    aria-expanded={open}
    title="Step back to a recent sound (Surprise rolls + Match applies)"
  >↺ Recent</button>

  {#if open}
    <div class="panel" role="dialog" aria-label="Recent sounds" tabindex="-1" use:trapFocus>
      <p class="title">Recent sounds</p>

      {#if error}<p class="err" role="alert">{error}</p>{/if}

      {#if entries.length === 0}
        <p class="empty">No recent sounds yet — roll Surprise or Match a sound to start a trail.</p>
      {:else}
        <ul class="list">
          {#each entries as e (`${e.savedAt}:${e.wire}`)}
            <li class="item">
              <button
                class="restore"
                onclick={() => onRestore(e)}
                disabled={busy}
                aria-label={`Restore ${label(e)} from ${SOURCE_WORD[e.source]}, ${ago(e.savedAt)}`}
              >
                <span class="r-head">
                  <span class="glyph" aria-hidden="true">{GLYPH[e.source]}</span>
                  <span class="r-name">{label(e)}</span>
                </span>
                <span class="r-meta">{ago(e.savedAt)}</span>
              </button>
            </li>
          {/each}
        </ul>
        <button class="clear" onclick={onClear} disabled={busy}>Clear history</button>
      {/if}
    </div>
  {/if}
</div>

<style>
  .recent-menu { position: relative; display: inline-flex; }
  .io-btn {
    font-family: var(--font-mono);
    font-size: 0.7rem;
    letter-spacing: 0.04em;
    padding: 5px 12px;
    color: var(--text);
    background: var(--surface-raised);
    border: var(--hairline-w) solid var(--hairline);
    border-radius: var(--radius-sm);
    cursor: pointer;
    white-space: nowrap;
    transition: filter var(--t-fast), border-color var(--t-fast);
  }
  .io-btn:hover:not(:disabled) { filter: brightness(1.1); border-color: var(--signal); }
  .io-btn:focus-visible { outline: 2px solid var(--signal); outline-offset: 1px; }
  .io-btn:disabled { opacity: 0.4; cursor: not-allowed; }
  .io-btn.active { border-color: var(--signal); color: var(--signal-ink); }

  .panel {
    position: absolute;
    top: calc(100% + 6px);
    right: 0;
    z-index: 20;
    width: 280px;
    max-width: 86vw;
    padding: 10px;
    background: var(--surface);
    border: var(--hairline-w) solid var(--hairline);
    border-radius: var(--radius-md);
    box-shadow: 0 14px 40px rgba(0, 0, 0, 0.36);
    display: flex;
    flex-direction: column;
    gap: 8px;
  }
  .title {
    margin: 0;
    font-family: var(--font-mono);
    font-size: 0.7rem;
    letter-spacing: 0.04em;
    color: var(--text-dim);
  }
  .err { margin: 0; font-family: var(--font-mono); font-size: 0.68rem; color: var(--danger); }
  .empty { margin: 2px 0; font-family: var(--font-mono); font-size: 0.7rem; color: var(--text-dim); line-height: 1.4; }

  .list {
    list-style: none;
    margin: 0;
    padding: 0;
    display: flex;
    flex-direction: column;
    gap: 3px;
    max-height: 260px;
    overflow-y: auto;
  }
  .item { display: flex; }
  .restore {
    flex: 1 1 auto;
    min-width: 0;
    display: flex;
    flex-direction: column;
    gap: 2px;
    text-align: left;
    padding: 6px 8px;
    background: var(--surface-sunken);
    border: var(--hairline-w) solid var(--hairline);
    border-radius: var(--radius-sm);
    cursor: pointer;
    transition: border-color var(--t-fast), background var(--t-fast);
  }
  .restore:hover:not(:disabled) { border-color: var(--signal); background: var(--signal-deep); }
  .restore:disabled { opacity: 0.5; cursor: progress; }
  .r-head { display: flex; align-items: baseline; gap: 7px; min-width: 0; }
  .glyph { flex: 0 0 auto; font-size: 0.82rem; color: var(--text); }
  .r-name {
    font-family: var(--font-mono);
    font-size: 0.74rem;
    color: var(--text);
    white-space: nowrap;
    overflow: hidden;
    text-overflow: ellipsis;
  }
  .r-meta {
    font-family: var(--font-mono);
    font-size: 0.62rem;
    color: var(--text-dim);
    padding-left: 23px;   /* align under the name, past the glyph + gap */
  }
  .clear {
    align-self: center;
    margin-top: 2px;
    font-family: var(--font-mono);
    font-size: 0.66rem;
    letter-spacing: 0.03em;
    color: var(--text-dim);
    background: transparent;
    border: none;
    border-radius: var(--radius-sm);
    cursor: pointer;
    padding: 4px 8px;
    transition: color var(--t-fast);
  }
  .clear:hover:not(:disabled) { color: var(--accent); }
  .clear:disabled { opacity: 0.4; cursor: not-allowed; }

  @media (pointer: coarse) {
    .io-btn { padding: 8px 12px; min-height: 36px; }
    .restore { min-height: 40px; }
    .clear { min-height: 34px; }
  }
</style>
