# Waiting on you

**Nothing pending (as of 2026-07-11).** The Rings design decisions (model scope,
excitation model, theme direction, single comprehensive spec) were all resolved
live in the 2026-07-11 session and are encoded in
`docs/superpowers/specs/2026-07-11-rings-engine-design.md` — execution needs no
further input until the plan's Task 9 human gate (ear/eye pass).

---

_Overnight run 2026-06-20 — full write-up in `.handoff/OVERNIGHT-LOG-2026-06-20.md`._
The melody + transport feature **shipped + verified** (no decision needed). Four
items were waiting on you, ordered most-actionable first.

## Resolved 2026-06-21 (pick-up session)
All four decisions below were walked through with Andrew:
1. **Melody contour → ADOPTED tonic-relative fall + SHIPPED** (`a8e34c5`).
   `contourTargetIdx()` extracted as a pure fn, interpolates tonicIdx↔peakIdx.
2. **One-loop audio export → chosen as the next build.** Sub-decisions take the
   spec's recommendations: realtime MediaRecorder tap, fixed +2s tail, 1 loop,
   export drives transport, runtime-negotiated WebM/Ogg, inline `⬇ Export`
   button, download-only.
3. **Melody tools → swing model = Tone transport (playback-only)** when built.
4. **Parallax Daily → accept algorithm drift** (seed = date string) when built.

---

### 1. Melody contour — quick yes/no (5-line code change, do this first) ⭐
**What:** Tonight's new `randomizeMelody` builds an arch contour. As written
(per the approved spec), the descending half aims at MIDI index 0 — the *lowest*
note in the row — and only the first/last notes are pinned to the tonic. For
**C-rooted** ranges index 0 *is* the tonic, so it's perfect; for **non-C keys**
(e.g. G major) the interior descent drifts to the lowest note instead of
resolving toward the tonic pitch class. The final-review reviewer flagged this
and proposed interpolating `tonicIdx ↔ peakIdx` so the fall resolves to the
tonic in *every* key.
**Why deferred, not auto-fixed:** it matches the spec as written and changes the
character of every generated melody — your call (aesthetic), per the
overnight rule. `findTonicIdx` already exists for exactly this.
**Options:** (a) **Adopt the tonic-relative fall** *(recommended — more musical,
matches the spec prose "lands on the tonic again", ~4 lines + 1 contour test)*;
(b) keep as-is (only matters for non-C Surprise rolls). Detail: `.superpowers/sdd/progress.md` Task 2 note.

### 2. One-loop audio export — spec ready, confirm approach
**Spec:** [`docs/superpowers/specs/2026-06-20-one-loop-audio-export.md`](../docs/superpowers/specs/2026-06-20-one-loop-audio-export.md)
**Headline finding:** the clean `OfflineAudioContext`/WAV route is a **hard
blocker** — the Braids WASM worklet + Tone scheduler are bound to the live
AudioContext. So it's a **realtime MediaRecorder tap on `masterGain`** (WebM/Ogg
Opus), one loop, with a `⬇ Export` button in the toolbar. Confirm or adjust the
7 §3 decisions (release tail = +2 s, 1 loop, export drives the transport, format
= negotiated WebM/Ogg with WAV deferred, inline button, download-only for v1).
Mostly "nod to the recommendations." Then I write the code-level plan.

### 3. Melody tools (swing / Euclidean / arp / mutate) — spec ready
**Spec:** [`docs/superpowers/specs/2026-06-20-melody-tools.md`](../docs/superpowers/specs/2026-06-20-melody-tools.md)
**Key calls:** build **order/scope** (recommended: Mutate → Euclidean → Arp →
Swing, shipped incrementally) and the **swing model** — bake timing offsets into
the note data (visible/exportable) vs Tone's playback-only swing param. Plus 6
smaller §3 decisions (Euclidean pitch fill, arp source pool, mutate scope, UI
home). All four tools are pure functions in `grid.ts` → TDD-friendly like
tonight's work.

### 4. Parallax Daily (date-seeded surprise) — spec ready
**Spec:** [`docs/superpowers/specs/2026-06-20-parallax-daily.md`](../docs/superpowers/specs/2026-06-20-parallax-daily.md)
**Shape:** a seeded PRNG (`xmur3` + `mulberry32`) injected into `surpriseMe` +
`randomizeMelody` (defaulting to `Math.random`, so normal Surprise is untouched);
the date string seeds it. **6 decisions** (recommended: UTC date, a dedicated
`▦ Daily` button, `?daily=YYYY-MM-DD` permalink, full engine+theme swap like
Surprise, accept algorithm drift, full undo+lineage parity). Note: this refactors
the `Math.random()` calls inside the melody functions shipped *today* — worth
doing soon while they're fresh.

