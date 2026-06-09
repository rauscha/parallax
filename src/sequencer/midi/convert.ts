/**
 * Melody ⇄ Standard MIDI File conversion (M5 increment C). PURE — imports only
 * @tonejs/midi (which is isomorphic) and a type from stores, so it runs and
 * unit-tests under Node.
 *
 * The melody is a 4-bar, 16th-note, monophonic grid (64 steps). We map a step
 * to MIDI *ticks* (a 16th = ppq/4) rather than seconds, so the grid lands on
 * exact tick boundaries independent of tempo — clean round-trips and no float
 * drift. Tempo is still written to the header so DAWs interpret the file at the
 * right speed.
 *
 * Import is deliberately lossy in service of the app's model: notes are
 * quantized to the 16th grid, reduced to monophonic (highest pitch wins on a
 * tie), trimmed so none overlaps the next, and anything past bar 4 (or out of
 * MIDI range) is dropped — with a count returned so the UI can say so.
 */
import { Midi } from "@tonejs/midi";
import type { Melody, MelodyEvent } from "../../state/stores";

const TOTAL_STEPS = 64; // 4 bars × 16 sixteenth steps — matches part.ts
const DEFAULT_VELOCITY = 0.8; // matches the sequencer's Part velocity

function clampBpm(bpm: number): number {
  const n = Math.round(Number(bpm));
  if (!Number.isFinite(n)) return 120;
  return Math.max(40, Math.min(240, n));
}

/** Build a Standard MIDI File (one track) from the melody. */
export function melodyToMidi(melody: Melody): Midi {
  const midi = new Midi();
  midi.header.setTempo(clampBpm(melody.tempo));
  const ticksPerStep = midi.header.ppq / 4; // 16th note
  const track = midi.addTrack();
  track.name = "Parallax";
  for (const e of melody.events) {
    if (e.startStep < 0 || e.startStep >= TOTAL_STEPS) continue;
    if (e.midi < 0 || e.midi > 127) continue;
    const durSteps = Math.max(1, e.durationSteps);
    track.addNote({
      midi: e.midi,
      ticks: Math.round(e.startStep * ticksPerStep),
      durationTicks: Math.round(durSteps * ticksPerStep),
      velocity: DEFAULT_VELOCITY,
    });
  }
  return midi;
}

export interface ImportResult {
  events: MelodyEvent[];
  tempo: number;
  /** How many source notes didn't make it into the 4-bar monophonic grid. */
  dropped: number;
}

/**
 * Reduce an arbitrary MIDI file to a 4-bar monophonic Parallax melody.
 * Quantizes to the 16th grid, keeps the highest of any simultaneous notes,
 * trims overlaps, drops everything past bar 4 / out of range.
 */
export function midiToMelody(midi: Midi): ImportResult {
  const ppq = midi.header.ppq || 480;
  const ticksPerStep = ppq / 4;
  const tempo = clampBpm(midi.header.tempos[0]?.bpm ?? 120);

  let dropped = 0;
  // At each start step keep at most one note (the highest pitch).
  const byStep = new Map<number, { step: number; durSteps: number; midi: number }>();
  for (const track of midi.tracks) {
    for (const n of track.notes) {
      const step = Math.round(n.ticks / ticksPerStep);
      if (step < 0 || step >= TOTAL_STEPS || n.midi < 0 || n.midi > 127) {
        dropped++;
        continue;
      }
      const durSteps = Math.max(1, Math.round(n.durationTicks / ticksPerStep));
      const existing = byStep.get(step);
      if (!existing) {
        byStep.set(step, { step, durSteps, midi: n.midi });
      } else {
        if (n.midi > existing.midi) byStep.set(step, { step, durSteps, midi: n.midi });
        dropped++; // the discarded simultaneous note
      }
    }
  }

  // Sort by start and trim each note so it never overruns the next one's start.
  const sorted = [...byStep.values()].sort((a, b) => a.step - b.step);
  const events: MelodyEvent[] = [];
  for (let i = 0; i < sorted.length; i++) {
    const cur = sorted[i];
    const nextStart = i + 1 < sorted.length ? sorted[i + 1].step : TOTAL_STEPS;
    const durSteps = Math.max(1, Math.min(cur.durSteps, nextStart - cur.step));
    events.push({ startStep: cur.step, durationSteps: durSteps, midi: cur.midi });
  }

  return { events, tempo, dropped };
}
