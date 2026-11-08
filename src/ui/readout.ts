import type { ParameterDescriptor } from "../audio/types";

/** Decimal places that suit a parameter's shape. */
function decimalsFor(spec: ParameterDescriptor): number {
  if (spec.step && spec.step >= 1) return 0;   // bits, rate
  const range = spec.max - spec.min;
  if (range >= 50) return 0;                   // signature, drift (0..255)
  if (range >= 8) return 1;                    // fm (-12..12 semitones)
  return 2;                                    // timbre, color, gain
}

/**
 * A knob's value as text: the descriptor's own formatter when it has one,
 * otherwise 0..1 macros as a percent, number + unit with a space before word units ("16 bit", "0.0 st")
 * and times under a second shown in milliseconds ("5 ms", not "0.01s").
 */
export function formatReadout(spec: ParameterDescriptor, v: number): string {
  if (spec.format) return spec.format(v);
  // A unitless 0..1 macro (Timbre, Color, Gain…) reads as a percent, the same
  // figure its Explain card shows.
  if (!spec.unit && spec.min === 0 && spec.max === 1) return `${Math.round(v * 100)}%`;
  if (spec.unit === "s" && Math.abs(v) < 1) return `${Math.round(v * 1000)} ms`;
  const num = v.toFixed(decimalsFor(spec));
  if (!spec.unit) return num;
  const unit = spec.unit === "semi" ? "st" : spec.unit;
  return unit === "%" ? `${num}%` : `${num} ${unit}`;
}
