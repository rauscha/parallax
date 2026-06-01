# Parallax — project instructions for Claude Code

Personal web synth: real Mutable Instruments **Braids** macro-oscillator in the browser, with a live oscilloscope, a per-model "explain the controls" panel, and a clickable 4-bar/4/4 staff. Engine sits behind a hot-swappable interface; everything routes as MIDI note numbers.

## Required reading on resume
1. `~/.claude/projects/C--GDrive-Braids-tester/memory/braids-synth-project.md` — locked decisions, defaults.
2. `~/.claude/plans/ok-we-re-in-planning-tingly-pike.md` — full research + roadmap. Source of truth for architecture.

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
- **All three themes** (Lab Instrument = default; Sandbox; Phosphor) built from CSS custom-property tokens, runtime-switchable.
- **Single responsive PWA.** No native wrapper.
- **v1 scope** = MIDI file import/export + shareable URL links. **Deferred:** Web MIDI input, audio recording, insert FX.
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

## What's deferred (don't quietly add)
- Polyphony, Web MIDI input, audio recording/export, insert FX, Plaits/second engine.

## Memory pointers (read on resume)
- `braids-synth-project` — project memory entry (decisions, plan path).
- `braids-key-architecture` — to be written when M1 lands (engine interface shape).
