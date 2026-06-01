<script lang="ts">
  import { onDestroy } from "svelte";
  import { audioEngine } from "../audio/AudioEngine";
  import { audioReadyStore, activeNotesStore } from "../state/stores";

  /**
   * Mobile-only tappable note strip — interim playability for phones until the
   * M3 staff editor lands. Single-octave chip row plus ◀/▶ octave shift. Lives
   * behind a (pointer:coarse) gate so desktop never sees it.
   *
   * Note state is local (no shared octave with KeyboardHarness) — fine for an
   * interim surface; the M3 staff will own the canonical melody/playback state.
   */

  // Pitch class metadata. `accidental` distinguishes black keys for styling
  // (colour-blind safe: a different background tone + offset, not hue alone).
  const NOTES: Array<{ name: string; offset: number; accidental: boolean }> = [
    { name: "C",  offset: 0,  accidental: false },
    { name: "C♯", offset: 1,  accidental: true  },
    { name: "D",  offset: 2,  accidental: false },
    { name: "D♯", offset: 3,  accidental: true  },
    { name: "E",  offset: 4,  accidental: false },
    { name: "F",  offset: 5,  accidental: false },
    { name: "F♯", offset: 6,  accidental: true  },
    { name: "G",  offset: 7,  accidental: false },
    { name: "G♯", offset: 8,  accidental: true  },
    { name: "A",  offset: 9,  accidental: false },
    { name: "A♯", offset: 10, accidental: true  },
    { name: "B",  offset: 11, accidental: false },
  ];

  let ready = $state(false);
  let octave = $state(4);              // C4 default — matches QWERTY harness
  let held = $state<Set<number>>(new Set());

  // pointerId → midi note. Lets us release the right note on multitouch.
  const owned = new Map<number, number>();

  audioReadyStore.subscribe((v) => { ready = v; });

  function midiOf(offset: number): number {
    return 12 * octave + offset;
  }

  function start(midi: number, pointerId: number) {
    if (owned.has(pointerId)) return;
    const eng = audioEngine.currentEngine;
    if (!eng) return;
    owned.set(pointerId, midi);
    if (!held.has(midi)) {
      eng.noteOn(midi, { velocity: 0.85 });
      held = new Set(held).add(midi);
      activeNotesStore.set(held);
    }
  }

  function stop(pointerId: number) {
    const midi = owned.get(pointerId);
    if (midi === undefined) return;
    owned.delete(pointerId);
    const eng = audioEngine.currentEngine;
    // Only release if no other active pointer is still holding the same note.
    let stillHeld = false;
    for (const v of owned.values()) if (v === midi) { stillHeld = true; break; }
    if (!stillHeld) {
      eng?.noteOff(midi);
      const next = new Set(held); next.delete(midi); held = next;
      activeNotesStore.set(held);
    }
  }

  function releaseAll() {
    if (owned.size === 0 && held.size === 0) return;
    const eng = audioEngine.currentEngine;
    owned.clear();
    if (eng) { for (const m of held) eng.noteOff(m); eng.allNotesOff(); }
    held = new Set();
    activeNotesStore.set(held);
  }

  function onChipDown(e: PointerEvent, midi: number) {
    if (!ready) return;
    e.preventDefault();
    start(midi, e.pointerId);
  }
  function onChipUp(e: PointerEvent) {
    stop(e.pointerId);
  }
  function onChipLeave(e: PointerEvent) {
    // Finger slid off the chip — release. (We don't capture the pointer, so
    // sliding to a neighbouring chip won't re-trigger; that's a deliberate
    // interim simplification, fine for the M3-handoff window.)
    if (e.buttons === 0) return;   // only treat as leave if the pointer is down
    stop(e.pointerId);
  }

  // Catch the case where the page hides mid-tap — same hardening as the
  // QWERTY harness so no note can drone after a tab switch.
  function onVisibility() {
    if (document.visibilityState === "hidden") releaseAll();
  }
  $effect(() => {
    window.addEventListener("blur", releaseAll);
    document.addEventListener("visibilitychange", onVisibility);
    return () => {
      window.removeEventListener("blur", releaseAll);
      document.removeEventListener("visibilitychange", onVisibility);
    };
  });
  onDestroy(releaseAll);
</script>

<div class="note-strip" role="group" aria-label="Touch note strip">
  <button class="oct" aria-label="Octave down"
    onclick={() => { octave = Math.max(0, octave - 1); }}
    disabled={!ready || octave === 0}>◀</button>
  <div class="oct-label">oct&nbsp;<strong>{octave}</strong></div>

  <div class="chips">
    {#each NOTES as note (note.offset)}
      {@const midi = midiOf(note.offset)}
      <button
        class="chip"
        class:black={note.accidental}
        class:held={held.has(midi)}
        disabled={!ready}
        aria-label="{note.name} octave {octave}"
        onpointerdown={(e) => onChipDown(e, midi)}
        onpointerup={onChipUp}
        onpointercancel={onChipUp}
        onpointerleave={onChipLeave}
      >{note.name}</button>
    {/each}
  </div>

  <button class="oct" aria-label="Octave up"
    onclick={() => { octave = Math.min(8, octave + 1); }}
    disabled={!ready || octave === 8}>▶</button>
</div>

<style>
  /* Strip is hidden by default — only surfaces on finger-class pointers. */
  .note-strip { display: none; }
  @media (pointer: coarse) {
    .note-strip {
      display: flex;
      flex: 0 0 auto;
      align-items: stretch;
      gap: 4px;
      padding: 8px;
      background: var(--surface);
      border-top: var(--hairline-w) solid var(--hairline);
      touch-action: none;     /* taps must not select text or scroll the page */
      user-select: none;
      -webkit-user-select: none;
    }
  }
  .chips {
    flex: 1 1 auto;
    display: grid;
    grid-template-columns: repeat(12, 1fr);
    gap: 3px;
  }
  .chip {
    min-height: 48px;
    min-width: 0;
    padding: 6px 2px;
    background: var(--surface-raised);
    border: var(--hairline-w) solid var(--hairline);
    border-radius: var(--radius-md);
    color: var(--text);
    font-family: var(--font-mono);
    font-size: 0.78rem;
    font-variant-numeric: tabular-nums;
    /* Snappy press feedback — local, not RAF-coalesced. */
    transition: transform var(--t-fast), background var(--t-fast), border-color var(--t-fast);
  }
  /* Accidentals get a darker fill and slightly muted label — readable without
     leaning on hue (colour-blind rule: brightness + label, never hue alone). */
  .chip.black {
    background: var(--surface-sunken);
    color: var(--text-muted);
    border-color: var(--hairline-soft);
  }
  .chip:active:not(:disabled),
  .chip.held {
    background: var(--signal-deep);
    border-color: var(--signal);
    color: var(--signal-ink);
    transform: translateY(1px);
  }
  .chip:disabled { opacity: 0.4; }

  .oct {
    min-width: 44px;
    min-height: 48px;
    padding: 0 10px;
    background: var(--surface-raised);
    border: var(--hairline-w) solid var(--hairline);
    border-radius: var(--radius-md);
    color: var(--text);
    font-family: var(--font-mono);
    font-size: 0.95rem;
  }
  .oct:disabled { opacity: 0.3; }
  .oct-label {
    align-self: center;
    padding: 0 6px;
    font-family: var(--font-mono);
    font-size: 0.7rem;
    color: var(--text-dim);
  }
  .oct-label strong {
    color: var(--signal-ink);
    font-weight: 600;
  }
</style>
