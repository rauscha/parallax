/**
 * Snap-to-scale — folds the melody's `key` + `scale` fields into a helper
 * that nudges a MIDI note to the nearest in-scale neighbour. Chromatic = no
 * snap. Cached per (key, scale) pair, so the hot path (every placement
 * commit) costs one dictionary lookup.
 */
import { Scale, Note } from "@tonaljs/tonal";
import type { Melody } from "../state/stores";

type ScaleId = Melody["scale"];

const TONAL_NAME: Record<ScaleId, string> = {
  major: "major",
  minor: "minor",
  pentatonic: "major pentatonic",
  chromatic: "chromatic",
};

const maskCache = new Map<string, number>();

function maskFor(key: string, scale: ScaleId): number {
  const cacheKey = `${key}|${scale}`;
  const hit = maskCache.get(cacheKey);
  if (hit !== undefined) return hit;
  const notes = Scale.get(`${key} ${TONAL_NAME[scale]}`).notes;
  let mask = 0;
  for (const n of notes) {
    const c = Note.chroma(n);
    if (c !== undefined) mask |= 1 << c;
  }
  // Fallback: malformed key string would yield 0 — treat as "all notes pass through".
  if (mask === 0) mask = 0xfff;
  maskCache.set(cacheKey, mask);
  return mask;
}

/**
 * Returns the nearest MIDI value to `midi` whose pitch class is in the
 * scale defined by (key, scale). Ties prefer the upward direction.
 * Chromatic short-circuits.
 */
export function snapToScale(midi: number, key: string, scale: ScaleId): number {
  if (scale === "chromatic") return midi;
  const mask = maskFor(key, scale);
  if (mask === 0xfff) return midi;
  for (let dist = 0; dist <= 6; dist++) {
    const up = midi + dist;
    if (mask & (1 << (((up % 12) + 12) % 12))) return up;
    if (dist === 0) continue;
    const down = midi - dist;
    if (mask & (1 << (((down % 12) + 12) % 12))) return down;
  }
  return midi;
}

/**
 * Snap a freshly-clicked MIDI to the nearest in-scale neighbour, preferring
 * candidates that stay on the clicked staff position. So clicking the B line
 * in F major snaps to Bb (still on the B line, with a flat) rather than
 * jumping up to C5. Flat-key default uses the flat candidate before the
 * sharp candidate; sharp-key default does the reverse.
 */
export function snapAtPosition(midi: number, key: string, scale: ScaleId): number {
  if (scale === "chromatic") return midi;
  const mask = maskFor(key, scale);
  if (mask === 0xfff) return midi;
  if (mask & (1 << (((midi % 12) + 12) % 12))) return midi;
  const order = preferFlats(key, scale)
    ? [midi - 1, midi + 1]
    : [midi + 1, midi - 1];
  for (const c of order) {
    if (mask & (1 << (((c % 12) + 12) % 12))) return c;
  }
  return snapToScale(midi, key, scale);
}

/** Flat-default rule: an explicit-flat key always uses flats; for naturals
 *  we look at the scale to decide. F-major, D-/G-/C-minor are flat keys
 *  without a "b" in their name; A-minor / C-major are natural. */
export function preferFlats(key: string, scale?: ScaleId): boolean {
  if (key.endsWith("b")) return true;
  if (key.endsWith("#")) return false;
  if (key === "F") return true;
  if (scale === "minor") {
    return key === "D" || key === "G" || key === "C" || key === "F";
  }
  return false;
}
