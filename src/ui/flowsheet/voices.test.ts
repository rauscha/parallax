/**
 * The flowsheet's voice picker lists the corpus grouped by family. The grouping
 * itself lives in Flowsheet.svelte (it is three lines over a compile-time
 * constant), so what is worth guarding is the corpus-shaped assumptions the
 * picker makes — the ones that would break it silently:
 *
 *   - a code that does not resolve, so picking a voice does nothing
 *   - a case mismatch, which is exactly how it fails: `indexForCode` and
 *     `bindings.ts` both work in lowercase, so writing the code as authored
 *     looks correct and silently changes nothing
 *   - a duplicate name, so two options read identically in the list
 *   - a missing family, which would render an unlabelled group
 */
import { describe, it, expect } from "vitest";
import { FM_MODELS } from "../../data/fm-models";
import { indexForCode } from "../../audio/registry";

describe("the flowsheet voice picker's assumptions about the corpus", () => {
  it("has a family on every model, so no group renders unlabelled", () => {
    for (const m of FM_MODELS) {
      expect(m.family, `${m.name} has no family`).toBeTruthy();
      expect(typeof m.family).toBe("string");
    }
  });

  it("resolves every model's lowercased code back to that model", () => {
    // This is the whole contract of pickVoice(). If it fails, selecting that
    // voice is a no-op with no error anywhere.
    for (const m of FM_MODELS) {
      const i = indexForCode("fm", m.code.toLowerCase());
      expect(i, `${m.name} (${m.code}) did not resolve`).toBeGreaterThanOrEqual(0);
      expect(FM_MODELS[i].code, `${m.code} resolved to the wrong model`).toBe(m.code);
    }
  });

  it("keeps codes unique case-insensitively, so lowercasing cannot collide", () => {
    const seen = new Set<string>();
    for (const m of FM_MODELS) {
      const key = m.code.toLowerCase();
      expect(seen.has(key), `duplicate code ${m.code}`).toBe(false);
      seen.add(key);
    }
  });

  it("keeps names unique, so no two options read the same in the list", () => {
    const seen = new Set<string>();
    for (const m of FM_MODELS) {
      expect(seen.has(m.name), `duplicate name ${m.name}`).toBe(false);
      seen.add(m.name);
    }
  });

  it("groups the whole corpus without losing or duplicating a model", () => {
    // Mirrors the grouping in Flowsheet.svelte: every model lands in exactly
    // one family group, and the groups together are the corpus.
    const byFamily = new Map<string, string[]>();
    for (const m of FM_MODELS) {
      const g = byFamily.get(m.family);
      if (g) g.push(m.code);
      else byFamily.set(m.family, [m.code]);
    }
    const flat = [...byFamily.values()].flat();
    expect(flat.length).toBe(FM_MODELS.length);
    expect(new Set(flat).size).toBe(FM_MODELS.length);
  });
});
