import { melodyStore, type MelodyEvent } from "../state/stores";

/**
 * A short, characterful C-major riff for the "Load demo" first move — a hook,
 * not a scale. Two bars of melody (steps are 16ths: 2 = eighth, 4 = quarter)
 * then two bars of air so the loop boundary breathes: a rising eighth-note
 * pickup to a peak, a falling answer, an eighth rest, then a descent that
 * resolves onto a held root. In-key for the default C-major first run.
 */
export function loadDemoMelody(): void {
  const events: MelodyEvent[] = [
    { startStep: 0,  durationSteps: 2, midi: 64 }, // E4  — rising pickup
    { startStep: 2,  durationSteps: 2, midi: 67 }, // G4
    { startStep: 4,  durationSteps: 4, midi: 72 }, // C5  — the peak (quarter)
    { startStep: 8,  durationSteps: 2, midi: 71 }, // B4  — falling answer
    { startStep: 10, durationSteps: 2, midi: 67 }, // G4
    { startStep: 12, durationSteps: 4, midi: 69 }, // A4  — held
    // steps 16-17: an eighth rest (a breath)
    { startStep: 18, durationSteps: 2, midi: 67 }, // G4  — descent
    { startStep: 20, durationSteps: 2, midi: 64 }, // E4
    { startStep: 22, durationSteps: 2, midi: 62 }, // D4
    { startStep: 24, durationSteps: 8, midi: 60 }, // C4  — resolve on the root, held
  ];
  melodyStore.setKey("events", events);
}

export function clearMelody(): void {
  melodyStore.setKey("events", []);
}
