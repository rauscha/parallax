/**
 * Knob audition — hear a knob while you turn it.
 *
 * The explain loop starts with "turn a knob". From a cold start nothing is
 * sounding, so without this the first turn is silent and the scope stays flat.
 * While a knob is being dragged or arrow-keyed and nothing else is making
 * sound, a demo note is held (the same one Show me uses) and released when you
 * let go. If the sequencer is running, a key is down or a Show me sweep owns
 * the voice, we ride that audio and trigger nothing of our own.
 *
 * Struck models (Rings, the drums and plucks; EngineModel.struck) ring out on
 * their own and a knob only shapes the NEXT strike, so a held note would go
 * quiet under the turn. For those we re-strike each time the knob has moved a
 * noticeable distance, so you hear the strike change as you turn.
 */
import { audioEngine } from "../audio/AudioEngine";
import { modelFor } from "../audio/registry";
import { patchStore, isPlayingStore, activeNotesStore } from "./stores";

export const DEMO_NOTE = 60;        // middle C — an audible register for any model
export const DEMO_VELOCITY = 0.8;

const RESTRIKE_TRAVEL = 0.12;       // re-strike after moving 12% of the range…
const RESTRIKE_MIN_MS = 220;        // …but no faster than this
const KEY_IDLE_MS = 700;            // keyboard turns: release after this much quiet

let owns = false;                   // we triggered the note that's sounding
let struck = false;
let lastStrikeNorm = 0;
let lastStrikeTs = 0;
let keyTimer: ReturnType<typeof setTimeout> | null = null;

/** Hooked by show-me.ts so audition never fights a sweep for the voice. */
let sweepActive: () => boolean = () => false;
export function setSweepProbe(probe: () => boolean): void { sweepActive = probe; }

function somethingElseSounding(): boolean {
  return sweepActive() || isPlayingStore.get() || activeNotesStore.get().size > 0;
}

function strike(norm: number): void {
  const eng = audioEngine.currentEngine;
  if (!eng) return;
  if (owns) eng.noteOff(DEMO_NOTE);
  eng.noteOn(DEMO_NOTE, { velocity: DEMO_VELOCITY });
  owns = true;
  lastStrikeNorm = norm;
  lastStrikeTs = performance.now();
}

/**
 * The knob for `paramId` just moved to `norm` (0..1 of its range). Starts the
 * demo note if nothing is sounding, and re-strikes struck models as they turn.
 */
export function auditionMove(norm: number): void {
  const eng = audioEngine.currentEngine;
  if (!eng || !eng.manifest.capabilities.producesAudio) return;
  if (!owns) {
    if (somethingElseSounding()) return;
    const p = patchStore.get();
    struck = modelFor(p.engineId, p.modelId)?.struck === true;
    strike(norm);
    return;
  }
  if (sweepActive()) { auditionEnd(); return; }
  if (struck
      && Math.abs(norm - lastStrikeNorm) >= RESTRIKE_TRAVEL
      && performance.now() - lastStrikeTs >= RESTRIKE_MIN_MS) {
    strike(norm);
  }
}

/** A keyboard step on a knob: audition, and release after a short quiet spell. */
export function auditionKey(norm: number): void {
  auditionMove(norm);
  if (keyTimer) clearTimeout(keyTimer);
  keyTimer = setTimeout(auditionEnd, KEY_IDLE_MS);
}

/** Pointer released, focus lost, or the knob went away: release our note. */
export function auditionEnd(): void {
  if (keyTimer) { clearTimeout(keyTimer); keyTimer = null; }
  if (!owns) return;
  owns = false;
  audioEngine.currentEngine?.noteOff(DEMO_NOTE);
}
