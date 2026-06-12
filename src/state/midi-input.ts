/**
 * Live MIDI input (Web MIDI API). Routes a hardware controller into the same
 * note funnel the on-screen keyboards use — `currentEngine.noteOn/noteOff` —
 * and mirrors held notes into `activeNotesStore` so the UI lights up.
 *
 * The engine is monophonic with a *global* gate-off (any noteOff releases the
 * single voice), so we keep our own note-stack and do proper last-note priority:
 * the newest held note sounds, and releasing it falls back to the next held note
 * rather than going silent. We only really `noteOff` the engine when the stack
 * empties. Sustain (CC64) holds notes past key-up until the pedal lifts.
 *
 * Not supported in WebKit (Safari / all iOS browsers); `midiSupported` is false
 * there and the UI shows a graceful message instead of a dead button.
 */
import { atom, map } from "nanostores";
import { audioEngine } from "../audio/AudioEngine";
import { publishActiveNotes } from "./stores";

export interface MidiInputInfo { id: string; name: string; }

export const midiSupported =
  typeof navigator !== "undefined" && typeof navigator.requestMIDIAccess === "function";

export const midiStateStore = map<{
  enabled: boolean;
  inputs: MidiInputInfo[];
  selectedId: string | null;
  error: string | null;
}>({ enabled: false, inputs: [], selectedId: null, error: null });

/** Bumped (to performance.now()) on every incoming message — drives the UI's activity dot. */
export const midiActivityStore = atom<number>(0);

/* ——— Mono note-stack (last-note priority) ——————————————————————————— */

const heldStack: number[] = [];          // sounding-priority order; top = newest
const physicallyHeld = new Set<number>(); // keys currently down (not sustain-held)
const velOf = new Map<number, number>(); // 0..1 velocity per held note
let sustainOn = false;
let currentSounding: number | null = null;

function engine() { return audioEngine.currentEngine; }

function refreshActive() {
  publishActiveNotes("midi", new Set(heldStack));
}

/** Make the engine voice match the top of the stack (or release it if empty). */
function updateVoice() {
  const target = heldStack.length ? heldStack[heldStack.length - 1] : null;
  if (target === currentSounding) return;
  const eng = engine();
  if (target === null) {
    if (currentSounding !== null) eng?.noteOff(currentSounding);
  } else {
    eng?.noteOn(target, { velocity: velOf.get(target) ?? 0.8 });
  }
  currentSounding = target;
}

function noteDown(midi: number, vel: number) {
  physicallyHeld.add(midi);
  velOf.set(midi, vel);
  const i = heldStack.indexOf(midi);
  if (i >= 0) heldStack.splice(i, 1);
  heldStack.push(midi);
  // New top → updateVoice retriggers to it. (A re-pressed top note is a no-op
  // for updateVoice, which matches a controller that won't repeat held notes.)
  updateVoice();
  refreshActive();
}

function dropFromStack(midi: number) {
  const i = heldStack.indexOf(midi);
  if (i >= 0) heldStack.splice(i, 1);
  velOf.delete(midi);
}

function noteUp(midi: number) {
  physicallyHeld.delete(midi);
  if (sustainOn) return;          // pedal holds it in the stack until released
  dropFromStack(midi);
  updateVoice();
  refreshActive();
}

function setSustain(on: boolean) {
  if (on === sustainOn) return;
  sustainOn = on;
  if (!on) {
    // Pedal up — release everything no longer physically held.
    for (const midi of [...heldStack]) {
      if (!physicallyHeld.has(midi)) dropFromStack(midi);
    }
    updateVoice();
    refreshActive();
  }
}

function panic() {
  heldStack.length = 0;
  physicallyHeld.clear();
  velOf.clear();
  sustainOn = false;
  currentSounding = null;
  engine()?.allNotesOff();
  refreshActive();
}

/* ——— Web MIDI plumbing ————————————————————————————————————————————— */

let access: MIDIAccess | null = null;
let boundInput: MIDIInput | null = null;

function onMessage(e: MIDIMessageEvent) {
  const data = e.data;
  if (!data || data.length < 1) return;
  const cmd = data[0] & 0xf0;
  const d1 = data[1] ?? 0;
  const d2 = data[2] ?? 0;
  if (cmd === 0x90 && d2 > 0) noteDown(d1, d2 / 127);
  else if (cmd === 0x80 || (cmd === 0x90 && d2 === 0)) noteUp(d1);
  else if (cmd === 0xb0 && d1 === 64) setSustain(d2 >= 64);
  else return;   // pitch-bend / other CCs not handled in v1
  midiActivityStore.set(performance.now());
}

function bindInput(input: MIDIInput | null) {
  if (boundInput) boundInput.onmidimessage = null;
  panic();   // dropping/changing device must not strand held notes
  boundInput = input;
  if (input) input.onmidimessage = onMessage;
  midiStateStore.setKey("selectedId", input ? input.id : null);
}

function listInputs(): MidiInputInfo[] {
  if (!access) return [];
  return [...access.inputs.values()].map((i) => ({
    id: i.id,
    name: i.name || i.id,
  }));
}

function refreshInputs() {
  if (!access) return;
  const inputs = listInputs();
  midiStateStore.setKey("inputs", inputs);
  // Keep the current selection if it's still present; else auto-pick the first.
  const selId = midiStateStore.get().selectedId;
  const stillThere = selId && inputs.some((i) => i.id === selId);
  if (!stillThere) {
    const first = access.inputs.values().next().value as MIDIInput | undefined;
    bindInput(first ?? null);
  }
}

function onWindowBlur() { panic(); }
function onVisibility() { if (document.visibilityState === "hidden") panic(); }

export async function enableMidi(): Promise<void> {
  if (!midiSupported) {
    midiStateStore.setKey("error", "MIDI input isn't supported in this browser.");
    return;
  }
  if (access) { midiStateStore.setKey("enabled", true); return; }
  try {
    access = await navigator.requestMIDIAccess({ sysex: false });
    access.onstatechange = refreshInputs;
    refreshInputs();
    midiStateStore.set({ ...midiStateStore.get(), enabled: true, error: null });
    window.addEventListener("blur", onWindowBlur);
    document.addEventListener("visibilitychange", onVisibility);
  } catch (e) {
    midiStateStore.setKey("error",
      e instanceof Error ? e.message : "Couldn't access MIDI devices.");
  }
}

export function selectMidiInput(id: string): void {
  if (!access) return;
  bindInput(access.inputs.get(id) ?? null);
}

export function disableMidi(): void {
  bindInput(null);
  if (access) access.onstatechange = null;
  window.removeEventListener("blur", onWindowBlur);
  document.removeEventListener("visibilitychange", onVisibility);
  access = null;
  midiStateStore.set({ enabled: false, inputs: [], selectedId: null, error: null });
}

/** Manual all-notes-off for the UI "panic" button. */
export const midiPanic = panic;
