# Grid sequencer — design + build plan

Status: **planned** (Opus planning session, 2026-06-04). Build target: a later Sonnet session.
Decisions locked this session:
- **Surface strategy: coexist behind a toggle.** The grid is a *new* surface alongside the existing staff. A view switch picks between them; both read/write the same `melodyStore`. This answers the open "is the staff the answer, or a real sequencer board?" question by letting us A/B them in real use before deleting anything.
- **First build scope: G0–G4** (lean MVP **plus** the delight layer). Per-step expression (G5) is deferred and pairs with M4.

Why this exists: M3 shipped a clickable SVG staff (`v0.4.0-m3`). Open question was whether a staff or a Synthstrom-Deluge-style step/grid board is the better long-term surface — especially for mobile. Research (codebase reuse map + a survey of hardware/web sequencers) says a **pitch-row × time-column grid** is a strong fit and, crucially, is just another front-end to the melody core we already built.

---

## 1. Design principles (north stars)

Most of these fall out of one structural choice: **rows are scale degrees, not pixels.**

1. **No wrong notes by default.** Rows = in-scale degrees ("fold to scale") → structurally impossible to play out of key. Root degree row is tinted as a permanent "home" anchor. *(Song Maker, Push "In Key")*
2. **See the melody as a shape.** Higher pitch = higher row; contour legible at a glance, color-coded by degree. The teaching superpower the staff only half-delivered.
3. **One gesture language, mouse and touch identical.** Tap = place/replace (monophony falls out — one lit cell per column). Drag right = note length (= tie). Empty column = rest. No separate rest or tie tools. *(BeepBox)*
4. **Approachable first, depth on demand.** Clean surface; per-step power behind hold / long-press. *(Elektron p-locks, OP-Z step components)* — G5.
5. **One responsive surface, not two builds.** Same grid everywhere. Mobile pages **one bar at a time** with 4 bar-tabs; desktop shows more columns + hover-ghost + keyboard accelerators. Touch targets ≥44px. *(Deluge viewport + BeepBox page boxes)*
6. **The instrument invites play.** Everything's in key, so a **"randomize in scale"** button always sounds good. Changing key/scale **transposes the melody by degree** (degree-3 stays degree-3) — a magic moment. *(OP-Z Random, Deluge re-key)*
7. **Keep the core surface-agnostic.** Grid writes the same `MelodyEvent[]` the staff does → playback, sharing, presets work regardless of surface. This is what makes coexistence cheap.

---

## 2. Methods worth stealing (survey synthesis)

| Problem | Proven method | Source |
|---|---|---|
| Monophonic melody layout | Pitch-rows × time-columns; one cell/column = monophony enforced visually. Beats TR step-row (hides pitch) and full piano-roll (too much). | Song Maker |
| Note length / tie / rest | Drag horizontally = length; gap = rest. No extra tools. | BeepBox, Korg Gadget |
| Snap-to-scale | "Fold" (rows = degrees) as default; one-toggle "Chromatic" (all 12, in-key rows lit) escape hatch for blue notes. | Push In-Key/Chromatic |
| 64 steps on a phone | Show 1 bar (16 steps); 4 bar-tabs to jump (double as song overview); optional 8th/16th resolution toggle; auto-follow playhead. | BeepBox boxes, Deluge zoom |
| Per-step expression w/o clutter | Hold/long-press a step → contextual sheet. For Braids: per-step **TIMBRE/COLOR locks** (killer feature), slide, accent, ratchet, probability. | Elektron, OP-Z |
| Delight | One-tap "randomize in scale" — always musical because in-key. | OP-Z Random |

**Parallax-specific standout:** Braids ≈ TIMBRE + COLOR + pitch, so **per-step macro p-locks** are unusually high value here — and align with the deferred M4 work (wiring `AD_VCA/TIMBRE/COLOR/FM` amounts). That's G5, not MVP.

Source tools: Chrome Music Lab Song Maker · BeepBox/JummBox · Synthstrom Deluge · Ableton Push (note mode) · Elektron Digitakt/Digitone · Roland TR-8S · TE OP-Z · Polyend Tracker · Ableton Learning Music · Korg Gadget.

---

## 3. Reuse map (from codebase inventory)

The melody core is genuinely surface-agnostic. Hard parts (audio, scheduling, scale theory) are done.

