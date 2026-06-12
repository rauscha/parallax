import { describe, it, expect } from "vitest";
import { encodeState, decodeState, WIRE_VERSION } from "./serialization";
import type { Patch, Melody } from "./stores";

const patch: Patch = {
  version: 1,
  engineId: "plaits",
  modelId: "va",
  params: { harmonics: 0.3, timbre: 0.7, morph: 0.4213, note: 48 },
};

const melody: Melody = {
  tempo: 132,
  key: "Eb",
  scale: "minor",
  events: [
    { startStep: 0, durationSteps: 4, midi: 63 },
    { startStep: 8, durationSteps: 2, midi: 67, position: 5, accidental: "flat" },
    { startStep: 24, durationSteps: 8, midi: 60 },
  ],
};

describe("serialization round-trip", () => {
  it("re-encodes to an identical wire string (deep-equal)", () => {
    const wire = encodeState(patch, melody);
    const state = decodeState(wire);
    expect(state).not.toBeNull();
    expect(encodeState(state!.patch, state!.melody)).toBe(wire);
  });

  it("preserves engine, model, tempo, key, scale and events", () => {
    const state = decodeState(encodeState(patch, melody))!;
    expect(state.patch.engineId).toBe("plaits");
    expect(state.patch.modelId).toBe("va");
    expect(state.melody.tempo).toBe(132);
    expect(state.melody.key).toBe("Eb");
    expect(state.melody.scale).toBe("minor");
    expect(state.melody.events).toHaveLength(3);
    expect(state.melody.events[1].accidental).toBe("flat");
    expect(state.melody.events[1].position).toBe(5);
  });

  it("rounds params to 4 dp", () => {
    const state = decodeState(encodeState(patch, melody))!;
    expect(state.patch.params.morph).toBeCloseTo(0.4213, 6);
  });

  it("uses the current wire version", () => {
    const wire = JSON.parse(encodeState(patch, melody));
    expect(wire.v).toBe(WIRE_VERSION);
  });
});

describe("decodeState defends against hostile / malformed wires (A6 clamps)", () => {
  function hostile(over: Record<string, unknown>): string {
    return JSON.stringify({
      v: 1,
      p: { e: "braids", m: "csaw", pr: {} },
      s: { t: 120, k: "C", sc: "major", ev: [], ...over },
    });
  }

  it("returns null for bad JSON", () => {
    expect(decodeState("{not json")).toBeNull();
  });

  it("returns null for an unknown version", () => {
    expect(decodeState(JSON.stringify({ v: 999, p: {}, s: {} }))).toBeNull();
  });

  it("caps the decoded event count at 256", () => {
    const ev = Array.from({ length: 500_000 }, () => [0, 4, 60]);
    const state = decodeState(hostile({ ev }))!;
    expect(state.melody.events.length).toBeLessThanOrEqual(256);
  });

  it("clamps an enormous durationSteps to the loop length (64)", () => {
    const state = decodeState(hostile({ ev: [[0, 1e9, 60]] }))!;
    expect(state.melody.events[0].durationSteps).toBe(64);
  });

  it("clamps an out-of-range position to +/-40", () => {
    const state = decodeState(hostile({ ev: [[0, 4, 60, 2e9, 0]] }))!;
    expect(Math.abs(state.melody.events[0].position!)).toBeLessThanOrEqual(40);
  });

  it("drops events outside the step / midi range without throwing", () => {
    const state = decodeState(hostile({ ev: [[999, 4, 60], [0, 4, 200], [4, 4, 64]] }))!;
    // only the last (in-range) event survives
    expect(state.melody.events).toHaveLength(1);
    expect(state.melody.events[0].midi).toBe(64);
  });

  it("falls back to defaults for out-of-range tempo / unknown scale", () => {
    const state = decodeState(hostile({ t: 99999, sc: "lydian-bogus" }))!;
    expect(state.melody.tempo).toBeLessThanOrEqual(240);
    expect(state.melody.scale).toBe("major");
  });
});
