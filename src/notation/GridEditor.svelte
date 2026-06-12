<script lang="ts">
  import { onDestroy } from "svelte";
  import * as Tone from "tone";
  import { melodyStore, isPlayingStore, type MelodyEvent } from "../state/stores";
  import {
    buildRowMidis, isRoot, isInScale, remapByDegree, randomizeMelody,
    pitchName, COLS_PER_BAR, BARS, TOTAL_STEPS, MIDI_MIN, MIDI_MAX,
  } from "./grid";
  import { preferFlats } from "../sequencer/scales";
  import {
    gridBaseOctaveStore, setGridBaseOctave,
    foldToScaleStore, setFoldToScale,
  } from "./editorMode";
  import { audioEngine } from "../audio/AudioEngine";
  import { hapticTick } from "../ui/haptics";

  /* ——— Store subscriptions ———————————————————————————————————————
     Captured and torn down in onDestroy. GridEditor is conditionally mounted
     (Staff↔Grid toggle); a leaked melodyStore subscriber here is the confirmed
     double-transpose-on-key-change bug (A1) — the live + leaked instances both
     remap, so the melody moves twice. */

  const unsubs: Array<() => void> = [];

  let events    = $state<MelodyEvent[]>(melodyStore.get().events);
  let key       = $state(melodyStore.get().key);
  let scale     = $state(melodyStore.get().scale);
  let baseOctave = $state(gridBaseOctaveStore.get());
  let foldToScale = $state(foldToScaleStore.get());

  // Track previous key/scale so we can remap by degree on change (G4).
  let prevKey   = melodyStore.get().key;
  let prevScale = melodyStore.get().scale;
  let remapping = false;   // guard against re-entrant store write

  unsubs.push(melodyStore.subscribe((mel) => {
    if (remapping) { events = mel.events; return; }

    // Wrapped so a remap/tonal hiccup can't throw out of this listener and break
    // nanostores' notification of every later melodyStore subscriber. On any
    // error we fall back to a plain sync and clear the re-entrancy guard.
    try {
      const keyChanged   = mel.key   !== prevKey;
      const scaleChanged = mel.scale !== prevScale;

      if ((keyChanged || scaleChanged) && foldToScale && mel.scale !== "chromatic") {
        const remapped = remapByDegree(events, prevKey, prevScale, mel.key, mel.scale);
        prevKey   = mel.key;
        prevScale = mel.scale;
        events    = remapped;
        key       = mel.key;
        scale     = mel.scale;
        // Write remapped events back — triggers recursion, guarded by `remapping`.
        remapping = true;
        melodyStore.setKey("events", remapped);
        remapping = false;
        return;
      }

      prevKey   = mel.key;
      prevScale = mel.scale;
      events    = mel.events;
      key       = mel.key;
      scale     = mel.scale;
    } catch (e) {
      console.error("[grid] key/scale remap failed — keeping notes as-is", e);
      remapping = false;
      prevKey = mel.key; prevScale = mel.scale;
      events = mel.events; key = mel.key; scale = mel.scale;
    }
  }));

  unsubs.push(gridBaseOctaveStore.subscribe(v => { baseOctave   = v; }));
  unsubs.push(foldToScaleStore.subscribe(   v => { foldToScale  = v; }));

  /* ——— Responsive octave span ————————————————————————————————————
     Two octaves of rows are too tall to show well on a phone — they overflow
     the panel and crowd the labels. Below the mobile breakpoint we drop to a
     single octave so the whole grid fits. matchMedia (not editorWidth) so it
     tracks the same 720px breakpoint as the rest of the mobile layout. */

  let narrow = $state(false);
  $effect(() => {
    const mq = window.matchMedia("(max-width: 720px)");
    narrow = mq.matches;
    const onChange = (e: MediaQueryListEvent) => { narrow = e.matches; };
    mq.addEventListener("change", onChange);
    return () => mq.removeEventListener("change", onChange);
  });
  let octaveSpan = $derived(narrow ? 1 : 2);

  /* ——— Derived geometry ———————————————————————————————————————— */

  let useFlats   = $derived(preferFlats(key, scale));
  let rowMidis   = $derived(buildRowMidis(key, scale, baseOctave, foldToScale, octaveSpan));

  /* ——— Bar page + responsive view ————————————————————————————————
     barPage (0..3) is the "active" bar — what the playhead/cursor sit on and
     what the tabs highlight. On a wide enough panel the grid shows TWO bars
     side-by-side, so the visible window is *derived* from barPage rather than
     equal to it (it snaps to a bar-pair). On a narrow panel it's one bar. */

  let barPage = $state(0);
  let editorWidth = $state(0);
  let gridHeight = $state(0);
  // While playing, the playhead auto-scrolls barPage to the bar it's in. A
  // manual bar tap/swipe turns that off so you can inspect/edit another bar
  // without it being yanked back every frame; pressing play re-enables it.
  let autoFollow = $state(true);

  /** Scale the pitch-label font to the row height so letters fit their rows and
   *  stay aligned on short (laptop) screens. null before the height is measured
   *  → the CSS fallback size applies. */
  let labelFs = $derived.by(() => {
    const n = rowMidis.length;
    if (!n || !gridHeight) return null;
    const fs = Math.max(6, Math.min(9, (gridHeight / n) * 0.74));
    return `${fs.toFixed(1)}px`;
  });

  let colsPerView   = $derived(editorWidth >= 560 ? COLS_PER_BAR * 2 : COLS_PER_BAR);
  let barsPerView   = $derived(colsPerView / COLS_PER_BAR);                      // 1 or 2
  let viewStartBar  = $derived(barsPerView === 2 ? barPage - (barPage % 2) : barPage);
  let viewStartStep = $derived(viewStartBar * COLS_PER_BAR);

  /* ——— Interaction constants ——————————————————————————————————— */

  const DEFAULT_DURATION = 4;   // quarter note

  /* ——— Note-entry feedback — hear (and feel) the pitch you place ————
     A tap always gives a haptic tick. The audible preview is suppressed while
     the transport is running, since the engine is monophonic and a preview
     would steal the voice mid-loop and glitch playback. */

  let isPlaying = $state(false);
  let previewTimer = 0;
  let previewMidi: number | null = null;

  function previewNote(midi: number): void {
    hapticTick(6);
    if (isPlaying) return;
    const eng = audioEngine.currentEngine;
    if (!eng) return;
    // Release any still-ringing preview first — one mono voice.
    if (previewMidi !== null) { try { eng.noteOff(previewMidi); } catch {} }
    clearTimeout(previewTimer);
    eng.noteOn(midi, { velocity: 0.7 });
    previewMidi = midi;
    previewTimer = window.setTimeout(() => {
      try { eng.noteOff(midi); } catch {}
      previewMidi = null;
    }, 220);
  }

  function clampMidi(n: number): number {
    return Math.max(MIDI_MIN, Math.min(MIDI_MAX, n));
  }

  /* ——— Drag state ——————————————————————————————————————————————— */

  let dragState = $state<null | {
    mode: "place" | "toggle";   // toggle = potential delete (becomes place if dragged)
    startStep: number;
    midi: number;
    durationSteps: number;
    maxDur: number;
    pointerId: number;
    userDragged: boolean;
  }>(null);

  /* ——— Hover ghost ————————————————————————————————————————————— */

  let hoverCell = $state<null | { midi: number; col: number }>(null);

  /* ——— Preview events (overlay drag state, same pattern as staff) */

  let previewEvents = $derived.by((): MelodyEvent[] => {
    if (!dragState || dragState.mode === "toggle") return events;
    const out: MelodyEvent[] = [];
    for (const e of events) {
      // Trim a note whose duration covers the drag start
      if (e.startStep < dragState.startStep &&
          dragState.startStep < e.startStep + e.durationSteps) {
        const newDur = dragState.startStep - e.startStep;
        if (newDur > 0) out.push({ ...e, durationSteps: newDur });
        continue;
      }
      // Remove the note that exactly starts here (will be replaced)
      if (e.startStep === dragState.startStep) continue;
      out.push(e);
    }
    out.push({
      startStep: dragState.startStep,
      durationSteps: dragState.durationSteps,
      midi: dragState.midi,
    });
    out.sort((a, b) => a.startStep - b.startStep);
    return out;
  });

  /* ——— Cell map: "midi-step" → { event, isStart } for O(1) lookup */

  type CellEntry = { event: MelodyEvent; isStart: boolean };

  let cellMap = $derived.by((): Map<string, CellEntry> => {
    const m = new Map<string, CellEntry>();
    for (const e of previewEvents) {
      for (let s = e.startStep; s < e.startStep + e.durationSteps && s < TOTAL_STEPS; s++) {
        m.set(`${e.midi}-${s}`, { event: e, isStart: s === e.startStep });
      }
    }
    return m;
  });

  /* ——— Helpers ————————————————————————————————————————————————— */

  /** First note whose startStep > step, or null. */
  function nextNoteAfterStep(step: number): MelodyEvent | null {
    let best: MelodyEvent | null = null;
    for (const e of events) {
      if (e.startStep > step && (!best || e.startStep < best.startStep)) best = e;
    }
    return best;
  }

  /** Place a note at `startStep`, trimming any note that overlaps it and
   *  replacing any note that starts on the same step. Shared by the pointer
   *  drag-commit path and the keyboard Space-to-place path. */
  function placeNote(startStep: number, midi: number, durationSteps: number): void {
    const out: MelodyEvent[] = [];
    for (const e of events) {
      if (e.startStep < startStep && startStep < e.startStep + e.durationSteps) {
        const newDur = startStep - e.startStep;
        if (newDur > 0) out.push({ ...e, durationSteps: newDur });
        continue;
      }
      if (e.startStep === startStep) continue;
      out.push(e);
    }
    out.push({ startStep, durationSteps, midi: clampMidi(midi) });
    out.sort((a, b) => a.startStep - b.startStep);
    melodyStore.setKey("events", out);
  }

  /** Remove the note that starts exactly at (startStep, midi). */
  function deleteNoteAt(startStep: number, midi: number): void {
    melodyStore.setKey("events",
      events.filter(e => !(e.startStep === startStep && e.midi === midi)));
  }

  function commitFromDragState(): void {
    if (!dragState || dragState.mode !== "place") return;
    placeNote(dragState.startStep, dragState.midi, dragState.durationSteps);
  }

  /* ——— Pointer handling (delegation on grid surface div) ————————— */

  let gridEl: HTMLDivElement;

  function coordsFromEvent(evt: PointerEvent): { col: number; midiIdx: number } | null {
    const rect = gridEl.getBoundingClientRect();
    const relX = evt.clientX - rect.left;
    const relY = evt.clientY - rect.top;
    const col = Math.floor((relX / rect.width)  * colsPerView);
    // rowMidis is low→high; display is high→low (top = last midi)
    const rowIdx = Math.floor((relY / rect.height) * rowMidis.length);
    if (col < 0 || col >= colsPerView) return null;
    if (rowIdx < 0 || rowIdx >= rowMidis.length) return null;
    // invert: display row 0 = highest midi = rowMidis[rowMidis.length - 1]
    const midiIdx = rowMidis.length - 1 - rowIdx;
    return { col, midiIdx };
  }

  function onPointerDown(evt: PointerEvent): void {
    if (evt.button !== 0) return;
    const coords = coordsFromEvent(evt);
    if (!coords) return;

    const { col, midiIdx } = coords;
    const midi = rowMidis[midiIdx];
    const step = viewStartStep + col;
    const existing = cellMap.get(`${midi}-${step}`);

    gridEl.setPointerCapture(evt.pointerId);
    cursor = { midi, step };   // keep keyboard cursor in sync with last tap

    if (existing?.isStart) {
      // Tap on start of note → potential delete (becomes re-place if dragged)
      dragState = {
        mode: "toggle",
        startStep: step, midi,
        durationSteps: existing.event.durationSteps,
        maxDur: 0, pointerId: evt.pointerId, userDragged: false,
      };
      return;
    }

    const next    = nextNoteAfterStep(step);
    const maxDur  = next ? Math.max(1, next.startStep - step) : TOTAL_STEPS - step;
    const defDur  = Math.min(DEFAULT_DURATION, maxDur);

    dragState = {
      mode: "place",
      startStep: step, midi,
      durationSteps: defDur,
      maxDur, pointerId: evt.pointerId, userDragged: false,
    };
    previewNote(midi);   // hear + feel the pitch you're placing
  }

  function onPointerMove(evt: PointerEvent): void {
    if (!dragState || evt.pointerId !== dragState.pointerId) {
      // No active drag → update hover ghost (mouse/pen only)
      const coords = coordsFromEvent(evt);
      if (coords) {
        const midi = rowMidis[coords.midiIdx];
        hoverCell = { midi, col: coords.col };
      } else {
        hoverCell = null;
      }
      return;
    }

    const coords = coordsFromEvent(evt);
    if (!coords) return;
    const col = coords.col;

    if (dragState.mode === "toggle") {
      // Detect drag: if pointer moved to a different column, upgrade to place mode
      const startCol = dragState.startStep - viewStartStep;
      if (col !== startCol) {
        const next   = nextNoteAfterStep(dragState.startStep);
        const maxDur = next ? Math.max(1, next.startStep - dragState.startStep) : TOTAL_STEPS - dragState.startStep;
        const span   = Math.max(1, col - startCol + 1);
        dragState = {
          mode: "place",
          startStep: dragState.startStep,
          midi: dragState.midi,
          durationSteps: Math.min(span, maxDur),
          maxDur,
          pointerId: dragState.pointerId,
          userDragged: true,
        };
      }
      return;
    }

    // Place mode: extend duration
    const startCol = dragState.startStep - viewStartStep;
    const span     = Math.max(1, col - startCol + 1);
    const clamped  = Math.min(span, dragState.maxDur);
    if (clamped !== dragState.durationSteps) {
      dragState = { ...dragState, durationSteps: clamped, userDragged: true };
    }
  }

  function onPointerUp(evt: PointerEvent): void {
    if (!dragState || evt.pointerId !== dragState.pointerId) return;
    try { gridEl.releasePointerCapture(evt.pointerId); } catch {}

    if (dragState.mode === "toggle" && !dragState.userDragged) {
      // Pure tap on note start → delete it
      deleteNoteAt(dragState.startStep, dragState.midi);
    } else {
      commitFromDragState();
    }
    dragState = null;
    hoverCell = null;
  }

  function onPointerCancel(evt: PointerEvent): void {
    if (dragState?.pointerId === evt.pointerId) {
      dragState = null;
      hoverCell = null;
    }
  }

  function onPointerLeave(): void {
    if (!dragState) hoverCell = null;
  }

  /* ——— Playhead (G3) — RAF sweep, auto-follows bar page ————————— */

  let playheadCol = $state<number | null>(null);  // column within current bar page
  let raf = 0;

  function tickPlayhead(): void {
    const transport = Tone.getTransport();
    if (transport.state !== "started") {
      playheadCol = null;
      raf = 0;
      return;
    }
    const bpm      = transport.bpm.value;
    const loopSec  = (60 / bpm) * 16;         // 4 bars × 4 beats
    const within   = ((transport.seconds % loopSec) + loopSec) % loopSec;
    const step     = (within / loopSec) * TOTAL_STEPS;
    const stepInt  = Math.floor(step);
    const currentBar = Math.floor(stepInt / COLS_PER_BAR);

    // Auto-follow the active bar — unless the user has manually navigated.
    if (autoFollow && currentBar !== barPage) barPage = currentBar;

    // Position within the (possibly 2-bar) visible window — computed from
    // currentBar directly so it stays consistent regardless of derived timing.
    const startBar = barsPerView === 2 ? currentBar - (currentBar % 2) : currentBar;
    playheadCol = step - startBar * COLS_PER_BAR;
    raf = requestAnimationFrame(tickPlayhead);
  }

  unsubs.push(isPlayingStore.subscribe((playing) => {
    isPlaying = playing;
    if (playing && !raf) {
      autoFollow = true;   // a fresh play resumes follow-the-playhead
      raf = requestAnimationFrame(tickPlayhead);
    } else if (!playing) {
      if (raf) cancelAnimationFrame(raf);
      raf = 0;
      playheadCol = null;
    }
  }));

  onDestroy(() => {
    if (raf) cancelAnimationFrame(raf);
    clearTimeout(previewTimer);
    if (previewMidi !== null) { try { audioEngine.currentEngine?.noteOff(previewMidi); } catch {} }
    unsubs.forEach((u) => u());
  });

  /* ——— G4: Randomize ————————————————————————————————————————————— */

  function handleRandomize(): void {
    const evs = randomizeMelody(key, scale, baseOctave, octaveSpan);
    melodyStore.setKey("events", evs);
  }

  /* ——— Keyboard navigation — selection cursor + Space toggle ————————
     Arrow keys move a highlighted cursor cell; Space/Enter place or remove
     a note there; Delete/Backspace removes one. The cursor is also synced to
     the last pointer interaction so tap and type share one position. */

  let cursor = $state<null | { midi: number; step: number }>(null);

  /** Seed/repair the cursor — snap to a valid row if the scale view changed. */
  function ensureCursor(): void {
    if (cursor && rowMidis.includes(cursor.midi)) return;
    const rootIdx = rowMidis.findIndex(m => isRoot(m, key));
    const idx = rootIdx >= 0 ? rootIdx : Math.floor(rowMidis.length / 2);
    cursor = { midi: rowMidis[idx] ?? MIDI_MIN, step: viewStartStep };
  }

  function moveCursor(dRow: number, dStep: number): void {
    ensureCursor();
    if (!cursor) return;
    let idx = rowMidis.indexOf(cursor.midi);
    if (idx === -1) idx = Math.floor(rowMidis.length / 2);
    idx = Math.max(0, Math.min(rowMidis.length - 1, idx + dRow));
    const step = Math.max(0, Math.min(TOTAL_STEPS - 1, cursor.step + dStep));
    cursor = { midi: rowMidis[idx], step };
    const bar = Math.floor(step / COLS_PER_BAR);
    if (bar !== barPage) barPage = bar;   // follow the cursor across bars
  }

  function toggleCursorCell(): void {
    ensureCursor();
    if (!cursor) return;
    const { midi, step } = cursor;
    const existing = cellMap.get(`${midi}-${step}`);
    if (existing?.isStart) {
      deleteNoteAt(step, midi);
      return;
    }
    const next   = nextNoteAfterStep(step);
    const maxDur = next ? Math.max(1, next.startStep - step) : TOTAL_STEPS - step;
    placeNote(step, midi, Math.min(DEFAULT_DURATION, maxDur));
    previewNote(midi);
  }

  function onKeyDown(evt: KeyboardEvent): void {
    switch (evt.key) {
      case "ArrowUp":    evt.preventDefault(); moveCursor(+1, 0); break;
      case "ArrowDown":  evt.preventDefault(); moveCursor(-1, 0); break;
      case "ArrowLeft":  evt.preventDefault(); moveCursor(0, -1); break;
      case "ArrowRight": evt.preventDefault(); moveCursor(0, +1); break;
      case " ":
      case "Enter":      evt.preventDefault(); toggleCursorCell(); break;
      case "Delete":
      case "Backspace": {
        evt.preventDefault();
        if (cursor && cellMap.get(`${cursor.midi}-${cursor.step}`)?.isStart) {
          deleteNoteAt(cursor.step, cursor.midi);
        }
        break;
      }
    }
  }

  /* ——— Swipe between bars — on the tab strip + label gutter ————————
     The grid cells own horizontal drag (note-extend), so bar swipe lives on
     the non-cell zones. Pointer capture lets a swipe track even off the narrow
     gutter; a swipe that fires swallows the trailing click on a tab button. */

  const SWIPE_THRESHOLD = 36;   // px of horizontal travel to flip a bar
  const SWIPE_CAPTURE_AT = 8;   // px of travel before we grab the pointer
  let swipeStart: null | { x: number; y: number; id: number; el: HTMLElement; captured: boolean } = null;
  let swipeHandled = false;     // true right after a swipe → eats the next tab click

  function onSwipeDown(evt: PointerEvent): void {
    swipeStart = {
      x: evt.clientX, y: evt.clientY, id: evt.pointerId,
      el: evt.currentTarget as HTMLElement, captured: false,
    };
    swipeHandled = false;
    // Deliberately DON'T setPointerCapture here. Capturing on pointerdown makes
    // the browser dispatch the following `click` to this container instead of the
    // bar-tab <button> under the pointer, so the button's onclick never runs and
    // tapping a tab silently fails to change bars. Capture lazily — only once a
    // real horizontal drag is underway (onSwipeMove) — so a plain tap stays a
    // normal button click while a swipe still tracks off the narrow gutter.
  }

  function onSwipeMove(evt: PointerEvent): void {
    if (!swipeStart || swipeStart.id !== evt.pointerId || swipeStart.captured) return;
    const dx = evt.clientX - swipeStart.x;
    const dy = evt.clientY - swipeStart.y;
    if (Math.abs(dx) > SWIPE_CAPTURE_AT && Math.abs(dx) > Math.abs(dy)) {
      try { swipeStart.el.setPointerCapture(evt.pointerId); } catch {}
      swipeStart.captured = true;
    }
  }

  function onSwipeUp(evt: PointerEvent): void {
    if (!swipeStart || swipeStart.id !== evt.pointerId) return;
    const dx = evt.clientX - swipeStart.x;
    const dy = evt.clientY - swipeStart.y;
    if (swipeStart.captured) {
      try { swipeStart.el.releasePointerCapture?.(evt.pointerId); } catch {}
    }
    swipeStart = null;
    if (Math.abs(dx) > SWIPE_THRESHOLD && Math.abs(dx) > Math.abs(dy)) {
      // swipe left → next page, swipe right → previous page (a page = 1 or 2 bars)
      barPage = Math.max(0, Math.min(BARS - 1, barPage + (dx < 0 ? 1 : -1) * barsPerView));
      autoFollow = false;   // manual navigation wins over playhead follow
      swipeHandled = true;
    }
  }

  function selectBar(bar: number): void {
    if (swipeHandled) { swipeHandled = false; return; }   // was a swipe, not a tap
    barPage = bar;
    autoFollow = false;   // manual navigation wins over playhead follow
  }
