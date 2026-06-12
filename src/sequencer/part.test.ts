import { describe, it, expect } from "vitest";
import { expand, stepToBBS } from "./part-expand";

describe("stepToBBS", () => {
  it("maps a step to bars:beats:sixteenths", () => {
    expect(stepToBBS(0)).toBe("0:0:0");
    expect(stepToBBS(4)).toBe("0:1:0");   // one beat in
    expect(stepToBBS(16)).toBe("1:0:0");  // bar 2
    expect(stepToBBS(63)).toBe("3:3:3");  // last step
  });
});

describe("expand", () => {
  it("emits a paired on/off for each event", () => {
    const out = expand([{ startStep: 0, durationSteps: 4, midi: 60 }]);
    expect(out).toHaveLength(2);
    expect(out[0]).toMatchObject({ kind: "on", midi: 60, time: "0:0:0" });
    expect(out[1]).toMatchObject({ kind: "off", midi: 60, time: "0:1:0" });
  });

  it("skips events outside the 64-step window", () => {
    expect(expand([{ startStep: -1, durationSteps: 4, midi: 60 }])).toHaveLength(0);
    expect(expand([{ startStep: 64, durationSteps: 4, midi: 60 }])).toHaveLength(0);
  });

  it("wraps a note-off across the loop boundary", () => {
    // start 60, duration 8 -> off at (60+8)%64 = 4 => "0:1:0"
    const out = expand([{ startStep: 60, durationSteps: 8, midi: 67 }]);
    expect(out[0]).toMatchObject({ kind: "on", time: "3:3:0" });
    expect(out[1]).toMatchObject({ kind: "off", time: "0:1:0" });
  });

  it("caps a degenerate full-loop duration so on != off", () => {
    // duration 64 -> capped to 63; off at (0+63)%64 = 63, not 0 (which would
    // collide with the note-on at step 0).
    const out = expand([{ startStep: 0, durationSteps: 64, midi: 60 }]);
    expect(out[0].time).toBe("0:0:0");      // on at step 0
    expect(out[1].time).toBe("3:3:3");      // off at step 63
    expect(out[1].time).not.toBe(out[0].time);
  });
});
