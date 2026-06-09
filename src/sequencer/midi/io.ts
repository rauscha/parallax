/**
 * Browser-side MIDI file I/O (M5 increment C) — the DOM glue around the pure
 * `convert.ts`: serialize a melody to a downloadable .mid, and read a dropped/
 * picked .mid back into melody events. Files never leave the browser.
 */
import { Midi } from "@tonejs/midi";
import { melodyToMidi, midiToMelody, type ImportResult } from "./convert";
import type { Melody } from "../../state/stores";

/** Encode the melody and trigger a .mid download. */
export function exportMelodyToFile(melody: Melody, filename = "parallax.mid"): void {
  const bytes = melodyToMidi(melody).toArray();
  const blob = new Blob([bytes as BlobPart], { type: "audio/midi" });
  const url = URL.createObjectURL(blob);
  const a = document.createElement("a");
  a.href = url;
  a.download = filename.endsWith(".mid") ? filename : `${filename}.mid`;
  document.body.appendChild(a);
  a.click();
  a.remove();
  // Revoke after the click has been handled so the download isn't cut short.
  setTimeout(() => URL.revokeObjectURL(url), 1000);
}

/** Parse a user-selected .mid File into a 4-bar monophonic melody. */
export async function importMelodyFromFile(file: File): Promise<ImportResult> {
  const buf = await file.arrayBuffer();
  const midi = new Midi(buf);
  return midiToMelody(midi);
}

export type { ImportResult };
