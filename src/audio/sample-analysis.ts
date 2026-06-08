// Offline analysis of a selected audio region for the "Match a sound" tool.
// Pure + deterministic (no Web Audio, no DOM) so it can be unit-checked against
// synthesized buffers — see `sample-analysis.test.ts`. The browser passes a
// decoded `AudioBuffer` to `analyzeRegion`; the math all lives in
// `analyzeSamples`, which takes a plain Float32Array + sample rate.
//
// Three features, each a deliberately simple, well-understood method:
//   • Pitch      — normalized autocorrelation (good on a solo/exposed mono line)
//   • Brightness — spectral centroid via a Hann-windowed FFT
//   • Envelope   — RMS-window amplitude contour → attack time + decay character

import { magnitudeSpectrum, prevPow2 } from "./fft";

export type Brightness = "low" | "medium" | "high";
export type DecayChar = "plucky" | "evolving" | "sustained";

export interface RegionAnalysis {
  /** Fundamental in Hz, or null when no clear pitch was found (noisy/percussive). */
  freq: number | null;
  /** Rounded MIDI note number, or null. */
  midi: number | null;
  /** Note name like "A4", or null. */
  note: string | null;
  /** Pitch clarity 0..1 (autocorrelation peak height). */
  confidence: number;
  /** Spectral centroid in Hz. */
  centroidHz: number;
  /** Bucketed brightness from the centroid. */
  brightness: Brightness;
  /** Time from region start to ~90% of peak amplitude, in ms. */
  attackMs: number;
  /** Sustain shape: plucky (dies away), sustained (holds), evolving (in between). */
  decayChar: DecayChar;
}

// Pitch search range — covers low bass to the top of most lead lines.
const MIN_FREQ = 50;
const MAX_FREQ = 2000;
// Cap the window the pitch/centroid math sees, so cost is bounded regardless of
// region length (a couple of hundred ms of steady tone is plenty).
const MAX_ANALYSIS_SAMPLES = 1 << 14; // 16384

const PITCH_CLASSES = [
  "C", "C#", "D", "D#", "E", "F", "F#", "G", "G#", "A", "A#", "B",
] as const;

/** MIDI note number for a frequency (A4 = 440 Hz = MIDI 69). */
export function freqToMidi(freq: number): number {
  return Math.round(12 * Math.log2(freq / 440) + 69);
}

/** Scientific-pitch name for a MIDI number, e.g. 69 → "A4". */
export function midiToNoteName(midi: number): string {
  const pc = PITCH_CLASSES[((midi % 12) + 12) % 12];
  const octave = Math.floor(midi / 12) - 1;
  return `${pc}${octave}`;
}

/** Centered slice of at most `maxLen` samples (the steadiest part of a tone). */
function centeredWindow(x: Float32Array, maxLen: number): Float32Array {
  if (x.length <= maxLen) return x;
  const start = (x.length - maxLen) >> 1;
  return x.subarray(start, start + maxLen);
}

/**
 * Monophonic pitch via normalized autocorrelation. Removes DC, skips the
 * initial correlation descent, then takes the highest peak in the lag range and
 * refines it with parabolic interpolation. Returns null below a clarity floor
 * (silence / noise / dense polyphony).
 */
function detectPitch(
  samples: Float32Array,
  sampleRate: number,
): { freq: number | null; confidence: number } {
  const n = samples.length;
  if (n < 4) return { freq: null, confidence: 0 };

  // DC-remove into a working copy and accumulate energy r0.
  let mean = 0;
  for (let i = 0; i < n; i++) mean += samples[i];
  mean /= n;
  const x = new Float32Array(n);
  let r0 = 0;
  for (let i = 0; i < n; i++) {
    const v = samples[i] - mean;
    x[i] = v;
    r0 += v * v;
  }
  const rms = Math.sqrt(r0 / n);
  if (rms < 1e-4 || r0 === 0) return { freq: null, confidence: 0 };

  const minLag = Math.max(2, Math.floor(sampleRate / MAX_FREQ));
  const maxLag = Math.min(n - 1, Math.ceil(sampleRate / MIN_FREQ));
  if (maxLag <= minLag) return { freq: null, confidence: 0 };

  // Normalized autocorrelation over the lag range (≈1 near lag 0).
  const ac = new Float32Array(maxLag + 1);
  for (let lag = minLag; lag <= maxLag; lag++) {
    let s = 0;
    for (let i = 0; i < n - lag; i++) s += x[i] * x[i + lag];
    ac[lag] = s / r0;
  }

  // Skip the initial descent so we lock onto the fundamental, not lag≈0.
  let lag = minLag;
  while (lag < maxLag && ac[lag + 1] < ac[lag]) lag++;

  // Highest peak in the remaining range.
  let bestLag = lag;
  let bestVal = ac[lag];
  for (let l = lag; l <= maxLag; l++) {
    if (ac[l] > bestVal) { bestVal = ac[l]; bestLag = l; }
  }
  if (bestVal < 0.2) return { freq: null, confidence: Math.max(0, bestVal) };

  // Parabolic interpolation around the peak for sub-sample lag accuracy.
  const y0 = bestLag > minLag ? ac[bestLag - 1] : bestVal;
  const y1 = bestVal;
  const y2 = bestLag < maxLag ? ac[bestLag + 1] : bestVal;
  const denom = y0 - 2 * y1 + y2;
  let shift = denom !== 0 ? (0.5 * (y0 - y2)) / denom : 0;
  shift = Math.max(-1, Math.min(1, shift));
  const refinedLag = bestLag + shift;

  return {
    freq: sampleRate / refinedLag,
    confidence: Math.max(0, Math.min(1, bestVal)),
  };
}

