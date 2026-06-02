import { melodyStore, type MelodyEvent } from "../state/stores";

/**
 * TEMPORARY — seeds melodyStore with an ascending C-major scale (2 bars of
 * quarter notes followed by 2 bars of silence, so the loop boundary is audible).
 * Remove once the click-to-place staff editor lands and the user can author
 * their own melodies.
 */
export function loadDemoMelody(): void {
  const C_MAJOR_UP: number[] = [60, 62, 64, 65, 67, 69, 71, 72];
  const events: MelodyEvent[] = C_MAJOR_UP.map((midi, i) => ({
    startStep: i * 4,
    durationSteps: 4,
    midi,
  }));
  melodyStore.setKey("events", events);
}

export function clearMelody(): void {
  melodyStore.setKey("events", []);
}