**Reuse as-is:**
- `src/state/stores.ts` — `MelodyEvent { startStep, durationSteps, midi, position?, accidental? }`; constants `STEPS_PER_BAR=16`, `TOTAL_STEPS=64` (4 bars × 16th); `Melody { tempo, key, scale, events }`; `melodyStore` (nanostores map), `patchStore`, `engineIdStore`, `isPlayingStore`, `activeNotesStore`. Mutate via `melodyStore.setKey("events", newEvents)`.
- `src/sequencer/scales.ts` — `snapToScale(midi, key, scale)`, `snapAtPosition(...)`, `preferFlats(key, scale)` (pure math, no UI deps).
- `src/sequencer/part.ts` — `expand()` (MelodyEvent[] → Part events) + `rebuild(melody)` (Tone.Part + loop). Rebuilds automatically on melody change.
- `src/sequencer/transport.ts` — `installSequencer()`, `playTransport()`, `stopTransport()`, tempo binding. UI-agnostic.
- `src/audio/types.ts` — `ISynthEngine` `noteOn(midi, opts?)` / `noteOff(midi, opts?)`.
- `src/notation/KeyScalePicker.svelte` — reuse unchanged.
- `src/notation/render.ts` *functions only*: `positionToMidi()`, `midiToPlacement()`, `silentGaps()`, `fillRestGap()` (optional rest helpers).

**Staff-only — keep behind the toggle, untouched:** `StaffEditor.svelte`, `StaffToolbar.svelte`, `interaction.ts`, `font.ts`/`glyphs.ts`, render.ts geometry (`stepToX`, `xToStep`, `positionToY`, stems, ledgers).

**Port in spirit (same state machine, new coords):** monophonic trim-on-overlap (StaffEditor `previewEvents` derived logic), drag-to-extend, hover-ghost.

**MIDI clamp:** currently C1(24)..C8(108) lives in `StaffEditor.svelte`. Grid needs the same — pull into shared/grid logic.

---

## 4. Phased build plan (G0–G4)

Lean MVP first, then the magic. Type-check clean at each step (`npm run check`). Commit per phase.

- **G0 — Scaffold + toggle.** Add a `surface` store (`'staff' | 'grid'`, persisted to localStorage like `octaveShiftStore`). Mount `GridEditor.svelte` in `App.svelte` next to the staff behind the toggle. Both read/write `melodyStore`. Visible empty grid + working switch = done.
- **G1 — Read-only grid render.** New pure-TS `src/notation/grid.ts`: row↔MIDI (via `scales.ts` fold), column↔step, viewport/paging math, MIDI clamp. Render: scale-degree rows (fold), one bar visible, root row tinted, existing events drawn as filled cells spanning `durationSteps`. Bar-tabs (1·2·3·4) + octave shift control. Color rows by degree.
- **G2 — Interaction.** Tap empty cell → place note (monophonic: replace/trim any note overlapping that column range — port StaffEditor trim logic); tap filled cell → clear; drag right → set `durationSteps` (length = tie; gap = rest); hover-ghost preview on desktop. Writes via `melodyStore.setKey("events", ...)`.
- **G3 — Playhead + responsive.** RAF playhead sweeping columns, auto-follows the active page during playback (reuse the staff's RAF approach). ≥44px cells; swipe between bars on mobile; desktop shows more columns + keyboard shortcuts (arrows move selection, space = play/stop).
- **G4 — Scale magic + delight.** Key/scale change re-maps existing events **by degree** (transpose intact, not by absolute pitch). In-Key ↔ Chromatic fold toggle (chromatic = all 12 rows, in-key lit, off-key dimmed-but-reachable). **"Randomize in scale"** button — fills the grid with an in-key melody; always musical.

**MVP = G0–G3** (a fully usable grid). G4 is the locked target for this build round.

### Deferred — G5 (its own milestone, pairs with M4)
Per-step expression: extend `MelodyEvent` with optional per-step params (timbre/color locks, slide, accent, ratchet, probability); long-press (mobile) / hover or modifier-click (desktop) → contextual per-step sheet; wire into M4's `AD_VCA/TIMBRE/COLOR/FM` modulation amounts. Highest value for Braids, but needs a data-model extension and is bigger — do it with M4.

---

## 5. New files to create
- `src/notation/grid.ts` — pure geometry/mapping (row↔MIDI, column↔step, paging, clamp). Testable, no Svelte.
- `src/notation/GridEditor.svelte` — the grid surface (mirror StaffEditor's store/subscribe/derive pattern).
- (maybe) `src/notation/GridToolbar.svelte` — octave / In-Key-Chromatic / randomize controls. Or fold into the existing header.
- `surface` store — alongside `src/notation/editorMode.ts` (`octaveShiftStore`, `editorToolStore`).

## 6. Open sub-decisions for the build session (sensible defaults noted)
- **Row count / range:** default ~2 octaves of scale degrees visible (≈15 rows for a 7-note scale) + octave shift control. Tune for phone legibility.
- **Resolution:** ship 16th-note grid (matches the 64-step model); 8th/16th toggle optional in G4.
- **Bar tabs vs continuous scroll:** default 4 bar-tabs (1 bar/page) on mobile; desktop may show 2 bars. Auto-follow playhead.
- **Randomize:** how dense / rhythmic the generated melody is — start simple (one note per beat, in-scale), iterate.
