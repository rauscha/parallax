<script lang="ts">
  import { onDestroy } from "svelte";
  import { audioEngine } from "../audio/AudioEngine";
  import { audioReadyStore, publishActiveNotes } from "../state/stores";

  /**
   * Mobile-only tappable note strip — interim playability for phones until the
   * M3 staff editor lands. Single-octave chip row plus ◀/▶ octave shift. Lives
   * behind a (pointer:coarse) gate so desktop never sees it.
   *
   * Note state is local (no shared octave with KeyboardHarness) — fine for an
   * interim surface; the M3 staff will own the canonical melody/playback state.
   */

  // Two-row piano layout: naturals on the bottom, accidentals floated above
  // between their adjacent whites. 14-col grid → each white spans 2 cols,
  // each black straddles the boundary between its neighbours.
  const NATURALS: Array<{ name: string; offset: number; col: number }> = [
    { name: "C", offset: 0,  col: 1  },
    { name: "D", offset: 2,  col: 3  },
    { name: "E", offset: 4,  col: 5  },
    { name: "F", offset: 5,  col: 7  },
    { name: "G", offset: 7,  col: 9  },
    { name: "A", offset: 9,  col: 11 },
    { name: "B", offset: 11, col: 13 },
  ];
  const ACCIDENTALS: Array<{ name: string; offset: number; col: number }> = [
    { name: "C♯", offset: 1,  col: 2  },
    { name: "D♯", offset: 3,  col: 4  },
    { name: "F♯", offset: 6,  col: 8  },
    { name: "G♯", offset: 8,  col: 10 },
    { name: "A♯", offset: 10, col: 12 },
  ];

  let ready = $state(false);
  let octave = $state(4);              // C4 default — matches QWERTY harness
  let collapsed = $state(false);       // tuck the keys away to reclaim screen
  let held = $state<Set<number>>(new Set());

  // pointerId → midi note. Lets us release the right note on multitouch.
  const owned = new Map<number, number>();

  const unsubReady = audioReadyStore.subscribe((v) => { ready = v; });

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
      publishActiveNotes("notestrip", held);
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
      publishActiveNotes("notestrip", held);
    }
  }

  function releaseAll() {
    if (owned.size === 0 && held.size === 0) return;
    const eng = audioEngine.currentEngine;
    owned.clear();
    if (eng) { for (const m of held) eng.noteOff(m); eng.allNotesOff(); }
    held = new Set();
    publishActiveNotes("notestrip", held);
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
  onDestroy(() => { releaseAll(); unsubReady(); });
</script>

<div class="note-strip" class:collapsed role="group" aria-label="Touch note strip">
  {#if collapsed}
    <button class="reveal" onclick={() => (collapsed = false)}
      aria-expanded="false" aria-label="Show note keys">▴ Note keys</button>
  {:else}
    <button class="oct" aria-label="Octave down"
      onclick={() => { octave = Math.max(0, octave - 1); }}
      disabled={!ready || octave === 0}>◀</button>
    <div class="oct-label">oct&nbsp;<strong>{octave}</strong></div>

    <div class="chips">
      {#each ACCIDENTALS as note (note.offset)}
        {@const midi = midiOf(note.offset)}
        <button
          class="chip black"
          class:held={held.has(midi)}
          disabled={!ready}
          style="grid-row: 1; grid-column: {note.col} / span 2;"
          aria-label="{note.name} octave {octave}"
          onpointerdown={(e) => onChipDown(e, midi)}
          onpointerup={onChipUp}
          onpointercancel={onChipUp}
          onpointerleave={onChipLeave}
        >{note.name}</button>
      {/each}
      {#each NATURALS as note (note.offset)}
        {@const midi = midiOf(note.offset)}
        <button
          class="chip"
          class:held={held.has(midi)}
          disabled={!ready}
          style="grid-row: 2; grid-column: {note.col} / span 2;"
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
    <button class="oct collapse" aria-label="Hide note keys" title="Hide note keys"
      onclick={() => (collapsed = true)}>▾</button>
  {/if}
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
    grid-template-columns: repeat(14, 1fr);
    grid-template-rows: 1fr 1fr;
    gap: 3px;
  }
  /* Suppress the long-press callout/selection menu (Android "download/select"
     popup, iOS magnifier) on the key + octave buttons — they're instruments,
     not text. touch-action:none also keeps a held key from scrolling/zooming. */
  .chip, .oct, .reveal {
    -webkit-touch-callout: none;
    user-select: none;
    -webkit-user-select: none;
    touch-action: none;
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

  /* Collapse affordance — a slim chevron matching the octave buttons, plus the
     full-width "reveal" bar shown once the keys are tucked away. */
  .oct.collapse {
    min-width: 40px;
    font-size: 0.85rem;
  }
  .note-strip.collapsed { padding: 4px 8px; }
  .reveal {
    flex: 1 1 auto;
    min-height: 32px;
    padding: 6px 10px;
    background: var(--surface-raised);
    border: var(--hairline-w) solid var(--hairline);
    border-radius: var(--radius-md);
    color: var(--text-dim);
    font-family: var(--font-mono);
    font-size: 0.72rem;
    letter-spacing: 0.06em;
    transition: color var(--t-fast), border-color var(--t-fast);
  }
  .reveal:hover { color: var(--text); border-color: var(--signal); }
</style>
