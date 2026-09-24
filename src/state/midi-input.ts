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
import {
  chooseInput, recallNotice, shouldRechoose, readRememberedName, writeRememberedName,
  type MidiInputInfo, type RecallNotice,
} from "./midi-input-core";

export type { MidiInputInfo, RecallNotice };

/**
 * localStorage, or null where it is unavailable. Reading the property itself
 * throws in a private window or with site data blocked, so the access — not
 * just the call — has to be guarded.
 */
function prefs(): Storage | null {
  try {
    return typeof localStorage !== "undefined" ? localStorage : null;
  } catch {
    return null;
  }
}

export const midiSupported =
  typeof navigator !== "undefined" && typeof navigator.requestMIDIAccess === "function";

export const midiStateStore = map<{
  enabled: boolean;
  inputs: MidiInputInfo[];
  selectedId: string | null;
  /** Set when the bound input is not the remembered name verbatim — the UI shows it. */
  recall: RecallNotice | null;
  error: string | null;
}>({ enabled: false, inputs: [], selectedId: null, recall: null, error: null });

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
  // Keep the current selection if it's still present (and not a stand-in);
  // else the remembered device, then the same port renamed, then the first.
  const { selectedId, recall } = midiStateStore.get();
  const stillThere = selectedId !== null && inputs.some((i) => i.id === selectedId);
  if (!shouldRechoose(stillThere, recall)) return;
  const store = prefs();
  const remembered = store ? readRememberedName(store) : null;
  const choice = chooseInput(inputs, remembered);
  // Rebinding panics held notes, so don't rebind to the input already bound.
  if (!stillThere || choice?.id !== selectedId) {
    bindInput(choice ? access.inputs.get(choice.id) ?? null : null);
  }
  midiStateStore.setKey("recall", recallNotice(choice, remembered));
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
  rememberMidiInput();
}

/**
 * Remember the bound input by its current name, and drop any recall notice.
 * Remember only an EXPLICIT choice — a pick, or the notice's button. Auto-
 * binding must never overwrite it, or unplugging the remembered device would
 * quietly rewrite the preference to whatever happened to be first.
 */
export function rememberMidiInput(): void {
  const store = prefs();
  if (store && boundInput) writeRememberedName(store, boundInput.name || boundInput.id);
  midiStateStore.setKey("recall", null);
}

export function disableMidi(): void {
  bindInput(null);
  if (access) access.onstatechange = null;
  window.removeEventListener("blur", onWindowBlur);
  document.removeEventListener("visibilitychange", onVisibility);
  access = null;
  midiStateStore.set({ enabled: false, inputs: [], selectedId: null, recall: null, error: null });
}

/** Manual all-notes-off for the UI "panic" button. */
export const midiPanic = panic;
