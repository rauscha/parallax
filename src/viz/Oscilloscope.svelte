<script lang="ts">
  import { onMount, onDestroy } from "svelte";
  import { audioEngine } from "../audio/AudioEngine";
  import { audioReadyStore } from "../state/stores";

  let canvas: HTMLCanvasElement;
  let wrap: HTMLDivElement;
  let raf = 0;
  let buf: Float32Array<ArrayBuffer> | null = null;

  // Edge-triggering parameters
  const HYSTERESIS = 0.02;   // must cross 0 by more than ±HYSTERESIS to count

  // Boot sweep: kicked when audioReadyStore flips false→true (TapToStart strike).
  // The TapToStart confirmation tone is ~260ms; the sweep runs ~700ms so the
  // visual tail outlasts the audio and the scope "lights up" rather than blips.
  const BOOT_SWEEP_MS = 700;
  let bootSweepStart = 0;
  let prevReady = false;
  const unsubReady = audioReadyStore.subscribe((v) => {
    if (v && !prevReady) bootSweepStart = performance.now();
    prevReady = v;
  });

  // Reduced-motion: read once on mount, refreshed via media-query listener.
  let reducedMotion = false;
  let motionMql: MediaQueryList | null = null;
  const onMotionChange = () => { if (motionMql) reducedMotion = motionMql.matches; };

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
    // Per-theme glow intensity: crisp vector on SNES Lab, heavy CRT bloom on
    // Phosphor, warm middle on Sandbox. Scales the halo width + shadowBlur.
    const bloom = tokenFloat("--scope-bloom", 1);

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

    // Trigger + silence-detect in a single pass — folded together so we don't
    // walk the buffer twice every frame.
    let triggerIdx = findTriggerIndex();
    let peak = 0;
    for (let i = 0; i < N; ++i) {
      const a = Math.abs(buf[i]);
      if (a > peak) peak = a;
    }
    const idle = peak < 0.002;
    if (triggerIdx < 0) triggerIdx = 0;

    // Sample window: ~half the analyser buffer starting at the trigger. Clamp
    // ≥1 so a degenerate trigger near the buffer end (very low-freq / DC-ish
    // signals) doesn't produce a zero-length window and a misleading flat frame.
    const samplesToShow = Math.max(1, Math.min(N - Math.ceil(triggerIdx) - 1, Math.floor(N * 0.5)));
    const start = Math.floor(triggerIdx);

    ctx2.lineJoin = "round";
    ctx2.lineCap = "round";

    const now = performance.now();

    if (idle) {
      // Breathing baseline — a real scope at rest isn't dead, it pulses softly.
      // Alpha-only animation (line stays put) so it doesn't read as a glitch.
      const alpha = reducedMotion
        ? 0.42
        : 0.32 + 0.18 * (0.5 + 0.5 * Math.sin(now * 2 * Math.PI / 4000));
      ctx2.strokeStyle = traceColor;
      ctx2.lineWidth = lineW;
      ctx2.globalAlpha = alpha;
      ctx2.beginPath();
      ctx2.moveTo(0, H / 2);
      ctx2.lineTo(W, H / 2);
      ctx2.stroke();

      // Faint beam dot sweeping left→right every ~6s — character without motion-jitter.
      if (!reducedMotion) {
        const sweepT = (now % 6000) / 6000;          // 0..1
        const dotX = sweepT * W;
        const fade = Math.sin(sweepT * Math.PI);     // 0 at ends, 1 mid-sweep
        ctx2.fillStyle = traceColor;
        ctx2.globalAlpha = 0.55 * fade;
        ctx2.beginPath();
        ctx2.arc(dotX, H / 2, lineW * 1.6, 0, 2 * Math.PI);
        ctx2.fill();
      }

      ctx2.globalAlpha = 1;
    } else {
      // Body halo (wide low-opacity stroke under the core).
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
      ctx2.lineWidth = lineW * (1 + 2 * bloom);
      drawTrace();

      // Core trace + real shadowBlur bloom — gated on amplitude so the
      // expensive blur stays off at near-silence (single peak read above).
      ctx2.strokeStyle = traceColor;
      ctx2.lineWidth = lineW;
      if (peak > 0.05) {
        ctx2.shadowColor = glow;
        ctx2.shadowBlur = 8 * dpr() * bloom;
      }
      drawTrace();
      ctx2.shadowBlur = 0;   // reset so it doesn't leak into the next frame's grid
    }

    // Boot sweep — one-shot when audio unlocks. Bright vertical scan crossing
    // the screen + a glow flare that decays. Synced to the A440 confirmation
    // strike so the visual energy lines up with the first sound.
    if (bootSweepStart > 0 && !reducedMotion) {
      const elapsed = now - bootSweepStart;
      if (elapsed < BOOT_SWEEP_MS) {
        const t = elapsed / BOOT_SWEEP_MS;     // 0..1
        const x = t * W;
        ctx2.strokeStyle = traceColor;
        ctx2.lineWidth = 2 * dpr();
        ctx2.globalAlpha = (1 - t) * 0.9;
        ctx2.shadowColor = glow;
        ctx2.shadowBlur = 18 * dpr() * bloom * (1 - t * 0.5);
        ctx2.beginPath();
        ctx2.moveTo(x, 0);
        ctx2.lineTo(x, H);
        ctx2.stroke();
        ctx2.shadowBlur = 0;
        ctx2.globalAlpha = 1;
      } else {
        bootSweepStart = 0;       // one-shot
      }
    }
  }

  let resizeObs: ResizeObserver | null = null;

  onMount(() => {
    fit();
    resizeObs = new ResizeObserver(fit);
    resizeObs.observe(wrap);
    motionMql = window.matchMedia("(prefers-reduced-motion: reduce)");
    reducedMotion = motionMql.matches;
    motionMql.addEventListener("change", onMotionChange);
    draw();
  });

  onDestroy(() => {
    cancelAnimationFrame(raf);
    resizeObs?.disconnect();
    motionMql?.removeEventListener("change", onMotionChange);
    unsubReady();
  });
</script>

<div class="scope-wrap" bind:this={wrap}>
  <canvas bind:this={canvas} aria-label="Oscilloscope"></canvas>
  <div class="scope-overlay scanlines"></div>
  <div class="scope-overlay vignette"></div>
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
  /* CRT screen falloff — only on Phosphor, to sell the curved-glass tube. */
  .scope-overlay.vignette { display: none; }
  :global([data-theme="phosphor"]) .scope-overlay.vignette {
    display: block;
    background: radial-gradient(ellipse at center,
      transparent 52%,
      rgba(0, 0, 0, 0.28) 82%,
      rgba(0, 0, 0, 0.55) 100%);
  }
</style>
