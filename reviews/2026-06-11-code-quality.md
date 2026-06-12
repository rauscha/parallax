# Parallax — Code Quality & Bug Hunt Review (2026-06-11)

Reviewer scope: full `src/` (~10k lines), `public/*-worklet.js`, `dsp/shim/*.cc`, build/CI config.
Verification: `npm run check` → **0 errors / 0 warnings** (887 files). `npm run build` → **clean** (one 550 KB chunk-size warning).
Branch reviewed: `claude/codebase-shipping-review-q5whpr` @ `945a6ac`.

---

## 1. Verdict

**Grade: B** — genuinely strong engineering in the audio core and state design, undermined by one systematic Svelte-component bug pattern, a worklet lifecycle leak, zero tests, and growing triplication across engines/worklets.

**Ship-readiness:** Shippable for its stated purpose (personal web synth) *after* the three must-fix items below. Nothing here is data-destroying or security-relevant; the worst bugs corrupt melodies or degrade audio after extended UI churn.

**Top 3 must-fix before ship:**

1. **Leaked store subscriptions in conditionally-mounted components cause double-transposed melodies** (GridEditor — confirmed, user-reachable via the prominent Staff↔Grid toggle). §2.1
2. **Disposed engines' AudioWorkletProcessors are never terminated** — every engine swap permanently leaks a live processor + WASM instance on the audio thread. §2.2
3. **Engine-swap kill is an instant cut, not the intended 40 ms fade** — audible pop when swapping engines while a note rings. §2.3

---

## 2. Confirmed bugs (severity-ordered)

### 2.1 HIGH — Leaked melodyStore subscription in GridEditor double-remaps melodies after a surface toggle

**Files:** `src/notation/GridEditor.svelte:30-68,405`, `src/notation/StaffEditor.svelte:38,54,56,500`, `src/notation/StaffToolbar.svelte:10,12`, `src/viz/Oscilloscope.svelte:20`

These components call `store.subscribe(...)` at component-init and **discard the unsubscribe function**; none is cleaned in `onDestroy`. That's harmless in always-mounted components (App, EnginePicker, …) but these four are **conditionally rendered**:

- `App.svelte:127-137` — `{#if surface === "staff"}<StaffEditor/>{:else}<GridEditor/>{/if}` and StaffToolbar; every Staff↔Grid toggle destroys/recreates them.
- `App.svelte:81-85` — Oscilloscope/Spectrum toggle.

Trace of the user-visible corruption (GridEditor):

1. Toggle Grid → Staff → Grid. The first GridEditor instance is destroyed but its `melodyStore.subscribe` handler (GridEditor.svelte:30) lives on, still updating its closed-over `$state` and — critically — still running the key-change remap branch (lines 40-52).
2. User changes key C → D (with default "In Key" mode). melodyStore notifies subscribers in subscription order. The **leaked** instance #1 sees `keyChanged`, computes `remapByDegree(events, C, …, D, …)` and writes `melodyStore.setKey("events", remapped)` (line 49).
3. That re-entrant events write notifies the **live** instance #2, whose `prevKey` is still `C` (it hasn't yet processed the key change). Its handler sees `mel.key === D ≠ prevKey` ⇒ `keyChanged` ⇒ it remaps the **already-remapped** events C→D a second time (line 41) and writes again.
4. Result: the melody is transposed twice (C→D→E). Each additional toggle adds another leaked subscriber and another potential re-remap, plus N redundant `remapByDegree` computations per key change.

Secondary effect: the leaked `isPlayingStore.subscribe` (GridEditor.svelte:405, StaffEditor.svelte:500) restarts a `requestAnimationFrame(tickPlayhead)` loop **per leaked instance** on every Play — N dead RAF loops per frame while playing. `onDestroy` (GridEditor.svelte:417) only cancels the *current* `raf`; the leaked subscription re-arms it after destruction.

