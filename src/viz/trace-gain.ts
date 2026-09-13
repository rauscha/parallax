/**
 * How much to multiply a trace by before drawing it.
 *
 * Pulled out of `Flowsheet.svelte`'s `drawAll` so it can be tested. It was one
 * inline expression, and it carried a bug that shipped with the flowsheet:
 *
 *     1 / Math.max(0.002, peak(frame, base, 1024))
 *
 * `0.002` is a divide-by-zero guard, and as an ABSOLUTE number it was wrong.
 * A sounding carrier on this engine peaks around 0.0166 of full scale — a fact
 * already written down in Flowsheet.svelte — so the guard sat only ~18 dB below
 * the loudest thing on the sheet. Every trace quieter than that was clamped, and
 * "Fit each" silently stopped fitting while the button went on claiming it did.
 * Measured on Parallax Bell: the carrier filled 96% of its canvas and the
 * modulator 32 dB under it filled 20% — the one operator whose shape explains
 * the sound was the least readable thing on the sheet.
 *
 * The guard has to be relative to the material, not absolute. Everything here
 * is expressed against `ref`, the loudest trace on the sheet, so the same patch
 * played louder or quieter draws identically.
 */

/**
 * How far below the sheet's loudest trace "Fit each" keeps fitting: 60 dB.
 *
 * This is an honesty limit, not an arithmetic one. Normalising a trace 90 dB
 * down would fill the box with amplified quantisation noise and draw a
 * confident waveform out of nothing — which is the failure mode the §6.3 gate
 * exists to catch. Past this point the trace shrinks instead, and the dB figure
 * every node prints carries the level.
 *
 * 60 dB is chosen to sit well clear of real material: the deepest modulator
 * measured across the fourteen voices is around 32 dB down, so nothing a patch
 * actually does gets clipped by it.
 */
export const FIT_FLOOR_RATIO = 1e-3;

/** Absolute backstop, for the case where the whole sheet is silent. */
const SILENT_SHEET = 1e-9;

/**
 * @param tracePeak Largest absolute sample in this trace's drawn window.
 * @param ref       Largest absolute sample across the sheet — the shared scale.
 * @param fitEach   True to normalise each trace to itself, false for one shared scale.
 * @returns A finite multiplier. Silence returns a finite gain applied to zero,
 *          which draws a flat line.
 */
export function traceGain(tracePeak: number, ref: number, fitEach: boolean): number {
  const sheet = Math.max(SILENT_SHEET, ref);
  if (!fitEach) return 1 / sheet;
  return 1 / Math.max(sheet * FIT_FLOOR_RATIO, tracePeak);
}
