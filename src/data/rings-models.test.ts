import { describe, it, expect } from "vitest";
import { RINGS_MODELS, RINGS_FAMILIES } from "./rings-models";
import { RingsEngine } from "../audio/engines/RingsEngine";

describe("rings catalogue integrity", () => {
  it("has 12 models with contiguous indices 0..11", () => {
    expect(RINGS_MODELS.length).toBe(12);
    RINGS_MODELS.forEach((m, i) => expect(m.index).toBe(i));
  });

  it("has unique, hardware-style codes", () => {
    const codes = RINGS_MODELS.map((m) => m.code);
    expect(new Set(codes).size).toBe(codes.length);
    for (const c of codes) expect(c.length).toBeLessThanOrEqual(4);
  });

  it("every model belongs to a declared family, every family is used", () => {
    const famIds = new Set(RINGS_FAMILIES.map((f) => f.id));
    for (const m of RINGS_MODELS) expect(famIds.has(m.family)).toBe(true);
    const used = new Set(RINGS_MODELS.map((m) => m.family));
    for (const f of RINGS_FAMILIES) expect(used.has(f.id)).toBe(true);
  });

  it("every knob card links to a real engine parameter (knob↔card highlight)", () => {
    const schemaIds = new Set(new RingsEngine().getParameterSchema().map((p) => p.id));
    for (const m of RINGS_MODELS) {
      expect(m.knobs.length).toBe(4);
      for (const k of m.knobs) expect(schemaIds.has(k.id)).toBe(true);
    }
  });

  it("every model has full Explain depth (description + listenFor + goodFor)", () => {
    for (const m of RINGS_MODELS) {
      expect(m.description.length).toBeGreaterThan(20);
      expect(m.detail?.listenFor?.length ?? 0).toBeGreaterThan(20);
      expect(m.detail?.goodFor?.length ?? 0).toBeGreaterThan(20);
    }
  });
});
