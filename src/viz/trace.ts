/**
 * Trace helpers shared by `Oscilloscope.svelte` and `Spectrum.svelte`: the DPR
 * cap, theme-token reads, and the edge trigger that makes a periodic waveform
 * stand still.
 *
 * Everything that can be tested without a canvas (the trigger) is a pure
 * function taking arrays.
 */

/** Device pixel ratio, capped at 2 — beyond that the cost buys nothing visible. */
export function dpr(): number {
  return Math.min(typeof window === "undefined" ? 1 : window.devicePixelRatio || 1, 2);
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
