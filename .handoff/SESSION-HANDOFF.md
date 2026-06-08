# Session hand-off — 2026-06-07 (machine: laptop)

## STATE (read this first)
- **Branch:** `main`, clean, fully synced with `origin/main` at **`26d68f0`**. One
  worktree only (`c:\parallax`) — nothing stranded.
- **New feature underway: the "Match a sound from a song" tool** (the in-app
  "recreate a sound you hear in a track" idea — now **decided + being built**).
  **Increment 1 of 3 shipped**: a "◎ Match a sound" overlay (topbar button, or
  drop a track anywhere) — load audio, drag-select + loop a region, compare
  **TARGET vs YOUR PATCH** spectra side-by-side, and refine with the model's
  macro knobs. Type-checks clean and compiles, **but not yet eyeballed in a
  browser** (see Watch-out) — that's the first thing to do.
- Also this session: **fixed a grid bug** (pitch labels misaligned with their
  rows on short/laptop screens) and **parked a future idea** (engine↔theme
  pairing).
- **Spec for the Match tool:** `~/.claude/plans/zesty-cuddling-cosmos.md` — the
  3-increment plan, source of truth.

## Done this session
- **Closed every open ear-test** (from the pick-up): **Laxsynth sounds good**,
  **Plaits drone fix confirmed**. No calibration needed.
- **Decided the song-matching tool: in-app, "Guided Match" tier** (analyze a clip
  → detect pitch/brightness/envelope → suggest an engine·model + starting patch →
  compare spectra to refine). Researched the codebase, wrote the plan, built it
  foundation-first.
- **Match Increment 1 (foundation) — shipped** (in `a6e9feb`, see Watch-out):
  - `AudioEngine.ts`: a parallel reference-sample path — `loadSampleFile` (decode),
    `playSample({loopStart,loopEnd})`/`stopSample`, and a 2nd `sampleAnalyserNode`
    (file plays through its own gain→analyser→destination, not through the synth).
  - `Spectrum.svelte`: optional `analyser` prop → a 2nd instance draws the sample.
  - `MatchPanel.svelte` (new): the overlay — load, waveform + drag-select region,
    Loop toggle, dual TARGET/PATCH spectra, macro-knob refine strip. "Detect &
    suggest" is a labelled placeholder (that's Increments 2–3).
  - `App.svelte`: topbar "◎ Match a sound" entry (gated on audio ready) + mount.
- **Grid fix (`a6e9feb`):** pitch-label gutter was a flex column with no row gaps
  while the cells are a grid with a 1px gap per row → labels drifted ~1px/row into
  whole-row misalignment, worst on a short screen. Gutter now mirrors the cells'
  tracks **and** gap; label font scales to row height. `npm run check` clean.
- **Parked (NEXT-STEPS):** engine↔theme pairing — Laxsynth→Lab (recolor to
  NES/SNES), Plaits→Sandbox, Braids→Phosphor. Future, not now.

## Next up
1. **You: eyeball Increment 1** at localhost:5173 (or the live site once deployed):
   **grid** (Sequencer→Grid, Chromatic mode — letters centered on rows?) and
   **Match** (◎ button → drop a track → loop a region → TARGET vs PATCH spectra,
   play Z–M, nudge Refine knobs).
2. **Increment 2 — detection:** new `audio/fft.ts` + `audio/sample-analysis.ts`
   (pitch via autocorrelation, brightness via FFT centroid, envelope via RMS) →
   wire the "Detected" readouts. Unit-check vs synthesized buffers (sine@440→A4,
   saw brighter than sine).
3. **Increment 3 — suggestion + Apply:** new `audio/suggest.ts` (rank models by
   `family` + `listenFor/goodFor` vs detected features) → suggestion + one-click
   **Apply starting patch** (`startEngine` if engine differs → `patchStore.set`).

## Watch out for
- **Match Inc 1 is NOT yet visually verified.** It type-checks and compiles, but
  no one has clicked through it in a browser. I couldn't automate it: the
  Claude-in-Chrome tab can't reach `http://localhost` (Chrome force-upgrades it to
  HTTPS, which the dev server doesn't speak) and `127.0.0.1` is blocked for the
  extension. **Eyeball before building on top of it.**
- **Commit `a6e9feb` is mislabelled.** Its message says only `fix(grid)`, but it
  *also* contains all 4 Match Increment-1 files — they were left staged from an
  earlier commit attempt and got swept in. You chose to **leave it as-is** (code
  is fine; history just understates that commit). Not a bug, just don't be
  surprised reading the log.
- **Match needs audio started** (tap-to-start) before it works, and the loaded
  file **stays in memory only** (never persisted, never leaves the browser).
- For Increment 3's Apply: the patch path is just *swap engine if different
  (`startEngine`) → `patchStore.set(patch)`* — the binding pushes model + params.
- Standing (unchanged): a `npm run dev` server may still be running on :5173 ·
  `vite base` is `/parallax/` on build, `/` on dev · no service worker (refresh
  gets the latest) · M5 (MIDI import/export · share-URL · presets · PWA) is still
  the road to v1 — the Match tool is post-v1 delight, built now by your call.
