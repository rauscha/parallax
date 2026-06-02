<script lang="ts">
  import { onMount, onDestroy } from "svelte";
  import * as Tone from "tone";
  import { melodyStore, isPlayingStore, type MelodyEvent } from "../state/stores";
  import { loadBravura } from "./font";
  import { GLYPH } from "./glyphs";
  import {
    makeMetrics, totalHeight, staffTopY,
    positionToY, stepToX, xToStep, yToPosition,
    midiToPlacement, durationToVisual,
    positionToMidi, stemUp, ledgersFor,
    TOTAL_STEPS, BARS, STEPS_PER_BAR,
  } from "./render";
  import { pointerToSP, hitTestNote } from "./interaction";
  import { snapAtPosition, preferFlats } from "../sequencer/scales";

  const STAFF_WIDTH_SP = 100;
  const m = makeMetrics(STAFF_WIDTH_SP);
  const VBH = totalHeight(m);
  const TOP = staffTopY(m);

  // Engraving weights from bravura_metadata.json's engravingDefaults.
  const T_STAFF = 0.13;
  const T_STEM = 0.12;
  const T_BARLINE = 0.16;
  const T_LEDGER = 0.16;

  const LINE_YS = [0, 1, 2, 3, 4].map((i) => TOP + i);
  const BARLINE_XS = Array.from({ length: BARS + 1 }, (_, i) => stepToX(i * STEPS_PER_BAR, m));

  let events = $state<MelodyEvent[]>(melodyStore.get().events);
  let key = $state(melodyStore.get().key);
  let scale = $state(melodyStore.get().scale);
  melodyStore.subscribe((mel) => {
    events = mel.events;
    key = mel.key;
    scale = mel.scale;
  });
  let useFlats = $derived(preferFlats(key, scale));

  let fontReady = $state(false);
  let svgEl: SVGSVGElement;
  onMount(() => {
    loadBravura().then(() => { fontReady = true; });
  });

  /* —— Visual record ————————————————————————————————————————————— */

  interface NoteVisual {
    x: number; y: number; position: number;
    accidental: "" | "sharp" | "flat";
    glyph: string;
    stemUp: boolean; stem: boolean;
    stemX1: number; stemY1: number; stemX2: number; stemY2: number;
    ledgerYs: number[];
    flag: 0 | 1 | 2;
    flagGlyph: string;
    flagX: number; flagY: number;
    durationSpan: number;   // SP — for duration-tail rendering
  }

  const NOTEHEAD_GLYPH = {
    whole: GLYPH.noteheadWhole,
    half:  GLYPH.noteheadHalf,
    black: GLYPH.noteheadBlack,
  } as const;

  const W_NOTEHEAD_BLACK = 1.18;
  const W_NOTEHEAD_HALF  = 1.18;
  const W_NOTEHEAD_WHOLE = 1.68;
  const STEM_LEN = 3.5;
  const STEM_ATTACH_Y = 0.17;
  const LEDGER_HALF = 0.9;
  const ACC_OFFSET = -1.1;

  function visualFor(ev: MelodyEvent): NoteVisual {
    const { position, accidental } = midiToPlacement(ev.midi, useFlats);
    const dv = durationToVisual(ev.durationSteps);
    const x = stepToX(ev.startStep, m);
    const y = positionToY(position, m);
    const up = stemUp(position);
    const headW = dv.notehead === "whole" ? W_NOTEHEAD_WHOLE : W_NOTEHEAD_BLACK;
    const stemX = up ? x + headW : x;
    const stemY1 = up ? y - STEM_ATTACH_Y : y + STEM_ATTACH_Y;
    const stemY2 = up ? y - STEM_LEN : y + STEM_LEN;
    let flagGlyph = "";
    if (dv.flag === 1) flagGlyph = up ? GLYPH.flag8thUp  : GLYPH.flag8thDown;
    if (dv.flag === 2) flagGlyph = up ? GLYPH.flag16thUp : GLYPH.flag16thDown;
    return {
      x, y, position, accidental,
      glyph: NOTEHEAD_GLYPH[dv.notehead],
      stemUp: up,
      stem: dv.stem,
      stemX1: stemX, stemY1, stemX2: stemX, stemY2,
      ledgerYs: ledgersFor(position).map((p) => positionToY(p, m)),
      flag: dv.flag,
      flagGlyph,
      flagX: stemX,
      flagY: stemY2,
      durationSpan: ev.durationSteps * m.stepWidth,
    };
  }

  let visuals = $derived(events.map(visualFor));

  /* —— Interaction ——————————————————————————————————————————————— */

  const DEFAULT_DURATION = 4;       // quarter — applied if user didn't drag
  const LONG_PRESS_MS = 500;
  const MIN_DRAG_SP = 0.5;
  const MIDI_MIN = 36;              // C2 — clamp; staff handles ledger lines well below this but UX gets silly
  const MIDI_MAX = 96;              // C7

  let dragState = $state<null | {
    startStep: number;
    midi: number;
    durationSteps: number;
    pointerId: number;
    userDragged: boolean;
  }>(null);
  let longPress: { idx: number; pointerId: number; startX: number; startY: number; timer: number } | null = null;

  let dragPreview = $derived(
    dragState
      ? visualFor({ startStep: dragState.startStep, durationSteps: dragState.durationSteps, midi: dragState.midi })
      : null,
  );

  function clampMidi(n: number): number { return Math.max(MIDI_MIN, Math.min(MIDI_MAX, n)); }

  function eventVisualX(i: number): number { return visuals[i].x; }
  function eventVisualY(i: number): number { return visuals[i].y; }
  function noteAt(spX: number, spY: number): number | null {
    return hitTestNote(events, m, spX, spY, eventVisualX, eventVisualY);
  }

  function commitPlacement(startStep: number, durationSteps: number, midi: number): void {
    const clamped = Math.min(durationSteps, TOTAL_STEPS - startStep);
    melodyStore.setKey("events", [
      ...events,
      { startStep, durationSteps: clamped, midi },
    ]);
  }

  function deleteAt(idx: number): void {
    melodyStore.setKey("events", events.filter((_, i) => i !== idx));
  }

  function onPointerDown(evt: PointerEvent): void {
    if (evt.button !== 0) return;          // primary button only
    const sp = pointerToSP(svgEl, evt.clientX, evt.clientY);
    if (sp.x < m.marginLeft) return;       // skip clef/time-sig column
    if (sp.x > STAFF_WIDTH_SP - m.marginRight) return;

    const hit = noteAt(sp.x, sp.y);
    if (hit !== null) {
      // Long-press → delete
      const idx = hit;
      const timer = window.setTimeout(() => {
        if (longPress && longPress.idx === idx) {
          deleteAt(idx);
          longPress = null;
        }
      }, LONG_PRESS_MS);
      longPress = { idx, pointerId: evt.pointerId, startX: sp.x, startY: sp.y, timer };
      return;
    }

    // Empty space — begin placement (snap pitch to the active scale,
    // preferring candidates that stay on the clicked staff position).
    const step = xToStep(sp.x, m);
    const position = yToPosition(sp.y, m);
    const rawMidi = clampMidi(positionToMidi(position));
    const midi = clampMidi(snapAtPosition(rawMidi, key, scale));
    dragState = {
      startStep: step,
      midi,
      durationSteps: DEFAULT_DURATION,
      pointerId: evt.pointerId,
      userDragged: false,
    };
    svgEl.setPointerCapture(evt.pointerId);
  }

  function onPointerMove(evt: PointerEvent): void {
    // Long-press cancellation on drift
    if (longPress && evt.pointerId === longPress.pointerId) {
      const sp = pointerToSP(svgEl, evt.clientX, evt.clientY);
      if (Math.abs(sp.x - longPress.startX) > MIN_DRAG_SP || Math.abs(sp.y - longPress.startY) > MIN_DRAG_SP) {
        clearTimeout(longPress.timer);
        longPress = null;
      }
    }

    // Drag-to-extend
    if (dragState && evt.pointerId === dragState.pointerId) {
      const sp = pointerToSP(svgEl, evt.clientX, evt.clientY);
      const startX = stepToX(dragState.startStep, m);
      const dragged = sp.x - startX > MIN_DRAG_SP;
      if (dragged) {
        const endStep = xToStep(sp.x, m);
        const span = Math.max(1, endStep - dragState.startStep + 1);
        dragState = { ...dragState, durationSteps: span, userDragged: true };
      } else if (!dragState.userDragged) {
        // Still hovering on/near the start step — keep default quarter.
        dragState = { ...dragState, durationSteps: DEFAULT_DURATION };
      }
    }
  }

  function onPointerUp(evt: PointerEvent): void {
    if (longPress && evt.pointerId === longPress.pointerId) {
      clearTimeout(longPress.timer);
      longPress = null;
    }
    if (dragState && evt.pointerId === dragState.pointerId) {
      try { svgEl.releasePointerCapture(evt.pointerId); } catch { /* may have been released */ }
      commitPlacement(dragState.startStep, dragState.durationSteps, dragState.midi);
      dragState = null;
    }
  }

  function onPointerCancel(evt: PointerEvent): void {
    if (longPress && evt.pointerId === longPress.pointerId) {
      clearTimeout(longPress.timer);
      longPress = null;
    }
    if (dragState && evt.pointerId === dragState.pointerId) {
      dragState = null;
    }
  }

  function onContextMenu(evt: MouseEvent): void {
    const sp = pointerToSP(svgEl, evt.clientX, evt.clientY);
    const hit = noteAt(sp.x, sp.y);
    if (hit !== null) {
      evt.preventDefault();
      deleteAt(hit);
    }
  }

  /* —— Playhead ——————————————————————————————————————————————————— */

  // Loop length in steps = TOTAL_STEPS (= 4 bars × 16). Convert seconds to
  // steps via the current tempo so a BPM change updates the sweep in lockstep.
  let playheadStep = $state<number | null>(null);
  let raf = 0;
  function tickPlayhead(): void {
    const transport = Tone.getTransport();
    if (transport.state !== "started") {
      playheadStep = null;
      raf = 0;
      return;
    }
    const bpm = transport.bpm.value;
    const loopSec = (60 / bpm) * 16;          // 16 beats per loop in 4/4
    const sec = transport.seconds;
    const within = ((sec % loopSec) + loopSec) % loopSec;
    playheadStep = (within / loopSec) * TOTAL_STEPS;
    raf = requestAnimationFrame(tickPlayhead);
  }
  isPlayingStore.subscribe((playing) => {
    if (playing && !raf) {
      raf = requestAnimationFrame(tickPlayhead);
    } else if (!playing) {
      if (raf) cancelAnimationFrame(raf);
      raf = 0;
      playheadStep = null;
    }
  });
  onDestroy(() => {
    if (raf) cancelAnimationFrame(raf);
  });
