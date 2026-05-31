# Vendored Mutable Instruments DSP

This directory contains the DSP code from Émilie Gillet's open-source firmware,
used to produce authentic Braids sound in the browser via Emscripten.

- `braids/` — the Braids firmware (eurorack/braids)
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
