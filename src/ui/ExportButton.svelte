<script lang="ts">
  /**
   * Export the current 4-bar loop as a downloadable audio file. One inline
   * io-btn whose label cycles "⬇ Export" → "Recording… Ns" (live countdown) →
   * "Done". State is conveyed by label TEXT + aria-live, never color alone
   * (house accessibility rule); the .done wash is reinforcement only.
   */
  import { onDestroy } from "svelte";
  import { audioReadyStore, melodyStore } from "../state/stores";
  import { computeLoopDurationMs, RELEASE_TAIL_MS, isExportSupported } from "../audio/export";
  import { exportOneLoop } from "../audio/export-loop";

  let ready = $state(audioReadyStore.get());
  const unsubReady = audioReadyStore.subscribe((v) => { ready = v; });

  const supported = isExportSupported();
  let label = $state("⬇ Export");
  let recording = $state(false);
  let countdownTimer = 0;
  let resetTimer = 0;

  onDestroy(() => {
    unsubReady();
    clearInterval(countdownTimer);
    clearTimeout(resetTimer);
  });

  async function onExport() {
    if (recording || !ready || !supported) return;
    recording = true;
    clearTimeout(resetTimer);

    const tempo = melodyStore.get().tempo;
    const totalMs = computeLoopDurationMs(tempo) + RELEASE_TAIL_MS;
    const endAt = performance.now() + totalMs;
    const tick = () => {
      const remaining = Math.max(0, Math.ceil((endAt - performance.now()) / 1000));
      label = remaining > 0 ? `Recording… ${remaining}s` : "Recording…";
    };
    tick();
    countdownTimer = window.setInterval(tick, 250);

    try {
      await exportOneLoop();
      label = "Done";
    } catch {
      label = "Failed";
    } finally {
      clearInterval(countdownTimer);
      recording = false;
      resetTimer = window.setTimeout(() => { label = "⬇ Export"; }, 1800);
    }
  }

  const tip = supported
    ? "Record one 4-bar loop of this sound + melody and download it (plus a 2s tail)"
    : "Audio export isn't supported in this browser";
</script>

<button
  class="io-btn"
  class:done={recording || label === "Done"}
  onclick={onExport}
  disabled={!ready || recording || !supported}
  aria-live="polite"
  title={tip}
>{label}</button>

<style>
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
    transition: filter var(--t-fast), border-color var(--t-fast), color var(--t-fast);
  }
  .io-btn:hover:not(:disabled) { filter: brightness(1.1); border-color: var(--signal); }
  .io-btn:focus-visible { outline: 2px solid var(--signal); outline-offset: 1px; }
  .io-btn:disabled { opacity: 0.4; cursor: not-allowed; }
  .io-btn.done {
    color: var(--signal-ink);
    background: var(--signal-deep);
    border-color: var(--signal);
  }
  @media (pointer: coarse) {
    .io-btn { padding: 8px 12px; min-height: 36px; }
  }
</style>
