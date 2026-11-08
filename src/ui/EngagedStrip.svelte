<script lang="ts">
  /**
   * Phone-only strip: while a knob is engaged (dragged, focused, or swept by
   * Show me), its name, value and meaning sit at the top of the screen.
   *
   * On a phone the regions stack, so the Explain card a knob lights is about
   * 500px below the knob: turning it explained nothing you could see. This
   * keeps the explanation on screen with the hand that's turning. Decorative
   * for assistive tech (the knob already carries the value and points
   * aria-describedby at its card text), and it never takes a touch.
   */
  import { onDestroy } from "svelte";
  import { audioEngine } from "../audio/AudioEngine";
  import { modelFor } from "../audio/registry";
  import { activeParamStore, patchStore, engineIdStore, audioReadyStore } from "../state/stores";
  import type { ParameterDescriptor } from "../audio/types";
  import { formatReadout } from "./readout";
  import { sweepingParamStore } from "../state/show-me";

  let activeId = $state<string | null>(activeParamStore.get());
  let engineId = $state(engineIdStore.get());
  let modelId = $state<string | null>(patchStore.get().modelId);
  let params = $state<Record<string, number>>(patchStore.get().params);
  let ready = $state(audioReadyStore.get());
  let sweeping = $state<string | null>(sweepingParamStore.get());
  const unsubs = [
    activeParamStore.subscribe((v) => { activeId = v; }),
    engineIdStore.subscribe((v) => { engineId = v; }),
    patchStore.subscribe((p) => { modelId = p.modelId; params = p.params; }),
    audioReadyStore.subscribe((v) => { ready = v; }),
    sweepingParamStore.subscribe((v) => { sweeping = v; }),
  ];
  onDestroy(() => unsubs.forEach((u) => u()));

  let schema = $state<ParameterDescriptor[]>([]);
  $effect(() => {
    if (!ready) return;
    void engineId;   // re-read on engine swap
    schema = audioEngine.currentEngine?.getParameterSchema() ?? [];
  });

  let shown = $derived.by(() => {
    // Show me is started from the card itself, which is already on screen.
    if (!activeId || sweeping) return null;
    const spec = schema.find((d) => d.id === activeId);
    if (!spec) return null;
    const card = modelFor(engineId, modelId)?.knobs.find((k) => k.id === activeId);
    const text = card?.text ?? spec.description;
    if (!text) return null;
    return {
      label: card?.label ?? spec.label,
      value: formatReadout(spec, params[spec.id] ?? spec.default),
      text,
    };
  });
</script>

{#if shown}
  <div class="strip" aria-hidden="true">
    <div class="head">
      <span class="name">{shown.label}</span>
      <span class="value">{shown.value}</span>
    </div>
    <p class="text">{shown.text}</p>
  </div>
{/if}

<style>
  .strip { display: none; }

  @media (max-width: 720px), (pointer: coarse) and (max-height: 500px) {
    .strip {
      display: block;
      position: fixed;
      top: 0;
      left: 0;
      right: 0;
      z-index: 40;
      padding: 8px 16px 10px;
      background: var(--surface-raised);
      border-bottom: 2px solid var(--signal);
      box-shadow: 0 4px 14px rgba(0, 0, 0, 0.28);
      pointer-events: none;
    }
  }
  .head {
    display: flex;
    align-items: baseline;
    gap: 10px;
    margin-bottom: 3px;
  }
  .name {
    font-family: var(--font-mono);
    font-size: var(--fs-label);
    font-weight: 700;
    letter-spacing: 0.08em;
    text-transform: var(--label-case);
    color: var(--text);
  }
  .value {
    margin-left: auto;
    font-family: var(--font-mono);
    font-size: var(--fs-label);
    font-variant-numeric: tabular-nums;
    color: var(--signal-ink);
  }
  .text {
    margin: 0;
    font-family: var(--font-mono);
    font-size: var(--fs-prose);
    line-height: 1.4;
    letter-spacing: 0;
    color: var(--text);
    display: -webkit-box;
    -webkit-line-clamp: 4;
    line-clamp: 4;
    -webkit-box-orient: vertical;
    overflow: hidden;
  }
</style>
