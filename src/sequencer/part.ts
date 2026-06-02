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
    // Clip the noteOff to loop end so we don't leak a stuck note across the wrap.
    // A future TODO is to wrap-around for legato; for M3-first-slice, clip is safe.
    const off = Math.min(e.startStep + e.durationSteps, TOTAL_STEPS);
    out.push({ time: stepToBBS(off), kind: "off", midi: e.midi });
  }
  return out;
}

function rebuild(m: Melody): void {
  if (activePart) {
    activePart.stop();
    activePart.clear();
    activePart.dispose();
    activePart = null;
  }
  const events = expand(m.events);
  if (events.length === 0) return;
  const part = new Tone.Part((_time, ev: PartEvent) => {
    const eng = audioEngine.currentEngine;
    if (!eng) return;
    if (ev.kind === "on") eng.noteOn(ev.midi, { velocity: ev.velocity });
    else eng.noteOff(ev.midi);
  }, events);
  part.loop = true;
  part.loopStart = 0;
  part.loopEnd = "4m";
  part.start(0);
  activePart = part;
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
