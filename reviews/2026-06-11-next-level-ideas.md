# Parallax — Next-Level Ideas Review
**Date:** 2026-06-11 · **Lens:** creative director pitching v1.1+ · **Branch reviewed:** `claude/codebase-shipping-review-q5whpr`

---

## 1. Opening thesis: what Parallax wants to become

Parallax already made its big bet and won it: *real firmware DSP in a browser tab, explained in plain English*. The Explain panel (`src/ui/ExplainPanel.svelte` + the hand-authored prose in `src/data/braids-models.ts` / `plaits-models.ts`), the "Show me" sweep (`src/state/show-me.ts`), and the sound-match suggester (`src/audio/suggest.ts`) all point the same direction — this is not a DAW, it's a **listening instrument**. A place where you *understand* a sound by touching it.

The second thing the codebase keeps whispering is **the loop as a postcard**. The share URL is a complete instrument (`src/state/share-url.ts` — engine + knobs + melody in a hash), the postcard renderer is already a deterministic pure-canvas social card (`src/ui/postcard.ts`), and the Surprise button rolls a whole coherent identity in one tap (`src/state/surprise.ts`). Parallax wants to be the place where a 15-second musical idea becomes a tangible, tradeable object.

So the trajectory: **deepen the listening-instrument side** (more ways to see and discover sound) and **complete the postcard loop** (make the shareable object *audible*, not just visible). Every pitch below serves one of those two arrows. The infrastructure is unusually generous: the engine registry makes catalogues data-driven, the wire format unifies presets/URLs/postcards, `show-me.ts` is secretly a parameter-automation engine, and `sample-analysis.ts` is a pure, testable feature-extraction core that doesn't care where the samples came from.

---

## 2. Tier 1 — Weekend wins

### 1.1 Scope draw modes: Lissajous / phase plot / dot mode
- **Builds on:** `src/viz/Oscilloscope.svelte` (already reads per-theme tokens `--scope-*`, has trigger + persistence + bloom), `audioEngine.analyserNode` (`src/audio/AudioEngine.ts:43`).
- **What:** A small mode toggle in the scope corner: (a) classic trace (current), (b) **phase plot** — plot `x(t)` vs `x(t−τ)` from the same mono buffer (the classic delayed-copy Lissajous trick; no second channel needed, so monophonic is fine), (c) dot/points mode with heavier persistence for that vintage-storage-scope look. Per-theme defaults: Phosphor gets phase plot as its alt, Lab gets crisp dots.
- **Effort:** S (one component, ~100 lines; the buffer + persistence machinery already exists).
- **Delight 5 / Utility 2.** No conflicts.
- **Cooler than it sounds:** the phase plot turns every Braids model into a distinct *shape* — CSAW draws a different orbit than VOWL — so the scope becomes a second model-identity display for free.

### 1.2 Patch lineage breadcrumb ("undo the dice")
- **Builds on:** `src/state/surprise.ts` (the roll), `encodeState` wire strings (`src/state/serialization.ts` — already the universal snapshot format used by presets and URLs, see `src/state/persistence.ts:45`).
- **What:** Before each Surprise roll (and Match-panel Apply), push `encodeState(...)` onto an in-memory ring (last ~10). Show a tiny "↩ previous sound" breadcrumb after a roll. Decode + apply uses the exact same path share-URL loading does (`applySharedState`).
- **Effort:** S. **Delight 4 / Utility 5.** No conflicts.
- **Cooler than it sounds:** it converts Surprise from a gamble into a *walk* — people roll 10× more when rolling is reversible, and the ring is a free "recent sounds" history menu later.

### 1.3 Swing knob
- **Builds on:** Tone.js Transport already installed and tempo-bound (`src/sequencer/transport.ts:20`); Tone exposes `transport.swing` / `swingSubdivision` natively. Grid is 16th-note steps (`src/notation/grid.ts:8`).
- **What:** One knob (0–100%) next to tempo, stored on `melodyStore` (bump wire version or make it an optional field — `decodeState` already defends against missing fields). Set `transport.swing` in the existing tempo subscriber.
- **Effort:** S. **Delight 4 / Utility 4.** Touches the share-URL schema (additive, safe).
- **Cooler than it sounds:** every existing demo melody, every Surprise roll, every shared link instantly has groove — it's the highest sound-quality-per-line-of-code change available.

