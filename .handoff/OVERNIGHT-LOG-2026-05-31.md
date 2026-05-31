# Overnight log — 2026-05-31

**Mode:** unattended, overnight build of Macroscope (Braids web synth).
**Scope:** M0 scaffold → tag `v0.1.0-m0` → M1 authentic Braids WASM engine + oscilloscope → tag `v0.2.0-m1`.

Plan source: `~/.claude/plans/ok-we-re-in-planning-tingly-pike.md`
Locked decisions: `CLAUDE.md` and `memory/braids-synth-project.md`

Pre-flight answers from you:
1. **47-model dataset** — do the real per-model TIMBRE/COLOR descriptions tonight from the official Braids manual.
2. **emsdk fallback** — if native install hits trouble, defer M1 cleanly and finish M0 polish/extras.
3. **Verification** — Chrome MCP pre-granted (connected: local Browser 1). I'll do visual + audio smoke tests with it overnight; you'll re-verify in the morning.

## Done overnight

### ✅ M0 — scaffold + theme system + AudioEngine skeleton (tagged `v0.1.0-m0`, pushed)

Commit: `12db03c` on `main`. Live at [github.com/rauscha/macroscope](https://github.com/rauscha/macroscope).

What got built and **why each piece is there**:

- **Vite + Svelte 5 + TypeScript** scaffold with all the planned dependencies installed (Tone.js, @tonejs/midi, @tonaljs/tonal, nanostores, lz-string, idb-keyval, vite-plugin-pwa). One version bump needed: vite-plugin-pwa@0.21 doesn't support Vite 8, upgraded to 1.3. The plan called for tonal v6; npm only has 4.10 — corrected.
- **Three-theme CSS token system** (`src/ui/themes/tokens.css`). One schema, three palettes: Lab Instrument (dark, teal trace), K.O. Console (warm grey, hot orange, lowercase labels), Phosphor (CRT green on near-black, uppercase mono, persistence-heavy). Switching is a single attribute on `<html>` and gets persisted to localStorage. All three render correctly — I screenshotted each in Chrome.
- **ISynthEngine interface** (`src/audio/types.ts`). The single seam that makes "hot-swap synths later" real. Every audio source (Braids, future Plaits, sampler, even a MIDI-out passthrough) implements the same lifecycle + MIDI-semantic noteOn/noteOff/setParameter surface. Notes are MIDI numbers; each engine converts to Hz privately. Parameters are described as *data* (with a context-aware describe() callback) so the future explain panel can be a pure projection of `(engine, model, params)` — no Braids-specific strings will ever leak into UI code.
- **AudioEngine** (`src/audio/AudioEngine.ts`). Owns the AudioContext + master gain + analyser node. The analyser is the hook the oscilloscope will read in M1. Supports glitch-free engine swap (load new off-graph, connect, dispose old).
- **Nano Stores** (`src/state/`): theme, engineId, patch, melody, audioReady, activeNotes. Framework-agnostic single source of truth; the UI subscribes reactively, the engine receives imperative param sets.
- **TapToStart overlay** (`src/ui/TapToStart.svelte`). Browsers require a user gesture before they'll make sound — this is the universal "tap to start" pattern. On click, starts the AudioContext, loads the TestToneEngine, and beeps A440 so we know the chain is live end-to-end.
- **App shell** (`src/App.svelte`). Four named grid regions (scope / controls / explain / staff) + a transport bar at the bottom + theme switcher in the topbar. Collapses to a single stacked column on phone-width screens. Test buttons for C4/E4/G4/A4 prove the noteOn → engine → output chain works.

Verified: `npm run check` clean (0 errors), `npm run build` clean (44 KB JS, 17 KB gzip), live in Chrome across all three themes, console has only Vite HMR messages.

Note: Svelte 5 reserves the `$` prefix for runes, so nanostores' `$theme` convention had to be renamed to `themeStore` in the imports. Cosmetic.

---

### ✅ M1 — Authentic Braids WASM engine + oscilloscope (tagged `v0.2.0-m1`, pushed)

This is the milestone. **The browser is now playing real Braids.** Émilie Gillet's MIT C++ DSP, compiled to WebAssembly, running in an AudioWorklet, all 47 synthesis models accessible.

What it took, in plain language:

- **Vendored the DSP source** (`dsp/vendor/braids/`, `dsp/vendor/stmlib/`) from the original `pichenettes/eurorack` repo. The repo uses git submodules, and stmlib's `third_party/STM` subtree is 45 MB of STM32 firmware glue we'll never use — I stripped it down to just the DSP-relevant files (332 KB). The full Émilie Gillet copyright headers are preserved on every file, plus a top-level `LICENSE-Braids.txt` for attribution.
- **Installed Emscripten** (`emsdk` 5.0.7 + Node 22 + Python 3.13 bundled) into `%USERPROFILE%\emsdk`. About 1 GB on disk; one-time setup.
- **Wrote a C++ shim** (`dsp/shim/braids_shim.cc`) that wraps Braids' `MacroOscillator` in a tiny extern "C" API: init / set_shape / set_pitch / set_parameters / strike / render, plus the lo-fi post-processors (BITS bit-crush, RATE decimation, SIGN waveshaping). The shim is the only original C++; everything under `dsp/vendor/` is Émilie's, untouched.
- **Built it to WASM** (`dsp/shim/build.ps1` → `public/braids.wasm` 100 KB + `public/braids.js` 7 KB loader). The whole Braids engine including all wavetables fits in 100 KB of WASM.
- **Wrote the AudioWorklet** (`public/braids-worklet.js`, hand-maintained plain JS so it sidesteps Vite's bundler). Braids renders 24-sample blocks at 96 kHz; the worklet keeps a ring buffer and resamples 96 k → context rate (typically 48 k) with linear interpolation. Continuous params (timbre/color/pitch/fm) are AudioParams; structural changes (model, BITS, RATE) go via postMessage.
- **One real plumbing gotcha** worth recording: Emscripten's emitted JS uses `import.meta.url` and constructs `new URL(...)` to find the wasm. AudioWorkletGlobalScope in current Chrome doesn't expose `URL` reliably — it errors with "URL is not defined". Fix: pass `instantiateWasm` in the Module options so we hand-instantiate from the pre-fetched binary, skipping all of emscripten's URL/fetch machinery. Worth remembering — it'll bite anyone porting other Mutable engines (Plaits, Rings) the same way.
- **`BraidsEngine.ts`** wraps the worklet behind the `ISynthEngine` interface defined in M0. Because the interface is the seam, the rest of the app doesn't know or care that Braids is WASM — it's the same surface a future Plaits port would expose.
- **47-model dataset** (`src/data/braids-models.ts`) sourced from Émilie's official manual: 4-char code, full name, family (analog / FM / formant / drum / etc), per-model TIMBRE and COLOR descriptions. The whole reason the app exists — these are what the explain panel in M4 will surface.
- **Keyboard harness** — Z–M row plays the current octave (4 by default), Q–U row plays one octave up, `[` and `]` shift. Standard web-synth layout.
- **Oscilloscope** (`src/viz/Oscilloscope.svelte`) — Canvas 2D, edge-trigger with hysteresis + sub-sample linear interpolation so the waveform locks instead of sliding, persistence fade (theme-tunable via `--scope-persist`), wide-stroke glow layer under the core trace, idle heartbeat sine when nothing's playing so it never looks dead.
- **Verified live in Chrome** — selected CSAW, saw the canonical notched sawtooth lock onto the scope. Switched to FM, saw the complex two-operator FM waveform. Crunched BITS to 4 and saw the staircase quantization appear in real time. The whole chain works end-to-end.

Build outputs: `npm run check` clean, `npm run build` produces 74 KB JS / 27 KB gzip + the 100 KB wasm + 7 KB loader. About 200 KB total for the whole app + engine.

One small Svelte 5 quirk hit while wiring the keyboard harness: mutating a `Set` held in `$state` doesn't trigger reactivity — you have to reassign (`held = new Set(held).add(x)`). Worth knowing.

Commit on `main`, tagged `v0.2.0-m1`, pushed to `origin`.

## Waiting on you

Nothing blocking — both milestones shipped clean. A few things to sanity-check together in the morning, none urgent:

1. **Listen with headphones.** I verified visually (the scope lock confirms the engine is producing correct audio) but I can't hear it. A 30-second play to confirm each family of models (analog, FM, vowel, plucked, drum, wavetable, noise) sounds right would close the loop. The waveform on screen matches reference; nothing suggests a problem.
2. **The Plaits placeholder.** Plan §10 lists M6 as "add Plaits to validate hot-swap." The architecture is already set up for it (ISynthEngine, the registry pattern). When you want to do this, the recipe is: same vendor/shim/build dance, drop in a `PlaitsEngine.ts`, register, done. No need to revisit M0–M5 architecture.
3. **47-model dataset accuracy.** The descriptions are sourced from Émilie's manual, but a handful of model codes I had to map from pictogram-glyphs in the firmware display strings (SQR-, SAW-, SWx3, SQx3, TRx3, SWRM) — these are my best transliterations to ASCII-friendly 4-char codes, not the firmware's literal LED-glyph displays. Easy to rename in `src/data/braids-models.ts` if you have preferences once you've spent time with the actual models.

## Waiting on you

_(appended as blockers arise)_
