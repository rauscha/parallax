# Parallax — project instructions for Claude Code

Personal web synth: real Mutable Instruments **Braids** macro-oscillator in the browser, with a live oscilloscope, a per-model "explain the controls" panel, and a clickable 4-bar/4/4 staff. Engine sits behind a hot-swappable interface; everything routes as MIDI note numbers.

## Required reading on resume
1. `docs/roadmap-v1.0.md` — **the active work queue**: the v1.0 ship-gate punch list from the 2026-06-11 shipping review, written for autonomous execution.
2. `reviews/2026-06-11-executive-summary.md` — the seven-agent shipping review verdict (security, code, UX, utility, fun, originality, ideas — full reports alongside it).
3. `~/.claude/projects/C--GDrive-Braids-tester/memory/braids-synth-project.md` — locked decisions, defaults.
4. `~/.claude/plans/ok-we-re-in-planning-tingly-pike.md` — full research + roadmap. Source of truth for architecture.

## Product identity (from the 2026-06-12 review — frame all work this way)
Parallax exists because the M8's Macro synth couldn't be learned from the hardware alone — the product is **the self-explaining instrument loop**: per-model prose that rewrites itself, live readouts, knob↔card linking, the "Show me" sweep, and a firmware-verified model corpus that doubles as the search index and the match ranker. The WASM ports are table stakes (prior art exists); the explain loop is the original, defensible thing. Protect its honesty and depth in every trade-off.