</script>

<!-- ─── Bar tabs ─────────────────────────────────────────────────────── -->
<div class="grid-editor" bind:clientWidth={editorWidth}>
  <div
    class="bar-tabs"
    role="group"
    aria-label="Bar navigation — tap a bar, or swipe left/right to move between bars"
    onpointerdown={onSwipeDown}
    onpointermove={onSwipeMove}
    onpointerup={onSwipeUp}
  >
    {#each Array.from({ length: BARS }, (_, i) => i) as bar}
      <button
        class="bar-tab"
        class:active={barPage === bar}
        class:in-view={barsPerView === 2 && bar >= viewStartBar && bar < viewStartBar + barsPerView && bar !== barPage}
        onclick={() => selectBar(bar)}
        aria-pressed={barPage === bar}
      >Bar {bar + 1}</button>
    {/each}
  </div>

  <!-- ─── Main grid (row labels + cells) ───────────────────────── -->
  <div class="grid-main" bind:clientHeight={gridHeight}>
    <!-- Row labels (right-aligned pitch names) — also a swipe zone for bars -->
    <!-- svelte-ignore a11y_no_noninteractive_element_interactions -->
    <div
      class="row-labels"
      aria-hidden="true"
      style:--row-count={rowMidis.length}
      style:--label-fs={labelFs}
      onpointerdown={onSwipeDown}
      onpointermove={onSwipeMove}
      onpointerup={onSwipeUp}
    >
      {#each rowMidis.toReversed() as midi}
        <div
          class="row-label"
          class:root={isRoot(midi, key)}
          class:in-scale={!foldToScale && isInScale(midi, key, scale)}
        >{pitchName(midi, useFlats)}</div>
      {/each}
    </div>

    <!-- Cell grid — an intentional interactive application surface: it takes
         keyboard focus for arrow-key navigation and owns pointer + key handlers. -->
    <!-- svelte-ignore a11y_no_noninteractive_element_interactions -->
    <!-- svelte-ignore a11y_no_noninteractive_tabindex -->
    <div
      class="grid-surface"
      style:--row-count={rowMidis.length}
      style:--cols={colsPerView}
      bind:this={gridEl}
      role="application"
      tabindex="0"
      aria-label="Step sequencer grid — tap or use arrow keys to move; Space places or removes a note; drag right to extend"
      onpointerdown={onPointerDown}
      onpointermove={onPointerMove}
      onpointerup={onPointerUp}
      onpointercancel={onPointerCancel}
      onpointerleave={onPointerLeave}
      onkeydown={onKeyDown}
    >
      {#each rowMidis.toReversed() as midi}
        {#each Array.from({ length: colsPerView }, (_, col) => col) as col}
          {@const step = viewStartStep + col}
          {@const entry = cellMap.get(`${midi}-${step}`)}
          {@const isGhost = !dragState && hoverCell?.midi === midi && hoverCell?.col === col}
          {@const isBeat  = col % 4 === 0}
          {@const isBarStart = col > 0 && col % COLS_PER_BAR === 0}
          {@const isCursor = cursor?.midi === midi && cursor?.step === step}
          <div
            class="cell"
            class:note-start={entry?.isStart}
            class:note-tail={entry && !entry.isStart}
            class:ghost={isGhost}
            class:cursor={isCursor}
            class:root-row={isRoot(midi, key)}
            class:off-key={!foldToScale && !isInScale(midi, key, scale)}
            class:beat-start={isBeat}
            class:bar-start={isBarStart}
            data-midi={midi}
            data-col={col}
          ></div>
        {/each}
      {/each}

      <!-- Playhead overlay — positioned with inline style -->
      {#if playheadCol !== null}
        <div
          class="playhead"
          style:left={`${(playheadCol / colsPerView) * 100}%`}
        ></div>
      {/if}
    </div>
  </div>

  <!-- ─── Bottom toolbar (G3/G4 controls) ─────────────────────── -->
  <div class="grid-toolbar">
    <div class="octave-ctrl" role="group" aria-label="Octave range">
      <button
        class="oct-btn"
        onclick={() => setGridBaseOctave(baseOctave - 1)}
        disabled={baseOctave <= 2}
        aria-label="Shift pitch range down"
        title="Shift pitch range down"
      >−8va</button>
      <span class="oct-label">C{baseOctave}–C{baseOctave + octaveSpan}</span>
      <button
        class="oct-btn"
        onclick={() => setGridBaseOctave(baseOctave + 1)}
        disabled={baseOctave >= 5}
        aria-label="Shift pitch range up"
        title="Shift pitch range up"
      >+8va</button>
    </div>

    <div class="fold-toggle" role="group" aria-label="Scale mode">
      <button
        class="fold-btn"
        class:active={foldToScale}
        onclick={() => setFoldToScale(true)}
        aria-pressed={foldToScale}
      >In Key</button>
      <button
        class="fold-btn"
        class:active={!foldToScale}
        onclick={() => setFoldToScale(false)}
        aria-pressed={!foldToScale}
      >Chromatic</button>
    </div>

    <button class="randomize-btn" onclick={handleRandomize}>
      ⚄ Randomize
    </button>
  </div>
</div>

<style>
  .grid-editor {
    width: 100%;
    height: 100%;
    display: flex;
    flex-direction: column;
    gap: 4px;
    overflow: hidden;
    font-family: var(--font-mono);
  }

  /* ─── Bar tabs ──────────────────────────────────────────────── */
  .bar-tabs {
    display: flex;
    gap: 2px;
    flex: 0 0 auto;
    touch-action: pan-y;   /* capture horizontal swipe; keep vertical scroll */
  }
  .bar-tab {
    flex: 1;
    font-family: var(--font-mono);
    font-size: 0.65rem;
    letter-spacing: 0.06em;
    text-transform: var(--label-case);
    padding: 4px 0;
    color: var(--text-dim);
    background: var(--surface-sunken);
    border: var(--hairline-w) solid var(--hairline);
    border-radius: var(--radius-sm);
    cursor: pointer;
    transition: color var(--t-fast), background var(--t-fast);
  }
  .bar-tab:hover:not(.active) { color: var(--text); }
  .bar-tab.active {
    background: var(--surface-raised);
    color: var(--text);
    border-color: var(--text-dim);
  }
  /* The other bar in a visible 2-bar pair — shown as present, not selected */
  .bar-tab.in-view {
    background: color-mix(in srgb, var(--surface-raised) 50%, var(--surface-sunken));
    color: var(--text);
  }

  /* ─── Main grid layout ──────────────────────────────────────── */
  .grid-main {
    flex: 1 1 auto;
    min-height: 0;
    display: flex;
    gap: 4px;
  }

  .row-labels {
    flex: 0 0 auto;
    width: 24px;
    display: grid;
    /* Mirror the cell grid's tracks AND its 1px row gap exactly so each label
       lines up with its row. A plain flex column (no gaps) drifted ~1px lower
       per row, which on a short laptop screen stacked into several rows of
       misalignment by the bottom. */
    grid-template-rows: repeat(var(--row-count), 1fr);
    gap: 1px;
    touch-action: pan-y;   /* swipe zone for bar navigation */
  }
  .row-label {
    display: flex;
    align-items: center;
    justify-content: flex-end;
    min-height: 0;       /* let the track shrink to match the (short) cell rows */
    overflow: hidden;    /* clip rather than overflow if a row is tiny */
    /* Font scales to row height (set inline); falls back before measurement. */
    font-size: var(--label-fs, 0.55rem);
    color: var(--text-dim);
    line-height: 1;
    padding-right: 2px;
    user-select: none;
  }
  .row-label.root { color: var(--signal-ink); font-weight: 600; }
  .row-label.in-scale { color: var(--text); }

  /* ─── Cell grid ─────────────────────────────────────────────── */
  .grid-surface {
    flex: 1 1 auto;
    min-height: 0;
    display: grid;
    grid-template-columns: repeat(var(--cols, 16), 1fr);
    grid-template-rows: repeat(var(--row-count), 1fr);
    gap: 1px;
    background: var(--hairline);
    position: relative;
    cursor: crosshair;
    touch-action: none;
    user-select: none;
    -webkit-user-select: none;
    border-radius: var(--radius-sm);
    overflow: hidden;
  }
  .grid-surface:focus-visible {
    outline: 2px solid var(--signal);
    outline-offset: 2px;
  }

  .cell {
    background: var(--surface-sunken);
    transition: background var(--t-fast);
    position: relative;
  }
  /* Subtle beat-start left border to show beats within the bar page */
  .cell.beat-start {
    border-left: 1px solid color-mix(in srgb, var(--hairline) 200%, transparent);
  }
  /* Stronger divider where the second bar begins (2-bar desktop view) */
  .cell.bar-start {
    border-left: 2px solid var(--text-dim);
  }
  /* Root row: faint home-base tint */
  .cell.root-row {
    background: color-mix(in srgb, var(--signal) 7%, var(--surface-sunken));
  }
  /* Off-key rows in chromatic mode: slightly dimmer */
  .cell.off-key {
    background: color-mix(in srgb, var(--bg) 60%, var(--surface-sunken));
  }
  /* Active note — start cell */
  .cell.note-start {
    background: var(--signal);
    border-radius: 3px 0 0 3px;
  }
  /* Active note — tail cells */
  .cell.note-tail {
    background: color-mix(in srgb, var(--signal) 50%, var(--surface-sunken));
  }
  /* Hover ghost (mouse/pen preview) */
  .cell.ghost {
    background: color-mix(in srgb, var(--signal) 28%, var(--surface-sunken));
  }
  /* Keyboard selection cursor — ring drawn over whatever the cell holds */
  .cell.cursor {
    box-shadow: inset 0 0 0 2px var(--text);
    z-index: 2;
  }
  /* Chromatic off-key + root override */
  .cell.root-row.note-start { background: var(--signal); }

  /* Playhead: absolute vertical bar */
  .playhead {
    position: absolute;
    top: 0;
    bottom: 0;
    width: 2px;
    background: var(--signal);
    opacity: 0.9;
    pointer-events: none;
    transform: translateX(-1px);
    box-shadow: 0 0 6px var(--signal);
  }

  /* ─── Bottom toolbar ────────────────────────────────────────── */
  .grid-toolbar {
    flex: 0 0 auto;
    display: flex;
    align-items: center;
    gap: 12px;
    flex-wrap: wrap;
  }

  .octave-ctrl {
    display: inline-flex;
    align-items: center;
    gap: 4px;
  }
  .oct-btn {
    font-family: var(--font-mono);
    font-size: 0.62rem;
    padding: 3px 6px;
    color: var(--text-dim);
    background: var(--surface-sunken);
    border: var(--hairline-w) solid var(--hairline);
    border-radius: var(--radius-sm);
    cursor: pointer;
    transition: color var(--t-fast);
  }
  .oct-btn:hover:not(:disabled) { color: var(--text); }
  .oct-btn:disabled { opacity: 0.35; cursor: not-allowed; }
  .oct-label {
    font-size: 0.62rem;
    color: var(--text-dim);
    min-width: 5em;
    text-align: center;
  }

  .fold-toggle {
    display: inline-flex;
    background: var(--surface-sunken);
    border: var(--hairline-w) solid var(--hairline);
    border-radius: var(--radius-sm);
    padding: 2px;
    gap: 2px;
  }
  .fold-btn {
    font-family: var(--font-mono);
    font-size: 0.62rem;
    letter-spacing: 0.04em;
    padding: 3px 8px;
    color: var(--text-dim);
    background: transparent;
    border: none;
    border-radius: calc(var(--radius-sm) - 2px);
    cursor: pointer;
    transition: color var(--t-fast), background var(--t-fast);
  }
  .fold-btn:hover:not(.active) { color: var(--text); }
  .fold-btn.active {
    background: var(--signal);
    color: var(--on-signal);
    font-weight: 600;
  }

  .randomize-btn {
    font-family: var(--font-mono);
    font-size: 0.65rem;
    letter-spacing: 0.04em;
    padding: 4px 10px;
    color: var(--text-dim);
    background: transparent;
    border: var(--hairline-w) solid var(--hairline);
    border-radius: var(--radius-sm);
    cursor: pointer;
    transition: color var(--t-fast), border-color var(--t-fast);
  }
  .randomize-btn:hover { color: var(--text); border-color: var(--text-dim); }

  @media (pointer: coarse) {
    .bar-tab    { padding: 8px 0; min-height: 36px; }
    .oct-btn    { padding: 7px 10px; min-height: 36px; }
    .fold-btn   { padding: 7px 12px; min-height: 36px; }
    .randomize-btn { padding: 7px 14px; min-height: 36px; }
  }

  /* On the phone layout (App.svelte ≤720px) the four regions size to content
     and the page scrolls, so no ancestor hands the grid a *definite* height.
     `1fr` rows have nothing to resolve against and collapse to a sliver — the
     symptom that hid the grid entirely on mobile. Give each row a pixel floor
     so the surface has an intrinsic height; the `1fr` still lets rows grow if
     there's room. Desktop keeps the pure-`1fr` fill (no clipping in Chromatic
     mode), so this stays scoped to the same breakpoint as the stacked layout. */
  @media (max-width: 720px) {
    /* Size the editor to its content and let the page scroll, instead of
       filling (and being clipped by) the flex-constrained .staff-frame. Paired
       with the row floor below, this lets every row show on the phone. */
    .grid-editor { height: auto; overflow: visible; }
    /* .grid-main is `flex: 0 0 auto` so it takes an *intrinsic* height in the
       column-flex editor (the row floors below supply that height). NOT on
       .grid-surface — that's a child of the *horizontal* .grid-main flex, where
       `flex: 0 0 auto` would size it to its (zero-width `1fr` cells) content and
       collapse the whole grid to a sliver. The surface keeps the desktop
       `flex: 1 1 auto` so it fills the row width; only its *height* is made
       intrinsic, via the row tracks. */
    .grid-main   { flex: 0 0 auto; }
    .grid-surface {
      grid-template-rows: repeat(var(--row-count), minmax(28px, 1fr));
    }
    /* Keep the label gutter's tracks identical to the cells' on mobile too, and
       give the pitch letters more room — at 24px they were cramped against the
       cells and the taller ones clipped. */
    .row-labels {
      width: 30px;
      grid-template-rows: repeat(var(--row-count), minmax(28px, 1fr));
    }
    .row-label { padding-right: 5px; font-size: var(--label-fs, 0.62rem); }
  }
</style>
