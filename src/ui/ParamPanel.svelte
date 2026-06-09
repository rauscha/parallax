<script lang="ts">
  import { audioEngine } from "../audio/AudioEngine";
  import { audioReadyStore, patchStore, engineIdStore } from "../state/stores";
  import type { ParameterDescriptor } from "../audio/types";
  import Knob from "./Knob.svelte";

  let ready = $state(false);
  let engineId = $state<string>(engineIdStore.get());
  audioReadyStore.subscribe((v) => { ready = v; });
  engineIdStore.subscribe((v) => { engineId = v; });

  // Controls are auto-generated from the live engine's parameter schema —
  // the schema holds non-serializable bits (format, describe) so it lives on
  // the engine, not the store. *Values* come from patchStore.params, which
  // is the source of truth: knob → patch → bindings → engine.
  // "model" is excluded — the ModelPicker owns model selection.
  let specs = $state<ParameterDescriptor[]>([]);
  let values = $state<Record<string, number>>(patchStore.get().params);
  patchStore.subscribe((p) => { values = p.params; });

  // Pull the live engine's schema when audio comes up — and again whenever the
  // engine hot-swaps. Reading engineId registers it as an effect dependency so a
  // swap (Braids → Plaits → Laxsynth) re-pulls the new schema; without it the
  // panel keeps rendering the previous engine's knobs (ready stays true across a
  // swap, so it can't be the trigger). installBindings() seeds patchStore (the
  // values) and sets engineIdStore *after* useEngine(), so by the time this
  // re-runs, currentEngine is already the new engine.
  $effect(() => {
    if (!ready) return;
    void engineId;   // dependency: re-pull schema on engine swap, not just boot
    const eng = audioEngine.currentEngine;
    if (!eng) return;
    specs = eng.getParameterSchema().filter((d) => d.id !== "model");
  });

  // Pretty names for the descriptor `group` keys; unknown groups fall back to
  // the raw key so a future engine's groups still render.
  const GROUP_LABELS: Record<string, string> = {
    shape: "Shape",
    pitch: "Pitch",
    filter: "Filter",
    envelope: "Envelope",
    lofi: "Lo-fi (the Braids crunch)",
    drive: "Drive & Crush",
    output: "Output",
  };

  // Group specs in first-seen order.
  let groups = $derived.by(() => {
    const order: string[] = [];
    const byGroup: Record<string, ParameterDescriptor[]> = {};
    for (const s of specs) {
      let bucket = byGroup[s.group];
      if (!bucket) { bucket = []; byGroup[s.group] = bucket; order.push(s.group); }
      bucket.push(s);
    }
    return order.map((id) => ({ id, label: GROUP_LABELS[id] ?? id, specs: byGroup[id] ?? [] }));
  });

  function stepFor(spec: ParameterDescriptor): number {
    return spec.step ?? (spec.max - spec.min || 1) / 1000;
  }

  // Sensible decimal count per parameter shape (mirrors the old hand-tuned panel).
  function decimalsFor(spec: ParameterDescriptor): number {
    if (spec.step && spec.step >= 1) return 0;     // bits, rate
    const range = spec.max - spec.min;
    if (range >= 50) return 0;                     // signature, drift (0..255)
    if (range >= 8) return 1;                      // fm (-12..12 semis)
    return 2;                                       // timbre, color, gain, env
  }

  function readout(spec: ParameterDescriptor, v: number): string {
    if (spec.format) return spec.format(v);
    const num = v.toFixed(decimalsFor(spec));
    if (!spec.unit) return num;
    return spec.unit.length > 1 ? `${num} ${spec.unit}` : `${num}${spec.unit}`;
  }

  function onChange(id: string, v: number) {
    // Write to the store; the binding pushes to the engine.
    patchStore.setKey("params", { ...patchStore.get().params, [id]: v });
  }
</script>

<section class="param-panel" aria-label="Synth parameters">
  {#each groups as group (group.id)}
    <div class="group">
      <div class="group-label">{group.label}</div>
      <div class="knob-row">
        {#each group.specs as spec (spec.id)}
          <Knob
            {spec}
            value={values[spec.id] ?? spec.default}
            onchange={(v) => onChange(spec.id, v)}
          />
        {/each}
      </div>
    </div>
  {/each}
</section>

<style>
  .param-panel {
    display: flex;
    flex-direction: column;
    gap: 14px;
  }
  .group {
    display: flex;
    flex-direction: column;
    gap: 6px;
  }
  .group-label {
    font-family: var(--font-mono);
    font-size: 0.65rem;
    text-transform: uppercase;
    letter-spacing: 0.1em;
    color: var(--text-dim);
    padding-bottom: 4px;
    border-bottom: var(--hairline-w) solid var(--hairline-soft);
  }
  .knob-row {
    display: flex;
    flex-wrap: wrap;
    gap: 0.1rem;
  }

  /* On phones the controls column is full-width, so pack the knobs into an even
     auto-filled grid instead of a ragged flex wrap — denser and tidier, with
     less wasted vertical space between groups. */
  @media (max-width: 720px) {
    .param-panel { gap: 10px; }
    .group { gap: 4px; }
    .group-label { padding-bottom: 2px; }
    .knob-row {
      display: grid;
      grid-template-columns: repeat(auto-fill, minmax(3.1rem, 1fr));
      gap: 4px 2px;
      justify-items: center;
    }
  }
</style>
