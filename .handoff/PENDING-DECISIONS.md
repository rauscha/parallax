# Waiting on you

Updated 2026-06-04 (desktop · crane-desk — M3 tag + grid sequencer planning).

## Nothing currently waiting on your input

This session tagged M3 (`v0.4.0-m3`) and resolved the staff-vs-grid question into a concrete build plan. No decisions are pending. The next move is purely execution: build the grid sequencer (G0–G4) per `docs/grid-sequencer-plan.md`. See [.handoff/SESSION-HANDOFF.md](SESSION-HANDOFF.md) for the digest and [.handoff/NEXT-STEPS.md](NEXT-STEPS.md) for the checklist.

## Resolved this session (the design decisions you made)

- ✓ **Staff vs. grid surface** — picked **coexist behind a toggle** (out of: coexist / replace staff / grid-now-decide-later). The grid is a new surface alongside the staff; both write the same `melodyStore`. Lets you A/B before deleting anything.
- ✓ **First grid build scope** — picked **G0–G4** (lean MVP + delight), out of (lean MVP only / MVP+delight / full incl. per-step expression). Per-step expression (G5) deferred to pair with M4.
- ✓ **Grid layout** — pitch-row × time-column ("Song Maker" style), fold-to-scale rows. Locked in the plan doc as the recommended layout; not re-litigated.

## Resolved earlier (carried forward, for reference)

- ✓ M3 design decisions (monophonic overlap = trim-previous; accidental toolbar; octave 0/−8va; auto-rests + rest tool; click-to-place = Math.floor cell semantics + hover ghost) — all shipped in M3, tagged `v0.4.0-m3`.
