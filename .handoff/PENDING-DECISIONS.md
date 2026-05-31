# Waiting on you

Updated 2026-05-31. None of these block M2.

## 1. Audio sanity-listen (the only thing the overnight run couldn't do)

I verified Braids visually — the oscilloscope locks on the canonical CSAW notched sawtooth, FM shows the right complex waveform, 4-bit crunch produces the expected staircase quantization. But I couldn't hear it. Spend 60 seconds with headphones cycling through one model per family:

- **CSAW** (analog) — should be the warm/notched sawtooth character
- **FM** — DX7-style bell/brass
- **VOWL** (formant) — sung-vowel quality
- **PLUK** (physical) — plucked-string attack
- **KICK** (drum) — 808 boom (try a low MIDI note)
- **WTBL** (wavetable) — depends on which wavetable COLOR selects
- **NOIS** (noise) — should be filtered noise; turn TIMBRE up for resonance pitch

If anything's off, the most likely culprits are pitch units (1/128-semitone q7 mapping) or the 96k → ctx-rate resampler.

## 2. Verify the post-M1 fixes I committed

Did these in the last 20 min of the session but didn't get to visually re-confirm:

- Brand says **Parallax** everywhere (tap-to-start headline, top-bar brand).
- Transport bar shows **`audio ● READY`** or **`audio ○ idle`** — shape carries the meaning, readable in greyscale.
- Theme switcher chips each have a **`●`** (active) or **`○`** (inactive) marker.
- Oscilloscope shows a **flat reference line** when no note is held (the previous "drifting heartbeat" is gone).

If any of these look off, files are: `src/App.svelte`, `src/ui/ThemeSwitcher.svelte`, `src/viz/Oscilloscope.svelte`, `src/ui/TapToStart.svelte`.

## 3. 4-char model code naming — your call

A few firmware codes are pictogram-glyphs that don't transliterate cleanly to ASCII. My choices in `src/data/braids-models.ts`:

- SQR- (Square + Sub), SAW- (Sawtooth + Sub)
- SYN-Q (Square Sync), SYN-W (Sawtooth Sync)
- SWx3 (Three Saws), SQx3 (Three Squares), TRx3 (Three Triangles)
- SWRM (Saw Swarm)

Rename freely — purely cosmetic.

## 4. M2 design decisions (when you start)

Plan §6.1 says custom rotary knobs with vertical-drag interaction (pro-audio standard). I'll use that unless you push back. Model picker per plan §6.1: 4-char-code chip + prev/next + searchable family-grouped list.

## 5. Reminders for picking up on the desktop

- **Install Emscripten there too** before `npm run wasm`: `git clone https://github.com/emscripten-core/emsdk %USERPROFILE%\emsdk && cd %USERPROFILE%\emsdk && .\emsdk install latest && .\emsdk activate latest`
- `public/braids.{wasm,js}` are gitignored build outputs. After cloning fresh: `npm install && npm run wasm && npm run dev`.
