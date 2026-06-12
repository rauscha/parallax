<script lang="ts">
  /**
   * One-shot "ready to work offline" confirmation (M5 increment D). Appears
   * when the service worker finishes precaching the app, then auto-dismisses.
   * Purely informational — updates apply silently (autoUpdate), so there's no
   * action to take.
   */
  import { onDestroy } from "svelte";
  import { offlineReadyStore } from "../state/pwa";

  let show = $state(false);
  let hideTimer = 0;
  const unsubOffline = offlineReadyStore.subscribe((v) => {
    if (v) {
      show = true;
      clearTimeout(hideTimer);
      hideTimer = window.setTimeout(() => { show = false; }, 4500);
    }
  });
  onDestroy(() => { clearTimeout(hideTimer); unsubOffline(); });
</script>

{#if show}
  <div class="toast" role="status">
    <span class="dot" aria-hidden="true">✓</span>
    Ready to work offline
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
    gap: 8px;
    padding: 8px 16px;
    font-family: var(--font-mono);
    font-size: 0.74rem;
    color: var(--text);
    background: var(--surface-raised);
    border: var(--hairline-w) solid var(--signal);
    border-radius: var(--radius-md);
    box-shadow: 0 10px 30px rgba(0, 0, 0, 0.4);
    animation: toast-in 220ms ease both;
  }
  .dot { color: var(--signal-ink); }
  @keyframes toast-in {
    from { opacity: 0; transform: translate(-50%, 8px); }
    to { opacity: 1; transform: translate(-50%, 0); }
  }
  @media (prefers-reduced-motion: reduce) {
    .toast { animation: none; }
  }
</style>
