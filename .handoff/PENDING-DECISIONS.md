# Waiting on you

**No blockers.** The one open thing is an **eyeball**, not a decision: confirm
Match Increment 1 + the grid fix look right in a browser (localhost:5173 or the
live site). Details in `SESSION-HANDOFF.md` → "Next up".

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
