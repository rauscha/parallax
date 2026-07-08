# Parallax — Road to v1.0

**Created:** 2026-06-12, from the seven-agent shipping review (`reviews/2026-06-11-*.md`).
**Audience:** an autonomous Claude session executing this end-to-end. Everything you need is in this file plus the cited reviews; when a task says "see §X of <review>", that section has the full code trace.

**Why this app exists (context for judgment calls):** the developer built Parallax because the Macro synth on the Dirtywave M8 was impossible to learn from the hardware alone — he needed a playground that *explains how the sound works while you touch it*. The review confirmed that instinct: the self-explaining instrument loop (Explain panel + "Show me" + knob↔card link + the verified model corpus) is the original, defensible product. The WASM port is table stakes. When any task here forces a trade-off, protect the explain loop and the teaching honesty first.

---

## Working rules for the executing agent

1. **Branch:** develop on a feature branch (e.g. `v1-ship-gate`), never directly on `main`. Push and open a PR when a phase completes.
2. **One commit per task**, conventional message (`fix(grid): …`), task ID in the body (e.g. `[v1-A5]`).
3. **`npm run check` must pass before every commit.** After Phase C lands tests, `npx vitest run` must pass too.
4. **Locked decisions are locked** (see CLAUDE.md): theme-follows-engine, monophonic, 4 bars, no backend, GitHub Pages, no manual theme switcher. Nothing in this roadmap touches them; if you think a task requires it, stop and surface it instead.
5. **Trademark rule:** never brand the product "Braids"/"Mutable Instruments" — factual attribution only. Task A8 enforces this; don't reintroduce violations.
6. **If you can't verify visually** (no browser), say so in the commit body and add the item to the Phase D checklist rather than claiming it's done.
7. **Order matters within phases** (A5 before C2's tests; A1 before anything touching GridEditor). Phases A → B → C sequentially; tasks inside a phase are sequential unless marked independent.
8. **When done:** update `.handoff/NEXT-STEPS.md` ("Done recently" + check off this file's checklist), push, and leave a summary in `.handoff/SESSION-HANDOFF.md`.

---

## Phase A — Correctness ship gate (confirmed bugs)

Full traces: `reviews/2026-06-11-code-quality.md` §2, `reviews/2026-06-11-security.md` §2.

### A1 — Sweep all component store subscriptions; unsubscribe on destroy  *(HIGH — the worst user-visible bug)*
- **Why:** Conditionally-mounted components leak live `store.subscribe()` handlers. Confirmed result: toggle Staff↔Grid, change key → the melody transposes **twice** (leaked GridEditor remaps, live one remaps again). Also leaks one dead RAF playhead loop per toggle. (code-quality §2.1)
- **Files:** `src/notation/GridEditor.svelte:30-68,405` · `src/notation/StaffEditor.svelte:38,54,56,500` · `src/notation/StaffToolbar.svelte:10,12` · `src/viz/Oscilloscope.svelte:20` — then sweep **all** `.subscribe(`/`.listen(` call sites in `src/**/*.svelte` (~30) and make cleanup the uniform rule. Same sweep: PwaToast's toast timer (`PwaToast.svelte:14`), MidiInput's blip timer (`MidiInput.svelte:18-23`), PostcardModal's object-URL revoke timer (`PostcardModal.svelte:96-103`).
- **Do:** capture every unsubscriber and call it in `onDestroy` (or move subscriptions into `$effect` scopes, which auto-clean). Pick ONE idiom and apply it everywhere — consistency is the regression-proofing.
- **Verify:** `npm run check`; grep proves no bare `.subscribe(` discards remain; if a browser is available: toggle Grid→Staff→Grid 3×, change key C→D once, confirm every note moved exactly +2 semitones.

### A2 — Terminate worklet processors on engine dispose  *(HIGH — leaks a live DSP per swap)*
- **Why:** All three processors `return true` unconditionally and have no kill message; `dispose()` only disconnects. Every engine swap (Surprise = one tap) strands a running WASM instance on the audio thread forever. (code-quality §2.2)
- **Files:** `public/braids-worklet.js:219` · `public/plaits-worklet.js:228` · `public/laxsynth-worklet.js:373` · `src/audio/engines/BraidsEngine.ts:358-363` · `PlaitsEngine.ts:224-229` · `LaxsynthEngine.ts:260-265`.
- **Do:** each worklet handles `{type:"dispose"}` → sets `this.disposed = true`; `process()` returns `false` when set; Braids/Plaits also free their WASM heap buffer (check the shim's exported `_braids_free`/equivalent). Each engine's `dispose()` posts the message **after** A3's fade delay, before nulling refs.
- **Verify:** `npm run check`; in-browser if possible: swap engines 10×, audio-thread CPU (about://tracing or perf panel) stays flat.

### A3 — Stop cutting the 40 ms fade on engine swap  *(pop on swap)*
- **Why:** `useEngine` schedules `allNotesOff()`'s 40 ms ramp then synchronously disconnects the old engine — the ramp never plays; a ringing note hard-cuts. (code-quality §2.3)
- **File:** `src/audio/AudioEngine.ts:91-100`.
- **Do:** connect the new engine immediately, but delay the old engine's `output.disconnect()` + `dispose()` (which now posts A2's message) by ~60 ms (`setTimeout` is fine).
- **Verify:** hold a note (QWERTY) and swap engines — no click. If no browser: state it; Phase D item.

### A4 — Serialize `startEngine` with an in-flight lock
- **Why:** EnginePicker guards itself but Surprise (`surprise.ts:62`), preset load (`engine-control.ts:48`), and Match Apply (`MatchPanel.svelte:46`) are independent entry points; interleaved calls can install-then-dispose the wrong engine. (code-quality §3)
- **File:** `src/state/engine-control.ts:29-35`.
- **Do:** module-level promise chain — every `startEngine` call awaits the previous one (`inFlight = inFlight.then(doSwap)`); all entry points go through it.
- **Verify:** `npm run check`; rapid-fire Surprise 5× if browser available — ends on a working engine matching the picker.

### A5 — `remapByDegree`: nearest-octave fix  *(do before C2 — its test encodes this)*
- **Why:** Octave preserved by letter, not proximity: C→Db remap sends B4 down 11 semitones instead of up 1. Fires on every key change with default fold-to-scale. (code-quality §2.5)
- **File:** `src/notation/grid.ts:111-121`.
- **Do:** after computing the new pitch class, candidate-test `octave−1 / octave / octave+1` and keep the midi nearest to `ev.midi`.
- **Verify:** quick Node check: key C→Db, B4 (71) must land on C5 (72), not C4 (60). Becomes a permanent test in C2.

### A6 — Clamp the share-URL decode (3 one-liners)
- **Why:** Two empirically verified DoS vectors via hostile share links + one contract gap. (security M-1, M-2, L-1)
- **File:** `src/state/serialization.ts` — `decodeEvent` (`:114-123`) and `decodeState` (`:162-164`).
- **Do:** ① clamp `position` to ±40; ② cap events: `s.ev.slice(0, 256)` before mapping; ③ clamp `durationSteps` to `TOTAL_STEPS` (64).
- **Verify:** decode a crafted wire with `position: 2e9`, 500k events, `dur: 1e9` → all clamped; round-trip of a legit melody unchanged. Test lands in C2.

### A7 — Braids shim: own the envelope-range contract
- **Why:** `braids_set_envelope_shape` accepts 0..127, render multiplies ×8 into a **128-entry** LUT → OOB heap read for any value >15. Masked today only by a JS clamp one layer up, while the worklet comment documents the opposite contract. (code-quality §2.4)
- **Files:** `dsp/shim/braids_shim.cc:176-181,232-234` · `public/braids-worklet.js:135-137` · `src/audio/engines/BraidsEngine.ts:246-251`.
- **Do:** clamp `a, d` to 0..15 **in the shim** (the owner); fix the worklet comment to "0..15"; add the same clamp in the worklet's message handler as the live guard (the shipped `.wasm` is prebuilt). Keep the engine-side clamp.
- **WASM rebuild:** requires Emscripten (`npm run wasm`, PowerShell — desktop only). If `emcc` is unavailable in your environment, commit the source + JS guards and flag "wasm rebuild pending" in the commit body and NEXT-STEPS — the JS clamp makes it safe to ship without the rebuild.

### A8 — De-brand the three user-facing "Braids" strings + one copy fix
- **Why:** Violates the project's own trademark rule (CLAUDE.md): brand strings outside attribution. Plus one factual slip the utility review caught.
- **Files & changes:**
  - `src/ui/ParamPanel.svelte:43` — group label `"Lo-fi (the Braids crunch)"` → engine-neutral, e.g. `"Lo-fi (bit crush & drift)"`.
  - `src/ui/TapToStart.svelte:47` — subtitle "A web playground for the sounds of Braids" → e.g. "A macro-oscillator playground — explained as you play". (Attribution stays in the README/footer, phrased factually.)
  - `vite.config.ts` PWA manifest `description` — same treatment.
  - `src/data/braids-models.ts:160` (RING) — description says "Two sine waves multiplied"; the firmware shape is **triple** ring-mod (knobs already say so). Fix the sentence.
- **Verify:** grep `Braids` in `src/` — remaining hits are code comments, file paths under `engines/braids`/`data/`, or factual-attribution phrasing only.

---

## Phase B — UX ship gate

Full detail: `reviews/2026-06-11-ux-ui.md` §3, `reviews/2026-06-11-fun.md` §3/§7.

### B1 — Sandbox contrast: add `--on-signal`, retire text-role `--signal`  *(the one UX blocker)*
- **Why:** On Sandbox, text on `--signal` computes **2.48:1** (1.87:1 on sunken surfaces) — below even the graphics threshold, across ~12 components. Lab (8.7:1) and Phosphor (15.6:1) are fine. (ux-ui B1 has the complete affected-site list with line numbers — use it as the sweep checklist.)
- **Files:** `src/ui/themes/tokens.css` + every site listed in ux-ui §3 B1.
- **Do:** ① add `--on-signal` per theme (lab/phosphor: the current `--bg` value; sandbox: `#1A1A1A` → 5.58:1); switch every signal-filled control's `color: var(--bg)` to `color: var(--on-signal)`. ② Replace `color: var(--signal)` used **as text** (Explain model code + % readouts, grid root-row labels, Match detected values) with the existing `--signal-ink`. ③ Fix the arithmetically-wrong comment at `tokens.css:87`. ④ While in the file: add a `--danger` token per theme (ux-ui m3) and use it for the error messages currently styled `var(--accent)` (`EnginePicker.svelte:98`, `MatchPanel.svelte:522`, `PresetMenu.svelte:220`).
- **Verify:** compute WCAG ratios for every changed pair (the ux-ui reviewer computed, not eyeballed — match that bar); all ≥4.5:1 for text. Visual confirmation → Phase D.

### B2 — Modal/popover focus management
- **Why:** `aria-modal` is claimed but no dialog moves focus in, traps Tab, or restores focus — for keyboard/SR users the dialogs don't exist. Escape already works everywhere. (ux-ui M3)
- **Files:** new `src/ui/trapFocus.ts` (Svelte action, ~15 lines) + `PostcardModal.svelte:127`, `MatchPanel.svelte:279`, `PresetMenu`, `MidiMenu`, `ToolsMenu` popovers.
- **Do:** on open: focus the dialog's first control; trap Tab/Shift-Tab; on close: restore focus to the invoker.
- **Verify:** `npm run check`; keyboard-walk each surface if browser available.

### B3 — iOS input-zoom: finish the 16px rule
- **Why:** Fixed for tempo, missed on two inputs — focusing them zooms the whole PWA on iPhone. (ux-ui M4)
- **Files:** `src/ui/ModelPicker.svelte:389-393` (search), `src/ui/PresetMenu.svelte:193-204` (name input).
- **Do:** `font-size: 16px` inside their `(pointer: coarse)` blocks (pattern: `App.svelte:389-393`).

### B4 — Keep ⚄ Surprise visible on phones
- **Why:** The hero delight collapses into the `⋯` overflow ≤720px; first-time phone users never see it. Flagged independently by UX (M5) and fun (§7.3).
- **Files:** `src/App.svelte` top bar + `src/ui/ToolsMenu.svelte:59-113`.
- **Do:** exempt Surprise from the ≤720px collapse — icon-only `⚄` button in the phone top bar; Share/Presets/MIDI/Match stay in the overflow.

### B5 — Single-slot undo + toast for the four destructive actions
- **Why:** Surprise/Randomize/Clear/MIDI-import each wipe work in one tap with no way back; "people roll 10× more when rolling is reversible." Highest-consensus UX item (ux-ui M1, fun §7.4, ideas 1.2). A snapshot beats confirmation dialogs — don't tax the roll loop.
- **Files:** new `src/state/undo.ts` + call sites `src/state/surprise.ts:56-87`, `GridEditor.svelte:425-428` (Randomize), `App.svelte:145` (Clear), `MidiMenu.svelte:50` (import). Toast: follow `PwaToast.svelte`'s pattern (or extend it).
- **Do:** before each destructive action, store `encodeState(...)` (the universal snapshot — `serialization.ts`) in a one-slot in-memory holder; show a ~6s toast "Patch replaced · **Undo**"; Undo restores via the same apply path share-links use (`applySharedState` / `engine-control.loadState`). In-memory only — no persistence.
- **Verify:** `npm run check`; Surprise → Undo returns engine+patch+melody+key exactly (deep-equal the re-encoded wire string before/after).

### B6 — Fix the first 60 seconds: demo melody + first-run nudge
- **Why:** Fun §3's trace: tap → one ping → empty sequencer, disabled PLAY, no pointer to the fun. The demo is an ascending C-major scale whose own docstring says "TEMPORARY". "The gap is not capability — it's choreography."
- **Files:** `src/sequencer/demo.ts` · `src/App.svelte:140-143`.
- **Do:** ① replace the demo with a short *characterful* in-key riff — use some eighth-note pairs and one held note, a rest or two, end on the root (16–32 steps; write it by hand, keep it tasteful). ② First-run only (no melody, no share-link, no stored presets): make the empty-state hint actively point at the two good first moves — "Load demo" and "⚄ Surprise me". Keep it one line; no modal, no tour.
- **Verify:** demo round-trips the wire format; empty-state renders both affordances. Feel-check → Phase D.

---

## Phase C — Loop, tests, infrastructure

### C1 — Postcard carries its sound: QR + Web Share + the real mark
- **Why:** Three reviewers converged: the postcard is "a picture of a sound — the recipient cannot hear it." Closing this is hours of work and turns the app's most shareable artifact into a working invitation. (utility wall #2, fun §6, originality #15)
- **Files:** `src/ui/postcard.ts` (footer, `:240-248`) · `src/ui/PostcardModal.svelte:86-118` · reuse `buildShareUrl()` from `src/state/share-url.ts:38`.
- **Do:** ① add tiny dep `qrcode-generator` (~10 KB, no transitive deps); render a QR of the share URL into the footer-right corner of the canvas (lz-string URLs are a few hundred chars — fine for QR at that size; quiet zone matters at 1200×630). ② Replace the `◐` Unicode placeholder in the footer with the bespoke `drawMark` waveform already used in the header (originality's sole "trash"-tier item). ③ In the modal, add `navigator.share({ files: [pngFile], url })` where supported (feature-detect `navigator.canShare`); keep Download/Copy as fallbacks.
- **Verify:** `npm run check` + build; decode the QR from the rendered canvas (any QR lib can read back the data URL) → it must equal `buildShareUrl()`'s output. Pixel look per theme → Phase D.

### C2 — Vitest + the four pure-layer test files + CI
- **Why:** Zero tests despite test-ready pure layers; CI builds but never type-checks, so regressions ship silently. The minimal plan below would have caught three of this review's bugs. (code-quality §5.1–2)
- **Do:**
  1. `npm i -D vitest`; add `"test": "vitest run"` to package.json scripts.
  2. `src/state/serialization.test.ts` — encode→decode round-trip; fuzz `decodeState` with malformed/hostile wires (huge `position`, 500k events, giant `dur` — pin A6's clamps).
  3. `src/notation/grid.test.ts` — `remapByDegree` invariants incl. the B/C boundary case (pins A5); `buildRowMidis` row counts per scale.
  4. `src/sequencer/midi/convert.test.ts` — melody→MIDI→melody round-trip; overlap trimming; polyphony reduction.
  5. `src/sequencer/part.test.ts` — export `expand()` for testing; loop-wrap + degenerate durations.
  6. New `.github/workflows/ci.yml`: on push + PR → `npm ci`, `npm run check`, `npm run test`, `npm run build`. Also insert check+test into `deploy.yml` before its build step.
- **Verify:** `npm run test` green locally; CI green on the PR.

### C3 — `PROVENANCE.md` for the committed binaries
- **Why:** The prebuilt `public/*.wasm`/`*.js` ship via CI unrebuilt — the one place trust isn't backed by verify. (security M-3)
- **Do:** create `dsp/PROVENANCE.md`: SHA-256 of every committed engine artifact (`sha256sum public/braids.wasm public/braids.js public/plaits.wasm public/plaits.js public/*-worklet.js`), the vendored eurorack source path/commit if recorded (check `dsp/vendor/`; if unknown, say "to be pinned at next rebuild"), emcc version (same caveat), and the rebuild commands. Note that worklet `.js` files are hand-maintained (readable), only `.wasm` + Emscripten glue are opaque.

### C4 — Self-host the webfonts (make "works offline" true)
- **Why:** Google Fonts aren't in the Workbox precache — offline, every theme falls back to system fonts despite the "Ready to work offline" toast. Bravura is already self-hosted; finish the job. (ux-ui §6.7)
- **Files:** `index.html` (font `<link>`s), `src/ui/themes/tokens.css`/`base.css` (families), `public/fonts/`, `vite.config.ts` precache globs + CSP (`fonts.googleapis.com`/`gstatic` entries can then be dropped from `connect/style/font-src`).
- **Do:** download the exact woff2 weights in use (check the families/weights referenced in tokens.css — JetBrains Mono + the sans in use), place under `public/fonts/`, declare `@font-face` locally, remove the Google links, confirm the precache picks them up (entry count rises in the build output).
- **Verify:** build output lists the fonts in precache; no `fonts.googleapis` references remain in `dist/`.

### C5 — Dead code + constant hygiene  *(independent, trivial)*
- Delete `src/audio/engines/TestToneEngine.ts` (registered nowhere) and `colToStep` (`src/notation/grid.ts:74`).
- `src/state/stores.ts:4,15` + `serialization.ts:153`: import `DEFAULT_ENGINE_ID` from `registry.ts` instead of repeating the `"braids"` literal.

### C6 — Stretch (only if A–C are green and time remains)
- `activeNotesStore` wholesale-overwrite collision between MIDI input and QWERTY (code-quality §2.7) — merge writers.
- PWA force-reload can eat an unsaved jam (code-quality §3): write the share-hash via `history.replaceState` before `location.reload()` in `pwa-register.ts:22-26`, and/or defer reload while the transport runs.
- Code-split Tone.js behind the first gesture (550 KB chunk warning).

---

## Phase D — Human gate (Andrew, not the agent)

The agent prepares; only a human can close these. Tag nothing until this list is done.

1. **Visual verification pass** — work through `reviews/2026-06-11-ux-ui.md` §6 (10 items: Sandbox post-fix legibility, Phosphor scanline moiré, iPhone PWA zoom/safe-area, small-laptop heights, 720px boundary, theme-flip feel, offline fonts, long-press feel, touch hover ghosts, postcard in all 3 themes).
2. **Real-device mobile pass** (the standing M5 item) + ear-check: engine-swap pop gone (A3), no audio-thread degradation after 10 Surprise rolls (A2).
3. **First-run feel check** — B6's demo riff and nudge; the fun review's bar: "a zero-knowledge visitor should grin inside 60 seconds."
4. **Then tag `v1.0.0`** (subsumes the never-tagged `v0.5.0-m5`), push the tag, confirm the Pages deploy is green, and update CLAUDE.md's status line.

---

## After v1.0 (not in scope for this cycle — do NOT start these)

Agreed direction from the review, in order: ① patch-lineage breadcrumb (extends B5's snapshot into a ring) — **✅ shipped** ("Recent sounds", 2026-06-20), ② swing + Euclidean/arp/mutate melody tools, ③ Parallax Daily (date-seeded surprise — refactor `surprise.ts`/`randomizeMelody` to take an injected RNG when the time comes), ④ un-defer one-loop audio export (MediaRecorder tap) — **✅ shipped** (2026-06-21; realtime MediaRecorder tap on masterGain → compressed WebM/Opus, not WAV; fixed +2 s release tail; ear-check confirmed 2026-07-07), ⑤ v1.2 marquee: port **Rings** as engine #4. Details: `reviews/2026-06-11-next-level-ideas.md`. The do-NOT-build list there is policy.

---

## Checklist (tick as you commit)

- [x] A1 subscription sweep
- [x] A2 worklet dispose
- [x] A3 deferred disconnect
- [x] A4 startEngine lock
- [x] A5 remapByDegree octave
- [x] A6 serialization clamps
- [x] A7 shim envelope clamp (+ wasm **rebuilt** 2026-06-18 with emcc 5.0.7; PROVENANCE re-pinned)
- [x] A8 brand strings + RING copy
- [x] B1 --on-signal / contrast (+ --danger)
- [x] B2 trapFocus
- [x] B3 16px inputs
- [x] B4 Surprise on phone
- [x] B5 single-slot undo
- [x] B6 demo riff + first-run nudge
- [x] C1 postcard QR + share + mark
- [x] C2 vitest + CI
- [x] C3 PROVENANCE.md
- [x] C4 self-hosted fonts
- [x] C5 dead code / constants
- [x] C6 stretch — activeNotes union + PWA-reload jam-preservation done; Tone code-split deferred (too risky to land unverified, optional per code-quality §5.5)
- [x] D1–D3 human gate — device + ear pass on 2026-06-18 (engine-swap pop gone, no audio degradation after repeated Surprise rolls, "want to show it off" grin, Korg NanoKey MIDI input plug-and-play on a phone)
- [x] D4 **tag `v1.0.0`**

Two extra fixes landed during the Phase-D pass (beyond the A–C list):
- postcard QR enlarged 100→176px + EC L (was sub-pixel / unscannable once downscaled) — `15c654a`
- mobile sequencer region collapsed into a `--hairline` colour seam through the Sequencer header (a Pixel catch, all themes) — `auto`→`max-content` rows — `d38974d`
