<script lang="ts">
  import { onMount, onDestroy } from "svelte";
  import { audioEngine } from "../audio/AudioEngine";

  let canvas: HTMLCanvasElement;
  let wrap: HTMLDivElement;
  let raf = 0;
  let freq: Uint8Array<ArrayBuffer> | null = null;
  let bars: Float32Array<ArrayBuffer> | null = null;   // smoothed heights 0..1

  const BAR_COUNT = 56;
  const SMOOTH = 0.55;   // EMA — the shared analyser runs unsmoothed (scope needs it)

  function dpr() { return Math.min(window.devicePixelRatio || 1, 2); }

  function fit() {
    if (!canvas || !wrap) return;
    const r = wrap.getBoundingClientRect();
    const ratio = dpr();
    canvas.width = Math.max(1, Math.floor(r.width * ratio));
    canvas.height = Math.max(1, Math.floor(r.height * ratio));
    canvas.style.width = `${r.width}px`;
    canvas.style.height = `${r.height}px`;
  }

  function readToken(name: string, fallback: string): string {
    return getComputedStyle(canvas).getPropertyValue(name).trim() || fallback;
  }
  function tokenFloat(name: string, fallback: number): number {
    const v = parseFloat(getComputedStyle(canvas).getPropertyValue(name));
    return Number.isFinite(v) ? v : fallback;
  }

  function draw() {
    raf = requestAnimationFrame(draw);
    const analyser = audioEngine.analyserNode;
    if (!canvas || !analyser) return;

    const bins = analyser.frequencyBinCount;
    if (!freq || freq.length !== bins) freq = new Uint8Array(bins);
    if (!bars || bars.length !== BAR_COUNT) bars = new Float32Array(BAR_COUNT);
    analyser.getByteFrequencyData(freq);
    const fq = freq, br = bars;   // non-null after the guards above

    const ctx2 = canvas.getContext("2d");
    if (!ctx2) return;
    const W = canvas.width, H = canvas.height;

    const traceColor = readToken("--scope-trace", "#34E1C4");
    const glow = readToken("--scope-glow", "rgba(52,225,196,0.55)");
    const gridColor = readToken("--scope-grid", "rgba(52,225,196,0.08)");
    const bg = readToken("--scope-bg", "#07090B");

    ctx2.fillStyle = bg;
    ctx2.fillRect(0, 0, W, H);

    // Baseline rule.
    ctx2.strokeStyle = gridColor;
    ctx2.lineWidth = 1;
    ctx2.beginPath();
    ctx2.moveTo(0, H - 1); ctx2.lineTo(W, H - 1);
    ctx2.stroke();

    // Aggregate FFT bins into log-spaced bars (peak-hold within each band),
    // then EMA-smooth so the display isn't jittery.
    const minBin = 2;   // skip DC / sub-bass rumble
    let peak = 0;
    for (let b = 0; b < BAR_COUNT; ++b) {
      const t0 = b / BAR_COUNT, t1 = (b + 1) / BAR_COUNT;
      const lo = Math.max(minBin, Math.floor(minBin * Math.pow(bins / minBin, t0)));
      const hi = Math.max(lo + 1, Math.floor(minBin * Math.pow(bins / minBin, t1)));
      let m = 0;
      for (let i = lo; i < hi && i < bins; ++i) if (fq[i] > m) m = fq[i];
      const target = m / 255;
      br[b] += (target - br[b]) * SMOOTH;
      if (br[b] > peak) peak = br[b];
    }

    const lineW = tokenFloat("--scope-trace-w", 1.6) * dpr();

    // Idle: flat baseline, matching the oscilloscope's no-signal treatment.
    if (peak < 0.01) {
      ctx2.strokeStyle = traceColor;
      ctx2.globalAlpha = 0.45;
      ctx2.lineWidth = lineW;
      ctx2.beginPath();
      ctx2.moveTo(0, H - 2); ctx2.lineTo(W, H - 2);
      ctx2.stroke();
      ctx2.globalAlpha = 1;
      return;
    }

    const gap = Math.max(1, (W / BAR_COUNT) * 0.18);
    const bw = (W - gap * (BAR_COUNT - 1)) / BAR_COUNT;
    ctx2.save();
    ctx2.fillStyle = traceColor;
    ctx2.shadowColor = glow;
    ctx2.shadowBlur = 6 * dpr();
    for (let b = 0; b < BAR_COUNT; ++b) {
      const h = Math.max(1, br[b] * H * 0.92);
      const x = b * (bw + gap);
      ctx2.fillRect(x, H - h, bw, h);
    }
    ctx2.restore();
  }

  let resizeObs: ResizeObserver | null = null;

  onMount(() => {
    fit();
    resizeObs = new ResizeObserver(fit);
    resizeObs.observe(wrap);
    draw();
  });

  onDestroy(() => {
    cancelAnimationFrame(raf);
    resizeObs?.disconnect();
  });
</script>

<div class="scope-wrap" bind:this={wrap}>
  <canvas bind:this={canvas} aria-label="Spectrum analyzer"></canvas>
  <div class="scope-overlay scanlines"></div>
</div>

<style>
  .scope-wrap {
    position: relative;
    width: 100%;
    height: 100%;
    min-height: 200px;
    background: var(--scope-bg);
  }
  canvas {
    display: block;
    width: 100%;
    height: 100%;
  }
  .scope-overlay {
    position: absolute; inset: 0;
    pointer-events: none;
  }
</style>
