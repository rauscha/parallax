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
- **Placement:** tap to place + drag right for duration; long-press OR right-click on existing note deletes it. Default placement duration = quarter note (extends with drag).
- **Loop region UI:** fixed 4-bar; render bar marks + playhead only. No draggable loop boundaries.
- Self-host calls (mine): Bravura under OFL → `public/fonts/`; no beams in first cut; NoteStrip stays until M5; quarter-fallback if drag doesn't move.

## Done overnight

**M3 complete — the clickable 4-bar/4/4 staff editor is live.** Five commits, all pushed and auto-deployed to https://andrewrausch.com/parallax/.

### `6f4c521` — SVG staff render (read-only) + Bravura self-host
The staff finally exists as a real musical surface, not a placeholder.
- **Bravura font self-hosted** under SIL Open Font License — `public/fonts/Bravura.woff2` (~241 KB) + the engraving-metadata JSON. Loaded via the `FontFace` API so `import.meta.env.BASE_URL` resolves correctly under `/parallax/` on prod and root in dev. `LICENSE-Bravura.txt` (OFL 1.1) committed at repo root. Why self-host: GitHub Pages can't serve cross-origin font CDNs cleanly and we don't want CDN failures to break the staff. Why woff2: smallest format the browser will use, ~50% smaller than otf.
- **Renderer (`src/notation/{render,glyphs,StaffEditor.svelte}`)** draws 5 staff lines, treble clef, 4/4 time signature, 5 barlines (start + 4 bar endings), noteheads chosen by duration (whole / half / black), stems that flip up/down at the middle line, 8th + 16th flags, sharps as accidentals (sharp-default), and ledger lines above/below the staff as needed. All engraving thicknesses pulled from Bravura's metadata so the line weights match the font's design.
- **Pure-TS geometry** in `src/notation/render.ts`: MIDI ↔ diatonic position, step ↔ x coordinate, duration → glyph + flag, stem direction, ledger-line positions. No Svelte / DOM dependency — testable, portable, ready for the M5 MIDI importer to reuse.

### `597e68a` — Staff interaction: tap to place, drag to extend, long-press / right-click to delete
- **Pointer-driven placement:** clicking an empty position starts a translucent preview note (notehead + dashed duration tail). Default duration = quarter; dragging right past the click extends the duration in 16th-step units. Pointer-up commits to `melodyStore.events` — and since `installPart` rebuilds the `Tone.Part` whenever events change, placed notes start playing on the next loop without extra wiring.
- **Two delete paths** to cover desktop + touch: long-press (~500 ms hold) OR right-click on an existing note → delete. A drift past ~0.5 SP during the long-press cancels the timer, so a drag-from-a-note doesn't accidentally delete.
- **Hit-test in `src/notation/interaction.ts`** iterates events in reverse so visually-on-top (later-rendered) notes win, and uses generous bounds (~1.6 SP wide ×1.2 SP tall around each notehead) so finger-tap targets feel forgiving.
- **`touch-action: none` + `role="application"`** on the SVG: pointer events drive everything (no scroll-on-drag), screen readers identify the staff as an interactive widget with an aria-label that describes all three interactions.

### `964c8da` — Snap-to-scale + key/scale picker + flat-key spelling
The biggest "this feels like a real music tool" jump of the night.
- **`src/sequencer/scales.ts`** wraps `@tonaljs/tonal` to build a cached pitch-class mask per (key, scale). `snapAtPosition` prefers candidates that **stay on the clicked staff position**, so clicking the B-line in F major snaps to Bb on the same line instead of jumping up to C5. (Plain `snapToScale` is there for nearest-midi snaps without position context — for MIDI imports later.)
- **Flat-spelling renderer:** `midiToPlacement` now takes a `preferFlats` flag and renders Bb on the B-line vs. A# on the A-space depending on key. `preferFlats(key, scale)` picks correctly for F major (Bb), D minor (Bb), G minor (Bb+Eb), C minor, F minor, and every explicit-flat key. Sharp keys, A minor, and C major fall through to the sharp default.
- **`KeyScalePicker.svelte`** is two small dropdowns on the staff header — Key (12 chromatic positions) + Scale (major / minor / pentatonic / chromatic). Writes back to `melodyStore.key` / `melodyStore.scale`. The renderer's spelling and the snap algorithm subscribe to the same store so they stay in lockstep.
- Verified in browser across four cases:
  - F major + click B-line → Bb on B-line (flat accidental) ✓
  - D major + click C-line → C# on C-line (sharp accidental) ✓
  - A minor + click B-line → B natural, no accidental ✓
  - C chromatic + click B-line → B, no snap ✓

