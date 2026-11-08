/**
 * "Show me" macro-knob sweep — the last interactive piece of the M4 Explain
 * panel. Each Explain card gets a button that demonstrates what its macro knob
 * does *on the current model* by sweeping the parameter across its full range
 * while you listen, with the knob moving along.
 *
 * It drives the value through `patchStore` (not the engine directly) for two
 * reasons: the knob is bound to the store, so it animates for free; and the
 * existing binding already pushes store → engine, so the sound updates live.
 *
 * If nothing is already sounding, a held demo note plays for the sweep's
 * duration so there's audio to shape. If the transport is running or a key is
 * down, we ride that instead and trigger no note of our own.
 *
 * Interrupt/restore is the fiddly part and is handled centrally here: a second
 * click stops it; grabbing any knob, switching model/engine, or an Apply from
 * the Match panel all bail out (via the patch watcher); window blur / tab-hide
 * release the demo note and put the knob back.
 *
 * Struck models (EngineModel.struck: Rings, the drums and plucks) ring out on
 * their own, and a knob that shapes the strike only changes the NEXT one, so a
 * smooth sweep over a single strike would demonstrate nothing. Those get a
 * stepped sweep instead: the knob glides to 0, 25, 50, 75 and 100% of its
 * range, pausing at each step, and strikes the note again on arrival.
 */
import { atom } from "nanostores";
import { audioEngine } from "../audio/AudioEngine";
import {
  patchStore,
  isPlayingStore,
  activeNotesStore,
  activeParamStore,
} from "./stores";
import type { ParameterDescriptor } from "../audio/types";
import { modelFor } from "../audio/registry";
import { DEMO_NOTE, DEMO_VELOCITY, setSweepProbe } from "./audition";

/** Param id currently being demonstrated by a "Show me" sweep (null = none).
 *  Drives the Explain-card button's Show me ↔ Stop label. Transient UI state —
 *  never persisted or shared. */
export const sweepingParamStore = atom<string | null>(null);

const DURATION_MS = 2600;    // total round-trip: original → min → max → original

// Stepped sweep for struck models: five stops across the range, then home.
const STEPS = [0, 0.25, 0.5, 0.75, 1];
const STEP_MS = 700;         // per stop: a short glide, then a hold while it rings
const GLIDE_FRAC = 0.22;     // share of each stop spent gliding to it
const HOME_MS = 500;         // final glide back to the original value

interface SweepState {
  paramId: string;
  original: number;
  min: number;
  max: number;
  engineId: string;
  startTs: number | null;    // first RAF timestamp; set on the first frame
  raf: number;
  lastWritten: number;       // last value WE wrote (so the watcher can spot user edits)
  ownsNote: boolean;         // did we trigger the demo note (vs. riding existing audio)?
  stepped: boolean;          // struck model → stepped sweep with a strike per stop
  struckStep: number;        // last stop we struck at (-1 = none yet)
}

let state: SweepState | null = null;
// Set true around our own patchStore writes so the interrupt watcher can tell
// the sweep's writes apart from a real user edit (knob drag, model/engine swap,
// a Match-panel Apply, …).
let applying = false;
let listenersBound = false;

function smoothstep(t: number): number {
  const x = t < 0 ? 0 : t > 1 ? 1 : t;
  return x * x * (3 - 2 * x);
}

// Eased value along original → min → max → original at progress p ∈ [0,1].
// Going low first, then sweeping all the way up, gives the ear the full range;
// ending back at `original` means a clean stop with nothing to undo if it runs
// to completion. The middle (min → max) is the longest leg — that's the reveal.
function pathValue(p: number, original: number, min: number, max: number): number {
  const A = 0.18; // original → min
  const B = 0.70; // min → max (the reveal)
  if (p <= A)      return original + (min - original) * smoothstep(p / A);
  else if (p <= B) return min + (max - min) * smoothstep((p - A) / (B - A));
  else             return max + (original - max) * smoothstep((p - B) / (1 - B));
}

function writeParam(v: number): void {
  if (!state) return;
  state.lastWritten = v;
  applying = true;
  patchStore.setKey("params", { ...patchStore.get().params, [state.paramId]: v });
  applying = false;
}

function strikeAgain(): void {
  if (!state || !state.ownsNote) return;
  const eng = audioEngine.currentEngine;
  if (!eng) return;
  eng.noteOff(DEMO_NOTE);
  eng.noteOn(DEMO_NOTE, { velocity: DEMO_VELOCITY });
}

