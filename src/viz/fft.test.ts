// The spectrum pane's arithmetic. A spectrum is the easiest thing in the app to
// get plausibly wrong — a wrong normalisation, an off-by-one bin, or a missing
// window still draws something that looks like a spectrum. So it is checked
// against signals whose spectra are known exactly.

import { describe, it, expect } from "vitest";
import { fft, spectrumDb, fftWork, hann } from "./fft";

const N = 1024;
const SR = 44100;

/** `cycles` whole cycles of a sine across N samples, amplitude `amp`. */
function sine(n: number, cycles: number, amp = 1, phase = 0): Float32Array {
  const out = new Float32Array(n);
  for (let i = 0; i < n; ++i) out[i] = amp * Math.sin(2 * Math.PI * (cycles * i / n + phase));
  return out;
}

function peakBin(mag: Float32Array): number {
  let best = 0;
  for (let i = 1; i < mag.length; ++i) if (mag[i] > mag[best]) best = i;
  return best;
}

describe("fft", () => {
  it("rejects a non-power-of-two length", () => {
    expect(() => fft(new Float32Array(100), new Float32Array(100))).toThrow(/power of two/);
  });

  it("transforms a constant into a single DC bin", () => {
    const re = new Float32Array(8).fill(1);
    const im = new Float32Array(8);
    fft(re, im);
    expect(re[0]).toBeCloseTo(8, 5);
    for (let k = 1; k < 8; ++k) {
      expect(Math.hypot(re[k], im[k]), `bin ${k}`).toBeCloseTo(0, 5);
    }
  });

  it("round-trips through an inverse transform", () => {
    // Inverse = conjugate, forward, conjugate, scale. If the butterflies or the
    // bit reversal were wrong, this would not come back.
    const n = 64;
    const re = new Float32Array(n);
    const im = new Float32Array(n);
    for (let i = 0; i < n; ++i) re[i] = Math.sin(i) + 0.3 * Math.cos(3 * i);
    const orig = Float32Array.from(re);
    fft(re, im);
    for (let i = 0; i < n; ++i) im[i] = -im[i];
    fft(re, im);
    for (let i = 0; i < n; ++i) {
      expect(re[i] / n, `sample ${i}`).toBeCloseTo(orig[i], 4);
    }
  });
});

describe("spectrumDb", () => {
  const work = fftWork(N);
  const out = new Float32Array(N / 2);

  it("puts a sine in its own bin", () => {
    // 64 whole cycles across 1024 samples is exactly bin 64.
    spectrumDb(sine(N, 64), 0, N, out, work);
    expect(peakBin(out)).toBe(64);
  });

  it("reads a full-scale sine as 0 dBFS", () => {
    // The normalisation claim, stated as a test: this is what makes the pane's
    // dB scale mean anything. Hann's coherent gain and the positive/negative
    // frequency split are both folded into it.
    spectrumDb(sine(N, 64), 0, N, out, work);
    expect(out[64]).toBeCloseTo(0, 1);
  });

  it("reads half amplitude as -6 dB", () => {
    spectrumDb(sine(N, 64, 0.5), 0, N, out, work);
    expect(out[64]).toBeCloseTo(-6, 1);
  });

  it("clamps silence to the floor instead of -Infinity", () => {
    spectrumDb(new Float32Array(N), 0, N, out, work, -96);
    for (const v of out) expect(v).toBe(-96);
  });

  it("separates two partials a few bins apart", () => {
    // The resolution claim — the reason this exists instead of 56 aggregated
    // bars. Two sidebands six bins apart must read as two peaks with a real
    // valley between them.
    const a = sine(N, 60);
    const b = sine(N, 66);
    const mix = new Float32Array(N);
    for (let i = 0; i < N; ++i) mix[i] = (a[i] + b[i]) / 2;
    spectrumDb(mix, 0, N, out, work);
    expect(out[60]).toBeGreaterThan(-10);
    expect(out[66]).toBeGreaterThan(-10);
    expect(out[63]).toBeLessThan(out[60] - 15);   // a genuine valley, not a plateau
  });

  it("finds FM sidebands where the theory puts them", () => {
    // A carrier at bin 128 modulated at bin 16 must show energy at 128 ± 16 and
    // 128 ± 32. This is the picture the pane is for, so it is worth pinning:
    // if the axis or the binning were wrong, the sidebands would not land on
    // the arithmetic the Explain prose promises.
    const carrier = 128;
    const modulator = 16;
    const index = 2;
    const buf = new Float32Array(N);
    for (let i = 0; i < N; ++i) {
      const t = i / N;
      buf[i] = Math.sin(2 * Math.PI * carrier * t + index * Math.sin(2 * Math.PI * modulator * t));
    }
    spectrumDb(buf, 0, N, out, work);
    for (const k of [carrier - 32, carrier - 16, carrier, carrier + 16, carrier + 32]) {
      expect(out[k], `sideband at bin ${k}`).toBeGreaterThan(-25);
    }
    // And nothing in between — sidebands are discrete, not a smear.
    expect(out[carrier + 8], "between sidebands").toBeLessThan(-40);
  });

  it("maps bins to the frequencies the pane will label", () => {
    // Bin k is k * rate / count Hz. Stated here because the axis labels depend
    // on it and an off-by-one would mislabel every harmonic.
    spectrumDb(sine(N, 100), 0, N, out, work);
    expect(peakBin(out) * SR / N).toBeCloseTo(100 * SR / N, 6);
    expect(peakBin(out) * SR / N).toBeCloseTo(4306.6, 0);
  });
});

describe("hann", () => {
  it("is zero at the ends and one in the middle", () => {
    const w = hann(1024);
    expect(w[0]).toBeCloseTo(0, 6);
    expect(w[1023]).toBeCloseTo(0, 6);
    expect(w[512]).toBeCloseTo(1, 3);
  });

  it("returns the same cached array for a repeated size", () => {
    expect(hann(256)).toBe(hann(256));
  });
});
