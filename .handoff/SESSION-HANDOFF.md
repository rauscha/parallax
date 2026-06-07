# Session hand-off — 2026-06-07 (machine: desktop · crane-desk)

## STATE (read this first)
- **Branch:** `main`, clean, synced with `origin/main` (`a1f11b3`). One worktree only — nothing stranded.
- Everything is committed and pushed; the deploy workflow auto-ships to **andrewrausch.com/parallax/** on push.
- **Plaits shipped as Parallax's second synth engine this session.** Pick **Braids / Plaits** from the new *Engine* selector above the model picker. The scope, Explain panel, and sequencer grid all work with it. Verified end-to-end numerically — but **not ear-confirmed** (I can't ear-test from the harness). That's the one open item.

## Done this session
- **Multi-engine plumbing (the app never had it).** New engine **registry** (`src/audio/registry.ts`) = the one place that knows what engines exist. ModelPicker + ExplainPanel + bindings read it per active engine, so they adapt with no per-engine code. Explain now renders **one card per macro knob** (Braids: Timbre/Color; Plaits: Harmonics/Timbre/Morph). New **EnginePicker** + `state/engine-control.ts` hot-swap engines; melody + transport survive the swap. (`40108ec`, `9899e4a`)
- **Authentic Plaits WASM port** (same approach as Braids, no placeholder oscillators). Vendored Émilie Gillet's MIT Plaits DSP (`295cc54`), wrote the shim + `npm run wasm:plaits` build → `public/plaits.wasm` 191 KB (`9bdd7ff`), worklet + `PlaitsEngine.ts` + all-**24**-model catalogue with manual-sourced knob text (`90f8968`). Pitch is MIDI-direct.
- **Edges was the original ask but is not faithfully portable** — its square voices are AVR hardware-timer-generated (no software DSP to lift). Surfaced in pre-flight; user chose Plaits (backlog flagship). Plaits' **Chiptune** engine covers the Edges itch.
- **Verified end-to-end:** Node smoke test = 24/24 engines render finite, non-silent, correctly pitched; browser analyser RMS = 0.00001 at rest / 0.165 on a note / 0.029 on release; bidirectional Braids↔Plaits swap, no regression. Type-check clean throughout.
- Dev-only `window.__parallax` audio handle (`b42554e`) — stripped from production builds; for harness verification on this machine where pixel/screenshot readback is wedged.

## Next up
1. **You: ear-confirm Plaits on the live site** (once deployed). Flip the Engine selector to Plaits, scroll the 24 models, play. Listen especially to the **drums (BD/SD/HH)** and the **6-op FM banks**. Signal-flow + pitch are proven; only tone needs your ear. *(Optional tuning afterward: the new DECAY / LPG TONE knobs set ring length/brightness — raise DECAY if sustained notes feel too plucky.)*
2. **"Show me" sweep** (M4 Explain item 3, the last interactive Explain piece) — per-knob button that sweeps a macro live so you hear what it does; animate the param + move the knob; handle interrupt/restore. Now applies to *both* engines via the registry.
3. **Grid G5 — per-step expression** — the only place `MelodyEvent` gets extended (p-locks, slide, accent, ratchet); pairs with M4 amounts.
4. **(Earlier, still open) eye-confirm** the knob↔card highlight + mobile-grid render from the 2026-06-06 session, if not already done.

## Watch out for
- **Faithful Plaits behaviour, not bugs:** the 3 "6-Op FM" entries are DX7 banks — you scroll their 32 presets with the **HARMONICS** knob, not the model picker. Drum/pluck models are percussive one-shots that ring per DECAY regardless of note length. Plaits doesn't drone at rest (its low-pass gate is closed) — that's correct.
- **Plaits build:** `npm run wasm:plaits` (separate from Braids' `npm run wasm`). Needs the Emscripten env (`& "$env:USERPROFILE\emsdk\emsdk_env.ps1"`). The prebuilt `public/plaits.{wasm,js}` are committed so CI ships them with no toolchain. A throwaway Node smoke test lives at `dsp/build/plaits-smoke.mjs` (gitignored) — handy to re-validate the WASM after a shim change.
- **Adding a 3rd engine is now a recipe:** vendor + shim + worklet + `data/<name>-models.ts` + one `ENGINES` entry in `registry.ts`. PlaitsEngine/worklet/shim are the template.
- **Preview screenshot renderer is still wedged** (same as last session): canvas pixel + colour readback are unreliable, so UI verification this session was DOM + numeric-analyser only. Screenshots time out. If you reopen the harness fresh and they work, great.
- **Note timing** is quantised to the audio render block (~2.7 ms) for Plaits — inaudible for the sequencer; flagged as a future refinement only if ultra-tight retriggers ever matter.
- Standing gotchas (unchanged): AudioContext needs a real tap (can't ear-test from the harness) · DSP shim changes need a WASM rebuild + commit the regenerated WASM · the `worker-src 'self' blob:` CSP must stay · `vite preview` uses `isPreview` for build-base · mutating a `Set` in `$state` needs reassignment · MIDI clamp C1..C8 · no service worker yet (a normal refresh gets the latest build).