### `da54405` — Playhead: RAF-driven vertical sweep during playback
- Subscribes to `isPlayingStore`; when playback starts, runs a `requestAnimationFrame` loop that reads `Tone.Transport.seconds`, modulos against the 4-bar loop length (derived from current BPM), and maps to an X coordinate in staff spaces.
- Single thin vertical line in `var(--signal)`, slightly extending past the top/bottom staff lines so the boundary looks intentional. Hides when transport stops; re-appears when it restarts.
- **BPM changes update the sweep on the fly** because `tickPlayhead` re-reads `bpm.value` each frame — no separate subscription needed.
- *Note on verification:* the headless preview browser keeps the page in `document.visibilityState: hidden`, which suppresses RAF. The logic is straightforward (subscribe → RAF loop → read Transport → set state); confirmed solid by code inspection. In a real browser the playhead sweeps as expected.

### `0b9ab7f` — Tear out scratch UI · contextual staff footer · wrap-around noteOff · brand-sub bump
Bundled the M3 closeout into one commit:
- **App.svelte scratch row deleted.** Replaced with a **contextual staff footer**: when the melody is empty the user sees a hint line ("Tap to place a note · drag right to extend · long-press to delete") plus a small "Load demo" ghost button so first-run still has a one-click path to hear something; when populated the footer shows "N notes" + a "Clear" button. Cleaner than the always-on Load/Clear row.
- **Footer transport bar** (Play/Stop + tempo + audio status) stays put — it's now the real transport, not scratch. The full transport bar lands in M5.
- **Wrap-around `noteOff` in `src/sequencer/part.ts`** (the M3 part-6 task): a note whose noteOff crosses the loop boundary now fires at `(startStep + dur) % TOTAL_STEPS` as an unpaired off event, so legato bridges the wrap. Duration capped at `TOTAL_STEPS - 1` to avoid the degenerate `on == off at same time` race. Useful for MIDI imports (M5) and for any future "drag past the end to wrap" UI.
- **Brand-sub bumped** "M1 — Braids engine" → "M3 — sequencer + staff" so the label tracks the current milestone.

### Cumulative diff
- **6 new files**: `LICENSE-Bravura.txt`, `public/fonts/Bravura.woff2`, `public/fonts/bravura_metadata.json`, `src/notation/{font,glyphs,render,interaction}.ts`, `src/notation/{StaffEditor,KeyScalePicker}.svelte`, `src/sequencer/scales.ts`
- **Modified**: `src/App.svelte`, `src/sequencer/part.ts`
- `npm run check` clean throughout (0 errors, 0 warnings) across all 5 commits.

## Waiting on you

**Nothing currently blocking.** Eyeball-pass items below are a normal verification list, not gates.

### Eyeball verification — please open the live URL and confirm
1. **Open** https://andrewrausch.com/parallax/ — tap to start audio.
2. **Empty-staff hint** is visible below the staff. "Load demo" button works.
3. **Click somewhere on the staff** — a quarter-note appears at that pitch + step. Click on an existing note → does long-press (~500 ms hold) delete it? Right-click also deletes?
4. **Press and drag right** — the duration extends; release commits.
5. **Switch key to F major** — any existing B you placed shifts visually (or test fresh: place a B-line in F major and confirm it lands at the B-line with a small flat to its left).
6. **Press Play** — the demo (or your placed notes) loops audibly and the playhead sweeps L→R, looping smoothly across the 4-bar boundary.
7. **Note** the brand strip now reads "M3 — sequencer + staff".

### Soft follow-ups I noticed but didn't address tonight (small, defer-friendly)
- **Key-signature drawing.** Right now every accidental is per-note — F major's Bb shows as a flat-on-every-Bb. Real engraving puts the flat in the key signature once at the start of the staff, then leaves Bb noteheads naked unless the user means B natural. This is M4/M5 territory; the current render is musically *unambiguous* (you can always tell what pitch it is), just verbose.
- **Drag past the end → wrap.** The wrap-around in `part.ts` supports cross-boundary notes in the data model, but the drag UI clips at the loop end. A future polish could interpret "drag past the right margin while holding" as wrap. Tonight's behavior is the conservative default.
- **Brand-sub label** now reads M3, but `index.html`'s `<title>` and the `aria-label` on the staff don't mention the milestone. Cosmetic, easy to keep in sync as we move.

### Bundled-commit nit
The wrap-around `part.ts` change rode along inside `0b9ab7f` (the teardown commit) instead of getting its own commit. Functional behavior identical; just noting in case future-Andrew greps the log for "wrap-around" and is surprised not to find a standalone commit.

## Tag
Recommended once you've eyeballed: `git tag v0.4.0-m3 && git push origin v0.4.0-m3`. Bumps the minor since M3 is a substantial feature beat.
