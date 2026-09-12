/**
 * A small real-input FFT, for the flowsheet's spectrum pane.
 *
 * **Why not the existing `Spectrum.svelte`.** Its frequency axis is already
 * logarithmic, so half of spec §9's open question was answered before it was
 * asked. The half that wasn't: it aggregates the analyser's bins into 56
 * peak-held bars, and 56 bars across the audible range cannot separate adjacent
 * FM sidebands — exactly the thing the flowsheet's spectrum exists to show. A
 * carrier at 261 Hz modulated at 261 Hz puts sidebands every 261 Hz, and they
 * have to read as *lines* for "the sidebands step outward as you turn this up"
 * to be visible at all.
 *
 * **Why compute it here rather than read an AnalyserNode.** The analyser sits
 * after the resampler, at the context rate, on the summed engine output. The
 * flowsheet's traces are tap data: engine rate, pre-resample, the same samples
 * the operators produced. Two panes claiming to show the same signal should be
 * computed from the same samples, or the claim is decoration. So the spectrum is
 * the FFT of the output tap — literally the frequency-domain view of the trace
 * drawn beside it.
 *
 * Nothing clever: iterative radix-2 Cooley-Tukey, real input, Hann window. At
 * 1024 points and ~60 Hz it costs on the order of 10k butterflies per frame on
 * the main thread, which is nothing next to the drawing.
 */

/** Hann window of length `n`, cached — the window never changes size in practice. */
const windows = new Map<number, Float32Array>();
export function hann(n: number): Float32Array {
  let w = windows.get(n);
  if (!w) {
    w = new Float32Array(n);
    for (let i = 0; i < n; ++i) w[i] = 0.5 - 0.5 * Math.cos((2 * Math.PI * i) / (n - 1));
    windows.set(n, w);
  }
  return w;
}

/** Bit-reversal permutation table for size `n`, cached. */
const revs = new Map<number, Uint32Array>();
function reversal(n: number): Uint32Array {
  let r = revs.get(n);
  if (!r) {
    const bits = Math.log2(n) | 0;
    r = new Uint32Array(n);
    for (let i = 0; i < n; ++i) {
      let x = i;
      let y = 0;
      for (let b = 0; b < bits; ++b) { y = (y << 1) | (x & 1); x >>= 1; }
      r[i] = y;
    }
    revs.set(n, r);
  }
  return r;
}

/**
 * In-place complex FFT. `re`/`im` must be the same power-of-two length.
 * Exported for the test; callers normally want `spectrumDb`.
 */
export function fft(re: Float32Array, im: Float32Array): void {
  const n = re.length;
  if (n < 2 || (n & (n - 1)) !== 0) throw new Error(`fft: length ${n} is not a power of two`);
  const rev = reversal(n);
  for (let i = 0; i < n; ++i) {
    const j = rev[i];
    if (j > i) {
      let t = re[i]; re[i] = re[j]; re[j] = t;
      t = im[i]; im[i] = im[j]; im[j] = t;
    }
  }
  for (let size = 2; size <= n; size <<= 1) {
    const half = size >> 1;
    const step = (-2 * Math.PI) / size;
    for (let i = 0; i < n; i += size) {
      for (let k = 0; k < half; ++k) {
        const ang = step * k;
        const wr = Math.cos(ang);
        const wi = Math.sin(ang);
        const a = i + k;
        const b = a + half;
        const xr = re[b] * wr - im[b] * wi;
        const xi = re[b] * wi + im[b] * wr;
        re[b] = re[a] - xr;
        im[b] = im[a] - xi;
        re[a] += xr;
        im[a] += xi;
      }
    }
  }
}

/**
 * Magnitude spectrum of `count` real samples from `buf[start..]`, in decibels
 * relative to full scale, written into `out` (length `count / 2`).
 *
 * `floorDb` is the bottom of the scale; anything quieter is clamped to it, so a
 * silent operator reads as a flat floor rather than as -Infinity.
 *
 * Scratch buffers are caller-owned via `work` so a draw loop allocates nothing.
 */
export function spectrumDb(
  buf: Float32Array,
  start: number,
  count: number,
  out: Float32Array,
  work: { re: Float32Array; im: Float32Array },
  floorDb = -96,
): void {
  const w = hann(count);
  const { re, im } = work;
  const limit = buf.length;
  for (let i = 0; i < count; ++i) {
    const s = start + i;
    re[i] = (s < limit ? buf[s] : 0) * w[i];
    im[i] = 0;
  }
  fft(re, im);
  const bins = count >> 1;
  // Hann's coherent gain is 0.5, and a real signal splits energy between the
  // positive and negative frequency, so a full-scale sine peaks at count/4.
  const norm = 4 / count;
  for (let k = 0; k < bins; ++k) {
    const mag = Math.hypot(re[k], im[k]) * norm;
    const db = mag > 0 ? 20 * Math.log10(mag) : floorDb;
    out[k] = db < floorDb ? floorDb : db;
  }
}

/** Allocate the scratch pair `spectrumDb` needs for a given FFT size. */
export function fftWork(n: number): { re: Float32Array; im: Float32Array } {
  return { re: new Float32Array(n), im: new Float32Array(n) };
}
