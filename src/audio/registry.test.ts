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
