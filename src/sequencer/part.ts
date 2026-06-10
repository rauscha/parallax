import * as Tone from "tone";
import { audioEngine } from "../audio/AudioEngine";
import { melodyStore, type Melody, type MelodyEvent } from "../state/stores";

const STEPS_PER_BAR = 16;
const TOTAL_STEPS = 64; // 4 bars × 16 sixteenth-note steps

interface PartEvent {
  time: string;
  kind: "on" | "off";
  midi: number;
  velocity?: number;
}

let activePart: Tone.Part | null = null;
let lastEvents: MelodyEvent[] | null = null;
let installed = false;

function stepToBBS(step: number): string {
  const bar = Math.floor(step / STEPS_PER_BAR);
  const within = step % STEPS_PER_BAR;
  const beat = Math.floor(within / 4);
  const sixteenth = within % 4;
  return `${bar}:${beat}:${sixteenth}`;
}

function expand(events: MelodyEvent[]): PartEvent[] {
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

function rebuild(m: Melody): void {
  // Teardown and build are wrapped so a Tone hiccup (e.g. disposing/scheduling
  // a Part while the transport is mid-loop, which happens when you edit notes
  // during playback) can NEVER throw out of here. This function runs inside a
  // melodyStore listener; if it threw, nanostores would stop notifying every
  // later subscriber on that update — which froze note entry, the event count,
  // and the play/stop button all at once. Worst case now is a dropped Part
  // (logged), not a wedged app.
  if (activePart) {
    try {
      activePart.stop();
      activePart.clear();
      activePart.dispose();
    } catch (e) {
      console.error("[part] teardown failed", e);
    }
    activePart = null;
  }
  const events = expand(m.events);
  if (events.length === 0) return;
  try {
    const part = new Tone.Part((time, ev: PartEvent) => {
      const eng = audioEngine.currentEngine;
      if (!eng) return;
      // Pass Tone's scheduled time straight through to the engine so notes fire
      // sample-accurately at the beat. Without it, the engine falls back to
      // ctx.currentTime and notes play ~100–200ms early (the look-ahead window)
      // and jitter relative to each other.
      try {
        if (ev.kind === "on") eng.noteOn(ev.midi, { velocity: ev.velocity, time });
        else eng.noteOff(ev.midi, { time });
      } catch (e) {
        console.error("[part] note dispatch failed", e);
      }
    }, events);
    part.loop = true;
    part.loopStart = 0;
    part.loopEnd = "4m";
    part.start(0);
    activePart = part;
  } catch (e) {
    console.error("[part] build failed", e);
    activePart = null;
  }
}

/**
 * Subscribe Part lifecycle to melodyStore. Rebuild whenever the events array
 * reference changes (so tempo/key/scale tweaks don't trigger a wasteful rebuild).
 * Call once after installSequencer().
 */
export function installPart(): void {
  if (installed) return;
  const initial = melodyStore.get();
  rebuild(initial);
  lastEvents = initial.events;

  melodyStore.subscribe((m) => {
    if (m.events === lastEvents) return;
    lastEvents = m.events;
    rebuild(m);
  });

  installed = true;
}