### 1.4 Konami code → "degauss"
- **Builds on:** `src/ui/KeyboardHarness.svelte` already owns global keydown routing (and carefully avoids editable targets); `Oscilloscope.svelte` boot-sweep one-shot (`bootSweepStart`) shows exactly how to do a transient canvas effect.
- **What:** ↑↑↓↓←→←→BA triggers a CRT degauss: scope trace wobbles/blooms for a second (reuse the boot-sweep pattern), a `hapticTick()` burst (`src/ui/haptics.ts`), and a one-shot pitch-warble on the current note via `setPitchBend` (already on `ISynthEngine`, `src/audio/types.ts:113`). On Phosphor theme it's *thematically perfect*.
- **Effort:** S. **Delight 5 / Utility 1.** No conflicts (visual one-shot, not a theme switch — respects theme-follows-engine).
- **Cooler than it sounds:** it's the kind of detail people screenshot and tell friends about, and it costs an afternoon. (Note: QWERTY keyboard already exists — `KeyboardHarness.svelte` — so don't pitch that; the keyboard is already an instrument, which is what makes a key-sequence egg land.)

### 1.5 Idle attract mode: the scope hums the logo
- **Builds on:** `Oscilloscope.svelte` already has an idle branch (breathing baseline + sweeping beam dot, lines 134–160); `drawMark` in `src/ui/postcard.ts:58` already encodes the wordmark waveform as quadratic curves.
- **What:** After ~60s of true idle (audio silent, no pointer activity), the breathing baseline occasionally morphs into the two-hump Parallax mark waveform and back. Pure canvas; respects the existing `reducedMotion` guard.
- **Effort:** S. **Delight 4 / Utility 1.** No conflicts.
- **Cooler than it sounds:** hardware synths have personality at rest; this gives Parallax an "alive on the shelf" quality that screenshots and demo videos pick up.

### 1.6 Postcard v2: QR code + Web Share
- **Builds on:** `src/ui/postcard.ts` (deterministic 1200×630 canvas), `PostcardModal.svelte` (already does `toBlob` + clipboard write, lines 86–114 — but **no `navigator.share` yet**), `buildShareUrl()` (`src/state/share-url.ts:38`).
- **What:** (a) Render a QR of the share URL into the postcard's empty footer-right corner (one tiny dependency, e.g. `qrcode-generator`, ~10 KB; lz-string URLs are typically a few hundred chars — well within QR capacity). (b) Add `navigator.share({ files: [pngFile], url })` where supported — this is the mobile-native share path the modal is missing.
- **Effort:** S. **Delight 4 / Utility 4.** Static-host-compatible by construction.
- **Cooler than it sounds:** the postcard stops being a picture *of* a sound and becomes a working *container* for it — scan the image anywhere, get the actual instrument. This is the whole no-backend share thesis in one artifact.

---

## 3. Tier 2 — Killer features (1–4 weeks)

### 2.1 Parallax Daily — date-seeded sound of the day
- **Builds on:** `src/state/surprise.ts` (the whole orchestration exists; it just calls `Math.random` directly via `pick`/`rand`, lines 18–23 — refactor to accept an injected RNG), `randomizeMelody` (`src/notation/grid.ts:128`, same treatment), postcard + share URL for the social half.
- **What:** A "Daily" button: seed a mulberry32-style PRNG from `YYYY-MM-DD`, run the existing surprise pipeline deterministically. Everyone on Earth who presses it today gets the *same* instrument and melody. Show "Parallax Daily · June 11" on the postcard. Your move: keep it, twist it, share your remix link. Streak counter in `idb-keyval` if you want the Wordle itch.
- **Effort:** M (the RNG injection refactor is the real work — maybe 2–3 days; the rest is UI).
- **Delight 5 / Utility 3.** Zero backend needed — the date *is* the server. No conflicts.
- **Cooler than it sounds:** it manufactures a shared moment for a single-developer static site. Daily ritual + remix-via-URL is a community mechanic with literally no infrastructure.