**Fix:** capture and call unsubscribers in `onDestroy` (or convert to `$effect`-scoped subscriptions / nanostores' `@nanostores/svelte` `useStore`). This is a 20-line mechanical fix across 4 files; I'd sweep all 30+ `.subscribe()` call sites and make cleanup the uniform rule so the next conditionally-rendered component doesn't regress.

### 2.2 HIGH — Engine `dispose()` never terminates the AudioWorkletProcessor: every swap leaks a live DSP

**Files:** `src/audio/engines/BraidsEngine.ts:358-363`, `PlaitsEngine.ts:224-229`, `LaxsynthEngine.ts:260-265`; `public/braids-worklet.js:219`, `public/plaits-worklet.js:228`, `public/laxsynth-worklet.js:373`

All three `dispose()` implementations only `disconnect()` the node and null the references. All three processors **unconditionally `return true` from `process()`** and have no message that ends them. Per the Web Audio spec, a processor whose `process()` returns true keeps its node's *active source* flag set — it is never garbage-collected and (in Chromium) keeps being rendered every quantum even when disconnected.

Consequence: each engine swap (EnginePicker, "Surprise me", preset/share-link load, Match-panel apply) strands a full processor: for Braids/Plaits that is a WASM instance + heap rendering 96/48 kHz blocks into a ring buffer forever. After a handful of swaps (Surprise-me makes this one tap each), audio-thread CPU and memory climb monotonically until the page is reloaded — a click/dropout risk on phones.

**Fix:** add a `{type:"dispose"}` port message to each worklet that sets `this.disposed = true`; `process()` returns `false` when set (and Braids/Plaits can also `_braids_free(bufPtr)`). Engines post it in `dispose()`. ~10 lines × 3 worklets.

*(Runtime CPU measurement recommended to size the impact, but the absence of any termination path is a fact of the code.)*

### 2.3 MEDIUM — Engine swap cuts a ringing note instantly instead of the scheduled fade (audible pop)

**File:** `src/audio/AudioEngine.ts:91-100`, with `BraidsEngine.ts:199-215`

`useEngine()` runs:

```ts
if (prev) prev.allNotesOff();        // schedules a 40ms gain ramp to 0 (BraidsEngine.ts:206)
...
if (prev.output) prev.output.disconnect();   // executes microseconds later
await prev.dispose();
```

`allNotesOff()` schedules `linearRampToValueAtTime(0, t + 0.04)` — but `prev.output.disconnect()` is called synchronously right after, removing the node from the graph before the ramp plays even one quantum. A note sounding at swap time is therefore hard-cut at full amplitude → click/pop. Same applies to Plaits/Laxsynth (their releases live in the worklet, which is silenced by `clearStrikes`/`gateOff` but again disconnected immediately).

**Fix:** delay `disconnect()`/`dispose()` of the previous engine by ~60 ms (`setTimeout` is fine here; the new engine is already connected). Combine with §2.2's dispose message.

### 2.4 MEDIUM (latent) — Braids shim accepts envelope indices that read out of bounds of a 128-entry LUT

**Files:** `dsp/shim/braids_shim.cc:176-181, 232-234`; `dsp/vendor/braids/resources.h:144`; `public/braids-worklet.js:135-137`; `src/audio/engines/BraidsEngine.ts:246-251`

`braids_set_envelope_shape` clamps `a, d` to **0..127** ("we accept the full 0..127 range so a UI knob can sweep it smoothly"), but `braids_render` then computes `g_env_attack * 8` (line 233) and `Envelope::Update` indexes `lut_env_portamento_increments[a]` directly (`envelope.h:62`). The LUT has **128 entries** (`LUT_ENV_PORTAMENTO_INCREMENTS_SIZE 128`), so any value > 15 reads up to index 1016 — an out-of-bounds heap read inside the WASM sandbox producing garbage envelope rates.

Today this is masked only because `BraidsEngine.applyEnvelope` clamps to 0..15 (`c(env.attack, 15)`), while `braids-worklet.js:136` documents the parameter as "0..127 (LUT indices)" — three layers each believing a different contract. The first person to "sweep it smoothly" from a UI knob, exactly as the shim comment invites, triggers the OOB.

**Fix:** clamp to 0..15 in the shim (or drop the ×8 and clamp to 0..127 consistently), and fix the worklet comment. One of these three layers must own the range; right now none does.

### 2.5 MEDIUM — `remapByDegree` jumps an octave at the B/C boundary

**File:** `src/notation/grid.ts:111-121`

Octave is preserved by *label*, not proximity: `const octave = Math.floor(ev.midi / 12) - 1; Note.midi(\`${newNotes[deg]}${octave}\`)`. Example: key C major → Db major. B4 (midi 71, degree 7) maps to Db major's 7th degree C. `"C" + octave 4` = midi 60 — the note drops **11 semitones** instead of moving up 1. Any remap where a degree crosses the B/C letter boundary (C→Db, C→D for B; etc.) produces these octave dives. With "fold to scale" on (the default), this fires on every key change via GridEditor.svelte:41.

**Fix:** after computing the new pitch class, choose the octave that minimizes `|newMidi − ev.midi|` (i.e. try `octave−1 / octave / octave+1`, pick nearest).

### 2.6 LOW — `decodeState` doesn't clamp `durationSteps`; a hostile/corrupt share-link survives into exports

**File:** `src/state/serialization.ts:114-118`

`dur` is validated only as `>= 1` — `[0, 1e9, 60]` round-trips into the store. Playback is safe (`part.ts:38` caps at 63; `GridEditor.svelte:202` caps the cell map), but `melodyToMidi` (`sequencer/midi/convert.ts:39-44`) writes `durationTicks` uncapped, so a melody loaded from such a link exports a degenerate .mid; staff rendering also computes a huge `durationSpan` (StaffEditor.svelte:136). The module's own contract ("every field is coerced/clamped") says this should be `Math.min(dur, TOTAL_STEPS)`.

### 2.7 LOW — `activeNotesStore` is overwritten wholesale by two independent writers

**Files:** `src/state/midi-input.ts:44-46`, `src/ui/KeyboardHarness.svelte:58-59,71`

`refreshActive()` does `activeNotesStore.set(new Set(heldStack))` and KeyboardHarness does `activeNotesStore.set(held)` — each replaces the whole set. Hold a MIDI key and press a QWERTY key: the QWERTY write erases the MIDI note from the store (UI lights and `show-me.ts:162`'s "is anything sounding" check go stale; a sweep may steal a sounding voice). Cosmetic-to-minor, but it's a real shared-state collision between two features shipped at different times.

---

## 3. Suspected bugs / risks (need runtime confirmation)

- **No global lock on `startEngine()`** — `src/state/engine-control.ts:29-35`. EnginePicker guards itself (`swapping`, EnginePicker.svelte:20), but "Surprise me" (`surprise.ts:62`), preset load (`engine-control.ts:48`), and Match-panel apply (`MatchPanel.svelte:46`) are independent entry points with only local guards. Two interleaved `startEngine` calls race `audioEngine.useEngine`: the slower `init()` wins `_engine`/bindings regardless of click order, and can dispose the engine the other call just installed. Likely hard to hit by hand (WASM init ≈ 100–300 ms) but trivially fixed with a module-level in-flight promise that serializes swaps.
- **Playhead drifts after a mid-play tempo change** — `GridEditor.svelte:388-391`, `StaffEditor.svelte:493-497`. The bar position is derived as `transport.seconds % loopSec` with `loopSec` computed from the *current* BPM; `transport.seconds` accumulated under the old BPM makes the modulo wrong until the next loop restart. Tone's `transport.position`/ticks would be exact. Visual only.
- **`Tone.Part` wrapped note-off can kill an unrelated live note** — `part.ts:36-40`: a note whose duration wraps the loop boundary fires its `noteOff` at the start of every iteration, including iteration 1 when its own noteOn hasn't happened. Engines ignore it unless `activeMidi` happens to equal that pitch (`BraidsEngine.ts:184`) — i.e. the user is *holding the same MIDI note* on keyboard/controller while the sequencer loops. Rare, but it's a silent voice-steal.
- **PWA auto-reload can destroy an unsaved session** — `pwa-register.ts:22-26` + hourly `registration.update()` (line 39). A deploy landing while someone is an hour into a jam reloads the page under them; the melody lives only in memory unless they saved a preset/share URL. Deliberate decision (commit `d79e79d`), but consider gating the reload on transport-stopped + a short toast, or auto-writing the share-hash before reloading (one `history.replaceState` — `share-url.ts:49` already does it).
- **`listPresets` never checks `v`/`STORED_VERSION`** — `persistence.ts:51-63` reads rows of any version; fine at v1, a foot-gun the first time the wire shape changes (the field exists precisely for that).
- **Minor cleanup gaps** flagged by sub-review, all in always-mounted or low-stakes components: PwaToast's uncancelled toast timer (`PwaToast.svelte:14`), MidiInput's activity-blip timer (`MidiInput.svelte:18-23`), PostcardModal's object-URL revoke timer racing modal close (`PostcardModal.svelte:96-103`). Same family as §2.1; fix in the same sweep.

**Checked and found solid (worth recording):** ring-buffer under/overflow is impossible by construction (render-on-empty pull model, max occupancy = one native block — braids-worklet.js:169, plaits-worklet.js:197); 44.1 k/48 k/96 k contexts all handled by the phase-accumulator resampler (`srcRatio = nativeRate/sampleRate`, fractional ratios fine); Laxsynth flushes filter denormals (laxsynth-worklet.js:362-363) and Braids is integer DSP; stop/panic correctly drains scheduled strikes *and* future gain automation (`BraidsEngine.allNotesOff` 199-215 + worklet `clearStrikes`); stuck-note defenses exist for blur/visibility on both QWERTY (KeyboardHarness.svelte:78-98) and MIDI input (midi-input.ts:157-158); the strike-carries-its-own-pitch design (braids-worklet.js:103-115, 192-204) is a genuinely correct fix for the k-rate-param race; the share-URL decode is properly defensive (serialization.ts) apart from §2.6.

---

## 4. Architecture assessment

### Genuinely good

- **The layering holds.** `audio/`, `sequencer/`, `state/`, `data/` are pure TS with no Svelte imports (verified); `serialization.ts` and `midi/convert.ts` are deliberately DOM-free and Node-testable. The store-down-to-engine flow (`bindings.ts` — UI writes patchStore, one subscriber diffs and pushes to the engine, engine never writes back) is the right shape and documented as such.
- **`ISynthEngine` is real, not aspirational.** Three engines with materially different note models (Braids JS-gated VCA, Plaits internal LPG, Laxsynth worklet ADSR) sit behind the same surface; `part.ts`, `midi-input.ts`, `KeyboardHarness`, and `show-me.ts` are all engine-blind. The registry adapter (`registry.ts:36-47`) generalizing Braids' hand-authored catalogue into `EngineModel` without rewriting it was the correct call.
- **Audio-thread message passing is above-average for hand-rolled.** Time-stamped gate queues drained at quantum boundaries, strikes carrying their own pitch to defeat the param/strike ordering race, RAF-coalesced knob writes to limit cross-thread traffic (Knob.svelte:72-90) — these are the marks of someone who actually chased the clicks.
- **Defensive decode + graceful degradation** on every external input (share URLs, presets, MIDI files, unknown engine ids fall back to default at *both* decode and apply layers).
- **Comments explain *why*, frequently citing the bug that motivated the code.** This is the most maintainable part of the codebase.

### Weak

- **The `subscribe`-into-`$state` idiom is the codebase's one systemic Svelte 5 defect.** 30+ call sites hand-mirror nanostores into `$state` and almost all discard the unsubscriber; §2.1 is the resulting bug. Runes are otherwise used well (`$derived.by` for the cell map and preview events is clean), but the store bridge needs one blessed helper.
- **Engine/worklet triplication is already drifting.** BraidsEngine vs PlaitsEngine share ~150 near-identical lines (WASM fetch + timeout, ready handshake, noteOn/Off/pitch-bend, dispose); the three worklets triplicate the gate queue, ring buffer, and resampler. Drift evidence: the envelope-range contract mismatch (§2.4), `RB_BLOCKS` 64 vs 128 with stale "≈16 ms" comments (the buffer never holds more than one native block in the pull design), Braids' `attack`/`release` descriptors claim `apply: "audioparam"` but are actually stored-only (`BraidsEngine.ts:294-297, 347-350`). The worklets also sit outside `src/` so `svelte-check` never sees them. Extract: a `wasm-engine-base.ts` for the two WASM engines, and a shared `gate-queue.js`/`resampler.js` snippet (even copy-by-build-step) for the worklets.
- **CLAUDE.md's "no Braids-specific strings outside data/ and engines/braids/" is violated in spirit in three user-facing places:** `ParamPanel.svelte:43` (`lofi: "Lo-fi (the Braids crunch)"` — a generic group-label map hardcoding one engine's brand), `TapToStart.svelte:47` ("A web playground for the sounds of Braids"), and the PWA manifest description (vite.config.ts). The latter two also brush the trademark rule (branding vs. factual attribution). Internal comments referencing Braids are fine; these three strings should be neutral or attribution-phrased.
- **`engine-control.ts` orchestrates swaps but doesn't own concurrency** (§3 race) — it's the natural place for a serialization lock and currently has none.
- **Dead code:** `TestToneEngine.ts` is registered nowhere and imported by nothing (the prompt's "+ a test tone" is vestigial); `grid.ts:74 colToStep` is unused. Delete or wire up.

---

## 5. Maintainability debt

1. **Zero tests, no runner configured.** The codebase was explicitly structured for testability (pure-TS layers, "safe to unit-test under Node" comments in serialization.ts/convert.ts) and then never tested. Minimal high-yield plan (~1 day with vitest):
   - `serialization.test.ts` — encode→decode round-trip property test; fuzz `decodeState` with malformed wires; would have caught §2.6.
   - `grid.test.ts` — `remapByDegree` degree/octave invariants (C→Db on B4 — **fails today**, §2.5); `buildRowMidis` row counts per scale.
   - `convert.test.ts` — melody→MIDI→melody round-trip; overlap trimming; polyphony reduction.
   - `part.test.ts` — `expand()` loop-wrap and degenerate-duration cases (export it for testing).
   - One worklet logic test by extracting the gate-queue insert/drain into a shared pure module (kills duplication *and* gains coverage).
2. **CI runs `npm run build` only** (`.github/workflows/deploy.yml`) — `npm run check` is not in CI and there is no PR workflow at all; type regressions ship silently. Add `npm run check` (and the future `vitest run`) before build.
3. **Hand-written worklets are entirely outside static analysis** — not in `tsconfig.app.json` includes, not Svelte-checked, not built. At minimum add `// @ts-check` + JSDoc, or check them with a second tsconfig (`checkJs` against `public/*.js` with webaudio lib types).
4. **Engine/worklet duplication** — see §4; do the extraction before adding a fourth engine, not after.
5. **Bundle:** single 550 KB JS chunk (Tone.js dominates). Code-split Tone behind the first user gesture (it's only needed at `installSequencer`) if initial-load matters; otherwise accept and raise the warning limit deliberately.
6. **`stores.ts` default-engine string `"braids"` duplicates `registry.DEFAULT_ENGINE_ID`** (stores.ts:4,15; serialization.ts:153) — three literals that must agree; import the constant.
7. WASM build scripts are PowerShell-only (`build.ps1`) despite CLAUDE.md mentioning `build.sh` — fine while binaries are committed, but the rebuild path is single-platform.

---

## 6. Prioritized pre-ship punch list

| # | Item | Ref | Effort |
|---|------|-----|--------|
| 1 | Sweep all component `.subscribe()` sites; add unsubscribe-on-destroy (fixes double-remap, leaked RAF loops) | §2.1 | ~1–2 h |
| 2 | Worklet `dispose` message → `process()` returns false; engines post it; free WASM buffers | §2.2 | ~1 h |
| 3 | Defer previous-engine disconnect/dispose ~60 ms in `useEngine` | §2.3 | 15 min |
| 4 | Serialize `startEngine` with an in-flight lock in `engine-control.ts` | §3 | 30 min |
| 5 | Clamp envelope indices in `braids_shim.cc` (and fix the worklet comment) — rebuild + recommit wasm | §2.4 | 30 min + rebuild |
| 6 | Nearest-octave fix in `remapByDegree` | §2.5 | 30 min |
| 7 | Clamp `durationSteps` in `decodeEvent` | §2.6 | 5 min |
| 8 | Neutralize the three user-facing "Braids" brand strings (ParamPanel group label, TapToStart subtitle, manifest description) | §4 | 15 min |
| 9 | Add `npm run check` to CI; add vitest + the 4 pure-layer test files | §5.1–2 | ~1 day |
| 10 | Delete `TestToneEngine.ts` / `colToStep` or wire them up | §4 | 10 min |
| 11 | (Post-ship) extract shared WASM-engine base + worklet gate-queue/resampler modules | §4 | ~½ day |
| 12 | (Post-ship) reconsider PWA force-reload UX (write share-hash before reload, or defer while transport runs) | §3 | 1 h |

Items 1–8 are the actual ship gate; everything else is debt management on a healthy foundation.
