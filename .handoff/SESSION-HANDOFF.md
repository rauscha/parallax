# Session hand-off — 2026-05-31 (machine: laptop)

## STATE (read this first)
- **Repo:** [github.com/rauscha/parallax](https://github.com/rauscha/parallax) (renamed from `macroscope` this session — `git remote` already points at the new URL).
- **Branch:** `main`, clean, in sync with `origin/main` (commit `73f5bac`).
- **Tags shipped tonight:** `v0.1.0-m0` (scaffold + theme system + AudioEngine skeleton) and `v0.2.0-m1` (authentic Braids WASM engine + oscilloscope).
- **State:** the app loads, plays real Braids in the browser through an Emscripten-compiled WASM AudioWorklet, the scope locks onto the waveform, and three themes are switchable at runtime. All 47 Braids models accessible from the model picker. Ready to pick up at M2 (the proper synth control surface — auto-generated knobs from the parameter schema).

## Done this session
- M0 scaffold: Vite + Svelte 5 + TS, three-theme CSS token system, ISynthEngine interface, AudioEngine + analyser, Nano Stores, tap-to-start, four-region grid.
- M1 engine: vendored `pichenettes/eurorack` (trimmed stmlib from 45 MB → 332 KB), Emscripten build (`dsp/shim/`) producing `public/braids.{wasm,js}`, AudioWorklet with ring buffer + 96 k → ctx-rate resampler, BraidsEngine implementing ISynthEngine, 47-model dataset with manual-sourced TIMBRE/COLOR descriptions, computer-keyboard harness, edge-triggered oscilloscope.
- **Renamed Macroscope → Parallax** everywhere (codebase, GitHub repo, memory, docs).
- **Colorblind-safe UI pass:** status indicators now use shape (●/○) + text-case + weight, not color alone. Saved as a durable memory (`feedback-colorblind`) so it sticks across sessions.
- **Scope idle fix:** the animated "heartbeat" sine was reading as a drifting waveform / glitch — replaced with a static flat reference line (what a real scope shows with no input).

## Next up
1. **Audio sanity-listen** (you, on the desktop, with headphones). Cycle through one model per family — CSAW, FM, VOWL, PLUK, KICK, WTBL, NOIS — confirm each sounds right. I verified visually but couldn't hear; the scope traces match reference, but nothing replaces ears. See `.handoff/PENDING-DECISIONS.md` for detail.
2. **Visually verify the three fixes** I made after M1 shipped — I had committed but the dev server wasn't up long enough for me to screenshot the post-rename UI. Tap-to-start should now show "Parallax", the transport bar should show `audio ● READY` (greyscale-readable), each theme chip should have a `●`/`○` marker, and the scope should be a flat line when no notes are held.
3. **Begin M2** (synth control surface) — auto-generated knobs from `ISynthEngine.getParameterSchema()`, searchable family-grouped 4-char model picker, spectrum view. The current BasicParamPanel.svelte is a stub for M1 testing; M2 replaces it.

## Watch out for
- **Emscripten is installed at `%USERPROFILE%\emsdk`** (~1 GB). It's NOT in the repo. If you pick up on the desktop, you'll need to install it there too before `npm run wasm` works. Recipe: `git clone https://github.com/emscripten-core/emsdk %USERPROFILE%\emsdk && cd %USERPROFILE%\emsdk && .\emsdk install latest && .\emsdk activate latest`.
- **`public/braids.{wasm,js}` are gitignored** — they're build artifacts. After cloning fresh on the desktop, run `npm install && npm run wasm` before `npm run dev`, or there'll be no audio.
- **The AudioWorklet URL gotcha** (now in memory as [[braids-key-architecture]]): emscripten's emitted JS uses `import.meta.url` + `new URL(...)`, which AudioWorkletGlobalScope can't handle reliably. We pass `instantiateWasm` to bypass it. Same fix will apply for Plaits / Rings / any future Mutable port.
- **Svelte 5 reserves `$` for runes.** Nanostores' convention of `$store` names had to be dropped — we use `themeStore`, `audioReadyStore`, etc. Also, mutating a `Set` held in `$state` doesn't trigger reactivity; reassign with `held = new Set(held).add(x)`.
- **None of the morning items in `.handoff/PENDING-DECISIONS.md` are blocking** — feel free to start M2 without addressing them.
