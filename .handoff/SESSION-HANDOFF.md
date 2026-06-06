# Session hand-off — 2026-06-06 (machine: desktop · crane-desk)

## STATE (read this first)
- **Branch:** `main`, clean, synced with `origin/main` (`2320544`). One worktree only — nothing stranded.
- Everything this session is committed, pushed, and **deployed green** to **andrewrausch.com/parallax/** (both audio-fix and docs CI runs succeeded).
- **The grace-note-on-playback bug is fixed** (real fix `0029ccb` — see below). The Explain richer-text rollout and the smaller scope row also shipped.
- **One thing waiting on you:** ear-confirm the grace note is actually gone on the live site. I verified it by capturing the audio in the harness (clean), but I can't *hear* it — you can. Play C-E-G-C, let it run, stop anywhere, hit play again; the ghost note before the first C should be gone in every case. No hard-refresh needed (no service worker — see Watch out for).

## Done this session
- **Grace-note bug — REAL FIX `0029ccb`.** The extra note before the first programmed note was the **gain (volume) envelope opening ~50 ms early**, uncovering whatever pitch last sounded (A4 from the start-blip on a cold play; otherwise the note you stopped on). Pitch is a stepped automation so it waited for the beat; the volume *ramp* drew its line from a stale past event and started early. Fix: pin the attack ramp's start to the note time with an explicit `setValueAtTime` so volume and pitch open together. Diagnosed + verified with a post-gain audio capture in the preview harness (replay onset now reads 262 Hz / C immediately, zero leak — both the stop-mid-arp and cold-first-note cases).
- **Two earlier grace-note passes (`3b45652`, `d3a81da`) — kept, but were off-target for this symptom.** They corrected a real *sub-3 ms* strike race (strike now fires at the note time and carries its own pitch). **Keep them** — they're needed for **drums**, whose one-shot AD envelope must be struck on the beat, not ~90 ms early. So now the hit fires on the beat *and* the gate opens on the beat.
- **Explain richer text → all 47 models** (`d666c14`, `427e74d`). `BraidsModel.detail` is now `{ listenFor, goodFor }`, rendered as two labeled lines under the description. Conversational/action voice; drum text matches the engine (KICK/SNAR/CYMB/DRUM = one-shots that ring out; PLUK/BELL = self-decaying).
- **Scope row shrunk** (`6661ff2`) — scope ~35%→27%, the height went to the Explain panel (~25%→34%).

## Next up
1. **You: ear-confirm the grace note is gone** on andrewrausch.com/parallax. If you still hear a faint *click* (not a pitch) at the very onset, tell me — there's a deeper lever (move the amp gate into the worklet). If it's clean, this bug is closed.
2. **Knob ↔ card highlight** — touch/focus a knob → its Explain card lights, and vice-versa. Needs a small shared "active param" store between `Knob`/`ParamPanel` and `ExplainPanel`.
3. **"Show me" sweep** — per-knob button that sweeps TIMBRE/COLOR live so you hear what it does on the current model (animate the engine param + move the knob; handle interrupt/restore).
4. **Grid G5 — per-step expression.** This is the *only* place `MelodyEvent` gets extended (p-locks, slide, accent, ratchet); pairs with the M4 AD amounts.

## Watch out for
- **No service worker is wired up.** `vite-plugin-pwa` is installed but NOT in `vite.config.ts` (PWA is deferred M5 work). So there's no offline cache — a normal refresh gets the latest build. (CLAUDE.md still says "PWA via vite-plugin-pwa" — that's aspirational, not yet true.)
- **Grace-note fix is JS-only** (no WASM rebuild). The fix lives in `BraidsEngine.noteOn` (gain anchor) + the strike queue in `public/braids-worklet.js`.
- **Don't re-enable PLUK/BELL as AD one-shots** without re-testing — that caused discordant overlaps earlier (they're paraphonic / self-decaying; they gate normally now).
- **Don't extend `MelodyEvent` until G5** — both staff and grid editors are pure UI over the existing model.
- Standing gotchas: AudioContext needs a real user tap (can't ear-test from the harness) · DSP shim changes need `npm run wasm` + commit the regenerated WASM · the `worker-src 'self' blob:` CSP must stay (Tone's clock worker) · `vite preview` runs with `command:'serve'` (use `isPreview` for build-base) · mutating a `Set` in `$state` needs reassignment · MIDI clamp C1..C8.
- A background dev/preview server (Claude Preview, port 5173) may still be running on crane-desk — harmless, dies with the session.