### 2.2 Loop export — record the 4 bars to a file *(deferred-list item: audio recording)*
- **Builds on:** `AudioEngine` master chain (`src/audio/AudioEngine.ts:47` — insert a `MediaStreamAudioDestinationNode` tap after `masterGain`), Tone Transport loop boundaries (`src/sequencer/part.ts:82`, `loopEnd = "4m"`), MIDI export's download plumbing (`src/sequencer/midi/io.ts:11` — the blob-anchor dance is already written).
- **What:** "Export loop" = start `MediaRecorder` on a master-gain tap, schedule one clean 4-bar pass on the transport, stop, download `.webm`/`.m4a`. Phase 2 (optional): WAV via a recorder worklet tap. Skip `OfflineAudioContext` entirely — the WASM worklets and Tone are wired to the live context (`ISynthEngine.init(ctx: AudioContext)`), and real-time capture of an 8-second loop is *fine*.
- **Effort:** M (~1 week incl. edge cases: tail/release ring-out, sample-rate labeling, Safari codec quirks).
- **Delight 4 / Utility 5.** **Deferred-list item — case for un-deferring:** the share story currently dead-ends for anyone *without* the link (a postcard you can't hear; a MIDI file with none of the timbre). One audio file closes the loop and feeds every social surface that ignores URLs. It's also the smallest possible version of "recording" — one loop, one file, no timeline.
- **Cooler than it sounds:** postcard PNG + QR + an audio file is a complete, self-hosting release format. People will post these.

### 2.3 Generative melody tools: Euclidean + arpeggiator on the grid
- **Builds on:** `randomizeMelody` precedent (`src/notation/grid.ts:128` — pure function → events array → `melodyStore` → Part rebuilds automatically via `src/sequencer/part.ts:102`), scale machinery (`buildRowMidis`, tonal), Plaits' own arpeggio prose (`src/data/plaits-models.ts:113`) proving arps suit the app's voice.
- **What:** A small "Generate" menu on the staff toolbar: **Euclid(k, n)** rhythm distributed over 16 steps with pitches walked from the scale; **Arp** (up/down/up-down/random over 1–2 octaves from a chosen root); **Mutate** (perturb 2–3 notes of the current melody, in-key). All pure functions in `grid.ts` style — testable, no new playback infrastructure, monophonic by construction.
- **Effort:** M (1–2 weeks with decent UI). **Delight 4 / Utility 5.** No conflicts — these *write to* the existing 4-bar monophonic grid rather than adding a new sequencer.
- **Cooler than it sounds:** Surprise currently rolls great *sounds* attached to mediocre *tunes* (random walk, 30% rests). Euclid+arp makes the rolled music actually bop, which upgrades Surprise, Daily, postcards, and exports simultaneously.

### 2.4 Hum-to-patch: mic input for the Match tool
- **Builds on:** the entire Match pipeline is already input-agnostic: `analyzeSamples(Float32Array, sampleRate)` is pure (`src/audio/sample-analysis.ts:208`), `suggestPatches` ranks all 70+ models across engines (`src/audio/suggest.ts:211`), `MatchPanel.svelte` + the parallel sample analyser chain (`AudioEngine.sampleAnalyser`, lines 50–57) handle playback/compare.
- **What:** A "🎤 record" button next to the file picker: `getUserMedia` → `MediaRecorder` (3–5 s) → `decodeAudioData` → the existing `loadSampleFile`-equivalent path → existing analysis + suggestions. Hum, whistle, or hold the phone to a record player.
- **Effort:** M (~1 week; permission UX and iOS quirks are the cost, not the DSP).
- **Delight 5 / Utility 4.** No conflicts; nothing leaves the browser (on-brand with the privacy stance in `share-url.ts`'s comments).
- **Cooler than it sounds:** "hum into your browser and it hands you a Eurorack patch that sounds like you" is the single best demo sentence this app could own, and 90% of it is already written.

### 2.5 Model Safari — guided listening tour
- **Builds on:** the per-model prose with `listenFor`/`goodFor` (`src/data/braids-models.ts`, 445 lines of hand-written gold), `startSweep` (`src/state/show-me.ts:144` — interruption/restore logic already solved), `loadDemoMelody` pattern (`src/sequencer/demo.ts`), family groupings in the registry (`src/audio/registry.ts`).
- **What:** "Take the tour" mode: a curated sequence (one stop per family, best-of model each) that auto-loads the model, plays a short fitting phrase, runs a Show-me sweep on the most characterful knob, and shows the `listenFor` text as a caption. Next/prev/exit. Pure orchestration of existing primitives plus a hand-curated stops list in `data/`.
- **Effort:** M (1–2 weeks; most of it is curating the stops and phrase-per-family).
- **Delight 4 / Utility 5.** No conflicts — it's the Explain panel's mission, animated.
- **Cooler than it sounds:** 47 models is a *paradox-of-choice wall* for newcomers. The safari converts the catalogue from a list into a narrative, and it doubles as the app's self-running demo mode.

### 2.6 MIDI-learn: hardware knobs drive the macros
- **Builds on:** `src/state/midi-input.ts` already parses incoming messages with a proper note-stack and handles CC64 sustain — the message loop exists; `patchStore.setKey("params", …)` is the universal write path that animates knobs *and* drives the engine (proven by `show-me.ts:79`).
- **What:** "Learn" affordance on each `Knob.svelte`: click learn, wiggle a hardware knob, bind that CC to the param (map 0–127 → descriptor min/max from `getParameterSchema`). Persist bindings per engine in `idb-keyval`.
- **Effort:** M (~1 week). **Delight 3 / Utility 4.** No conflicts (Web MIDI *input* already shipped; this extends it). Not supported on Safari — UI already degrades gracefully (`midiSupported`).
- **Cooler than it sounds:** TIMBRE/COLOR under a physical knob with the Explain card lighting up as you turn is the closest a browser gets to the hardware module — it completes the "real Braids" promise for hardware people.

---

## 4. Tier 3 — Vision swings

### 3.1 Port a third voice from the eurorack repo — and make it **Rings**
- **Builds on:** the shims are *small and patterned* — `dsp/shim/braids_shim.cc` is 289 lines, `plaits_shim.cc` is 141: global instance → `extern "C"` setters → block-renderer → int16 heap buffer the worklet reads. A new engine needs: shim + build script (note: `dsp/shim/` currently has only `.ps1` scripts — the `build.sh` mentioned in CLAUDE.md doesn't exist yet, worth fixing regardless), a worklet (clone `public/plaits-worklet.js`), an `ISynthEngine` class (~`PlaitsEngine.ts`-sized), a `data/rings-models.ts` catalogue, one registry entry (`src/audio/registry.ts:51`), one theme-map line (`src/state/theme.ts:11`).
- **What & why Rings:** Rings is a *resonator* — strike it (it has a built-in exciter when nothing's patched, `performance_state.strumming`), and it sings physical-modeling strings/plates/sympathetic sets. It's monophonic-compatible (its internal polyphony setting can be pinned to 1 — locked-decision-clean), note-driven, and its sound is the most beloved in the Mutable catalogue. Plaits already overlaps Braids; Rings adds a *category* (resonant physical modeling with that signature shimmer) nothing else covers. Tides is the runner-up (and carries the famous "sheep" wavetable easter egg — a fourth-theme delight if ever ported), but Tides is a slope/LFO generator — it fights the note-in/audio-out engine contract; Rings fits it.
- **The compounding part:** a new engine means a **fourth theme** (theme-follows-engine turns every port into a whole new outfit for the app), new Explain prose, new Surprise/Daily/Match territory. The registry design means every existing feature inherits it for free.
- **Effort:** L (3–5 weeks: shim + worklet resampling at Rings' 48 kHz, catalogue authoring, theme design). **Delight 5 / Utility 4.** *Deferred-list item ("more engines") — worth un-deferring as THE marquee v1.2 because the entire app multiplies through the registry.*
- **Cooler than it sounds:** Parallax stops being "the Braids site" and becomes "the place where Mutable modules live in your browser" — a genuinely unique cultural artifact, fully MIT-licensed.

### 3.2 Remix chains — provenance without a server
- **Builds on:** the wire format (`src/state/serialization.ts`) is versioned and already round-trips through URLs, presets, and (with 1.6) QR codes; `applySharedState` (`share-url.ts:62`); postcard footer real estate (`postcard.ts:240`).
- **What:** Add an optional `lineage: string[]` (short names/handles, e.g. `["andrew", "kim"]`, capped at ~5) to the shared state. When you open someone's link and re-share, the UI offers "add your name to the chain". Postcards print the chain: *"a sound by andrew → kim → you"*. Optionally hash-stamp each hop so chains can't be trivially forged (cosmetic integrity only — label honestly).
- **Effort:** M–L (2–3 weeks with schema migration + UI). **Delight 4 / Utility 3.** No backend — the chain *is* the payload. The only "social network" is the URLs people already pass around.
- **Cooler than it sounds:** it turns patch-sharing from broadcasting into a *game of telephone* — the same mechanic that made exquisite-corpse art work, on a static host.

### 3.3 Synthesis 101 — a curriculum built from parts you already own
- **Builds on:** Safari (2.5) as the spine, `show-me.ts` sweeps as the interactive demos, `sample-analysis.ts` as the *grader* (it can verify "make it brighter" by re-measuring the spectral centroid of the live analyser output!), Explain prose as the textbook, scales/grid as the music-theory half.
- **What:** A ~10-lesson track: oscillators → harmonics (sweep TIMBRE on CSAW, watch the Spectrum) → FM → physical modeling → envelopes → scales & keys. Each lesson: one paragraph, one interactive task, one "check" (analysis-verified where possible, honor-system elsewhere). Progress in `idb-keyval`.
- **Effort:** L (the writing is the cost; the runtime is mostly Tier-2 reuse). **Delight 3 / Utility 5.** No conflicts.
- **Cooler than it sounds:** there is *no* synthesis course on the internet where the lab equipment is real Eurorack firmware with a live scope and an auto-grader. Teachers would assign this. It's the app's legacy mode.

---

## 5. Recommended v1.1 set (green-light these)

1. **Patch lineage breadcrumb (1.2)** — ships in a day, makes Surprise fearless, and quietly builds the snapshot-ring every later feature (Daily, A/B compare) wants.
2. **Swing knob (1.3)** + **Generative melody tools (2.3)** — together they fix the one soft spot in the magic loop: the *music* coming out of randomization. Everything downstream (Daily, postcards, exports) sounds better the moment these land.
3. **Postcard QR + Web Share (1.6)** — small, completes the postcard-as-container thesis, and is a prerequisite for Daily's social loop to feel finished.
4. **Parallax Daily (2.1)** — the headline. It needs 1.2 (rolls feel safe), 2.3 (rolls sound good), and 1.6 (sharing the result feels good) — which is exactly why this set compounds: Daily is the flywheel, the other three are its bearings.
5. **Loop export (2.2)** — un-defer it. One loop, one file, real-time capture, ~a week. It's the difference between "look at my patch" and "listen to my patch" everywhere URLs don't reach.

Hold **Rings (3.1)** as the v1.2 marquee — it deserves its own milestone and its own theme, and the v1.1 set above makes the app it lands in far stickier.

---

## 6. Do-NOT-build list

- **Polyphony.** Locked for good reason: both shims are architected around a single global voice (`braids_shim.cc:42`, `plaits_shim.cc:40`), the MIDI note-stack does elegant last-note priority *because* mono (`midi-input.ts:34`), and the staff/grid is monophonic by design. Polyphony rewrites the worklets, the sequencer, the notation, and the app's identity — for a feature general-purpose web synths already do worse than DAWs.
- **An insert-FX rack.** The commented slot exists (`AudioEngine.ts:10`), but a reverb/delay/chorus menu turns a focused instrument into a mediocre channel strip and muddies the "this is what *Braids itself* sounds like" promise — the authenticity is the product. (If anything ever goes there, it's Rings-as-resonator, and that's an engine decision, not an FX menu.)
- **A manual theme switcher.** Theme-follows-engine is the locked decision and it's *right* — themes are costumes with bodies in them. A dropdown would orphan the costumes. (One-shot visual eggs like degauss are fine; persistent overrides are not.)
- **Song mode / more bars / pattern chaining.** 4 bars is the haiku constraint that makes everything else work — share URLs stay small, postcards stay readable, loops stay tradeable, the staff stays comprehensible. The moment there's an arrangement timeline, Parallax is a bad DAW instead of a great instrument.
- **A sampler engine.** The registry makes it *technically* cheap, which is the trap: the app's soul is "synthesis, explained." A sample-playback engine has no TIMBRE/COLOR story for the Explain panel, no firmware provenance, and no scope-shape identity. The mic belongs in the *Match* tool (2.4), not the voice path.
- **Accounts, cloud preset sync, comments, a feed.** No backend is a feature: it's why the app is private, permanent, and free to run forever. Remix chains (3.2) get 80% of the social feeling at 0% of the infrastructure. The day Parallax needs a database is the day it stops being a personal instrument.
- **AI patch generation via an API.** Tempting demo, but it adds a network dependency, a bill, and a black box to an app whose entire pedagogy is "here is exactly what this knob does." The deterministic, explainable ranker in `suggest.ts` *is* the brand.
