<script lang="ts">
  import { GLYPH } from "./glyphs";
  import {
    octaveShiftStore, setOctaveShift,
    editorToolStore, toggleEditorTool,
    type OctaveShift, type EditorTool,
  } from "./editorMode";

  let octave = $state<OctaveShift>(octaveShiftStore.get());
  octaveShiftStore.subscribe((v) => { octave = v; });
  let tool = $state<EditorTool>(editorToolStore.get());
  editorToolStore.subscribe((v) => { tool = v; });

  function onOctaveChange(e: Event) {
    const v = (e.currentTarget as HTMLSelectElement).value === "-1" ? -1 : 0;
    setOctaveShift(v);
  }
</script>

<div class="staff-toolbar" role="toolbar" aria-label="Staff editing tools">
  <div class="tools" role="radiogroup" aria-label="Placement tool">
    <button
      class="tool" class:active={tool === "natural"}
      onclick={() => toggleEditorTool("natural")}
      role="radio" aria-checked={tool === "natural"}
      aria-label="Force natural"
      title="Force natural — override snap-to-scale"
    >{GLYPH.accidentalNatural}</button>
    <button
      class="tool" class:active={tool === "sharp"}
      onclick={() => toggleEditorTool("sharp")}
      role="radio" aria-checked={tool === "sharp"}
      aria-label="Force sharp"
      title="Force sharp on the clicked staff position"
    >{GLYPH.accidentalSharp}</button>
    <button
      class="tool" class:active={tool === "flat"}
      onclick={() => toggleEditorTool("flat")}
      role="radio" aria-checked={tool === "flat"}
      aria-label="Force flat"
      title="Force flat on the clicked staff position"
    >{GLYPH.accidentalFlat}</button>
    <button
      class="tool rest-tool" class:active={tool === "rest"}
      onclick={() => toggleEditorTool("rest")}
      role="radio" aria-checked={tool === "rest"}
      aria-label="Rest mode"
      title="Rest mode — tap inserts silence (trims previous note)"
    >{GLYPH.restQuarter}</button>
  </div>

  <label class="octave-field">
    <span class="lbl">Octave</span>
    <select onchange={onOctaveChange} value={String(octave)}>
      <option value="0">0</option>
      <option value="-1">−8va</option>
    </select>
  </label>
</div>

<style>
  .staff-toolbar {
    display: inline-flex;
    align-items: center;
    gap: 12px;
    font-family: var(--font-mono);
    font-size: 0.72rem;
  }
  .tools {
    display: inline-flex;
    background: var(--surface-sunken);
    border: var(--hairline-w) solid var(--hairline);
    border-radius: var(--radius-sm);
    padding: 2px;
    gap: 2px;
  }
  .tool {
    /* Bravura glyphs need real glyph rendering, not text font */
    font-family: Bravura, serif;
    font-size: 1.4rem;
    line-height: 1;
    width: 28px;
    height: 28px;
    display: inline-flex;
    align-items: center;
    justify-content: center;
    color: var(--text-dim);
    background: transparent;
    border: none;
    border-radius: calc(var(--radius-sm) - 1px);
    cursor: pointer;
    transition: color var(--t-fast), background var(--t-fast);
  }
  .tool:hover:not(.active) { color: var(--text); background: var(--surface-raised); }
  .tool.active {
    background: var(--signal);
    color: var(--bg);
  }
  /* Rest glyph is taller — needs slight downward nudge to look centered */
  .rest-tool { font-size: 1.2rem; }

  .octave-field { display: inline-flex; align-items: center; gap: 5px; }
  .octave-field .lbl {
    text-transform: var(--label-case);
    letter-spacing: var(--label-tracking);
    color: var(--text-dim);
  }
  .octave-field select {
    font-family: var(--font-mono);
    font-size: 0.72rem;
    padding: 3px 6px;
    color: var(--text);
    background: var(--surface-raised);
    border: var(--hairline-w) solid var(--hairline);
    border-radius: var(--radius-sm);
    cursor: pointer;
  }
  .octave-field select:hover { filter: brightness(1.1); }
  @media (pointer: coarse) {
    .tool { width: 36px; height: 36px; }
    .octave-field select { padding: 8px 10px; min-height: 36px; }
  }
</style>
