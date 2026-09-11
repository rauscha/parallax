# Overnight log — 2026-09-10 → 2026-09-11 (desktop · crane-desk)

**Scope going in:** phases **3, 4 and 5** of the FM engine port
(`docs/superpowers/specs/2026-09-10-fm-engine-and-flowsheet.md` §7). Phases 0–2 were
already done and pushed earlier today (`42ebed4`, `9bddaa1`).

- Phase 3 — `fm-worklet.js` + `FmEngine.ts` + registry entry → plays from the staff, pitch-calibrated
- Phase 4 — macro parameter set (§3) + schema
- Phase 5 — model corpus + Explain prose (own voices, authored by hand)

Out of scope by your choice: phase 6 (the 5th theme — needs a name and your eye),
phase 7 (tap exports), phase 8 (the flowsheet view), phase 9 (the ear/eye gate).

## Pre-flight answers from you

1. **Scope = phases 3–5.** Theme, taps and flowsheet wait for a fresh session.
2. **Knob feel = continuous where possible.** msfa bakes operator levels and EG rates into
   voice state at `Dx7Note::init`, so anything that must be note-on-scoped is labelled
   honestly on its knob card rather than faked.
3. **Corpus = 12–16 voices**, roughly two per family across the six FM families.
4. **Taps = patch `fm_core.cc`** when phase 7 arrives — an optional per-operator tap pointer,
   null by default, as a second dated `[Parallax modification]`. Recorded in the spec tonight
   so it is not re-litigated; no vendored code is touched during phases 3–5.

Auto mode was on for the run, so routine edits proceeded without gating.

## Measurement before phase 3 — the make-up gain, and a correction to the record

Phase 2 recorded a "~17 dB deficit" needing make-up gain. That number was the distance from
a normal FM voice to **full scale**, which is not the same question as *how loud does this
engine sound next to the other four*. Measured tonight over identical 2-second windows, C4:

| | peak | RMS (2 s) | RMS (first 200 ms) |
|---|---|---|---|
| FM boot patch, velocity 127 | −16.7 dBFS | −35.0 | −27.1 |
| Rings modal resonator, default knobs | −8.3 dBFS | −32.9 | −23.2 |

So the real loudness gap is about **4 dB**, not 17. Peak level is flat across the range
(−16.6 to −17.1 dBFS from MIDI 36 to 84), so the make-up is a constant, not a per-note curve.
Chosen: **×1.6 (+4.1 dB)**, which matches Rings' attack loudness and still leaves the FM peak
4 dB below Rings' peak.

## Done overnight

_(filled in as each phase lands)_

## Waiting on you

_(see the end of this file and `.handoff/PENDING-DECISIONS.md`)_
