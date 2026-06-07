# Waiting on you

**No blockers.** The 2026-06-07 overnight run (Plaits second engine) shipped completely — nothing was deferred. Two *optional* items for you:

## From the 2026-06-07 Plaits run (optional — nothing is blocked)
1. **Ear-confirm Plaits on the live site.** Switch the **Engine** selector (new, above the model picker) to **Plaits**, scroll the 24 models, and play. Verified numerically that signal flows + pitch is correct (note 69 → 440 Hz) and all 24 engines render; I just can't ear-test tone from the harness. Listen especially to the **drums** and **6-op FM banks**.
2. **Optional tuning (exposed knobs, not code):** new **DECAY** / **LPG TONE** knobs set ring length/brightness (default 0.5 — raise DECAY if sustained notes feel too plucky). Default Plaits model is engine 0 (VAF); say if you'd prefer another.
   - *Faithful-behaviour notes (not bugs):* the 3 "6-Op FM" entries are DX7 banks — scroll their 32 presets with the **HARMONICS** knob; drum/pluck models are percussive one-shots that ring per DECAY regardless of note length.

Full detail: `.handoff/OVERNIGHT-LOG-2026-06-07.md`.

---

## Resolved 2026-06-06 (kept for the record)
**All three decisions parked by the 2026-06-04 overnight run were resolved in the 2026-06-06 session.**

## Resolved 2026-06-06
1. **M4 — per-model AD envelope amounts → DONE, keeping as-is.** Authored conservative AD decays and wired them. After an ear-test, scoped the one-shot "let-ring" behavior to the four *unpitched* drums (KICK/SNAR/CYMB/DRUM) only. PLUK & BELL were deliberately **excluded** — they self-decay in the DSP, and PLUK is paraphonic in the firmware, so forcing a VCA envelope + holding the gate open stacked successive notes into discordant overlaps and killed the Release knob. User: "ok with keeping the decay tuning as is." (`0419ccd`)
2. **M4 — Explain-panel visuals → direction chosen, richer text DONE.** User approved the baseline text panel and picked three of four directions: **richer per-model text**, **"show me" macro sweep**, and **knob↔card highlight** (animated mini-diagrams *skipped* for v1). Richer text shipped to **all 47 models** (`d666c14`, `427e74d`) — `detail` is now `{ listenFor, goodFor }`, conversational voice, full coverage. Knob↔card highlight shipped too (`751d4b6`). Remaining build: just the "show me" sweep (see NEXT-STEPS "Now — Explain panel").
3. **Staff lines under the clef → KEEP.** Confirmed on-device; correct engraving.

## Resolved earlier (2026-06-04 overnight)
- ✓ Grid polish: keyboard nav, swipe-between-bars, desktop 2-bar view (`930b3c8`, `5173d21`)
- ✓ Staff: key signatures + first-note breathing room (`0d899e7`)
- ✓ Security: production CSP via meta tag + fixed `npm run preview` (`fa8ae42`)
- ✓ Three small audio bugs: octave-strand, pitch-bend, panic (`98823ed`)
- ✓ M4 groundwork: Explain panel data/text layer (`f9f06df`)
