// Tiny iterative radix-2 Cooley–Tukey FFT. Pure, dependency-free, deterministic
// — lives in `audio/` with the rest of the testable DSP. Used by
// `sample-analysis.ts` for the spectral centroid (brightness) of a clip.
//
// Not the fastest FFT around, but the windows we transform are small (≤ 16384)
// and it runs once per region selection, so clarity beats cleverness here.

/**
 * In-place complex FFT. `re`/`im` are equal-length arrays; length MUST be a
 * power of two. On return they hold the transform (frequency domain).
 */
export function fftRadix2(re: Float32Array, im: Float32Array): void {
  const n = re.length;
  if (n <= 1) return;
  if ((n & (n - 1)) !== 0) {
    throw new Error(`fftRadix2: length must be a power of two, got ${n}`);
  }

  // Bit-reversal permutation.
  for (let i = 1, j = 0; i < n; i++) {
    let bit = n >> 1;
    for (; j & bit; bit >>= 1) j ^= bit;
    j ^= bit;
    if (i < j) {
      const tr = re[i]; re[i] = re[j]; re[j] = tr;
      const ti = im[i]; im[i] = im[j]; im[j] = ti;
    }
  }

  // Danielson–Lanczos butterflies, stage by stage.
  for (let len = 2; len <= n; len <<= 1) {
    const ang = (-2 * Math.PI) / len;
    const wr = Math.cos(ang);
    const wi = Math.sin(ang);
    const half = len >> 1;
    for (let i = 0; i < n; i += len) {
      let cr = 1;
      let ci = 0;
      for (let k = 0; k < half; k++) {
        const a = i + k;
        const b = a + half;
        const tr = cr * re[b] - ci * im[b];
        const ti = cr * im[b] + ci * re[b];
        re[b] = re[a] - tr;
        im[b] = im[a] - ti;
        re[a] += tr;
        im[a] += ti;
        const ncr = cr * wr - ci * wi;
        ci = cr * wi + ci * wr;
        cr = ncr;
      }
    }
  }
}

/**
 * Magnitude spectrum of a real-valued signal. Length must be a power of two;
 * returns the lower half (bins 0 … N/2-1, i.e. DC up to just below Nyquist).
 */
export function magnitudeSpectrum(signal: Float32Array): Float32Array {
  const n = signal.length;
  const re = new Float32Array(n);
  const im = new Float32Array(n);
  re.set(signal);
  fftRadix2(re, im);
  const half = n >> 1;
  const mag = new Float32Array(half);
  for (let i = 0; i < half; i++) mag[i] = Math.hypot(re[i], im[i]);
  return mag;
}

/** Largest power of two ≤ n (minimum 1). */
export function prevPow2(n: number): number {
  let p = 1;
  while (p * 2 <= n) p *= 2;
  return p;
}
