import { describe, it, expect } from "vitest";
import {
  CAP,
  buildEntry,
  pushSnapshot,
  mergeRing,
  isValidEntry,
  type LineageEntry,
} from "./lineage-core";
import { encodeState } from "./serialization";
import type { Patch, Melody } from "./stores";

const patch: Patch = {
  version: 1,
  engineId: "braids",
  modelId: "csaw",
  params: { timbre: 0.3, color: 0.4 },
};
const melody: Melody = { tempo: 120, key: "C", scale: "major", events: [] };

function entry(wire: string, savedAt = 0): LineageEntry {
  return { wire, savedAt, engineId: "braids", modelId: "csaw", source: "surprise" };
}

describe("buildEntry", () => {
  it("captures the wire (== encodeState), summary fields, source and time", () => {
    const e = buildEntry(patch, melody, "match", 1234);
    expect(e.wire).toBe(encodeState(patch, melody));
    expect(e.engineId).toBe("braids");
    expect(e.modelId).toBe("csaw");
    expect(e.source).toBe("match");
    expect(e.savedAt).toBe(1234);
  });
});

describe("pushSnapshot", () => {
  it("prepends newest-first", () => {
    const ring = pushSnapshot([entry("a")], entry("b"));
    expect(ring.map((e) => e.wire)).toEqual(["b", "a"]);
  });

  it("is a no-op (same reference) when the wire matches the head", () => {
    const start = [entry("a")];
    const ring = pushSnapshot(start, entry("a"));
    expect(ring).toBe(start);
  });

  it("caps at CAP, dropping the oldest", () => {
    let ring: LineageEntry[] = [];
    for (let i = 0; i < CAP + 1; i++) ring = pushSnapshot(ring, entry(`w${i}`));
    expect(ring).toHaveLength(CAP);
    expect(ring[0].wire).toBe(`w${CAP}`);          // newest kept
    expect(ring.at(-1)!.wire).toBe("w1");          // w0 dropped
  });

  it("allows a non-adjacent duplicate wire", () => {
    let ring = pushSnapshot([], entry("a"));
    ring = pushSnapshot(ring, entry("b"));
    ring = pushSnapshot(ring, entry("a"));
    expect(ring.map((e) => e.wire)).toEqual(["a", "b", "a"]);
  });
});

describe("mergeRing", () => {
  it("keeps live first, appends persisted, dedups by wire, caps", () => {
    const live = [entry("x"), entry("y")];
    const persisted = [entry("y"), entry("z")];    // y duplicates a live entry
    expect(mergeRing(live, persisted).map((e) => e.wire)).toEqual(["x", "y", "z"]);
  });

  it("caps the merged result to CAP", () => {
    const live = Array.from({ length: 6 }, (_, i) => entry(`l${i}`));
    const persisted = Array.from({ length: 8 }, (_, i) => entry(`p${i}`));
    expect(mergeRing(live, persisted)).toHaveLength(CAP);
  });
});

describe("isValidEntry", () => {
  it("accepts a well-formed entry", () => {
    expect(isValidEntry(entry("a"))).toBe(true);
  });
  it("rejects junk and bad sources", () => {
    expect(isValidEntry(null)).toBe(false);
    expect(isValidEntry({ wire: 1 })).toBe(false);
    expect(isValidEntry({ ...entry("a"), source: "bogus" })).toBe(false);
  });
});
