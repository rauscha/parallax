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
_(filled as work lands)_

---

## Waiting on you
_(deferred decisions / gated tasks — filled as encountered)_
