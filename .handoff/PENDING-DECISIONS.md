# Waiting on you

**No hard blockers.** Two **eyeball passes** are the only things gating the M5 /
v1 tag (`v0.5.0-m5`) — both need a human, neither needs a decision from me:

1. **Mobile pass on a real phone.** The top bar gained 4 I/O buttons this run
   (MIDI · Presets · Postcard · Share). I added `flex-wrap` so it degrades and
   capped the popovers/postcard modal at 86vw, but a phone-in-hand check at
   ~375px is your call — does the wrapped bar look OK, do the menus fit?
2. **Final aesthetic look across all 3 themes.** Token coverage is *verified*
   complete (lab/sandbox/phosphor) and the postcard is confirmed in Lab +
   Phosphor; give the whole app a once-over especially in **Sandbox** (the light
   theme). Once both pass, tag `v0.5.0-m5`.

Optional (not a gate): PNG PWA icons — the app installs fine with SVG icons, but
no rasteriser is available in this toolchain; a future `sharp` pass could add
crisp PNG/Apple-touch variants for the broadest install/iOS coverage. Also still
open from before: the optional **Match-tool ear-pass on a real track** (nice-to-
have, not a gate).

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
