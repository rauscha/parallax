# Waiting on you

Updated 2026-06-03 (desktop, evening — after M3 polish + click-placement fix).

## Nothing currently waiting on your input

Today's session closed out two rounds of M3 feedback. See [.handoff/SESSION-HANDOFF.md](SESSION-HANDOFF.md) for the full per-session digest. The only open thread is the **eyeball verification** at the top of `NEXT-STEPS.md` — that's a verification pass, not a decision.

Recommended after eyeball: `git tag v0.4.0-m3 && git push origin v0.4.0-m3`.

## Resolved this session (the design decisions you made)

- ✓ **Monophonic semantics on overlap** — picked "trim previous, place new" (classic paint-over) out of three options. Drag-extend clamps to the next note's start so durations can't overlap.
- ✓ **Accidental placement UX** — picked "toolbar mode toggle ♮ ♯ ♭" (sticky, mutually exclusive) out of three options. Active mode bypasses snap-to-scale and forces that sign on the clicked position.
- ✓ **Octave shift scope** — picked "0 / −8va toggle" out of three options. Treble clef stays; gClef8vb swaps in for the lower-octave reading. Persists in localStorage.
- ✓ **Explicit rests** — picked "auto-render in gaps PLUS a rest tool" out of three options. Rest tool taps insert silence by trimming previous + deleting forward notes in the drag range.
- ✓ **Click-to-place mapping** — picked Pattern C (pure `Math.floor` cell semantics) plus Pattern D (hover ghost) out of four patterns surfaced by the deep-research workflow on click-placement UX. Matches your tracker mental model; ghost preview added independently as the highest-value universal UX upgrade.

## Resolved overnight (the design decisions you made before bed on 2026-06-02)

- ✓ **Initial placement model** — picked "tap to place + drag right for duration; long-press OR right-click to delete".
- ✓ **Loop region scope for M3** — fixed 4-bar loop, bar marks + playhead only. No draggable boundaries (deferred to M5 polish).
