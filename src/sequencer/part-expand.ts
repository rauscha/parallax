/**
 * Pure melody → scheduled-event expansion for the Tone.Part. Split out of
 * part.ts (which imports Tone + the AudioEngine singleton, neither Node-safe)
 * so the loop-wrap / degenerate-duration logic is unit-testable on its own.
 */
import type { MelodyEvent } from "../state/stores";

export const STEPS_PER_BAR = 16;
export const TOTAL_STEPS = 64; // 4 bars × 16 sixteenth-note steps

export interface PartEvent {
  time: string;
  kind: "on" | "off";
  midi: number;
  velocity?: number;
}

export function stepToBBS(step: number): string {
  const bar = Math.floor(step / STEPS_PER_BAR);
  const within = step % STEPS_PER_BAR;
  const beat = Math.floor(within / 4);
  const sixteenth = within % 4;
  return `${bar}:${beat}:${sixteenth}`;
}

export function expand(events: MelodyEvent[]): PartEvent[] {
  const out: PartEvent[] = [];
  for (const e of events) {
    if (e.startStep < 0 || e.startStep >= TOTAL_STEPS) continue;
    out.push({ time: stepToBBS(e.startStep), kind: "on", midi: e.midi, velocity: 0.8 });
    // Wrap the noteOff around the loop boundary so legato bridges the wrap.
    // Cap duration at TOTAL_STEPS - 1 to avoid the degenerate on==off-at-same-time
    // race (would otherwise produce zero-length rings depending on event order).
    // For start=60, duration=8 (endStep=68): off fires at step 4 of the NEXT loop
    // iteration. Tone.Part fires both the on and the wrapped-off on every iteration;
    // the unmatched off on the first iteration is a no-op against an inactive note.
    const dur = Math.min(e.durationSteps, TOTAL_STEPS - 1);
    const offStep = (e.startStep + dur) % TOTAL_STEPS;
    out.push({ time: stepToBBS(offStep), kind: "off", midi: e.midi });
  }
  return out;
}
