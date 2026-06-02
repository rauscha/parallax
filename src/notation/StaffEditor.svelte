<script lang="ts">
  import { onMount } from "svelte";
  import { melodyStore, type MelodyEvent } from "../state/stores";
  import { loadBravura } from "./font";
  import { GLYPH } from "./glyphs";
  import {
    makeMetrics, totalHeight, staffTopY,
    positionToY, stepToX,
    midiToPlacement, durationToVisual,
    stemUp, ledgersFor,
    TOTAL_STEPS, BARS, STEPS_PER_BAR,
    TOP_LINE_POS, BOTTOM_LINE_POS,
  } from "./render";

  // viewBox width in staff spaces. The SVG scales to its CSS box; SP→px is
  // whatever the container demands at runtime.
  const STAFF_WIDTH_SP = 100;
  const m = makeMetrics(STAFF_WIDTH_SP);
  const VBH = totalHeight(m);
  const TOP = staffTopY(m);

  // Bravura engraving defaults — pulled from bravura_metadata.json so the
  // line weights match the font's design. (Hard-coded constants are fine
  // here — they don't change across Bravura versions; the metadata file
  // is still committed for the renderer if richer geometry lands.)
  const T_STAFF = 0.13;
  const T_STEM = 0.12;
  const T_BARLINE = 0.16;
  const T_LEDGER = 0.16;

  // Treble staff line Y positions (SP).
  const LINE_YS = [0, 1, 2, 3, 4].map((i) => TOP + i);

  // Barline X positions (SP) — at the END of each bar (4 internal divisions).
  const BARLINE_XS = Array.from({ length: BARS + 1 }, (_, i) => stepToX(i * STEPS_PER_BAR, m));

  let events = $state<MelodyEvent[]>(melodyStore.get().events);
  melodyStore.subscribe((mel) => { events = mel.events; });

  let fontReady = $state(false);
  onMount(() => {
    loadBravura().then(() => { fontReady = true; });
  });

  // Per-event visual record (derived from events + helpers).
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
  }

  const NOTEHEAD_GLYPH = {
    whole: GLYPH.noteheadWhole,
    half:  GLYPH.noteheadHalf,
    black: GLYPH.noteheadBlack,
  } as const;

  // Approximate advance widths in SP (Bravura design values).
  const W_NOTEHEAD_BLACK = 1.18;
  const W_NOTEHEAD_HALF  = 1.18;
  const W_NOTEHEAD_WHOLE = 1.68;
  const STEM_LEN = 3.5;
  const STEM_ATTACH_Y = 0.17;     // small offset above/below glyph center

  function visualFor(ev: MelodyEvent): NoteVisual {
    const { position, accidental } = midiToPlacement(ev.midi);
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
    };
  }

  let visuals = $derived(events.map(visualFor));

  // Ledger line half-length around a notehead (~1 SP).
  const LEDGER_HALF = 0.9;
  // Accidental offset to left of notehead.
  const ACC_OFFSET = -1.1;
</script>

<div class="staff-editor" role="img" aria-label="Melody staff, 4 bars, 4/4">
  <svg
    class="staff-svg"
    viewBox={`0 0 ${STAFF_WIDTH_SP} ${VBH}`}
    preserveAspectRatio="xMidYMid meet"
    xmlns="http://www.w3.org/2000/svg"
    class:font-ready={fontReady}
  >
    <!-- Staff lines (5) -->
    <g class="staff-lines" stroke="currentColor" stroke-width={T_STAFF}>
      {#each LINE_YS as y}
        <line x1={m.marginLeft} y1={y} x2={STAFF_WIDTH_SP - m.marginRight} y2={y} />
      {/each}
    </g>

    <!-- Barlines (start of each bar, including final) -->
    <g class="barlines" stroke="currentColor" stroke-width={T_BARLINE}>
      {#each BARLINE_XS as x}
        <line x1={x} y1={TOP} x2={x} y2={TOP + 4} />
      {/each}
    </g>

    <!-- Clef + time signature (SMuFL glyphs). font-size=4 puts 1em = 4 SP. -->
    <g class="clef-and-time" font-family="Bravura" font-size="4" fill="currentColor">
      <!-- gClef baseline at G4 line (position 4 → y=TOP+3) -->
      <text x="1.5" y={TOP + 3}>{GLYPH.gClef}</text>
      <!-- 4/4: top digit baseline near top staff line, bottom digit near middle -->
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

    <!-- Noteheads + accidentals + flags (Bravura text) -->
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
    /* While Bravura is loading, hide text glyphs to avoid a flash of system-font garbage. */
    visibility: hidden;
  }
  .staff-svg.font-ready { visibility: visible; }

  /* Outside the Bravura text elements, currentColor inherits .staff-editor's
     `color: var(--text)`. SVG strokes and fills resolve to currentColor. */
</style>
