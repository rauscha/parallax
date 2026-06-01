<script lang="ts">
  import { audioEngine } from "../audio/AudioEngine";
  import { BraidsEngine } from "../audio/engines/BraidsEngine";
  import { audioReadyStore } from "../state/stores";

  let starting = $state(false);
  let error = $state<string | null>(null);

  async function start() {
    if (starting) return;
    starting = true;
    error = null;
    try {
      await audioEngine.start();
      await audioEngine.useEngine(new BraidsEngine());
      // Confirmation strike — short A440 so we know the chain is live end-to-end.
      audioEngine.currentEngine?.noteOn(69, { velocity: 0.5 });
      setTimeout(() => audioEngine.currentEngine?.noteOff(69), 260);
      audioReadyStore.set(true);
    } catch (e) {
      error = e instanceof Error ? e.message : String(e);
      starting = false;
    }
  }
</script>

<div class="overlay" role="dialog" aria-modal="true" aria-labelledby="ttsTitle">
  <div class="card">
    <h1 id="ttsTitle">Parallax</h1>
    <p class="subtitle">A web playground for the sounds of Braids.</p>
    <button class="cta" onclick={start} disabled={starting}>
      {starting ? "Starting…" : "Tap to start audio"}
    </button>
    {#if error}
      <p class="error" role="alert"><strong>ERROR:</strong> {error}</p>
    {/if}
    <p class="fineprint">
      Browsers require a click before they'll make sound. One tap and you're in.
    </p>
  </div>
</div>

<style>
  .overlay {
    position: fixed; inset: 0;
    display: grid; place-items: center;
    background: radial-gradient(ellipse at center, var(--bg) 0%, color-mix(in oklab, var(--bg) 92%, black) 100%);
    z-index: 100;
    padding: 24px;
  }
  .card {
    text-align: center;
    max-width: 420px;
    padding: 32px 28px;
    background: var(--surface);
    border: var(--hairline-w) solid var(--hairline);
    border-radius: var(--radius-lg);
    box-shadow: 0 24px 64px rgba(0, 0, 0, 0.4);
  }
  h1 {
    color: var(--signal-ink);
    margin-bottom: 4px;
    font-size: clamp(28px, 1.5rem + 1vw, 36px);
  }
  .subtitle {
    color: var(--text-muted);
    margin-bottom: 24px;
  }
  .cta {
    display: inline-block;
    padding: 12px 28px;
    background: var(--signal);
    color: var(--bg);
    font-family: var(--font-mono);
    font-size: 0.85rem;
    text-transform: var(--label-case);
    letter-spacing: var(--label-tracking);
    border-radius: var(--radius-md);
    transition: transform var(--t-fast), filter var(--t-fast);
  }
  .cta:hover:not(:disabled) { filter: brightness(1.08); }
  .cta:active:not(:disabled) { transform: scale(0.98); }
  .cta:disabled { opacity: 0.6; cursor: progress; }
  .error {
    margin-top: 14px;
    color: var(--accent);
    font-family: var(--font-mono);
    font-size: 0.75rem;
  }
  .fineprint {
    margin-top: 18px;
    color: var(--text-dim);
    font-size: 0.78rem;
  }
</style>
