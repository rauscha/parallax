<script lang="ts">
  import { onMount, onDestroy } from "svelte";
  import * as Tone from "tone";
  import { melodyStore, isPlayingStore, type MelodyEvent } from "../state/stores";
  import { loadBravura } from "./font";
  import { GLYPH } from "./glyphs";
  import {
    makeMetrics, totalHeight, staffTopY,
    positionToY, stepToX, noteX, xToStep, yToPosition,
    midiToPlacement, durationToVisual,
    positionToMidi, stemUp, ledgersFor,
    keySignatureFor, accidentalUnderKey,
    silentGaps, fillRestGap, type RestKind,
    TOTAL_STEPS, BARS, STEPS_PER_BAR,
  } from "./render";
  import { pointerToSP, hitTestNote } from "./interaction";
  import { snapAtPosition, preferFlats } from "../sequencer/scales";
  import { octaveShiftStore, editorToolStore, type EditorTool } from "./editorMode";

  const STAFF_WIDTH_SP = 100;
  // Vertical metrics (height, top line, staff lines) are key-signature-
  // independent, so derive them once from a base metrics.
  const baseM = makeMetrics(STAFF_WIDTH_SP, 0);
  const VBH = totalHeight(baseM);
  const TOP = staffTopY(baseM);

  // Engraving weights from bravura_metadata.json's engravingDefaults.
  const T_STAFF = 0.13;
  const T_STEM = 0.12;
  const T_BARLINE = 0.16;
  const T_LEDGER = 0.16;

  const LINE_YS = [0, 1, 2, 3, 4].map((i) => TOP + i);

  // Store subscriptions — captured and torn down in onDestroy. StaffEditor is
  // conditionally mounted (Staff↔Grid toggle), so leaking these would keep dead
  // copies updating after the surface swaps (A1).
  const unsubs: Array<() => void> = [];

  let events = $state<MelodyEvent[]>(melodyStore.get().events);
  let key = $state(melodyStore.get().key);
  let scale = $state(melodyStore.get().scale);
  unsubs.push(melodyStore.subscribe((mel) => {
    events = mel.events;
    key = mel.key;
    scale = mel.scale;
  }));
  let useFlats = $derived(preferFlats(key, scale));

  // Key signature drives the header width: more accidentals → music starts
  // further right. `m` (and the barlines) therefore react to key/scale.
  let keySig = $derived(keySignatureFor(key, scale));
  let m = $derived(makeMetrics(STAFF_WIDTH_SP, keySig.positions.length));
  let BARLINE_XS = $derived(Array.from({ length: BARS + 1 }, (_, i) => stepToX(i * STEPS_PER_BAR, m)));

  // Octave shift + active tool live in shared stores so the toolbar
  // component can read/write them. octaveShift persists across reloads.
  let octaveShift = $state(octaveShiftStore.get());
  unsubs.push(octaveShiftStore.subscribe((v) => { octaveShift = v; }));
  let activeTool = $state<EditorTool>(editorToolStore.get());
  unsubs.push(editorToolStore.subscribe((v) => { activeTool = v; }));

  let clefGlyph = $derived(octaveShift === -1 ? GLYPH.gClef8vb : GLYPH.gClef);

  let fontReady = $state(false);
  let svgEl: SVGSVGElement;
  onMount(() => {
    loadBravura().then(() => { fontReady = true; });
  });

  /* —— Visual record ————————————————————————————————————————————— */

  interface NoteVisual {
    x: number; y: number; position: number;
    accidental: "" | "sharp" | "flat" | "natural";
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
    // The octave shift moves the *visual* pitch up by |shift| octaves while
    // the underlying MIDI stays the same. shift = -1 means midi 48 (C3)
    // shows at midi 60 (C4)'s staff position.
    // Stored position is absolute (C4 = 0); subtract 7*shift for display.
    let position: number;
    let accidental: "" | "sharp" | "flat" | "natural";
    if (ev.position !== undefined) {
      position = ev.position - 7 * octaveShift;
      accidental = ev.accidental ?? "";
    } else {
      const displayMidi = ev.midi - 12 * octaveShift;
      const placement = midiToPlacement(displayMidi, useFlats);
      position = placement.position;
      accidental = ev.accidental ?? placement.accidental;
    }
    // Suppress accidentals the key signature already implies; add a natural
    // where a note contradicts it.
    accidental = accidentalUnderKey(position, accidental, keySig);
    const dv = durationToVisual(ev.durationSteps);
    const x = noteX(ev.startStep, m);
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

  /* —— Interaction (monophonic, tool-aware) ————————————————————————

     The model: every tap on the staff places a note (or, in rest mode,
     a rest = trim only). Monophonic invariant — when a tap lands inside
     an existing note's duration, that note is trimmed to end at the tap.
     Drag-extend clamps to the next note's start so durations never overlap.

     Delete paths: long-press (~500 ms hold without movement) OR right-click
     on an existing note. Both work over any part of the note's range. */

  const DEFAULT_DURATION = 4;       // quarter — applied if user didn't drag
  const LONG_PRESS_MS = 500;
  const MIN_DRAG_SP = 0.5;
  const MIDI_MIN = 24;              // C1 — wide range; octave shift extends low end further
  const MIDI_MAX = 108;             // C8

  type DragMode = "place" | "rest";
  let dragState = $state<null | {
    mode: DragMode;
    startStep: number;
    endStep: number;                // for rest mode (= drag-extended)
    midi: number;
    position?: number;
    accidental?: "sharp" | "flat" | "natural";
    durationSteps: number;
    maxDur: number;
    pointerId: number;
    userDragged: boolean;
  }>(null);
  let longPress: { idx: number; pointerId: number; startX: number; startY: number; timer: number } | null = null;

  /* Hover-ghost preview: a translucent shape under the cursor showing what
     a tap would place. Mouse-only in practice — touch pointermove only
     fires during press, and the drag preview covers that case. */
  let hoverState = $state<null | { step: number; displayPos: number }>(null);

  function clampMidi(n: number): number { return Math.max(MIDI_MIN, Math.min(MIDI_MAX, n)); }

  /** Apply the dragState's trim + new-note overlay to the committed events.
   *  This is what the renderer draws — so the user sees the trim happen the
   *  moment they tap, without modifying the store until pointerup. */
  let previewEvents = $derived.by((): MelodyEvent[] => {
    if (!dragState) return events;
    const out: MelodyEvent[] = [];
    for (const e of events) {
      // Trim a covering note so its duration ends at dragState.startStep.
      if (e.startStep < dragState.startStep && dragState.startStep < e.startStep + e.durationSteps) {
        const newDur = dragState.startStep - e.startStep;
        if (newDur > 0) out.push({ ...e, durationSteps: newDur });
        continue;
      }
      // For rest mode, also drop forward notes inside the rest range.
      if (dragState.mode === "rest" && e.startStep >= dragState.startStep && e.startStep < dragState.endStep) {
        continue;
      }
      // Replace the note at exactly the same startStep (place mode only).
      if (dragState.mode === "place" && e.startStep === dragState.startStep) continue;
      out.push(e);
    }
    if (dragState.mode === "place") {
      out.push({
        startStep: dragState.startStep,
        durationSteps: dragState.durationSteps,
        midi: dragState.midi,
        position: dragState.position,
        accidental: dragState.accidental,
      });
    }
    out.sort((a, b) => a.startStep - b.startStep);
    return out;
  });

  let visuals = $derived(previewEvents.map(visualFor));

  /* Hover-ghost visual derived from hoverState + the active tool. Returns
     either a synthesized note visual or a rest-glyph placeholder. */
  type GhostShape =
    | { kind: "note"; visual: NoteVisual }
    | { kind: "rest"; x: number };
  let ghostShape = $derived.by((): GhostShape | null => {
    if (!hoverState || dragState) return null;
    const { step, displayPos } = hoverState;
    if (activeTool === "rest") {
      return { kind: "rest", x: noteX(step, m) };
    }
    const p = paramsFor(displayPos);
    const next = nextNoteAfter(step);
    const maxDur = next ? Math.max(1, next.startStep - step) : TOTAL_STEPS - step;
    const dur = Math.max(1, Math.min(DEFAULT_DURATION, maxDur));
    const ev: MelodyEvent = {
      startStep: step,
      durationSteps: dur,
      midi: p.midi,
      position: p.position,
      accidental: p.accidental,
    };
    return { kind: "note", visual: visualFor(ev) };
  });

  /* —— Rests (auto-rendered in gaps) ——————————————————————————— */
  // Compute the rest decomposition of every silent gap in the previewed
  // melody. Renders rest glyphs so the staff always shows a full 4-bar
  // metric structure, even when notes are sparse.
  interface RestVisual {
    x: number; y: number; glyph: string;
  }
  const REST_GLYPH: Record<RestKind, string> = {
    whole:   GLYPH.restWhole,
    half:    GLYPH.restHalf,
    quarter: GLYPH.restQuarter,
    "8th":   GLYPH.rest8th,
    "16th":  GLYPH.rest16th,
  };
  function restY(kind: RestKind): number {
    // Whole rest hangs from the D5 (4th-from-bottom) line; the rest sit on/around
    // the middle line.
    return kind === "whole" ? TOP + 1 : TOP + 2;
  }
  let restVisuals = $derived.by((): RestVisual[] => {
    const gaps = silentGaps(previewEvents);
    const out: RestVisual[] = [];
    for (const [a, b] of gaps) {
      for (const r of fillRestGap(a, b)) {
        out.push({
          x: noteX(r.step, m),
          y: restY(r.kind),
          glyph: REST_GLYPH[r.kind],
        });
      }
    }
    return out;
  });

  function eventVisualX(i: number): number { return visuals[i].x; }
  function eventVisualY(i: number): number { return visuals[i].y; }
  function noteAt(spX: number, spY: number): number | null {
    return hitTestNote(events, m, spX, spY, eventVisualX, eventVisualY);
  }

  /** The next note whose startStep > step, or null. */
  function nextNoteAfter(step: number): MelodyEvent | null {
    let best: MelodyEvent | null = null;
    for (const e of events) {
      if (e.startStep > step && (!best || e.startStep < best.startStep)) best = e;
    }
    return best;
  }

  function deleteAt(idx: number): void {
    melodyStore.setKey("events", events.filter((_, i) => i !== idx));
  }

  function commitFromDragState(): void {
    if (!dragState) return;
    const out: MelodyEvent[] = [];
    for (const e of events) {
      if (e.startStep < dragState.startStep && dragState.startStep < e.startStep + e.durationSteps) {
        const newDur = dragState.startStep - e.startStep;
        if (newDur > 0) out.push({ ...e, durationSteps: newDur });
        continue;
      }
      if (dragState.mode === "rest" && e.startStep >= dragState.startStep && e.startStep < dragState.endStep) {
        continue;
      }
      if (dragState.mode === "place" && e.startStep === dragState.startStep) continue;
      out.push(e);
    }
    if (dragState.mode === "place") {
      out.push({
        startStep: dragState.startStep,
        durationSteps: dragState.durationSteps,
        midi: dragState.midi,
        position: dragState.position,
        accidental: dragState.accidental,
      });
    }
    out.sort((a, b) => a.startStep - b.startStep);
    melodyStore.setKey("events", out);
  }

  /** Compute the note's parameters from the click position + active tool. */
  function paramsFor(displayPos: number): {
    midi: number;
    position?: number;
    accidental?: "sharp" | "flat" | "natural";
  } {
    const absPos = displayPos + 7 * octaveShift;
    const natural = clampMidi(positionToMidi(absPos));
    switch (activeTool) {
      case "sharp":
        return { midi: clampMidi(natural + 1), position: absPos, accidental: "sharp" };
      case "flat":
        return { midi: clampMidi(natural - 1), position: absPos, accidental: "flat" };
      case "natural":
        return { midi: natural, position: absPos, accidental: "natural" };
      default: // "normal" — snap to scale
        return { midi: clampMidi(snapAtPosition(natural, key, scale)) };
    }
  }

  function onPointerDown(evt: PointerEvent): void {
    if (evt.button !== 0) return;          // primary button only
    const sp = pointerToSP(svgEl, evt.clientX, evt.clientY);
    if (sp.x < m.marginLeft) return;       // skip clef/time-sig column
    if (sp.x > STAFF_WIDTH_SP - m.marginRight) return;

    // Arm long-press: if the press lands on any existing note (notehead or
    // tail) AND the user holds without moving for LONG_PRESS_MS, delete it.
    // Quick-tap (release before timer fires) falls through to placement.
    const hit = noteAt(sp.x, sp.y);
    if (hit !== null) {
      const idx = hit;
      const timer = window.setTimeout(() => {
        if (longPress && longPress.idx === idx) {
          // Cancel any pending placement so we don't both delete AND place.
          dragState = null;
          deleteAt(idx);
          longPress = null;
        }
      }, LONG_PRESS_MS);
      longPress = { idx, pointerId: evt.pointerId, startX: sp.x, startY: sp.y, timer };
    }

    const step = xToStep(sp.x, m);

    if (activeTool === "rest") {
      // Rest mode: tap inserts silence. No new event — just trim the
      // covering note (and any forward notes within the drag range).
      dragState = {
        mode: "rest",
        startStep: step,
        endStep: step + 1,
        midi: 0,
        durationSteps: 0,
        maxDur: 0,
        pointerId: evt.pointerId,
        userDragged: false,
      };
      svgEl.setPointerCapture(evt.pointerId);
      return;
    }

    const displayPos = yToPosition(sp.y, m);
    const p = paramsFor(displayPos);
    const next = nextNoteAfter(step);
    const maxDur = next ? Math.max(1, next.startStep - step) : TOTAL_STEPS - step;
    const defaultDur = Math.min(DEFAULT_DURATION, maxDur);

    dragState = {
      mode: "place",
      startStep: step,
      endStep: step + defaultDur,
      midi: p.midi,
      position: p.position,
      accidental: p.accidental,
      durationSteps: defaultDur,
      maxDur,
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

    // Drag-extend takes precedence over hover tracking.
    if (dragState && evt.pointerId === dragState.pointerId) {
      const sp = pointerToSP(svgEl, evt.clientX, evt.clientY);
      const startX = stepToX(dragState.startStep, m);
      const dragged = sp.x - startX > MIN_DRAG_SP;
      if (!dragged && !dragState.userDragged) return;
      if (dragState.mode === "place") {
        const endStep = xToStep(sp.x, m);
        const span = Math.max(1, endStep - dragState.startStep + 1);
        const clampedSpan = Math.min(span, dragState.maxDur);
        dragState = { ...dragState, durationSteps: clampedSpan, endStep: dragState.startStep + clampedSpan, userDragged: true };
      } else {
        // rest mode: drag extends the silence
        const endStep = Math.max(dragState.startStep + 1, xToStep(sp.x, m) + 1);
        dragState = { ...dragState, endStep: Math.min(endStep, TOTAL_STEPS), userDragged: true };
      }
      return;
    }

    // No active drag → update the hover ghost.
    const sp = pointerToSP(svgEl, evt.clientX, evt.clientY);
    if (sp.x < m.marginLeft || sp.x > STAFF_WIDTH_SP - m.marginRight) {
      hoverState = null;
      return;
    }
    const step = xToStep(sp.x, m);
    const displayPos = yToPosition(sp.y, m);
    if (!hoverState || hoverState.step !== step || hoverState.displayPos !== displayPos) {
      hoverState = { step, displayPos };
    }
  }

  function onPointerLeave(): void {
    hoverState = null;
  }

  function onPointerUp(evt: PointerEvent): void {
    if (longPress && evt.pointerId === longPress.pointerId) {
      clearTimeout(longPress.timer);
      longPress = null;
    }
    if (dragState && evt.pointerId === dragState.pointerId) {
      try { svgEl.releasePointerCapture(evt.pointerId); } catch { /* may have been released */ }
      commitFromDragState();
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
  unsubs.push(isPlayingStore.subscribe((playing) => {
    if (playing && !raf) {
      raf = requestAnimationFrame(tickPlayhead);
    } else if (!playing) {
      if (raf) cancelAnimationFrame(raf);
      raf = 0;
      playheadStep = null;
    }
  }));
  onDestroy(() => {
    if (raf) cancelAnimationFrame(raf);
    unsubs.forEach((u) => u());
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
    onpointerleave={onPointerLeave}
    oncontextmenu={onContextMenu}
  >
    <!-- Staff lines — run from the left edge (under the clef / key sig / time
         sig) to the closing barline, so the header sits ON the staff. -->
    <g class="staff-lines" stroke="currentColor" stroke-width={T_STAFF}>
      {#each LINE_YS as y}
        <line x1={0.5} y1={y} x2={stepToX(TOTAL_STEPS, m)} y2={y} />
      {/each}
    </g>

    <!-- Barlines -->
    <g class="barlines" stroke="currentColor" stroke-width={T_BARLINE}>
      {#each BARLINE_XS as x}
        <line x1={x} y1={TOP} x2={x} y2={TOP + 4} />
      {/each}
    </g>

    <!-- Clef + key signature + time signature. Bravura's time-sig digits have
         their design baseline at the *center* of the glyph (bbox [-1, +1] SP),
         so the baseline-y sits at the digit's vertical center: TOP+1 (upper
         half) and TOP+3 (lower half) gives a stacked 4/4. The key signature's
         accidentals sit at fixed treble positions between clef and time sig and
         widen the header (m.timeSigX shifts right with the count). gClef swaps
         to gClef8vb when octaveShift is -1. -->
    <g class="clef-and-time" font-family="Bravura" font-size="4" fill="currentColor">
      <text x={m.clefX} y={TOP + 3}>{clefGlyph}</text>
      {#each keySig.positions as pos, i}
        <text x={m.keySigX0 + i * m.keySigDx} y={positionToY(pos, m)}
        >{keySig.type === "sharp" ? GLYPH.accidentalSharp : GLYPH.accidentalFlat}</text>
      {/each}
      <text x={m.timeSigX} y={TOP + 1}>{GLYPH.timeSig4}</text>
      <text x={m.timeSigX} y={TOP + 3}>{GLYPH.timeSig4}</text>
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

    <!-- Rests (auto-rendered in silence gaps) -->
    <g class="rests" font-family="Bravura" font-size="4" fill="currentColor" opacity="0.55">
      {#each restVisuals as r}
        <text x={r.x} y={r.y}>{r.glyph}</text>
      {/each}
    </g>

    <!-- Noteheads + accidentals + flags -->
    <g class="noteheads" font-family="Bravura" font-size="4" fill="currentColor">
      {#each visuals as v}
        {#if v.accidental === "sharp"}
          <text x={v.x + ACC_OFFSET} y={v.y}>{GLYPH.accidentalSharp}</text>
        {:else if v.accidental === "flat"}
          <text x={v.x + ACC_OFFSET} y={v.y}>{GLYPH.accidentalFlat}</text>
        {:else if v.accidental === "natural"}
          <text x={v.x + ACC_OFFSET} y={v.y}>{GLYPH.accidentalNatural}</text>
        {/if}
        <text x={v.x} y={v.y}>{v.glyph}</text>
        {#if v.flag > 0}
          <text x={v.flagX} y={v.flagY}>{v.flagGlyph}</text>
        {/if}
      {/each}
    </g>

    <!-- Hover ghost: shows where a tap would land before commit. Mouse-only
         in practice (touch pointermove fires only during press, which is
         already the drag state). Translucent + muted so it reads as preview. -->
    {#if ghostShape}
      {#if ghostShape.kind === "rest"}
        <text
          class="ghost-rest"
          x={ghostShape.x}
          y={TOP + 2}
          font-family="Bravura"
          font-size="4"
          fill="var(--text-dim)"
          opacity="0.5"
        >{GLYPH.restQuarter}</text>
      {:else}
        {@const g = ghostShape.visual}
        <g class="ghost-note" opacity="0.4" fill="var(--text-dim)">
          {#each g.ledgerYs as ly}
            <line
              x1={g.x + W_NOTEHEAD_BLACK / 2 - LEDGER_HALF}
              y1={ly}
              x2={g.x + W_NOTEHEAD_BLACK / 2 + LEDGER_HALF}
              y2={ly}
              stroke="var(--text-dim)"
              stroke-width={T_LEDGER}
            />
          {/each}
          {#if g.stem}
            <line
              x1={g.stemX1} y1={g.stemY1}
              x2={g.stemX2} y2={g.stemY2}
              stroke="var(--text-dim)"
              stroke-width={T_STEM}
            />
          {/if}
          {#if g.accidental === "sharp"}
            <text x={g.x + ACC_OFFSET} y={g.y} font-family="Bravura" font-size="4">{GLYPH.accidentalSharp}</text>
          {:else if g.accidental === "flat"}
            <text x={g.x + ACC_OFFSET} y={g.y} font-family="Bravura" font-size="4">{GLYPH.accidentalFlat}</text>
          {:else if g.accidental === "natural"}
            <text x={g.x + ACC_OFFSET} y={g.y} font-family="Bravura" font-size="4">{GLYPH.accidentalNatural}</text>
          {/if}
          <text x={g.x} y={g.y} font-family="Bravura" font-size="4">{g.glyph}</text>
          {#if g.flag > 0}
            <text x={g.flagX} y={g.flagY} font-family="Bravura" font-size="4">{g.flagGlyph}</text>
          {/if}
        </g>
      {/if}
    {/if}

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

    <!-- Drag indicator: when actively placing/extending, draw a small marker
         at the current end of the drag range to make the duration legible. -->
    {#if dragState}
      <line
        class="drag-end"
        x1={stepToX(dragState.endStep, m)}
        y1={TOP - 0.3}
        x2={stepToX(dragState.endStep, m)}
        y2={TOP + 4.3}
        stroke={dragState.mode === "rest" ? "var(--accent)" : "var(--signal-dim)"}
        stroke-width="0.1"
        stroke-dasharray="0.3 0.3"
      />
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
