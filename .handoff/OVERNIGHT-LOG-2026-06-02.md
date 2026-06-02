# Overnight log — 2026-06-02 → 2026-06-03 (M3 staff editor)

## Scope going in
Continue M3 per `.handoff/NEXT-STEPS.md` "Now":
1. SVG staff render (read-only first) — Bravura SMuFL font self-hosted
2. Click-to-place + drag-for-duration interaction · long-press/right-click to delete
3. Snap-to-scale via `@tonaljs/tonal`
4. Playhead animation (fixed 4-bar loop, bar marks only — adjustable loop deferred to M5)
5. Tear out the scratch buttons in `App.svelte`
6. Wrap-around `noteOff` at the loop boundary in `src/sequencer/part.ts`

User-locked design calls (pre-flight):
- **Placement:** tap to place + drag right for duration; long-press OR right-click on existing note deletes it. Default placement duration = 1 sixteenth (extends with drag).
- **Loop region UI:** fixed 4-bar; render bar marks + playhead only. No draggable loop boundaries.
- Self-host calls (mine): Bravura under OFL → `public/fonts/`; no beams in first cut; NoteStrip stays until M5; quarter-fallback if drag doesn't move.

## Done overnight
_(filled in as tasks land)_

## Waiting on you
_(filled in if anything gets deferred — empty means clean run)_
