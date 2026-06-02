# Waiting on you

Updated 2026-06-03 (desktop, after overnight M3 completion).

## Nothing currently waiting on your input

The overnight run closed out M3. See [.handoff/OVERNIGHT-LOG-2026-06-02.md](OVERNIGHT-LOG-2026-06-02.md) for the full write-up, especially the **Eyeball verification** checklist near the bottom — that's the morning todo, but it's a verification pass, not a decision.

Recommended after eyeball: `git tag v0.4.0-m3 && git push origin v0.4.0-m3`.

## Resolved overnight (the design decisions you made before bed)

- ✓ **Placement model** — picked "tap to place + drag right for duration; long-press OR right-click to delete" out of three options. Default placement duration = quarter; extends in 16th-step units as you drag.
- ✓ **Loop region scope for M3** — fixed 4-bar loop, bar marks + playhead only. No draggable boundaries (deferred to M5 polish).
