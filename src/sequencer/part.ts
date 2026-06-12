import * as Tone from "tone";
import { audioEngine } from "../audio/AudioEngine";
import { melodyStore, type Melody, type MelodyEvent } from "../state/stores";
import { expand, type PartEvent } from "./part-expand";

// Re-exported so it stays importable from here; the pure implementation lives in
// part-expand.ts (Node-testable, no Tone/AudioEngine).
export { expand };

let activePart: Tone.Part | null = null;
let lastEvents: MelodyEvent[] | null = null;
let installed = false;

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
