<script lang="ts">
  /**
   * Preset library popover (M5 increment B). Save the current sound + melody
   * under a name, then load or delete saved ones. Everything is local
   * (IndexedDB) — nothing leaves the browser. Loading hot-swaps the engine if
   * the preset needs a different one (via loadState).
   */
  import { audioReadyStore } from "../state/stores";
  import {
    savePreset,
    listPresets,
    loadPreset,
    deletePreset,
    presetExists,
    type PresetSummary,
  } from "../state/persistence";
  import { loadState } from "../state/engine-control";

  let ready = $state(audioReadyStore.get());
  audioReadyStore.subscribe((v) => { ready = v; });

  let open = $state(false);
  let presets = $state<PresetSummary[]>([]);
  let name = $state("");
  let busy = $state(false);
  let error = $state<string | null>(null);
  let rootEl: HTMLElement;

  async function refresh() {
    try {
      presets = await listPresets();
    } catch (e) {
      error = e instanceof Error ? e.message : String(e);
    }
  }

  // Load the list when the menu opens; wire outside-click + Escape to close.
  $effect(() => {
    if (!open) return;
    refresh();
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

  async function onSave() {
    const trimmed = name.trim();
    if (!trimmed) { error = "Name required"; return; }
    error = null;
    busy = true;
    try {
      if (await presetExists(trimmed) && !confirm(`Overwrite preset "${trimmed}"?`)) return;
      await savePreset(trimmed);
      name = "";
      await refresh();
    } catch (e) {
      error = e instanceof Error ? e.message : String(e);
    } finally {
      busy = false;
    }
  }

  async function onLoad(n: string) {
    busy = true;
    error = null;
    try {
      const state = await loadPreset(n);
      if (!state) { error = `"${n}" couldn't be read`; return; }
      await loadState(state);
      open = false;
    } catch (e) {
      error = e instanceof Error ? e.message : String(e);
    } finally {
      busy = false;
    }
  }

  async function onDelete(n: string) {
    if (!confirm(`Delete preset "${n}"?`)) return;
    busy = true;
    try {
      await deletePreset(n);
      await refresh();
    } catch (e) {
      error = e instanceof Error ? e.message : String(e);
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
</script>

<div class="preset-menu" bind:this={rootEl}>
  <button
    class="io-btn"
    class:active={open}
    onclick={() => (open = !open)}
    disabled={!ready}
    aria-haspopup="true"
    aria-expanded={open}
    title="Save and load patches (stored on this device)"
  >▤ Presets</button>

  {#if open}
    <div class="panel" role="dialog" aria-label="Preset library">
      <form class="save-row" onsubmit={(e) => { e.preventDefault(); onSave(); }}>
        <input
          class="name-input"
          type="text"
          placeholder="Name this patch…"
          bind:value={name}
          maxlength="40"
          aria-label="Preset name"
        />
        <button class="save-btn" type="submit" disabled={busy || !name.trim()}>Save</button>
      </form>

      {#if error}<p class="err" role="alert">{error}</p>{/if}

      {#if presets.length === 0}
        <p class="empty">No saved presets yet.</p>
      {:else}
        <ul class="list">
          {#each presets as p (p.name)}
            <li class="item">
              <button class="load" onclick={() => onLoad(p.name)} disabled={busy} title="Load this preset">
                <span class="p-name">{p.name}</span>
                <span class="p-meta">{p.engineId}{p.modelId ? ` · ${p.modelId}` : ""} · {ago(p.savedAt)}</span>
              </button>
              <button class="del" onclick={() => onDelete(p.name)} disabled={busy} title="Delete" aria-label={`Delete ${p.name}`}>×</button>
            </li>
          {/each}
        </ul>
      {/if}
    </div>
  {/if}
</div>

<style>
  .preset-menu { position: relative; display: inline-flex; }
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
  .save-row { display: flex; gap: 6px; }
  .name-input {
    flex: 1 1 auto;
    min-width: 0;
    font-family: var(--font-mono);
    font-size: 0.74rem;
    color: var(--text);
    background: var(--surface-sunken);
    border: var(--hairline-w) solid var(--hairline);
    border-radius: var(--radius-sm);
    padding: 5px 8px;
  }
  .name-input:focus { outline: 2px solid var(--signal); outline-offset: 1px; }
  .save-btn {
    flex: 0 0 auto;
    font-family: var(--font-mono);
    font-size: 0.7rem;
    padding: 5px 12px;
    color: var(--bg);
    background: var(--signal);
    border: none;
    border-radius: var(--radius-sm);
    cursor: pointer;
    transition: filter var(--t-fast);
  }
  .save-btn:hover:not(:disabled) { filter: brightness(1.08); }
  .save-btn:disabled { opacity: 0.4; cursor: not-allowed; }

  .err { margin: 0; font-family: var(--font-mono); font-size: 0.68rem; color: var(--accent); }
  .empty { margin: 2px 0; font-family: var(--font-mono); font-size: 0.7rem; color: var(--text-dim); }

  .list {
    list-style: none;
    margin: 0;
    padding: 0;
    display: flex;
    flex-direction: column;
    gap: 3px;
    max-height: 240px;
    overflow-y: auto;
  }
  .item { display: flex; align-items: stretch; gap: 4px; }
  .load {
    flex: 1 1 auto;
    min-width: 0;
    display: flex;
    flex-direction: column;
    gap: 1px;
    text-align: left;
    padding: 6px 8px;
    background: var(--surface-sunken);
    border: var(--hairline-w) solid var(--hairline);
    border-radius: var(--radius-sm);
    cursor: pointer;
    transition: border-color var(--t-fast), background var(--t-fast);
  }
  .load:hover:not(:disabled) { border-color: var(--signal); background: var(--signal-deep); }
  .load:disabled { opacity: 0.5; cursor: progress; }
  .p-name {
    font-family: var(--font-mono);
    font-size: 0.74rem;
    color: var(--text);
    white-space: nowrap;
    overflow: hidden;
    text-overflow: ellipsis;
  }
  .p-meta {
    font-family: var(--font-mono);
    font-size: 0.62rem;
    color: var(--text-dim);
    white-space: nowrap;
    overflow: hidden;
    text-overflow: ellipsis;
  }
  .del {
    flex: 0 0 auto;
    width: 30px;
    font-family: var(--font-mono);
    font-size: 1rem;
    line-height: 1;
    color: var(--text-dim);
    background: transparent;
    border: var(--hairline-w) solid var(--hairline);
    border-radius: var(--radius-sm);
    cursor: pointer;
    transition: color var(--t-fast), border-color var(--t-fast);
  }
  .del:hover:not(:disabled) { color: var(--accent); border-color: var(--accent); }
  .del:disabled { opacity: 0.4; cursor: not-allowed; }

  @media (pointer: coarse) {
    .io-btn { padding: 8px 12px; min-height: 36px; }
    .save-btn, .del { min-height: 34px; }
  }
</style>
