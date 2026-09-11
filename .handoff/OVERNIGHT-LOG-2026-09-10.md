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
First chosen ×1.6 (+4.1 dB) to match Rings' attack RMS. In the running app that still left FM
2.9 dB under Rings, so it was raised to **×2.0 (+6 dB)**, which splits the two measurements.
All fourteen finished voices land within 1.4 dB of each other at the same velocity, which is
what makes one engine-wide constant defensible rather than arbitrary.

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
currently sounding. See card 1 below — it is the one real decision the night produced.

### Phase 5 — fourteen voices and their prose — `c4f797f`

Six families: three bells, two electric pianos, two brass and winds, two basses, two
inharmonic, three teaching primitives. All original, authored against the engine and then
measured. `src/data/fm-voices.ts` is the sound; `src/data/fm-models.ts` is the words.

**Measurement caught two things that reading would not have.**

*The engine silently unplugs chains.* `FmCore::compute` keeps a "has contents" flag per
modulation bus. An operator below the gain threshold whose flags do not say "add" marks its
output bus **empty**, and a carrier reading an empty bus is rendered as a bare sine. So
"use algorithm 16, but only switch on operators 1, 2 and 6" does not give a deep stack — it
gives a sine, with no error anywhere. The first draft of the noise voice measured
*identically* to the pure-sine voice. Every voice now uses a contiguous chain, and a test
asserts that all thirteen non-sine voices are audibly more modulated than a sine.

*The default voice had a dead knob.* Algorithm 1 puts the feedback loop on operator 6, which
the boot patch does not sound — so Feedback did nothing on the engine's landing voice.
Algorithm 2 wires the same two operators but puts the loop on operator 2. The boot patch
moved to algorithm 2 and the wasm was rebuilt; the audio is unchanged, and a test proves it
by rendering both and comparing samples. `dsp/PROVENANCE.md` hash updated.

**Every comparative claim in the prose is asserted against rendered audio** — Clank really is
the brightest, One Operator really is the least, Bronze Gong really does have the longest
decay, and the quoted ratios are read back out of the patch bytes. Where a knob genuinely
does nothing on a voice the card says so, and a test proves the knob produces sample-identical
audio. One Operator has three dead knobs, which is the point of that voice.

**Verified live:** all fourteen sound through the worklet (peaks 0.121–0.143, a 1.4 dB
spread), the picker groups all six families, and the Explain panel renders four cards per
voice with working Show-me buttons. 137 tests pass, type-check clean.

## Waiting on you

Also mirrored in `.handoff/PENDING-DECISIONS.md`.

### 1. Should a macro knob change the note that is already sounding?

**Where it stopped.** Phase 4 shipped the four macros working, but a knob move lands on the
*next* note-on rather than the note under your fingers. With the sequencer running that is
under half a beat away and barely noticeable; on a held note, nothing happens.

**Why.** msfa builds a voice's operator state inside `Dx7Note::init` and offers no public way
in afterwards. `Env::setparam` exists and is designed for exactly this, but `env_[]` is
private to `Dx7Note`, and the `Controllers` struct that *is* passed in every block carries
pitch bend and nothing else. There is no route that does not touch vendored code.

**Options.**
- **(a) Add a small live-update method to `Dx7Note`** — a third local modification, the same
  shape as the tap patch you already approved for phase 7: additive, dated, documented in
  `dsp/vendor/msfa/README.md` as re-apply-on-revendor.
- **(b) Leave it note-on scoped.** Costs nothing, and the knob cards already say so plainly.
  The real casualty is the "Show me" sweep, which holds one note for 2.6 seconds — on FM it
  will move the knob and change nothing audible.
- **(c) Make "Show me" retrigger** for engines that declare note-on-scoped params. Generic,
  no vendored change, but it edits shared UI for one engine's benefit.

**My recommendation: (a).** You have already accepted the principle for taps, the patch is
about six lines, and it is the difference between FM having the same live knob feel as the
other four engines or being the one that does not.

### 2. The 5th theme needs a name before phase 6

Not a blocker tonight — I deliberately did not build it, because a theme you cannot see until
morning is a poor use of unattended time, and the name lands in `ThemeId`, filenames and docs
where renaming later is churn.

The spec locks the direction: a **drafting surface**, flatter and higher-contrast than the four
instrument-panel skins, designed *for* the flowsheet rather than tolerating it. Candidate
names: **Blueprint**, **Drafting**, **Graph**. Say which (or your own) and phase 6 is
straightforward — token set, `ENGINE_THEME` / `THEME_COLOR` entries, and a `contrast.test.ts`
row, AA-guarded the way Soundboard was.

Until then FM wears Phosphor, which is the existing documented fallback for an unknown engine
id, not a bug.

### 3. Firefox and Safari pass on the tap spike — still outstanding

Unchanged from phase 0 and not something this machine can do: Safari is not installed here.
It is not a blocker for phases 1–7, but it should run before the flowsheet view ships.

### 4. An ear pass, when you have a minute

Everything above is verified by measurement, and measurement cannot tell you whether Swell
Brass sounds like brass. The fourteen voices are the first thing in this engine that only you
can sign off. `⚄ Surprise me` will walk you through them quickly.