</script>

<div class="staff-editor">
  <svg
    bind:this={svgEl}
    class="staff-svg"
    class:font-ready={fontReady}
    viewBox={`0 0 ${STAFF_WIDTH_SP} ${VBH}`}
    preserveAspectRatio="xMidYMid meet"
    xmlns="http://www.w3.org/2000/svg"
    role="application"
    aria-label="Melody staff, 4 bars, 4/4. Tap to place a note; drag right to extend; long-press or right-click an existing note to delete."
    onpointerdown={onPointerDown}
    onpointermove={onPointerMove}
    onpointerup={onPointerUp}
    onpointercancel={onPointerCancel}
    oncontextmenu={onContextMenu}
  >
    <!-- Staff lines -->
    <g class="staff-lines" stroke="currentColor" stroke-width={T_STAFF}>
      {#each LINE_YS as y}
        <line x1={m.marginLeft} y1={y} x2={STAFF_WIDTH_SP - m.marginRight} y2={y} />
      {/each}
    </g>

    <!-- Barlines -->
    <g class="barlines" stroke="currentColor" stroke-width={T_BARLINE}>
      {#each BARLINE_XS as x}
        <line x1={x} y1={TOP} x2={x} y2={TOP + 4} />
      {/each}
    </g>

    <!-- Clef + time signature -->
    <g class="clef-and-time" font-family="Bravura" font-size="4" fill="currentColor">
      <text x="1.5" y={TOP + 3}>{GLYPH.gClef}</text>
      <text x="4.6" y={TOP + 2}>{GLYPH.timeSig4}</text>
      <text x="4.6" y={TOP + 4}>{GLYPH.timeSig4}</text>
    </g>

    <!-- Ledger lines per note -->
    <g class="ledgers" stroke="currentColor" stroke-width={T_LEDGER}>
      {#each visuals as v}
        {#each v.ledgerYs as ly}
          <line
            x1={v.x + W_NOTEHEAD_BLACK / 2 - LEDGER_HALF}
            y1={ly}
            x2={v.x + W_NOTEHEAD_BLACK / 2 + LEDGER_HALF}
            y2={ly}
          />
        {/each}
      {/each}
    </g>

    <!-- Stems -->
    <g class="stems" stroke="currentColor" stroke-width={T_STEM} stroke-linecap="butt">
      {#each visuals as v}
        {#if v.stem}
          <line x1={v.stemX1} y1={v.stemY1} x2={v.stemX2} y2={v.stemY2} />
        {/if}
      {/each}
    </g>

    <!-- Noteheads + accidentals + flags -->
    <g class="noteheads" font-family="Bravura" font-size="4" fill="currentColor">
      {#each visuals as v}
        {#if v.accidental === "sharp"}
          <text x={v.x + ACC_OFFSET} y={v.y}>{GLYPH.accidentalSharp}</text>
        {:else if v.accidental === "flat"}
          <text x={v.x + ACC_OFFSET} y={v.y}>{GLYPH.accidentalFlat}</text>
        {/if}
        <text x={v.x} y={v.y}>{v.glyph}</text>
        {#if v.flag > 0}
          <text x={v.flagX} y={v.flagY}>{v.flagGlyph}</text>
        {/if}
      {/each}
    </g>

    <!-- Playhead (during playback) -->
    {#if playheadStep !== null}
      <line
        class="playhead"
        x1={stepToX(playheadStep, m)}
        y1={TOP - 0.5}
        x2={stepToX(playheadStep, m)}
        y2={TOP + 4.5}
        stroke="var(--signal)"
        stroke-width="0.18"
        stroke-linecap="round"
      />
    {/if}

    <!-- Drag preview (translucent) -->
    {#if dragPreview}
      <g class="preview" opacity="0.45">
        {#each dragPreview.ledgerYs as ly}
          <line
            x1={dragPreview.x + W_NOTEHEAD_BLACK / 2 - LEDGER_HALF}
            y1={ly}
            x2={dragPreview.x + W_NOTEHEAD_BLACK / 2 + LEDGER_HALF}
            y2={ly}
            stroke="currentColor"
            stroke-width={T_LEDGER}
          />
        {/each}
        {#if dragPreview.stem}
          <line
            x1={dragPreview.stemX1}
            y1={dragPreview.stemY1}
            x2={dragPreview.stemX2}
            y2={dragPreview.stemY2}
            stroke="currentColor"
            stroke-width={T_STEM}
          />
        {/if}
        <text x={dragPreview.x} y={dragPreview.y}
              font-family="Bravura" font-size="4" fill="currentColor">{dragPreview.glyph}</text>
        {#if dragPreview.flag > 0}
          <text x={dragPreview.flagX} y={dragPreview.flagY}
                font-family="Bravura" font-size="4" fill="currentColor">{dragPreview.flagGlyph}</text>
        {/if}
        {#if dragPreview.accidental === "sharp"}
          <text x={dragPreview.x + ACC_OFFSET} y={dragPreview.y}
                font-family="Bravura" font-size="4" fill="currentColor">{GLYPH.accidentalSharp}</text>
        {/if}
        <!-- Duration tail: thin line marking the note's sounding span. Makes
             "I'm holding a long note" legible during the drag. -->
        <line
          x1={dragPreview.x + W_NOTEHEAD_BLACK}
          y1={dragPreview.y}
          x2={dragPreview.x + Math.max(dragPreview.durationSpan, W_NOTEHEAD_BLACK)}
          y2={dragPreview.y}
          stroke="currentColor"
          stroke-width={T_STEM}
          stroke-dasharray="0.4 0.3"
        />
      </g>
    {/if}
  </svg>
</div>

<style>
  .staff-editor {
    width: 100%;
    height: 100%;
    color: var(--text);
    display: flex;
    align-items: center;
    justify-content: center;
    user-select: none;
    -webkit-user-select: none;
  }
  .staff-svg {
    width: 100%;
    max-height: 100%;
    height: auto;
    display: block;
    visibility: hidden;
    cursor: crosshair;
    touch-action: none;   /* let pointer events drive everything; no scroll-on-drag */
  }
  .staff-svg.font-ready { visibility: visible; }
</style>
