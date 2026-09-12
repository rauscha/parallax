/**
 * Trace drawing — the shared primitive behind every waveform in the app.
 *
 * Pulled out at phase 8 (spec §4.3). The flowsheet draws eight traces at once
 * from a tap snapshot while `Oscilloscope.svelte` draws one from an
 * `AnalyserNode`; the *source* differs, the drawing does not, and forking the
 * drawing would have meant two edge-triggers that could drift apart — the
 * flowsheet's whole claim is that what it shows is the same signal the scope
 * shows, so they had better agree on how to show it.
 *
 * Everything here is framework-free, and everything that can be tested without a
 * canvas (the trigger, the per-column envelope) is a pure function taking arrays.
 *
 * On honesty: `columns()` reduces a long buffer to one pixel column at a time by
 * keeping the **minimum and maximum** of the samples that fall in that column,
 * not by taking every Nth sample. Point-sampling a waveform denser than the
 * display aliases — a 2 kHz modulator drawn at one sample per pixel can come out
 * looking like a slow wobble, which would be a picture of nothing. Min/max keeps
 * the true excursion, so a trace too dense to resolve reads as a filled band
 * rather than as a lie.
 */

/** Device pixel ratio, capped at 2 — beyond that the cost buys nothing visible. */
export function dpr(): number {
  return Math.min(typeof window === "undefined" ? 1 : window.devicePixelRatio || 1, 2);
}

/** Size a canvas's backing store to its CSS box at the current DPR. */
export function fitCanvas(canvas: HTMLCanvasElement, cssW: number, cssH: number): void {
  const ratio = dpr();
  canvas.width = Math.max(1, Math.floor(cssW * ratio));
  canvas.height = Math.max(1, Math.floor(cssH * ratio));
  canvas.style.width = `${cssW}px`;
  canvas.style.height = `${cssH}px`;
}

/** Read a CSS custom property as a string, resolved against `el`. */
export function readToken(el: Element, name: string, fallback: string): string {
  return getComputedStyle(el).getPropertyValue(name).trim() || fallback;
}

/** Read a CSS custom property as a number. */
export function tokenFloat(el: Element, name: string, fallback: number): number {
  const v = parseFloat(getComputedStyle(el).getPropertyValue(name));
  return Number.isFinite(v) ? v : fallback;
}

/** Largest absolute sample in `buf[start .. start+count)`. */
export function peak(buf: Float32Array, start = 0, count = buf.length - start): number {
  let p = 0;
  for (let i = start; i < start + count; ++i) {
    const a = buf[i] < 0 ? -buf[i] : buf[i];
    if (a > p) p = a;
  }
  return p;
}

/**
 * Find a rising zero crossing in `buf[start .. start+count)`, so a periodic
 * trace stands still instead of sliding across the screen.
 *
 * Armed by hysteresis: the signal must first go below `-hysteresis`, which stops
 * a noisy near-zero stretch from triggering on every sample. The returned index
 * is **fractional**, linearly interpolated across the crossing — without that,
 * the trace jitters by up to one sample period every frame, which at a few
 * hundred Hz is plainly visible and reads as instability in the *sound*.
 *
 * Returns -1 when there is no crossing (silence, or DC).
 */
export function findTrigger(
  buf: Float32Array,
  start = 0,
  count = buf.length - start,
  hysteresis = 0.02,
): number {
  const end = start + count;
  let armed = false;
  for (let i = start + 1; i < end; ++i) {
    const x = buf[i];
    if (!armed) {
      if (x < -hysteresis) armed = true;
      continue;
    }
    if (x >= 0 && buf[i - 1] < 0) {
      const a = buf[i - 1];
      const b = buf[i];
      const frac = b !== a ? -a / (b - a) : 0;
      return i - 1 + frac;
    }
  }
  return -1;
}

