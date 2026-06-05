# Session hand-off — 2026-06-04 (machine: desktop · crane-desk)

## STATE (read this first)
- **Branch:** `main`, clean, synced with `origin/main`. One worktree only — **nothing stranded.**
- **Grid G0–G4 is shipped** (`5f35124`). The pitch-row × step-column grid sequencer surface is live behind a Staff/Grid toggle in the Sequencer section. Both surfaces coexist and share `melodyStore`.
- No pending decisions. Next work is grid polish (keyboard nav, swipe) and then M4.

## Done this session
- **Built grid sequencer G0–G4 in one Sonnet session** (`5f35124`).
  - **G0** — `surfaceStore`/`gridBaseOctaveStore`/`foldToScaleStore` in `editorMode.ts`; `GridEditor.svelte` mounted behind Staff/Grid toggle in `App.svelte`.
  - **G1** — `src/notation/grid.ts`: `buildRowMidis` (fold-to-scale / chromatic), `colToStep`, `isRoot`, `pitchName`. Grid renders 15 rows × 16 cols (C major default, 2-octave range); root row tinted; bar tabs 1–4; pitch-class labels on left.
  - **G2** — Pointer delegation on grid div: tap empty cell → place note (monophonic trim on overlap); tap note-start → delete; drag right → extend duration; hover-ghost on mouse/pen. `previewEvents` derived pattern mirrors `StaffEditor`.
  - **G3** — RAF playhead sweeping columns; auto-follows active bar page during playback. ≥44px targets on toolbar controls.
  - **G4** — Key/scale change remaps melody by degree (degree-3 stays degree-3 across key changes) when grid is active. In-Key ↔ Chromatic fold toggle. Octave shift ±1 (C2–C7 range, default C3–C5). "Randomize" button: in-scale quarter-note melody with ~30% beat gaps.
  - Type-check: 0 errors. Browser-verified: cells light, bar nav works, Chromatic gives 25 rows vs 15 in In-Key.

## Next up
1. **Grid polish (small, quick-wins):** keyboard arrow nav + Space toggle; touch swipe between bars; desktop 2-bar view.
2. **M4** — Explain panel + wire per-model `AD_VCA/TIMBRE/COLOR/FM` amounts (shim setters ready since 2026-06-01). Pairs with G5 per-step expression.

## Watch out for
- **Don't extend `MelodyEvent`** until G5 (the per-step expression milestone with M4). The current grid is a pure UI surface on top of the existing data model.
- **Keep both surfaces working.** Staff is still behind the toggle — `StaffEditor.svelte`, `render.ts`, `interaction.ts`, Bravura font are all untouched.
- **Degree-remap is grid-only.** It only runs when `GridEditor` is mounted (i.e., `surface === 'grid'`). Staff users see notes stay at MIDI values on key change — existing behavior preserved.
- Prior gotchas: AudioWorklet `import.meta.url` shim · Svelte 5 `$`-reserved store names · mutating a `Set` in `$state` needs reassign · MIDI clamp C1..C8 · DSP shim changes need `npm run wasm` + commit regenerated WASM.
