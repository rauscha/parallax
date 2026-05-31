<script lang="ts">
  import { audioEngine } from "../audio/AudioEngine";
  import { audioReadyStore } from "../state/stores";

  let ready = $state(false);
  audioReadyStore.subscribe((v) => { ready = v; });

  let timbre = $state(0.5);
  let color = $state(0.5);
  let fm = $state(0);
  let bits = $state(16);
  let rate = $state(96);
  let sign = $state(0);
  let attack = $state(0.005);
  let release = $state(0.18);
  let gain = $state(0.4);

  function set(id: string, v: number) {
    audioEngine.currentEngine?.setParameter(id, v);
  }

  $effect(() => { if (ready) set("timbre", timbre); });
  $effect(() => { if (ready) set("color", color); });
  $effect(() => { if (ready) set("fm", fm); });
  $effect(() => { if (ready) set("bits", bits); });
  $effect(() => { if (ready) set("sampleRateKhz", rate); });
  $effect(() => { if (ready) set("signature", sign); });
  $effect(() => { if (ready) set("attack", attack); });
  $effect(() => { if (ready) set("release", release); });
  $effect(() => { if (ready) set("gain", gain); });
</script>

<div class="panel">
  <div class="group">
    <div class="group-label">Shape</div>
    <label>
      <span class="label">TIMBRE</span>
      <input type="range" min="0" max="1" step="0.001" bind:value={timbre} disabled={!ready} />
      <span class="readout">{timbre.toFixed(2)}</span>
    </label>
    <label>
      <span class="label">COLOR</span>
      <input type="range" min="0" max="1" step="0.001" bind:value={color} disabled={!ready} />
      <span class="readout">{color.toFixed(2)}</span>
    </label>
    <label>
      <span class="label">FM</span>
      <input type="range" min="-12" max="12" step="0.1" bind:value={fm} disabled={!ready} />
      <span class="readout">{fm.toFixed(1)} st</span>
    </label>
  </div>

  <div class="group">
    <div class="group-label">Envelope</div>
    <label>
      <span class="label">ATTACK</span>
      <input type="range" min="0.001" max="2" step="0.001" bind:value={attack} disabled={!ready} />
      <span class="readout">{(attack * 1000).toFixed(0)} ms</span>
    </label>
    <label>
      <span class="label">RELEASE</span>
      <input type="range" min="0.01" max="4" step="0.01" bind:value={release} disabled={!ready} />
      <span class="readout">{release.toFixed(2)} s</span>
    </label>
    <label>
      <span class="label">GAIN</span>
      <input type="range" min="0" max="1" step="0.001" bind:value={gain} disabled={!ready} />
      <span class="readout">{gain.toFixed(2)}</span>
    </label>
  </div>

  <div class="group">
    <div class="group-label">Lo-fi (the Braids crunch)</div>
    <label>
      <span class="label">BITS</span>
      <input type="range" min="2" max="16" step="1" bind:value={bits} disabled={!ready} />
      <span class="readout">{bits} bit</span>
    </label>
    <label>
      <span class="label">RATE</span>
      <input type="range" min="4" max="96" step="1" bind:value={rate} disabled={!ready} />
      <span class="readout">{rate} kHz</span>
    </label>
    <label>
      <span class="label">SIGN</span>
      <input type="range" min="0" max="255" step="1" bind:value={sign} disabled={!ready} />
      <span class="readout">{sign}</span>
    </label>
  </div>
</div>

<style>
  .panel {
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
  label {
    display: grid;
    grid-template-columns: 70px 1fr 64px;
    align-items: center;
    gap: 8px;
  }
  .label {
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
  }
  input[type="range"]:disabled { opacity: 0.4; }
</style>
