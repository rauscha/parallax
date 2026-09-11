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

### Spec correction — `afb6a2d`

Recorded the tap decision (phase 7 will patch `fm_core.cc` with an optional per-operator
tap pointer) and corrected the make-up-gain figure. Reading `FmCore::compute` showed the
taps §2 asks for cannot be taken without touching vendored code: the operator kernels write
into three shared buses private to `FmCore`, with add flags, so each operator's block is
overwritten or summed away before the shim could see it.

### Phase 3 — the engine plays — `826624a`

`public/fm-worklet.js`, `src/audio/engines/FmEngine.ts`, and the registry entry. The worklet
is a Rings clone with the differences FM forces: 44.1 kHz native resampled to the context
rate, a 64-sample block read from the wasm rather than hardcoded, a held gate with a real
note-off, and real velocity (every operator has a key-velocity-sensitivity field, so a soft
note is genuinely less bright, not just quieter).

An FM "model" is data, not a firmware enum. `src/data/fm-patch.ts` turns a typed,
panel-ordered voice description into msfa's 156-byte layout, reversing panel order into
sysex order on the way out — panel operator 1 is byte block 5, and getting that backwards
would mirror every future flowsheet diagram. `fm-models.test.ts` proves the TS description
of voice 0 and the C++ `LoadBootPatch` agree by rendering both: they are sample-identical.

**Verified in the browser:** FM appears in the picker, swaps in and out four times with no
console errors, and an offline render through the real worklet reports blockSize 64 and puts
MIDI 60 at 262 Hz — the resampler preserves pitch.

### Phase 4 — the four macro knobs — `516f9f2`

Brightness, Ratio, Feedback, Envelope, all centred at 0.5 = the voice as authored. Pure TS:
they rewrite the patch bytes and push them through the existing `setPatch` path, so no C++
change and no wasm rebuild.

`src/data/fm-algorithms.ts` is **generated** from the vendored `algorithms[32]` table rather
than hand-typed, because which operators are modulators is a property of the algorithm, not
the patch. That generation surfaced a real engine limitation, now asserted in tests:
**algorithms 4 and 6 have no feedback operator** — the hardware loops a *pair* of operators
there and msfa's own source says "todo: more than one op in a feedback loop". The Feedback
knob genuinely does nothing on those two, so no voice prose may claim otherwise.

**Verified:** 17 new tests, three of them rendering through the real binary to check the
macros do what their labels claim. In the running app, sweeping Brightness from 0.15 to 0.9
moves the measured spectral centroid from 260 Hz to about 5.4 kHz.

**One compromise, not hidden:** a macro move lands on the *next* note-on, not the note
currently sounding. See the first card under "Waiting on you" — it is the one real decision
the night produced.

## Waiting on you

_(see the end of this file and `.handoff/PENDING-DECISIONS.md`)_