function steppedTick(s: SweepState, elapsed: number): void {
  const stepsEnd = STEPS.length * STEP_MS;
  if (elapsed >= stepsEnd + HOME_MS) { finish(true); return; }
  if (elapsed >= stepsEnd) {
    // Home leg: glide from the last stop back to where the knob started.
    const t = smoothstep((elapsed - stepsEnd) / HOME_MS);
    writeParam(s.max + (s.original - s.max) * t);
  } else {
    const i = Math.floor(elapsed / STEP_MS);
    const local = (elapsed - i * STEP_MS) / STEP_MS;
    const target = s.min + (s.max - s.min) * STEPS[i];
    if (i !== s.struckStep && local < GLIDE_FRAC) {
      const from = i === 0 ? s.original : s.min + (s.max - s.min) * STEPS[i - 1];
      writeParam(from + (target - from) * smoothstep(local / GLIDE_FRAC));
    } else {
      writeParam(target);
      if (i !== s.struckStep) { s.struckStep = i; strikeAgain(); }
    }
  }
  s.raf = requestAnimationFrame(tick);
}

function tick(ts: number): void {
  if (!state) return;
  if (state.startTs === null) state.startTs = ts;
  if (state.stepped) { steppedTick(state, ts - state.startTs); return; }
  const p = (ts - state.startTs) / DURATION_MS;
  if (p >= 1) { finish(true); return; }   // restore = land exactly on `original`
  writeParam(pathValue(p, state.original, state.min, state.max));
  state.raf = requestAnimationFrame(tick);
}

/** Stop the current sweep. `restore` writes the captured original value back
 *  (the normal case); pass false when the user has taken over the swept param
 *  itself, or the engine changed out from under us. */
function finish(restore: boolean): void {
  if (!state) return;
  const s = state;
  state = null;                          // clear first → writeParam / watcher no-op
  if (s.raf) cancelAnimationFrame(s.raf);
  if (restore) {
    applying = true;
    patchStore.setKey("params", { ...patchStore.get().params, [s.paramId]: s.original });
    applying = false;
  }
  if (s.ownsNote) audioEngine.currentEngine?.noteOff(DEMO_NOTE);
  if (activeParamStore.get() === s.paramId) activeParamStore.set(null);
  sweepingParamStore.set(null);
}

function onInterrupt(): void {
  // window blur / tab hidden — release the demo note + put the knob back.
  finish(true);
}

function bindListeners(): void {
  if (listenersBound) return;
  listenersBound = true;
  setSweepProbe(() => state !== null);

  // Any *external* write to the patch while a sweep runs means the user (or an
  // Apply) took control — bail. Restore the knob unless they grabbed the swept
  // param itself (their value wins) or the engine swapped (the param may not
  // exist on the new one). Kept as a permanent listener — a cheap no-op when
  // nothing is sweeping. `listen` (not `subscribe`) so it doesn't fire on bind.
  patchStore.listen((p) => {
    if (!state || applying) return;
    const engineChanged = p.engineId !== state.engineId;
    const sweptGrabbed = p.params[state.paramId] !== state.lastWritten;
    finish(!engineChanged && !sweptGrabbed);
  });

  window.addEventListener("blur", onInterrupt);
  document.addEventListener("visibilitychange", () => {
    if (document.visibilityState === "hidden") onInterrupt();
  });
}

/**
 * Toggle a live "Show me" demo of one macro knob: sweep it across its full
 * range (original → min → max → original) over a couple of seconds so you hear
 * what it does on the current model, with the knob moving along. Calling it
 * again for the same param stops early; for a different param it restarts on
 * that one. No-op if audio isn't up or the param isn't a continuous range.
 */
export function startSweep(paramId: string): void {
  // Toggle off if this exact param is already sweeping.
  if (state && state.paramId === paramId) { finish(true); return; }
  // Different param mid-sweep → stop the old one cleanly first.
  if (state) finish(true);

  const eng = audioEngine.currentEngine;
  if (!eng) return;
  const spec: ParameterDescriptor | undefined =
    eng.getParameterSchema().find((s) => s.id === paramId);
  if (!spec || spec.type !== "continuous" || spec.max <= spec.min) return;

  bindListeners();

  const original = patchStore.get().params[paramId] ?? spec.default;
  const ownsNote =
    eng.manifest.capabilities.producesAudio &&
    !isPlayingStore.get() &&
    activeNotesStore.get().size === 0;

  const p = patchStore.get();
  const stepped = modelFor(p.engineId, p.modelId)?.struck === true;
  // A smooth sweep holds one note for its whole length; a stepped one strikes
  // at each stop instead (strikeAgain), so it starts silent.
  if (ownsNote && !stepped) eng.noteOn(DEMO_NOTE, { velocity: DEMO_VELOCITY });

  state = {
    paramId,
    original,
    min: spec.min,
    max: spec.max,
    engineId: patchStore.get().engineId,
    startTs: null,
    raf: 0,
    lastWritten: original,
    ownsNote,
    stepped,
    struckStep: -1,
  };

  // Light the matching knob + card for the whole sweep (reuses the existing
  // knob ↔ Explain-card highlight channel).
  activeParamStore.set(paramId);
  sweepingParamStore.set(paramId);
  state.raf = requestAnimationFrame(tick);
}

/** Stop any active sweep and restore the knob (Stop click / component teardown). */
export function stopSweep(): void { finish(true); }
