<script lang="ts">
  /**
   * Patch postcard preview + export (M5 delight). Renders a shareable card of
   * the current sound + melody in the live theme's colours, shows it, and lets
   * you download or copy it as a PNG. The in-app preview is also the surface to
   * eyeball the design.
   */
  import { onDestroy } from "svelte";
  import { patchStore, melodyStore } from "../state/stores";
  import { engineEntryOrDefault } from "../audio/registry";
  import {
    renderPostcard,
    POSTCARD_W,
    POSTCARD_H,
    type PostcardData,
    type PostcardColors,
  } from "./postcard";

  let { open = $bindable(false) }: { open?: boolean } = $props();

  let canvasEl = $state<HTMLCanvasElement | null>(null);
  let status = $state<string | null>(null);

  // Object-URL revoke timer. Tracked so a modal close mid-countdown still
  // revokes the URL on destroy rather than leaking it (A1 sweep).
  let revokeTimer = 0;
  let pendingUrl: string | null = null;
  onDestroy(() => {
    clearTimeout(revokeTimer);
    if (pendingUrl) { URL.revokeObjectURL(pendingUrl); pendingUrl = null; }
  });

  function readColors(): PostcardColors {
    const cs = getComputedStyle(document.documentElement);
    const v = (name: string, fallback: string) => cs.getPropertyValue(name).trim() || fallback;
    return {
      bg: v("--bg", "#0B0E11"),
      surface: v("--surface", "#14181D"),
      surfaceSunken: v("--surface-sunken", "#0E1216"),
      hairline: v("--hairline", "#2A323B"),
      text: v("--text", "#E8EDF2"),
      textDim: v("--text-dim", "#8A95A0"),
      signal: v("--signal", "#34E1C4"),
      signalDeep: v("--signal-deep", "rgba(52,225,196,0.18)"),
      accent: v("--accent", "#FF4D8D"),
    };
  }

  function gatherData(): PostcardData {
    const patch = patchStore.get();
    const melody = melodyStore.get();
    const entry = engineEntryOrDefault(patch.engineId);
    const model =
      entry.models.find((m) => m.code.toLowerCase() === (patch.modelId ?? "").toLowerCase()) ??
      entry.models[0] ??
      null;
    const familyLabel = model
      ? entry.families.find((f) => f.id === model.family)?.label ?? ""
      : "";
    const knobs = model
      ? model.knobs.map((k) => ({ label: k.label, value: patch.params[k.id] ?? 0.5 }))
      : [];
    return {
      engineName: entry.name,
      modelCode: model?.code ?? entry.id,
      modelName: model?.name ?? entry.name,
      familyLabel,
      knobs,
      tempo: melody.tempo,
      keyName: melody.key,
      scale: melody.scale,
      events: melody.events.map((e) => ({
        startStep: e.startStep,
        durationSteps: e.durationSteps,
        midi: e.midi,
      })),
    };
  }

  // Render whenever the modal is open and the canvas is mounted.
  $effect(() => {
    if (open && canvasEl) {
      status = null;
      renderPostcard(canvasEl, gatherData(), readColors());
    }
  });

  // Escape to close.
  $effect(() => {
    if (!open) return;
    const onKey = (e: KeyboardEvent) => { if (e.key === "Escape") open = false; };
    document.addEventListener("keydown", onKey);
    return () => document.removeEventListener("keydown", onKey);
  });

  function toBlob(): Promise<Blob | null> {
    return new Promise((resolve) => {
      if (!canvasEl) return resolve(null);
      canvasEl.toBlob((b) => resolve(b), "image/png");
    });
  }

  async function download() {
    const blob = await toBlob();
    if (!blob) return;
    const url = URL.createObjectURL(blob);
    pendingUrl = url;
    const a = document.createElement("a");
    a.href = url;
    a.download = "parallax-postcard.png";
    document.body.appendChild(a);
    a.click();
    a.remove();
    clearTimeout(revokeTimer);
    revokeTimer = window.setTimeout(() => {
      URL.revokeObjectURL(url);
      if (pendingUrl === url) pendingUrl = null;
    }, 1000);
    status = "Downloaded";
  }

  async function copyImage() {
    try {
      const blob = await toBlob();
      if (!blob) return;
      // ClipboardItem image write — supported in Chromium/Safari; may be blocked
      // in some contexts, hence the fallback message.
      await navigator.clipboard.write([new ClipboardItem({ "image/png": blob })]);
      status = "Copied to clipboard";
    } catch {
      status = "Copy unavailable — use Download";
    }
  }
