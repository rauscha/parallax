<script lang="ts">
  import { audioEngine } from "../audio/AudioEngine";
  import { audioReadyStore } from "../state/stores";
  import type { ParameterDescriptor } from "../audio/types";
  // KNOBS (parked): vertical-drag rotary knobs. Liked the feel, but they eat too
  // much vertical space for the controls column. Back to sliders for now.
  // To bring knobs back: uncomment this import + the knob block in the markup,
  // and comment out the slider block. See Knob.svelte.
  // import Knob from "./Knob.svelte";

  let ready = $state(false);
  audioReadyStore.subscribe((v) => { ready = v; });

  // Controls are auto-generated from the live engine's parameter schema.
  // "model" is excluded — the ModelPicker owns model selection.
  let specs = $state<ParameterDescriptor[]>([]);
  let values = $state<Record<string, number>>({});

  // When audio comes up, pull the engine's schema and seed from current values.
  $effect(() => {
    if (!ready) return;
    const eng = audioEngine.currentEngine;
    if (!eng) return;
    const schema = eng.getParameterSchema().filter((d) => d.id !== "model");
    const seed: Record<string, number> = {};
    for (const s of schema) seed[s.id] = eng.getParameter(s.id) ?? s.default;
    specs = schema;
    values = seed;
  });

  // Pretty names for the descriptor `group` keys; unknown groups fall back to
  // the raw key so a future engine's groups still render.
  const GROUP_LABELS: Record<string, string> = {
    shape: "Shape",
    pitch: "Pitch",
    envelope: "Envelope",
    lofi: "Lo-fi (the Braids crunch)",
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
    values = { ...values, [id]: v };
    audioEngine.currentEngine?.setParameter(id, v);
  }
</script>

<section class="param-panel" aria-label="Synth parameters">
  {#each groups as group (group.id)}
    <div class="group">
      <div class="group-label">{group.label}</div>
      {#each group.specs as spec (spec.id)}
        {@const value = values[spec.id] ?? spec.default}
        <label class="row">
          <span class="ctl-label">{spec.label}</span>
          <input
            type="range"
            min={spec.min}
            max={spec.max}
            step={stepFor(spec)}
            {value}
            disabled={!ready}
            aria-label={spec.label}
            oninput={(e) => onChange(spec.id, +e.currentTarget.value)}
          />
          <span class="readout">{readout(spec, value)}</span>
        </label>
      {/each}
    </div>
  {/each}

  <!--
    KNOBS (parked, per request) — vertical-drag rotary version. Same engine
    binding as the sliders above. To re-enable: uncomment the `import Knob`
    line at the top of the <script>, uncomment this block, comment out the
    slider block above, and add this rule back to <style>:
        .knob-row { display: flex; flex-wrap: wrap; gap: 0.25rem; }

    {#each groups as group (group.id)}
      <div class="group">
        <div class="group-label">{group.label}</div>
        <div class="knob-row">
          {#each group.specs as spec (spec.id)}
            <Knob {spec} value={values[spec.id] ?? spec.default} onchange={(v) => onChange(spec.id, v)} />
          {/each}
        </div>
      </div>
    {/each}
  -->
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
  .row {
    display: grid;
    grid-template-columns: 64px 1fr 60px;
    align-items: center;
    gap: 8px;
  }
  .ctl-label {
    font-family: var(--font-mono);
    font-size: 0.7rem;
    color: var(--text-muted);
    text-transform: uppercase;
    letter-spacing: 0.05em;
  }
  .readout {
    font-family: var(--font-mono);
    font-size: 0.72rem;
    color: var(--text);
    font-variant-numeric: tabular-nums;
    text-align: right;
  }
  input[type="range"] {
    width: 100%;
    accent-color: var(--signal);
    cursor: pointer;
  }
  input[type="range"]:disabled {
    opacity: 0.4;
    cursor: not-allowed;
  }
</style>
