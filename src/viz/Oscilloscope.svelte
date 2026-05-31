<script lang="ts">
  import { onMount, onDestroy } from "svelte";
  import { audioEngine } from "../audio/AudioEngine";

  let canvas: HTMLCanvasElement;
  let wrap: HTMLDivElement;
  let raf = 0;
  let buf: Float32Array<ArrayBuffer> | null = null;
  let heartbeatPhase = 0;

  // Edge-triggering parameters
  const HYSTERESIS = 0.02;   // must cross 0 by more than ±HYSTERESIS to count

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

  // Find a zero-crossing in `buf` using hysteresis. Returns interpolated index
  // (fractional) of the first positive-going crossing, or -1 if none found.
  function findTriggerIndex(): number {
    if (!buf) return -1;
    const N = buf.length;
    let armed = false;        // true after we've seen a sample below -HYSTERESIS
    for (let i = 1; i < N; ++i) {
      const x = buf[i];
      if (!armed) {
        if (x < -HYSTERESIS) armed = true;
        continue;
      }
      if (x >= 0 && buf[i - 1] < 0) {
        // Linear interp between (i-1) and i where the signal crosses zero
        const a = buf[i - 1], b = buf[i];
        const frac = b !== a ? -a / (b - a) : 0;
        return (i - 1) + frac;
      }
    }
    return -1;
  }

  function draw() {
    raf = requestAnimationFrame(draw);
    if (!canvas || !audioEngine.analyserNode) return;

    const analyser = audioEngine.analyserNode;
    const N = analyser.fftSize;
    if (!buf || buf.length !== N) buf = new Float32Array(N);
    analyser.getFloatTimeDomainData(buf);

    const ctx2 = canvas.getContext("2d");
    if (!ctx2) return;
    const W = canvas.width, H = canvas.height;

    const persist = tokenFloat("--scope-persist", 0.85);
    const traceColor = readToken("--scope-trace", "#34E1C4");
    const glow = readToken("--scope-glow", "rgba(52,225,196,0.55)");
    const gridColor = readToken("--scope-grid", "rgba(52,225,196,0.08)");
    const bg = readToken("--scope-bg", "#07090B");
    const lineW = tokenFloat("--scope-trace-w", 1.5) * dpr();

    // Persistence: paint a slightly-opaque background each frame so prior traces
    // fade rather than vanish — cheaper than a full-frame composite.
    ctx2.globalCompositeOperation = "source-over";
    ctx2.fillStyle = bg;
    ctx2.globalAlpha = 1 - persist;
    ctx2.fillRect(0, 0, W, H);
    ctx2.globalAlpha = 1;

    // Grid (faint center cross + horizontal mid-rule)
    ctx2.strokeStyle = gridColor;
    ctx2.lineWidth = 1;
    ctx2.beginPath();
    ctx2.moveTo(0, H / 2); ctx2.lineTo(W, H / 2);
    ctx2.moveTo(W / 2, 0); ctx2.lineTo(W / 2, H);
    ctx2.stroke();

    // Find a stable trigger so the waveform doesn't slide.
    let triggerIdx = findTriggerIndex();

    // Detect silence: if peak < tiny epsilon, draw an idle heartbeat sine so
    // the scope never looks dead.
    let peak = 0;
    for (let i = 0; i < N; ++i) {
      const a = Math.abs(buf[i]);
      if (a > peak) peak = a;
    }
    let idle = peak < 0.002;

    if (triggerIdx < 0) triggerIdx = 0;

    // Sample window: we display ~half the analyser buffer starting at the trigger.
    const samplesToShow = Math.min(N - Math.ceil(triggerIdx) - 1, Math.floor(N * 0.5));
    const start = Math.floor(triggerIdx);

    // Glow layer (wide stroke, transparent color) then core stroke
    ctx2.lineJoin = "round";
    ctx2.lineCap = "round";

    if (idle) {
      // Heartbeat sine
      heartbeatPhase += 0.02;
      ctx2.strokeStyle = glow;
      ctx2.lineWidth = lineW * 2.5;
      ctx2.beginPath();
      for (let i = 0; i < W; ++i) {
        const t = i / W;
        const y = H / 2 + Math.sin(t * Math.PI * 4 + heartbeatPhase) * H * 0.04 * Math.exp(-Math.pow((t - 0.5) * 3, 2));
        if (i === 0) ctx2.moveTo(i, y); else ctx2.lineTo(i, y);
      }
      ctx2.stroke();
      ctx2.strokeStyle = traceColor;
      ctx2.lineWidth = lineW;
      ctx2.stroke();
    } else {
      // Render twice: glow + core
      const drawTrace = () => {
        ctx2.beginPath();
        for (let i = 0; i < W; ++i) {
          const t = i / (W - 1);
          const idx = start + t * samplesToShow;
          const i0 = Math.floor(idx);
          const i1 = Math.min(i0 + 1, N - 1);
          const f = idx - i0;
          const v = buf![i0] * (1 - f) + buf![i1] * f;
          const y = H / 2 - v * H * 0.45;
          if (i === 0) ctx2.moveTo(i, y); else ctx2.lineTo(i, y);
        }
        ctx2.stroke();
      };
      ctx2.strokeStyle = glow;
      ctx2.lineWidth = lineW * 3;
      drawTrace();
      ctx2.strokeStyle = traceColor;
      ctx2.lineWidth = lineW;
      drawTrace();
    }
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
  <canvas bind:this={canvas} aria-label="Oscilloscope"></canvas>
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
