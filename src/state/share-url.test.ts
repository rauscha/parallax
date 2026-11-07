// applySharedState's fallback: a preset, recent sound or link saved with an
// engine this build doesn't have (the retired FM engine) keeps its melody, and
// leaves the fallback engine on the defaults it was seeded with.

import { describe, it, expect, beforeEach } from "vitest";
import { applySharedState } from "./share-url";
import { patchStore, melodyStore, engineIdStore, type Patch } from "./stores";
import type { SharedState } from "./serialization";

const SEEDED: Patch = {
  version: 1,
  engineId: "braids",
  modelId: "csaw",
  params: { timbre: 0.5, color: 0.5 },
};

const melody: SharedState["melody"] = {
  ...melodyStore.get(),
  events: [{ startStep: 0, durationSteps: 4, midi: 60 }],
};

beforeEach(() => {
  engineIdStore.set("braids");
  patchStore.set({ ...SEEDED, params: { ...SEEDED.params } });
});

describe("applySharedState", () => {
  it("applies the saved patch when its engine is the one that loaded", () => {
    const state: SharedState = {
      patch: { version: 1, engineId: "braids", modelId: "fold", params: { timbre: 0.9, color: 0.1 } },
      melody,
    };
    applySharedState(state, "braids");
    expect(patchStore.get().modelId).toBe("fold");
    expect(patchStore.get().params).toEqual({ timbre: 0.9, color: 0.1 });
    expect(melodyStore.get().events).toEqual(melody.events);
  });

  it("keeps only the melody when the saved engine is missing", () => {
    const state: SharedState = {
      patch: { version: 1, engineId: "fm", modelId: "epno", params: { macro1: 0.7, op1Level: 99 } },
      melody,
    };
    applySharedState(state, "braids");
    expect(engineIdStore.get()).toBe("braids");
    expect(patchStore.get()).toEqual(SEEDED);
    expect(melodyStore.get().events).toEqual(melody.events);
  });
});