/**
 * Reduce `buf[start .. start+count)` to `width` [min, max] pairs, written into
 * `out` as `out[2c]` = min, `out[2c + 1]` = max for column `c`.
 *
 * `out` is caller-owned so a 60 Hz draw loop allocates nothing. Samples past the
 * end of `buf` are ignored rather than wrapped — a snapshot is a window, not a
 * ring, and silently wrapping would join the end of the trace to its beginning.
 */
export function columns(
  buf: Float32Array,
  start: number,
  count: number,
  width: number,
  out: Float32Array,
): void {
  const per = count / width;
  const limit = buf.length;
  for (let c = 0; c < width; ++c) {
    let lo = Infinity;
    let hi = -Infinity;
    const from = Math.floor(start + c * per);
    let to = Math.floor(start + (c + 1) * per);
    if (to <= from) to = from + 1;
    for (let i = from; i < to && i < limit; ++i) {
      const x = buf[i];
      if (x < lo) lo = x;
      if (x > hi) hi = x;
    }
    if (lo === Infinity) { lo = 0; hi = 0; }
    out[2 * c] = lo;
    out[2 * c + 1] = hi;
  }
}

export interface TraceStyle {
  /** Stroke colour. */
  color: string;
  /** Line width in CSS pixels (scaled by DPR internally). */
  lineWidth?: number;
  /** Dash pattern in CSS pixels — the second channel that carries meaning when
   *  colour cannot (the app's reader may not separate two hues). */
  dash?: number[];
  /** Vertical scale. 1 means ±1.0 fills the box. */
  gain?: number;
  /** Draw the zero line. */
  midline?: string;
}

/**
 * Draw one trace into a canvas, filling it. Clears first — persistence is the
 * caller's business (the `graph` theme sets `--scope-persist: 0` because a plot
 * is not a phosphor screen).
 *
 * `count` samples starting at `start` are mapped across the full width, so
 * "slow motion" is just a smaller `count` over the same captured data — real
 * magnification of the real samples, not a re-render at a different rate.
 */
export function drawTrace(
  ctx: CanvasRenderingContext2D,
  buf: Float32Array,
  start: number,
  count: number,
  style: TraceStyle,
  scratch?: Float32Array,
): void {
  const W = ctx.canvas.width;
  const H = ctx.canvas.height;
  const ratio = dpr();
  const mid = H / 2;
  const gain = style.gain ?? 1;
  const amp = mid * gain;

  ctx.clearRect(0, 0, W, H);

  if (style.midline) {
    ctx.strokeStyle = style.midline;
    ctx.lineWidth = 1;
    ctx.setLineDash([]);
    ctx.beginPath();
    ctx.moveTo(0, Math.round(mid) + 0.5);
    ctx.lineTo(W, Math.round(mid) + 0.5);
    ctx.stroke();
  }

  ctx.strokeStyle = style.color;
  ctx.lineWidth = (style.lineWidth ?? 1.25) * ratio;
  ctx.setLineDash((style.dash ?? []).map((d) => d * ratio));
  ctx.lineJoin = "round";
  ctx.lineCap = "round";
  ctx.beginPath();

  if (count > W) {
    // Denser than the display: one min/max band per column.
    const need = W * 2;
    const cols = scratch && scratch.length >= need ? scratch : new Float32Array(need);
    columns(buf, start, count, W, cols);
    for (let c = 0; c < W; ++c) {
      const x = c + 0.5;
      const yTop = mid - cols[2 * c + 1] * amp;
      const yBot = mid - cols[2 * c] * amp;
      ctx.moveTo(x, yTop);
      ctx.lineTo(x, yBot === yTop ? yBot + 0.01 : yBot);
    }
  } else {
    // Sparser than the display: a polyline through the actual samples.
    const step = W / Math.max(1, count - 1);
    for (let i = 0; i < count; ++i) {
      const s = start + i;
      const y = mid - (s < buf.length ? buf[s] : 0) * amp;
      if (i === 0) ctx.moveTo(0, y);
      else ctx.lineTo(i * step, y);
    }
  }

  ctx.stroke();
  ctx.setLineDash([]);
}
