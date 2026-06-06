# Session hand-off — 2026-06-06 (machine: desktop · crane-desk)

## STATE (read this first)
- **Branch:** `main`, clean, synced with `origin/main`. One worktree only — nothing stranded.
- **All three parked decisions are resolved.** Four commits this session, all pushed + deployed green to **andrewrausch.com/parallax/** (CI now on Node-24 actions).
- **One thread is open and waiting on you:** the Explain-panel richer text. I drafted 4 exemplar blurbs and asked three voice questions — answer those and I roll the text out to the rest, then build the knob↔card highlight + "show me" sweep.

## Done this session
- **Per-model AD envelopes** (`0419ccd`) — new `src/data/braids-envelopes.ts` table → `BraidsEngine.applyEnvelope()` on model switch, clamped to firmware ranges. Only the **4 unpitched drums** (KICK/SNAR/CYMB/DRUM) are one-shots (`letRing` = ring out the full decay). **PLUK & BELL excluded on purpose:** my first pass forced a VCA envelope + held the gate open on them, but you ear-tested and they were discordant — PLUK is paraphonic in the firmware (stacks a new string per strike) and both self-decay in the DSP, so the held-open gate piled successive notes into clashes and killed Release. You're keeping the decay tuning as-is.
- **Mobile sequencer fix** (`6c60de2`) — staff *and* grid had vanished on phones because the desktop layout never scrolls and clipped the bottom region off-screen. Mobile now scrolls the grid between a pinned top bar and transport; regions size to content. Verified at 375px (both surfaces render).
- **CI Node-24 bump** (`40ea94c`) — Pages workflow actions updated ahead of GitHub's 2026-06-16 forced upgrade.
- **Explain panel deeper text — STARTED** (`66416ed`) — optional `detail` field on `BraidsModel`, rendered under the description with a left rule. 4 exemplars live (FM, WTFM, VOWL, WMAP).

## Next up
1. **Explain richer text** — you owe three answers: (a) voice/length (~3 sentences? drier/more technical?), (b) one flowing paragraph vs. split "listen for" / "good for" lines, (c) coverage list. Then roll `detail` out to the non-obvious models (see NEXT-STEPS "Now — Explain panel").
2. **Knob ↔ card highlight** — touch/focus a knob → its Explain card lights (and back). Needs a small shared "active param" store.
3. **"Show me" sweep** — per-knob button that sweeps TIMBRE/COLOR live so you hear it on the current model.
4. **Grid G5** — per-step expression; this is where `MelodyEvent` finally gets extended (and where the AD amounts pair up).

## Watch out for
- **Don't re-enable PLUK/BELL as AD one-shots** without re-testing — that's exactly what caused the discordant overlaps. They gate normally and self-decay by design now.
- **The Explain `detail` field is WIP** — only 4 models have it and the voice isn't signed off. Don't mass-roll-out until the 3 questions are answered.
- **Don't extend `MelodyEvent` until G5** (still holds — both editors are pure UI on the existing model).
- Standing gotchas: AudioContext needs a real tap (can't ear-test from a harness) · DSP shim changes need `npm run wasm` + commit the regenerated WASM · the `worker-src 'self' blob:` CSP must stay (Tone's clock worker) · `vite preview` runs with `command:'serve'` (use `isPreview` for build-base behavior) · mutating a `Set` in `$state` needs reassign · MIDI clamp C1..C8.
- Two background dev servers may still be running on crane-desk (Bash :5173 + preview :61860) — harmless, die with the session.
