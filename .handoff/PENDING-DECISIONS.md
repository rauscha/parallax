# Waiting on you

**No blockers.** Everything built is committed, pushed, and (for Laxsynth) browser-verified. The open items are all *yours* — ear-tests and one design decision.

## 1. Ear-test Laxsynth vs your M8 WavSynth (the main one)
Laxsynth (the new **3rd engine**) is live-verified mechanically — it loads, all controls work, audio renders, the operators reshape the sound. The only thing I can't judge is **tone**. Switch the Engine selector to **Laxsynth**, play the 9 shapes, push Size/Mult/Warp/Mirror, and A/B against the real WavSynth.
- Dev server is running at **localhost:5173** (parked on clean Laxsynth defaults); also live at andrewrausch.com/parallax/ after the deploy.
- Heads-up: **Drive + Resonance together get hot** — ride the Gain knob.
- Calibration (shape roster, operator curves, default headroom) is a **no-rebuild edit** to `public/laxsynth-worklet.js` — tell me what your ears want and I'll tune it. Plan/detail: `~/.claude/plans/pure-wibbling-cook.md`.

## 2. Design decision: the "reverse-engineer a sound from a song" tool
Your earlier idea — pull up a track and get help recreating one of its synth voices on a Parallax engine. **Open question: does it live inside Parallax, or as a separate app/desktop tool?** Not scoped yet; needs your call before any build. (Tracked in `NEXT-STEPS.md` → "Parked questions".)

## 3. Plaits tone ear-confirm (carried over, lower priority)
From the 2026-06-07 Plaits run — still worth a general tone pass on the 24 models. The Chiptune infinite-drone you'd have hit is now **fixed** (`acb3625`). Numerically verified (note 69 → 440 Hz, all 24 render); listen especially to the **drums** and **6-op FM banks**.
- *Knobs, not code:* **DECAY** / **LPG TONE** set ring length/brightness (default 0.5 — raise DECAY if notes feel too plucky).
- *Faithful behaviour, not bugs:* the 3 "6-Op FM" entries are DX7 banks — scroll their 32 presets with **HARMONICS**; drum/pluck models are one-shots that ring per DECAY regardless of note length.

*Confirmed still on the roadmap (you asked): the patch **postcard** + **MIDI import/export** are both M5 items, not dropped.*

Full detail: Laxsynth → this session's `SESSION-HANDOFF.md`; Plaits → `.handoff/OVERNIGHT-LOG-2026-06-07.md`.

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
