<script lang="ts">
  /**
   * Undo toast for the one-tap destructive actions (Surprise / Randomize /
   * Clear / MIDI import). Appears for ~6s with an Undo button that restores the
   * snapshot captured before the action. Driven by undoLabelStore — when it goes
   * null (timeout, dismiss, or a fresh action) the toast hides.
   */
  import { onDestroy } from "svelte";
  import { undoLabelStore, performUndo, dismissUndo } from "../state/undo";

  let label = $state<string | null>(undoLabelStore.get());
  const unsub = undoLabelStore.subscribe((v) => { label = v; });
  onDestroy(unsub);

  let undoing = $state(false);
  async function onUndo() {
    if (undoing) return;
    undoing = true;
    try { await performUndo(); }
    catch (e) { console.error("[undo] restore failed", e); }
    finally { undoing = false; }
  }
</script>

{#if label}
  <div class="toast" role="status">
    <span class="msg">{label}</span>
    <button class="undo" onclick={onUndo} disabled={undoing}>
      {undoing ? "Undoing…" : "Undo"}
    </button>
    <button class="dismiss" onclick={dismissUndo} aria-label="Dismiss">×</button>
  </div>
{/if}

<style>
  .toast {
    position: fixed;
    left: 50%;
    bottom: 64px;
    transform: translateX(-50%);
    z-index: 80;
    display: inline-flex;
    align-items: center;
    gap: 12px;
    padding: 8px 10px 8px 16px;
    font-family: var(--font-mono);
    font-size: 0.74rem;
    color: var(--text);
    background: var(--surface-raised);
    border: var(--hairline-w) solid var(--signal);
    border-radius: var(--radius-md);
    box-shadow: 0 10px 30px rgba(0, 0, 0, 0.4);
    animation: toast-in 220ms ease both;
    max-width: min(92vw, 420px);
  }
  .msg { white-space: nowrap; }
  .undo {
    font-family: var(--font-mono);
    font-size: 0.72rem;
    font-weight: 600;
    letter-spacing: 0.04em;
    padding: 4px 12px;
    color: var(--on-signal);
    background: var(--signal);
    border: var(--hairline-w) solid var(--signal);
    border-radius: var(--radius-sm);
    cursor: pointer;
    transition: filter var(--t-fast);
  }
  .undo:hover:not(:disabled) { filter: brightness(1.08); }
  .undo:disabled { opacity: 0.6; cursor: progress; }
  .dismiss {
    font-family: var(--font-mono);
    font-size: 1rem;
    line-height: 1;
    color: var(--text-dim);
    background: transparent;
    border: none;
    cursor: pointer;
    padding: 2px 6px;
  }
  .dismiss:hover { color: var(--text); }
  @media (prefers-reduced-motion: reduce) {
    .toast { animation: none; }
  }
  @keyframes toast-in {
    from { opacity: 0; transform: translate(-50%, 8px); }
    to { opacity: 1; transform: translate(-50%, 0); }
  }
  @media (pointer: coarse) {
    .undo { min-height: 36px; }
  }
</style>
