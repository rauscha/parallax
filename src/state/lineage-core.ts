/**
 * Patch-lineage ("Recent sounds") — PURE ring logic. No idb, no Svelte, no DOM,
 * so it is unit-testable under Node (mirrors the project's pure-layer convention:
 * serialization.ts / part.ts / grid.ts). The idb persistence + store wiring live
 * in the impure shell `lineage.ts`, which imports these helpers.
 *
 * The ring stores the OUTGOING sound — the one you're leaving — newest-first, so
 * the list reads as "sounds I can step back to." The currently-live sound is not
 * in the ring (you're already on it).
 */
import type { Patch, Melody } from "./stores";
import { encodeState } from "./serialization";

/** Max entries kept. Short by design — a high-value trail, not a library. */
export const CAP = 10;

/**
 * Which generative action put this sound into history:
 * - surprise: displaced by a "Surprise me" roll
 * - match:    displaced by a Match-panel Apply
 * - restore:  displaced by stepping back to an earlier recent sound
 *
 * Note: the label = the action DISPLACING this sound, not necessarily the one that
 * created it. True-to-content in the common case (repeated rolls); a close-enough
 * breadcrumb otherwise.
 */
export type LineageSource = "surprise" | "match" | "restore";

export interface LineageEntry {
  wire: string;            // encodeState(patch, melody) — same format as presets/URLs
  savedAt: number;         // epoch ms, for the "2m ago" label
  engineId: string;        // summary field — render the row without decoding the blob
  modelId: string | null;
  source: LineageSource;   // drives the row's leading glyph
}

/**
 * Build a ring entry from the live patch + melody. `now` is injected (rather than
 * read from Date.now() here) so the builder stays pure/testable; the shell passes
 * Date.now().
 */
export function buildEntry(
  patch: Patch,
  melody: Melody,
  source: LineageSource,
  now: number,
): LineageEntry {
  return {
    wire: encodeState(patch, melody),
    savedAt: now,
    engineId: patch.engineId,
    modelId: patch.modelId,
    source,
  };
}

/**
 * Prepend newest-first, skip if the wire is identical to the current head (so a
 * no-op re-roll doesn't churn the list), and cap to CAP. Returns the SAME array
 * reference when it dedups, so callers can detect the no-op by identity.
 */
export function pushSnapshot(ring: LineageEntry[], entry: LineageEntry): LineageEntry[] {
  if (ring[0]?.wire === entry.wire) return ring;   // dedup against head only
  return [entry, ...ring].slice(0, CAP);
}

/**
 * Merge live (in-memory) entries with persisted ones on hydration: keep live
 * newest-first, append persisted after, drop duplicate wires (first occurrence
 * wins, so a fresh roll captured before hydration isn't clobbered), cap to CAP.
 */
export function mergeRing(live: LineageEntry[], persisted: LineageEntry[]): LineageEntry[] {
  const out: LineageEntry[] = [];
  const seen = new Set<string>();
  for (const e of [...live, ...persisted]) {
    if (seen.has(e.wire)) continue;
    seen.add(e.wire);
    out.push(e);
  }
  return out.slice(0, CAP);
}

const SOURCES: readonly LineageSource[] = ["surprise", "match", "restore"];

/**
 * Shape guard for entries loaded from idb (a corrupt/foreign row must not crash
 * hydration). Validates the fields the UI reads.
 */
export function isValidEntry(x: unknown): x is LineageEntry {
  if (!x || typeof x !== "object") return false;
  const e = x as Record<string, unknown>;
  return (
    typeof e.wire === "string" &&
    typeof e.savedAt === "number" &&
    typeof e.engineId === "string" &&
    (e.modelId === null || typeof e.modelId === "string") &&
    typeof e.source === "string" &&
    (SOURCES as readonly string[]).includes(e.source)
  );
}
