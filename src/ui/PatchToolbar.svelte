<script lang="ts">
  /**
   * Patch & song I/O cluster (M5). Home for sharing, presets, and MIDI
   * file in/out — the actions that get a patch *out of* or *into* the app.
   * Lives in the top bar next to the theme switcher.
   *
   * Increment A: Share — mint a self-contained link to the current sound +
   * melody and copy it to the clipboard. The link also lands in the address
   * bar (replaceState), so it's bookmarkable even when the clipboard is
   * unavailable (e.g. a non-secure context).
   */
  import { onDestroy } from "svelte";
  import { audioReadyStore } from "../state/stores";
  import { writeShareUrl } from "../state/share-url";
  import PresetMenu from "./PresetMenu.svelte";
  import RecentSoundsMenu from "./RecentSoundsMenu.svelte";
  import MidiMenu from "./MidiMenu.svelte";
  import PostcardModal from "./PostcardModal.svelte";
  import ExportButton from "./ExportButton.svelte";

  let ready = $state(audioReadyStore.get());
  const unsubReady = audioReadyStore.subscribe((v) => { ready = v; });

  // Transient button feedback ("Share" → "Copied!" / "In address bar").
  let shareLabel = $state<"Share" | "Copied!" | "In address bar">("Share");
  let resetTimer = 0;
  onDestroy(() => { clearTimeout(resetTimer); unsubReady(); });
  let postcardOpen = $state(false);

  async function share() {
    const url = writeShareUrl();
    try {
      await navigator.clipboard.writeText(url);
      shareLabel = "Copied!";
    } catch {
      // Clipboard blocked (insecure context / permissions). The link is still
      // in the address bar from writeShareUrl(), so point the user there.
      shareLabel = "In address bar";
    }
    clearTimeout(resetTimer);
    resetTimer = window.setTimeout(() => { shareLabel = "Share"; }, 1800);
  }
</script>

<div class="io-bar">
  <MidiMenu />
  <PresetMenu />
  <RecentSoundsMenu />
  <button
    class="io-btn"
    onclick={() => (postcardOpen = true)}
    disabled={!ready}
    title="Make a shareable postcard image of this patch"
  >✦ Postcard</button>
  <button
    class="io-btn"
    class:done={shareLabel !== "Share"}
    onclick={share}
    disabled={!ready}
    title="Copy a link that recreates this exact sound + melody"
  >⤴ {shareLabel}</button>
  <ExportButton />
</div>

<PostcardModal bind:open={postcardOpen} />

<style>
  .io-bar {
    display: inline-flex;
    align-items: center;
    gap: 6px;
  }
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
  /* Brief confirmation wash when the link is copied. */
  .io-btn.done {
    color: var(--signal-ink);
    background: var(--signal-deep);
    border-color: var(--signal);
  }
  @media (pointer: coarse) {
    .io-btn { padding: 8px 12px; min-height: 36px; }
  }
</style>
