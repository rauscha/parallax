import { describe, it, expect } from "vitest";
import { formatReadout } from "./readout";
import type { ParameterDescriptor } from "../audio/types";

const spec = (o: Partial<ParameterDescriptor>): ParameterDescriptor =>
  ({ id: "x", label: "X", group: "g", type: "continuous", min: 0, max: 1, default: 0, apply: "message", ...o });

describe("formatReadout", () => {
  it("shows sub-second times in milliseconds", () => {
    expect(formatReadout(spec({ unit: "s", max: 2 }), 0.005)).toBe("5 ms");
    expect(formatReadout(spec({ unit: "s", max: 2 }), 1.5)).toBe("1.50 s");
  });
  it("spaces word units and shortens semitones", () => {
    expect(formatReadout(spec({ unit: "semi", min: -12, max: 12 }), 0)).toBe("0.0 st");
    expect(formatReadout(spec({ unit: "bit", min: 1, max: 16, step: 1 }), 16)).toBe("16 bit");
    expect(formatReadout(spec({ unit: "kHz", min: 1, max: 96, step: 1 }), 96)).toBe("96 kHz");
  });
  it("prefers the descriptor's own formatter", () => {
    expect(formatReadout(spec({ format: (v) => `${v}!` }), 3)).toBe("3!");
  });
  it("prints unitless 0..1 macros as a percent, like the Explain card", () => {
    expect(formatReadout(spec({}), 0.5)).toBe("50%");
    expect(formatReadout(spec({}), 0.884)).toBe("88%");
  });
  it("prints other unitless ranges to a sensible precision", () => {
    expect(formatReadout(spec({ min: 0, max: 255, step: 1 }), 12)).toBe("12");
  });
});
