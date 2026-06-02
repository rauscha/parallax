/**
 * Pointer-math helpers for the staff editor.
 * The state machine lives in StaffEditor.svelte; these are the pure pieces.
 */
import type { MelodyEvent } from "../state/stores";
import type { StaffMetrics } from "./render";

/** Convert a clientX/Y to SVG viewBox coords (= staff spaces, given our viewBox). */
export function pointerToSP(
  svg: SVGSVGElement,
  clientX: number,
  clientY: number,
): { x: number; y: number } {
  const pt = svg.createSVGPoint();
  pt.x = clientX;
  pt.y = clientY;
  const ctm = svg.getScreenCTM();
  if (!ctm) return { x: 0, y: 0 };
  const p = pt.matrixTransform(ctm.inverse());
  return { x: p.x, y: p.y };
}

/** Hit-test against the event list. Returns the events[] index of the
 *  topmost matching note, or null. Iterates in reverse so visually-on-top
 *  (later-rendered) notes win. `xOf` / `yOf` come from the component's
 *  rendered visuals to keep this independent of accidental offsets etc. */
export function hitTestNote(
  events: ReadonlyArray<MelodyEvent>,
  m: StaffMetrics,
  spX: number,
  spY: number,
  visualX: (i: number) => number,
  visualY: (i: number) => number,
  noteheadW = 1.18,
  vTol = 0.6,
): number | null {
  for (let i = events.length - 1; i >= 0; i--) {
    const e = events[i];
    const x0 = visualX(i) - 0.3;
    const xEndDuration = visualX(i) + e.durationSteps * m.stepWidth;
    const x1 = Math.max(visualX(i) + noteheadW + 0.2, xEndDuration);
    if (spX >= x0 && spX <= x1 && Math.abs(spY - visualY(i)) <= vTol) return i;
  }
  return null;
}