## Stack (locked)
- **Svelte 5 + TypeScript + Vite**, PWA via `vite-plugin-pwa`.
- **Tone.js** for Transport/Part only (look-ahead scheduler in a Worker). **Custom AudioWorklet** for the actual DSP.
- **Braids DSP** = Émilie Gillet's MIT C++ (`pichenettes/eurorack` → `braids/` + `stmlib/`) compiled with **Emscripten** to WASM, run in the worklet via a ring buffer (Braids renders 24-sample blocks @ 96 kHz, we resample to context rate).
- **State:** Nano Stores (`$patch`, `$melody`, `$engineId`). Single source of truth, framework-agnostic.
- **Notation:** custom SVG (Bravura SMuFL font). **MIDI I/O:** `@tonejs/midi`. **Scales:** `@tonaljs/tonal`. **Share URLs:** `lz-string` → `location.hash`. **Preset library:** `idb-keyval`.
- **Hosting:** **GitHub Pages — FINAL** (chosen 2026-05-31, superseding Cloudflare Pages). Live at **andrewrausch.com/parallax/** — a project page under `rauscha.github.io`, which carries the custom domain, so it lands at the sub-path automatically. Auto-deploys via `.github/workflows/deploy.yml` on push to `main`; the prebuilt `public/braids.wasm` + `braids.js` are committed (un-gitignored) so CI ships them with no Emscripten toolchain. Single-threaded WASM-in-worklet → **no SharedArrayBuffer / COOP-COEP** needed, so a plain static host is fine. Why not Cloudflare: the domain already lived on GitHub Pages, and the app is purely static — the only Cloudflare-only feature we'd want is a `_headers` CSP, which we do instead via a `<meta http-equiv>` tag. Vite `base` is `/parallax/` for `build`, `/` for dev (so the Tailscale test URL stays at root); runtime asset loads use `import.meta.env.BASE_URL`.
- **Package manager:** npm. **Node:** LTS (whatever is on PATH).

## Locked decisions (do not re-litigate)
- **Authentic Braids first** — real WASM engine before any UI flesh. No placeholder oscillator.
- **All four themes** (Lab Instrument [SNES-inspired]; Sandbox; Phosphor; Soundboard [walnut/brass]) built from CSS custom-property tokens. **Theme follows the engine** (chosen 2026-06-09, superseding the manual runtime switcher): braids → phosphor, plaits → sandbox, laxsynth → lab, rings → soundboard (ThemeId `"rings"`; "Soundboard" is the skin name). There is no manual theme control; selecting an engine switches the skin. Braids boots first, so phosphor is the landing theme.
- **Single responsive PWA.** No native wrapper.
- **v1 scope** = MIDI file import/export + shareable URL links — shipped, plus more (presets, PWA, postcard, Web MIDI input, Surprise, Match tool). **`v1.0.0` shipped 2026-06-18** — the ship-gate punch list in `docs/roadmap-v1.0.md` (Phases A–D) is complete; the tag subsumes the never-cut `v0.5.0-m5`. **Deferred:** audio recording/export (one-loop export is the agreed first un-deferral after v1.0), insert FX.
- **Snap-to-scale on by default.** Monophonic. Treble clef. 120 BPM default.
- **Product name = "Parallax"** (chosen 2026-05-31, replacing the working name "Macroscope"). The repo is `rauscha/parallax`.

## Trademark / licensing rule (important)
- The code is MIT. Keep Émilie Gillet's copyright + MIT notice intact in every ported file. See `LICENSE-Braids.txt` (added in M1).
- **Never brand the product "Mutable Instruments" or "Braids".** Factual attribution only: *"based on the open-source Mutable Instruments Braids firmware (MIT)."*

## Folder layout (target)
```
dsp/
  vendor/eurorack/   # pichenettes/eurorack, vendored (MIT)
  shim/              # braids_shim.cc + build.ps1 / build.sh (Emscripten)
  build/             # emitted braids.wasm + braids.js (gitignored)
public/
  braids.wasm        # copied from dsp/build
src/
  audio/             # AudioEngine, worklets/, engines/{braids,…}, types.ts, schema.ts, registry.ts
  sequencer/         # transport.ts, part.ts, melody.ts, scales.ts, midi/
  state/             # store.ts, bindings.ts, persistence.ts, serialization.ts, share-url.ts
  notation/          # StaffEditor.svelte, render.ts, interaction.ts
  viz/               # Oscilloscope.svelte, Spectrum.svelte, analyser.ts
  ui/                # App.svelte, controls/, explain/, transport/, themes/
  data/              # braids-models.ts (47 models), braids-params.ts
```
`audio/`, `sequencer/`, `state/`, `data/` are pure TS (no Svelte) → testable, portable.

## Commands
- **Dev:** `npm run dev` (Vite dev server)
- **Build:** `npm run build` then `npm run preview`
- **Type-check:** `npm run check` (svelte-check)
- **WASM build:** `npm run wasm` (wraps the Emscripten build script in `dsp/shim/`)
- **Emscripten env:** `& "$env:USERPROFILE\emsdk\emsdk_env.ps1"` before first `emcc` call in a session

## Working style for this project
- Commit after each milestone (M0, M1, …). Tag with `v0.X.0-mN`. Push to `origin/main`.
- The plan file (linked above) is the spec. If you'd change a locked decision, surface it for the user instead of just doing it.
- For UI/visual changes, run the dev server and confirm visually before claiming done. If you can't open a browser, say so.
- Keep the engine interface (`ISynthEngine`) pure — no Braids-specific strings outside `data/` and `engines/braids/`.
- **Solo dev — no PR ceremony.** Andrew works alone on `main`; PRs are not part of the workflow. Don't open PRs as a deliverable, don't ask for review, don't babysit CI or schedule PR check-ins. *(Exception: Claude Code web/remote sessions are required by their harness to open a draft PR for any branch they push — treat that as plumbing to merge or ignore, not as a review request.)*

## What's deferred (don't quietly add)
- Polyphony, audio recording/export, insert FX. *(Web MIDI input shipped 2026-06-11; Plaits + Laxsynth engines shipped 2026-06-07; Rings engine shipped 2026-08-09.)* First un-deferral after v1.0: one-loop audio export (see roadmap "After v1.0").

## Engine #5 — FM (in progress — phases 0–5 done 2026-09-10)
- **Spec:** `docs/superpowers/specs/2026-09-10-fm-engine-and-flowsheet.md` — 6-op FM ported from **msfa**
  (`google/music-synthesizer-for-android`, Apache-2.0), plus per-node **scope taps** and the **flowsheet teacher** view.
  One port, two features. Locked: msfa is the engine; taps read the **real** engine (no TS model); the teacher is
  **designed for a computer screen** (its own route — the app stays a responsive PWA).
- **All design decisions closed 2026-09-10:** the 5th theme is designed *for* the diagram surface; the model axis is
  **voices** (algorithm shown as a property); the corpus is **our own, built by ear — never from ROM patch data**
  (msfa's Apache-2.0 covers the engine, not Yamaha's factory voices). Nothing in the plan is blocked.
- **Phase 0 (tap spike) passed** — `docs/superpowers/specs/2026-09-10-tap-spike-results.md`. 8 taps cost
  +0.055 pp of the audio-thread budget; the SharedArrayBuffer fallback is **not** built. Firefox/Safari pass still
  outstanding (needed before the flowsheet view ships, not before the port).
- **Phase 1 (vendoring) done** — msfa DSP under `dsp/vendor/msfa/` at upstream `f67d41d3`, Apache-2.0
  (`LICENSE-msfa.txt`, `NOTICE`). Read `dsp/vendor/msfa/README.md` before writing the shim: render block `N = 64`,
  one local patch to `aligned_buf.h`, and **`Env` is sample-rate-blind** — which is why the engine runs at **44.1 kHz**
  (spec §1 amended 2026-09-10) and the worklet resamples, exactly as Braids does from 96 kHz.
- **Phase 2 (shim + build) done** — `dsp/shim/fm_shim.cc`, `dsp/shim/build-fm.ps1`, `npm run wasm:fm`,
  `public/fm.{js,wasm}` committed. Pitch is exact with no trim; `HEAP16` stands (−2.5 dBFS worst case) but a normal
  voice sits ~17 dB down, so phase 3 owes it make-up gain in the engine's `GainNode`. `src/audio/fm-wasm.test.ts`
  renders through the committed binary and guards block size, pitch and level — the only engine with that guard.
  The boot patch is **ours, authored by hand**; msfa's own `synth_unit.cc` carries a factory voice and is not
  vendored.
- **Phases 3–5 done (overnight 2026-09-10 → 11)** — `.handoff/OVERNIGHT-LOG-2026-09-10.md`. The engine plays from
  the staff (`public/fm-worklet.js`, `src/audio/engines/FmEngine.ts`, registry entry), has its four macro knobs,
  and carries **14 hand-authored voices** across six families with verified Explain prose. Make-up gain is **×2.0**
  in the engine's `GainNode`, measured against Rings rather than against full scale. Three things to know before
  touching this engine:
  **(a)** an FM "model" is *data* — 156 patch bytes in `src/data/fm-voices.ts`, not a firmware enum;
  **(b)** `src/data/fm-algorithms.ts` is **generated** from the vendored algorithm table, not hand-typed;
  **(c)** silencing an operator in the middle of a chain makes the carrier render as a bare sine, silently —
  read the header of `fm-voices.ts` before authoring a patch.
- **Macro knobs reach the note already sounding** (decided + built 2026-09-11). That needed `Env::update` and
  `Dx7Note::update` — additive local modifications to the vendored engine, patches 2 and 3 of three, all documented
  in `dsp/vendor/msfa/README.md`. **There are now three local patches to msfa, not one**; phase 7's tap pointer
  will be the fourth.
- **The 5th theme is named `graph`** (Andrew, 2026-09-11) — a drafting surface, flatter and higher-contrast than
  the four instrument-panel skins. Next build step is **phase 6**: `ThemeId` entry, tokens, `ENGINE_THEME` /
  `THEME_COLOR`, and a `contrast.test.ts` row. Needs an eye pass before it ships.
- **Origin notes (reasoning trail, superseded by the spec):** `docs/ideas/2026-09-10-diy-synth-engine-survey.md`,
  `docs/ideas/2026-09-10-fm-flowsheet-teacher.md`.

## Memory pointers (read on resume)
- `braids-synth-project` — project memory entry (decisions, plan path).
- `braids-key-architecture` — to be written when M1 lands (engine interface shape).
