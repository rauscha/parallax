/**
 * Patch + melody (de)serialization — the canonical wire form shared by both
 * the share-URL links (M5) and the local preset library. PURE and DOM-free:
 * it imports only *types* from `stores`, so it has no runtime imports at all
 * and is safe to unit-test under Node.
 *
 * The wire form is a small JSON object with short keys + event tuples, kept
 * compact because share-URLs put it in `location.hash`. lz-string compression
 * (done in `share-url.ts`, not here) squeezes it further; this layer only owns
 * the shape, the versioning, and — crucially — the *defensive decode*: a hand-
 * edited or stale link must never throw or seed garbage, so every field is
 * coerced/clamped and bad events are dropped rather than trusted.
 *
 * Engine-agnostic by design: `engineId` is carried as an opaque string. An
 * unknown engine falls back to "braids" here; the apply path
 * (`engineEntryOrDefault`) makes the same choice, so a link minted by a build
 * that has an engine this build lacks degrades gracefully instead of breaking.
 */
import type { Patch, Melody, MelodyEvent } from "./stores";

/** Bump when the wire shape changes incompatibly. `decodeState` rejects
 *  versions it doesn't understand (a future reader adds migration here). */
export const WIRE_VERSION = 1;

export interface SharedState {
  patch: Patch;
  melody: Melody;
}

const SCALES = ["major", "minor", "pentatonic", "chromatic"] as const;
type ScaleName = (typeof SCALES)[number];

// Accidental ⇄ small int so the event tuple stays numeric. 0 = none.
const ACC_CODE: Record<NonNullable<MelodyEvent["accidental"]>, number> = {
  sharp: 1,
  flat: 2,
  natural: 3,
};
const ACC_NAME = ["", "sharp", "flat", "natural"] as const;

const TOTAL_STEPS = 64; // 4 bars × 16 sixteenth steps — matches part.ts

// ---- encode ---------------------------------------------------------------

/** Round knob values to 4 dp — imperceptible on a 0..1 (or modest) range, but
 *  it trims a lot of "0.7000000000000001" noise out of the compressed URL. */
function roundParams(params: Record<string, number>): Record<string, number> {
  const out: Record<string, number> = {};
  for (const [k, v] of Object.entries(params)) {
    if (typeof v === "number" && Number.isFinite(v)) {
      out[k] = Math.round(v * 1e4) / 1e4;
    }
  }
  return out;
}

// Event → tuple [startStep, durationSteps, midi, position|null, accCode].
function encodeEvent(e: MelodyEvent): Array<number | null> {
  return [
    e.startStep,
    e.durationSteps,
    e.midi,
    e.position ?? null,
    e.accidental ? ACC_CODE[e.accidental] : 0,
  ];
}

/** Serialize patch + melody to the canonical JSON wire string. */
export function encodeState(patch: Patch, melody: Melody): string {
  const wire = {
    v: WIRE_VERSION,
    p: {
      e: patch.engineId,
      m: patch.modelId,
      pr: roundParams(patch.params),
    },
    s: {
      t: melody.tempo,
      k: melody.key,
      sc: melody.scale,
      ev: melody.events.map(encodeEvent),
    },
  };
  return JSON.stringify(wire);
}

// ---- decode (defensive) ---------------------------------------------------

function clampTempo(t: unknown): number {
  const n = Math.round(Number(t));
  if (!Number.isFinite(n)) return 120;
  return Math.max(40, Math.min(240, n));
}

function sanitizeParams(pr: unknown): Record<string, number> {
  const out: Record<string, number> = {};
  if (pr && typeof pr === "object") {
    for (const [k, v] of Object.entries(pr as Record<string, unknown>)) {
      const n = Number(v);
      if (typeof k === "string" && Number.isFinite(n)) out[k] = n;
    }
  }
  return out;
}

function isScale(s: unknown): s is ScaleName {
  return typeof s === "string" && (SCALES as readonly string[]).includes(s);
}

function decodeEvent(raw: unknown): MelodyEvent | null {
  if (!Array.isArray(raw)) return null;
  const [startStep, durationSteps, midi, position, accCode] = raw;
  const start = Math.round(Number(startStep));
  const dur = Math.round(Number(durationSteps));
  const note = Math.round(Number(midi));
  if (!Number.isFinite(start) || start < 0 || start >= TOTAL_STEPS) return null;
  if (!Number.isFinite(dur) || dur < 1) return null;
  if (!Number.isFinite(note) || note < 0 || note > 127) return null;

  const ev: MelodyEvent = { startStep: start, durationSteps: dur, midi: note };

  if (position != null && Number.isFinite(Number(position))) {
    ev.position = Math.round(Number(position));
  }
  const acc = Math.round(Number(accCode));
  if (acc >= 1 && acc <= 3) ev.accidental = ACC_NAME[acc] as MelodyEvent["accidental"];

  return ev;
}

/**
 * Parse a wire JSON string back to a validated {patch, melody}. Returns null
 * for anything it can't trust (bad JSON, missing sections, unknown version) so
 * callers can cleanly ignore a broken link. Individual bad events are dropped,
 * not fatal — a partially-corrupt melody still loads its good notes.
 */
export function decodeState(json: string): SharedState | null {
  let wire: unknown;
  try {
    wire = JSON.parse(json);
  } catch {
    return null;
  }
  if (!wire || typeof wire !== "object") return null;
  const w = wire as Record<string, unknown>;
  if (w.v !== WIRE_VERSION) return null; // future: migrate older versions here
  const p = w.p as Record<string, unknown> | undefined;
  const s = w.s as Record<string, unknown> | undefined;
  if (!p || !s) return null;

  const patch: Patch = {
    version: 1,
    engineId: typeof p.e === "string" && p.e ? p.e : "braids",
    modelId: typeof p.m === "string" ? p.m : null,
    params: sanitizeParams(p.pr),
  };

  const melody: Melody = {
    tempo: clampTempo(s.t),
    key: typeof s.k === "string" && s.k ? s.k : "C",
    scale: isScale(s.sc) ? s.sc : "major",
    events: Array.isArray(s.ev)
      ? (s.ev.map(decodeEvent).filter(Boolean) as MelodyEvent[])
      : [],
  };

  return { patch, melody };
}
