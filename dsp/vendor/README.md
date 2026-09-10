# Vendored DSP

Third-party DSP source compiled to WASM via Emscripten. Two upstreams, two
licences — keep them straight.

## Mutable Instruments (MIT) — Émilie Gillet's open-source firmware

- `braids/` — the Braids firmware (eurorack/braids)
- `plaits/` — the Plaits firmware DSP core (eurorack/plaits)
- `rings/` — the Rings firmware DSP core (eurorack/rings)
- `stmlib/` — DSP utilities used by Braids (trimmed: only `dsp/`, `utils/`,
  `algorithms/`, `fft/`, `midi/`, `system/`, `ui/`, `stmlib.h`, `LICENSE`)

The `stm_audio_bootloader`, `third_party/STM`, `linker_scripts`, `programming`,
`test`, and `tools` subtrees are STM32 firmware-only and not needed for the
WASM build, so they were stripped during vendoring.

License and attribution: see `../../LICENSE-Braids.txt`. All original copyright
headers are preserved in every file.

Do **not** rename "Braids" or "Mutable Instruments" in any vendored file — keep
the original code as-is. Our own code (shim, build scripts, JS wrappers) lives
in `dsp/shim/` and `src/`, and that is where any project-specific naming or
modifications live.

## msfa (Apache-2.0) — Raph Levien's music-synthesizer-for-android

- `msfa/` — the six-operator FM voice core behind engine #5, vendored from
  `google/music-synthesizer-for-android` at commit `f67d41d3`.

Licence text in `../../LICENSE-msfa.txt`, attribution in `../../NOTICE`. It has
**one** deliberate local modification (two standard includes in
`aligned_buf.h`); that and everything confirmed at vendoring — render block
`N = 64`, the sample-rate wiring, and the `Env` rate gap — are documented in
`msfa/README.md`. Read it before touching the shim.

Same rule as above: do not rename or reformat vendored files. Our code lives in
`dsp/shim/` and `src/`.
