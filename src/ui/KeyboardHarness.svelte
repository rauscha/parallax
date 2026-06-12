<script lang="ts">
  import { onMount, onDestroy } from "svelte";
  import { audioEngine } from "../audio/AudioEngine";
  import { audioReadyStore, activeNotesStore } from "../state/stores";

  // QWERTY → MIDI note offset (standard Ableton/web layout, A = C of the current octave)
  // Lower row: Z S X D C V G B H N J M , — bottom octave
  // Upper row: Q 2 W 3 E R 5 T 6 Y 7 U — top octave
  const KEY_MAP: Record<string, number> = {
    "KeyZ": 0,  "KeyS": 1,  "KeyX": 2,  "KeyD": 3,  "KeyC": 4,  "KeyV": 5,
    "KeyG": 6,  "KeyB": 7,  "KeyH": 8,  "KeyN": 9,  "KeyJ": 10, "KeyM": 11,
    "Comma": 12, "KeyL": 13, "Period": 14, "Semicolon": 15, "Slash": 16,
    "KeyQ": 12, "Digit2": 13, "KeyW": 14, "Digit3": 15, "KeyE": 16,
    "KeyR": 17, "Digit5": 18, "KeyT": 19, "Digit6": 20, "KeyY": 21,
    "Digit7": 22, "KeyU": 23, "KeyI": 24, "Digit9": 25, "KeyO": 26,
    "Digit0": 27, "KeyP": 28,
  };

  let octave = $state(4);  // start at C4
  let ready = $state(false);
  let held = $state<Set<number>>(new Set());

  // Which midi each physical key actually started. Key-up releases *this* note,
  // not one recomputed from the current octave — otherwise shifting octave
  // while a key is held would noteOff the wrong midi and strand the original.
  const codeToMidi = new Map<string, number>();

  const unsubReady = audioReadyStore.subscribe((v) => { ready = v; });

  function midiFor(code: string): number | null {
    const offset = KEY_MAP[code];
    return offset === undefined ? null : 12 * octave + offset;
  }

  // Don't hijack the keyboard while a form control is focused (dropdown typeahead,
  // and the model-search field arriving in M2 would both fight the note keys otherwise).
  function isEditableTarget(e: KeyboardEvent): boolean {
    const t = e.target as HTMLElement | null;
    if (!t) return false;
    return t.isContentEditable || /^(INPUT|TEXTAREA|SELECT)$/.test(t.tagName);
  }

  function onKeyDown(e: KeyboardEvent) {
    if (!ready) return;
    if (isEditableTarget(e)) return;
    if (e.repeat) return;
    if (e.metaKey || e.ctrlKey || e.altKey) return;
    if (e.code === "Minus" || e.code === "BracketLeft") { octave = Math.max(0, octave - 1); e.preventDefault(); return; }
    if (e.code === "Equal" || e.code === "BracketRight") { octave = Math.min(8, octave + 1); e.preventDefault(); return; }
    const midi = midiFor(e.code);
    if (midi === null) return;
    if (held.has(midi)) return;
    const eng = audioEngine.currentEngine;
    if (!eng) return;
    eng.noteOn(midi, { velocity: 0.85 });
    codeToMidi.set(e.code, midi);
    // Svelte 5 runes don't track Set mutation — reassign with a fresh Set.
    held = new Set(held).add(midi);
    activeNotesStore.set(held);
    e.preventDefault();
  }

  function onKeyUp(e: KeyboardEvent) {
    const midi = codeToMidi.get(e.code);
    if (midi === undefined) return;     // this key wasn't holding a note
    codeToMidi.delete(e.code);
    audioEngine.currentEngine?.noteOff(midi);
    const next = new Set(held);
    next.delete(midi);
    held = next;
    activeNotesStore.set(held);
    e.preventDefault();
  }

  // If focus leaves the window (alt-tab, click in another app, tab hidden)
  // we never see the keyup — without this, notes get stranded "held" and
  // play indefinitely. Release every held note and let the engine know.
  function releaseAllHeld() {
    if (held.size === 0 && codeToMidi.size === 0) return;
    const eng = audioEngine.currentEngine;
    if (eng) {
      for (const midi of held) eng.noteOff(midi);
      eng.allNotesOff();   // defence in depth — also clears the gain ramp
    }
    codeToMidi.clear();
    held = new Set();
    activeNotesStore.set(held);
  }

  function onVisibilityChange() {
    if (document.visibilityState === "hidden") releaseAllHeld();
  }

  onMount(() => {
    window.addEventListener("keydown", onKeyDown);
    window.addEventListener("keyup", onKeyUp);
    window.addEventListener("blur", releaseAllHeld);
    document.addEventListener("visibilitychange", onVisibilityChange);
  });
  onDestroy(() => {
    window.removeEventListener("keydown", onKeyDown);
    window.removeEventListener("keyup", onKeyUp);
    window.removeEventListener("blur", releaseAllHeld);
    document.removeEventListener("visibilitychange", onVisibilityChange);
    unsubReady();
  });
</script>

<div class="hint">
  <span class="label">keyboard</span>
  <span class="readout">
    Z–M row = octave <strong>{octave}</strong>, Q–U row = octave <strong>{octave + 1}</strong> ·
    <kbd>[</kbd>/<kbd>]</kbd> shift octave · {held.size > 0 ? `${held.size} note${held.size > 1 ? 's' : ''} held` : 'idle'}
  </span>
</div>

<style>
  .hint {
    display: flex;
    flex-direction: column;
    gap: 4px;
    padding: 8px 10px;
    border: var(--hairline-w) solid var(--hairline);
    border-radius: var(--radius-md);
    background: var(--surface);
  }
  .readout {
    font-family: var(--font-mono);
    font-size: 0.72rem;
    color: var(--text-muted);
  }
  .readout strong {
    color: var(--signal-ink);
  }
  kbd {
    font-family: var(--font-mono);
    font-size: 0.7rem;
    padding: 1px 5px;
    border: var(--hairline-w) solid var(--hairline);
    border-radius: 2px;
    color: var(--text);
    background: var(--surface-raised);
  }
  /* This is a physical-QWERTY play hint — meaningless on a phone, where the
     tappable NoteStrip is the play surface. Reclaim the column space. */
  @media (max-width: 720px) {
    .hint { display: none; }
  }
</style>
