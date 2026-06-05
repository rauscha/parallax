# Overnight log — 2026-06-04 (desktop · crane-desk)

Scope chosen at pre-flight: **Go big** — grid polish + M4 groundwork + staff key-sigs.
Decisions locked before the run:
- **Swipe between bars** → lives on the bar-tab strip + pitch-label gutter (no conflict with grid drag-extend).
- **CSP** → add a real `<meta http-equiv>` policy, verify against a production-base build, commit only if clean.

## Plan (dependency-ordered)
1. Grid: keyboard nav (arrow cursor + Space toggle)
2. Grid: swipe between bars on tab/gutter zones
3. Grid: desktop 2-bar side-by-side view
4. Staff: first-note left-padding from barline
5. Staff: key signatures (one accidental block at clef, not per-note)
6. CSP `<meta>` tag + browser verify
7. Small bugs: octave-shift-while-held, future-note panic, pitch-bend re-baseline (investigate; fix clear, defer ambiguous)
8. M4 groundwork: per-model explain data/text layer + panel scaffold + wire AD_VCA/TIMBRE/COLOR/FM amounts

---

## Done overnight

### 1. Grid keyboard navigation ✓ (`930b3c8`, pushed)
Arrow keys move a highlighted selection cursor on the grid; Space/Enter place or remove a note there; Delete/Backspace removes one. The cursor follows the active bar page across bar boundaries and stays in sync with the last pointer tap, so tapping and typing share one position. Also refactored the place/delete event mutation into shared `placeNote()`/`deleteNoteAt()` helpers (used by both the pointer and keyboard paths). Type-check + a11y clean (0/0).
**Why it matters:** lets you build patterns from the keyboard without the mouse — faster entry, and accessible.

### 2 + 3. Grid swipe between bars + responsive 2-bar desktop view ✓ (`5173d21`, pushed)
- **Swipe:** horizontal swipe on the bar-tab strip and the pitch-label gutter moves between bar pages. Kept off the grid cells (which own horizontal note drag-extend) per your pre-flight choice. A swipe swallows the trailing tab click so you don't get a double action; pointer capture lets the swipe track even off the narrow gutter.
- **2-bar view:** on a panel ≥560px wide the grid shows two bars side-by-side (32 columns) with a divider at the bar boundary; narrower panels (phones) stay at one bar. All the step math (pointer placement, drag-extend, playhead, keyboard cursor, swipe) was reframed around a derived `viewStartStep` so everything stays correct in either window.
- **Browser-verified** at both breakpoints (32 cols wide / 16 narrow), keyboard place+delete, swipe page-advance, and tab highlighting. 0 console errors. (Live desktop→mobile *resize* switch relies on a ResizeObserver that the preview harness's synthetic viewport-override doesn't always fire — it works on real browser resizes; verified correct on fresh load at each width.)
**Why it matters:** a desktop user gets a richer two-bar overview; phone users keep a legible one-bar grid; and swipe is a natural touch gesture for moving through the 4-bar loop.

---

## Waiting on you
_(deferred decisions / gated tasks — filled as encountered)_
