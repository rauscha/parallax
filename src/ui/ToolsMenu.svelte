<script lang="ts">
  /**
   * Responsive disclosure wrapper for the top-bar action cluster.
   *
   * Desktop (> 720px): renders as `display: contents` — it vanishes from layout
   * and its children flow straight into the top bar exactly as if this wrapper
   * weren't here, so the desktop layout is byte-for-byte unchanged.
   *
   * Phone (≤ 720px): collapses everything behind a single `⋯` button that opens
   * a popover panel (same visual language as the MIDI / Presets menus). This is
   * what keeps the phone top bar to one tidy row instead of a wrapped, crowded
   * stack. The slotted controls (Match, MIDI, Presets, Postcard, Share, theme)
   * keep working untouched — their own nested popovers open within the panel.
   */
  let { children } = $props();

  let open = $state(false);
  let rootEl: HTMLElement;

  // Outside-click + Escape to close — mirrors the MIDI/Preset menu behaviour so
  // the whole top bar dismisses consistently.
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
</script>

<div class="tools" bind:this={rootEl}>
  <button
    class="tools-toggle"
    class:active={open}
    onclick={() => (open = !open)}
    aria-haspopup="true"
    aria-expanded={open}
    aria-label="More controls"
    title="More controls"
  >⋯</button>
  <div class="tools-panel" class:open role="group" aria-label="Top bar controls">
    {@render children()}
  </div>
</div>

<style>
  /* Desktop: the wrapper is invisible — children flow into the top bar as
     before. The toggle is hidden; the panel is a pass-through container. */
  .tools { display: contents; }
  .tools-toggle { display: none; }
  .tools-panel { display: contents; }

  @media (max-width: 720px) {
    .tools { position: relative; display: inline-flex; }

    .tools-toggle {
      display: inline-flex;
      align-items: center;
      justify-content: center;
      min-width: 40px;
      min-height: 36px;
      padding: 6px 10px;
      font-size: 1.1rem;
      line-height: 1;
      color: var(--text);
      background: var(--surface-raised);
      border: var(--hairline-w) solid var(--hairline);
      border-radius: var(--radius-sm);
      cursor: pointer;
      transition: filter var(--t-fast), border-color var(--t-fast);
    }
    .tools-toggle:hover { filter: brightness(1.1); border-color: var(--signal); }
    .tools-toggle.active { border-color: var(--signal); color: var(--signal-ink); }

    .tools-panel {
      display: none;
      position: absolute;
      top: calc(100% + 6px);
      right: 0;
      z-index: 30;
      flex-direction: column;
      align-items: stretch;
      gap: 10px;
      width: min(264px, 88vw);
      padding: 12px;
      background: var(--surface);
      border: var(--hairline-w) solid var(--hairline);
      border-radius: var(--radius-md);
      box-shadow: 0 14px 40px rgba(0, 0, 0, 0.36);
    }
    .tools-panel.open { display: flex; }

    /* Lay the slotted controls out as tidy full-width rows. The Match button
       and the I/O / theme clusters each take their own line and wrap within it
       rather than overflowing the narrow panel. */
    .tools-panel :global(.match-entry) {
      width: 100%;
      text-align: center;
    }
    .tools-panel :global(.io-bar) {
      flex-wrap: wrap;
      gap: 6px;
      width: 100%;
    }
    .tools-panel :global(.io-bar) > :global(*) { flex: 1 1 auto; }
  }
</style>
