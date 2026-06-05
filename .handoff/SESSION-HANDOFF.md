# Session hand-off — 2026-06-04 (machine: desktop · crane-desk)

## STATE (read this first)
- **Branch:** `main`, clean, synced with `origin/main`. One worktree only — **nothing stranded.**
- **M3 is closed and tagged** (`v0.4.0-m3`, pushed). The big outcome this session: we resolved the staff-vs-grid question. **Next work is a new grid sequencer surface, planned but not yet built.** Full spec lives in `docs/grid-sequencer-plan.md`; the backlog (`.handoff/NEXT-STEPS.md`) now opens on it with a G0–G4 checklist.
- No code was written this session beyond docs — this was a tag + planning session, done in Opus. Build happens next, in Sonnet.

## Done this session
- **Tagged M3.** `git tag v0.4.0-m3` + pushed. M3 (clickable 4-bar/4/4 staff) is officially complete. The live eyeball pass surfaced one cosmetic nit (logged, see below) but nothing blocking.
- **Resolved the staff-vs-grid fork** (`845f0d7`). You flagged that the staff might not be the right long-term surface vs. a Synthstrom-Deluge-style step/grid board, especially for mobile. Ran two research streams (codebase reuse map + a survey of hardware/web sequencers) and produced a full design + build plan: **`docs/grid-sequencer-plan.md`**.
  - **Decision 1 — coexist behind a toggle.** The grid is a *new* surface alongside the staff; a view switch picks between them. Both write the same `melodyStore` (the melody core is surface-agnostic), so we can A/B them in real use before deleting anything. Cheap insurance against committing to the wrong surface.
  - **Decision 2 — first build scope is G0–G4** (lean MVP + the delight layer). Per-step expression (G5: TIMBRE/COLOR p-locks, slide, accent, ratchet, probability) is deferred and pairs naturally with M4's modulation wiring.
  - The chosen layout: **pitch-row × time-column grid** (Chrome Music Lab "Song Maker" style) — rows = scale degrees (fold-to-scale, no wrong notes), columns = steps, one cell per column = monophony for free.
- **Logged a cosmetic bug:** the beat-1 note sits too tight against the opening bar line (needs a small left-pad). It's in NEXT-STEPS under "Soon" — low priority, not blocking.

## Next up
1. **Build the grid sequencer, phases G0–G4** (hand to a Sonnet session, point it at `docs/grid-sequencer-plan.md`). Start with **G0** — a `surface` store + `GridEditor.svelte` mounted behind a staff/grid toggle. It's the cleanest, lowest-risk entry point. Then G1 (render) → G2 (interaction) → G3 (playhead/responsive) → G4 (scale magic + "randomize in scale").
2. **Then M4** — Explain panel + wire per-model `AD_VCA/TIMBRE/COLOR/FM` amounts (shim setters landed 2026-06-01; amounts default to 0 today). Pairs with grid G5.

## Watch out for
- **The grid is a UI surface, not a data-model change (for G0–G4).** It writes the exact same `MelodyEvent[]` the staff does. Don't extend `MelodyEvent` until G5 — that's where per-step params come in, and it should land with M4.
- **Keep the staff working.** We chose coexistence, so don't delete `StaffEditor.svelte` / `render.ts` geometry / `interaction.ts` / Bravura font. They stay behind the toggle. The reuse map in the plan doc lists exactly what's shared vs. staff-only vs. new.
- **Reuse, don't rebuild:** `scales.ts` (snap-to-scale), `part.ts` (Part rebuild), `transport.ts`, `KeyScalePicker.svelte`, and `positionToMidi`/`midiToPlacement` in `render.ts` are all surface-agnostic and reusable. The MIDI clamp (C1..C8) currently lives in `StaffEditor.svelte` and should be pulled into shared/grid logic.
- **The credit/quota context:** you noted you were over quota at tag time. M4 and the grid build are both deferred until you've got headroom — no rush implied.
- Prior gotchas still apply: AudioWorklet `import.meta.url` shim · Svelte 5 `$`-reserved store names · mutating a `Set` in `$state` needs reassign · DSP shim changes need `npm run wasm` AND committing regenerated `public/braids.wasm` · MIDI clamp is C1..C8.