---

Optional, never a gate (carry-forward nice-to-haves):
- **PNG PWA icons** — the app installs fine with SVG icons; a future `sharp` pass
  could add crisp PNG / Apple-touch variants for the broadest install/iOS coverage.
- **Match-tool ear-pass on a real track** — the suggestion ranker is verified on
  ground-truth clips; a real-track listen is polish, not a gate.
- **"Recent sounds" Match-Apply capture** — verified by code + identical to the
  fully-verified Surprise path, but not driven end-to-end overnight (needs a
  dropped audio file). A 10-second human confirm (drop a clip → Apply → check a
  `◎` row appears) would fully close the lineage checklist.

## Resolved 2026-06-18 (v1.0.0 ship)
The two eyeball passes that gated the tag are **done**:
1. **Mobile pass on a real phone → DONE.** Checked on a Pixel; caught + fixed a
   colour-seam through the Sequencer header (`auto`→`max-content` grid rows,
   `d38974d`). Top bar wraps cleanly, no overflow at 375px.
2. **Aesthetic look across all 3 themes → DONE.** Contrast verified AA in every
   theme programmatically; on-device pass good. Tagged `v1.0.0` (subsumes the
   never-cut `v0.5.0-m5`).

## Resolved 2026-06-08 (laptop session)
- **Match Increment 1 eyeball → DONE.** Was the one open item here; the compare
  surface, detection, and suggestion+Apply were all driven in a real browser
  this session (zero console errors). Nothing left to confirm in-browser.

## Resolved 2026-06-07 (laptop session)
1. **Laxsynth tone → GOOD.** Ear-tested vs the M8 WavSynth; user: "lax sounding
   good." No calibration needed. (The 3rd engine is fully closed out.)
2. **Plaits tone → GOOD.** Chiptune drone fix confirmed ("drone fixed"). Ear-test
   closed.
3. **"Reverse-engineer a sound from a song" tool → DECIDED: in-app, "Guided
   Match" tier.** Was the one open design question. Now an active build —
   Increment 1 shipped, Increments 2–3 next. Spec:
   `~/.claude/plans/zesty-cuddling-cosmos.md`; backlog: NEXT-STEPS "Now".

---

## Resolved 2026-06-06 (kept for the record)
**All three decisions parked by the 2026-06-04 overnight run were resolved in the 2026-06-06 session.**

## Resolved 2026-06-06
1. **M4 — per-model AD envelope amounts → DONE, keeping as-is.** Authored conservative AD decays and wired them. After an ear-test, scoped the one-shot "let-ring" behavior to the four *unpitched* drums (KICK/SNAR/CYMB/DRUM) only. PLUK & BELL were deliberately **excluded** — they self-decay in the DSP, and PLUK is paraphonic in the firmware, so forcing a VCA envelope + holding the gate open stacked successive notes into discordant overlaps and killed the Release knob. User: "ok with keeping the decay tuning as is." (`0419ccd`)
2. **M4 — Explain-panel visuals → direction chosen, richer text DONE.** User approved the baseline text panel and picked three of four directions: **richer per-model text**, **"show me" macro sweep**, and **knob↔card highlight** (animated mini-diagrams *skipped* for v1). Richer text shipped to **all 47 models** (`d666c14`, `427e74d`) — `detail` is now `{ listenFor, goodFor }`, conversational voice, full coverage. Knob↔card highlight shipped too (`751d4b6`).
3. **Staff lines under the clef → KEEP.** Confirmed on-device; correct engraving.

## Resolved earlier (2026-06-04 overnight)
- ✓ Grid polish: keyboard nav, swipe-between-bars, desktop 2-bar view (`930b3c8`, `5173d21`)
- ✓ Staff: key signatures + first-note breathing room (`0d899e7`)
- ✓ Security: production CSP via meta tag + fixed `npm run preview` (`fa8ae42`)
- ✓ Three small audio bugs: octave-strand, pitch-bend, panic (`98823ed`)
- ✓ M4 groundwork: Explain panel data/text layer (`f9f06df`)