/** Spectral centroid (Hz) of a Hann-windowed frame. Higher = brighter. */
function spectralCentroid(samples: Float32Array, sampleRate: number): number {
  const n = prevPow2(Math.min(samples.length, MAX_ANALYSIS_SAMPLES));
  if (n < 2) return 0;
  const win = new Float32Array(n);
  for (let i = 0; i < n; i++) {
    const w = 0.5 - 0.5 * Math.cos((2 * Math.PI * i) / (n - 1)); // Hann
    win[i] = samples[i] * w;
  }
  const mag = magnitudeSpectrum(win);
  let num = 0;
  let den = 0;
  for (let i = 1; i < mag.length; i++) { // skip DC bin
    const f = (i * sampleRate) / n;
    num += f * mag[i];
    den += mag[i];
  }
  return den > 0 ? num / den : 0;
}

function centroidToBrightness(centroidHz: number): Brightness {
  if (centroidHz < 1500) return "low";
  if (centroidHz < 3500) return "medium";
  return "high";
}

/**
 * Amplitude contour → attack time and decay character. RMS over ~5 ms hops, then
 * attack = time to first reach 90% of peak, decay = level of the final 15%
 * relative to the peak.
 */
function analyzeEnvelope(
  samples: Float32Array,
  sampleRate: number,
): { attackMs: number; decayChar: DecayChar } {
  const hop = Math.max(1, Math.floor((sampleRate * 5) / 1000)); // ~5 ms
  const frames = Math.floor(samples.length / hop);
  if (frames < 2) return { attackMs: 0, decayChar: "sustained" };

  const env = new Float32Array(frames);
  let peak = 0;
  let peakIdx = 0;
  for (let f = 0; f < frames; f++) {
    const start = f * hop;
    let s = 0;
    for (let i = 0; i < hop; i++) { const v = samples[start + i]; s += v * v; }
    const r = Math.sqrt(s / hop);
    env[f] = r;
    if (r > peak) { peak = r; peakIdx = f; }
  }
  if (peak < 1e-4) return { attackMs: 0, decayChar: "sustained" };

  // Attack: first frame reaching 90% of peak (bounded by the peak frame).
  const atkThresh = 0.9 * peak;
  let atkFrame = peakIdx;
  for (let f = 0; f <= peakIdx; f++) {
    if (env[f] >= atkThresh) { atkFrame = f; break; }
  }
  const attackMs = ((atkFrame * hop) / sampleRate) * 1000;

  // Decay: mean of the final 15% of frames vs the peak.
  const tailStart = Math.floor(frames * 0.85);
  let tail = 0;
  let count = 0;
  for (let f = tailStart; f < frames; f++) { tail += env[f]; count++; }
  const sustainRatio = count > 0 ? tail / count / peak : 0;

  let decayChar: DecayChar;
  if (sustainRatio < 0.3) decayChar = "plucky";
  else if (sustainRatio > 0.6) decayChar = "sustained";
  else decayChar = "evolving";

  return { attackMs, decayChar };
}

/** Analyze a raw mono sample window. The pure core — fully testable. */
export function analyzeSamples(
  samples: Float32Array,
  sampleRate: number,
): RegionAnalysis {
  const win = centeredWindow(samples, MAX_ANALYSIS_SAMPLES);

  const { freq, confidence } = detectPitch(win, sampleRate);
  const midi = freq != null ? freqToMidi(freq) : null;
  const note = midi != null ? midiToNoteName(midi) : null;

  const centroidHz = spectralCentroid(win, sampleRate);
  const brightness = centroidToBrightness(centroidHz);

  const { attackMs, decayChar } = analyzeEnvelope(samples, sampleRate);

  return { freq, midi, note, confidence, centroidHz, brightness, attackMs, decayChar };
}

/**
 * Analyze a time region of a decoded buffer (channel 0). Thin browser-facing
 * wrapper over `analyzeSamples`.
 */
export function analyzeRegion(
  buffer: AudioBuffer,
  startSec: number,
  endSec: number,
): RegionAnalysis {
  const sr = buffer.sampleRate;
  const ch = buffer.getChannelData(0);
  const s = Math.max(0, Math.floor(startSec * sr));
  const e = Math.min(ch.length, Math.floor(endSec * sr));
  const slice = ch.subarray(s, Math.max(s + 1, e));
  return analyzeSamples(slice, sr);
}