</script>

{#if open}
  <!-- svelte-ignore a11y_no_static_element_interactions -->
  <div
    class="overlay"
    onpointerdown={(e) => { if (e.target === e.currentTarget) open = false; }}
  >
    <div class="sheet" role="dialog" aria-modal="true" aria-label="Patch postcard" tabindex="-1">
      <div class="sheet-head">
        <span class="title">Patch postcard</span>
        <button class="x" onclick={() => (open = false)} aria-label="Close">×</button>
      </div>

      <div class="preview">
        <canvas
          bind:this={canvasEl}
          width={POSTCARD_W}
          height={POSTCARD_H}
          class="card-canvas"
          aria-label="Postcard preview"
        ></canvas>
      </div>

      <div class="actions">
        <span class="status" role="status">{status ?? ""}</span>
        <div class="btns">
          <button class="act" onclick={copyImage}>Copy image</button>
          <button class="act primary" onclick={download}>Download PNG</button>
        </div>
      </div>
    </div>
  </div>
{/if}

<style>
  .overlay {
    position: fixed;
    inset: 0;
    z-index: 90;
    display: grid;
    place-items: center;
    padding: 24px;
    background: rgba(0, 0, 0, 0.55);
  }
  .sheet {
    width: min(680px, 94vw);
    max-height: 92vh;
    overflow: auto;
    display: flex;
    flex-direction: column;
    gap: 12px;
    padding: 16px;
    background: var(--surface);
    border: var(--hairline-w) solid var(--hairline);
    border-radius: var(--radius-lg);
    box-shadow: 0 24px 64px rgba(0, 0, 0, 0.45);
  }
  .sheet-head {
    display: flex;
    align-items: center;
    justify-content: space-between;
  }
  .title {
    font-family: var(--font-mono);
    font-size: 0.8rem;
    letter-spacing: 0.06em;
    text-transform: var(--label-case);
    color: var(--text);
  }
  .x {
    font-family: var(--font-mono);
    font-size: 1.2rem;
    line-height: 1;
    width: 32px;
    height: 32px;
    color: var(--text-dim);
    background: transparent;
    border: var(--hairline-w) solid var(--hairline);
    border-radius: var(--radius-sm);
    cursor: pointer;
  }
  .x:hover { color: var(--text); border-color: var(--text-dim); }
  .preview {
    border: var(--hairline-w) solid var(--hairline);
    border-radius: var(--radius-md);
    overflow: hidden;
    background: var(--bg);
  }
  .card-canvas {
    display: block;
    width: 100%;
    height: auto;
  }
  .actions {
    display: flex;
    align-items: center;
    justify-content: space-between;
    gap: 12px;
    flex-wrap: wrap;
  }
  .status {
    font-family: var(--font-mono);
    font-size: 0.7rem;
    color: var(--signal-ink);
    min-height: 1em;
  }
  .btns { display: inline-flex; gap: 8px; }
  .act {
    font-family: var(--font-mono);
    font-size: 0.72rem;
    padding: 7px 14px;
    color: var(--text);
    background: var(--surface-raised);
    border: var(--hairline-w) solid var(--hairline);
    border-radius: var(--radius-sm);
    cursor: pointer;
    transition: filter var(--t-fast), border-color var(--t-fast);
  }
  .act:hover { filter: brightness(1.1); border-color: var(--signal); }
  .act.primary { color: var(--bg); background: var(--signal); border-color: var(--signal); }
  @media (pointer: coarse) {
    .act, .x { min-height: 38px; }
  }
</style>
