import { describe, it, expect } from "vitest";
import { getEngineEntry, modelFor } from "./registry";

// EngineModel.struck drives Show me's stepped sweep and knob audition's
// re-strike. A wrong flag either sweeps over a dead note or stutters a pad.
describe("struck models", () => {
  const struck = (engine: string) =>
    getEngineEntry(engine)!.models.filter((m) => m.struck).map((m) => m.code);

  it("flags every Rings model: each note is a strum", () => {
    const rings = getEngineEntry("rings")!.models;
    expect(rings.length).toBeGreaterThan(0);
    expect(rings.every((m) => m.struck)).toBe(true);
  });

  it("flags only Braids' struck, plucked and drum models", () => {
    expect(struck("braids").sort()).toEqual(["BELL", "CYMB", "DRUM", "KICK", "PLUK", "SNAR"]);
  });

  it("flags only Plaits' string, modal and drum models", () => {
    expect(struck("plaits").sort()).toEqual(["BD", "HH", "MODL", "SD", "STRG"]);
  });

  it("flags nothing on Laxsynth: every note sustains", () => {
    expect(struck("laxsynth")).toEqual([]);
  });
});

describe("modelFor", () => {
  it("looks up the model by lowercase code", () => {
    expect(modelFor("braids", "kick")?.code).toBe("KICK");
  });
  it("falls back to the first model for an unknown or empty code", () => {
    expect(modelFor("braids", null)?.code).toBe("CSAW");
    expect(modelFor("braids", "nope")?.code).toBe("CSAW");
  });
});

// The ruler's words restate the card; they must never claim something the
// card's own text doesn't. Every word (3+ letters) of every ruler label has to
// appear in that card's text.
describe("ruler words come from the card text", () => {
  for (const engine of ["braids", "plaits", "laxsynth", "rings"]) {
    it(`${engine}: no ruler word the text doesn't say`, () => {
      const bad: string[] = [];
      for (const m of getEngineEntry(engine)!.models) {
        for (const k of m.knobs) {
          const r = k.range;
          if (!r) continue;
          const text = k.text.toLowerCase();
          const labels = [r.lo, r.hi, ...(r.marks ?? []).map((x) => x.label)].filter(Boolean) as string[];
          for (const label of labels) {
            for (const w of label.toLowerCase().split(/[^a-z]+/).filter((w) => w.length >= 3)) {
              if (!text.includes(w)) bad.push(`${m.code}/${k.id}: "${w}"`);
            }
          }
          for (const mk of r.marks ?? []) if (mk.at <= 0 || mk.at >= 1) bad.push(`${m.code}/${k.id}: mark at ${mk.at}`);
        }
      }
      expect(bad).toEqual([]);
    });
  }
});
