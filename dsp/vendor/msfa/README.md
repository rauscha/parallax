# Vendored msfa DSP — 6-operator FM (engine #5)

The FM voice core from Raph Levien's **music-synthesizer-for-android**, vendored
for the Parallax FM engine and the flowsheet teacher.

- **Upstream:** <https://github.com/google/music-synthesizer-for-android>
- **Commit pinned at vendoring:** `f67d41d313b7dc85f6fb99e79e515cc9d208cfff`
  (2017-09-12, repository HEAD as of 2026-09-10 — upstream is dormant)
- **Licence:** Apache-2.0. Full text in `../../../LICENSE-msfa.txt`; attribution
  in `../../../NOTICE`. Every vendored file keeps its original Google copyright
  header — do not strip them.
- **Source path upstream:** `app/src/main/jni/`

## What was taken, and why only this

Only the self-contained DSP translation units. No JNI, no OpenSL glue, no
`synth_unit` host, no NEON assembly, no test harnesses, no `Sawtooth` /
`ResoFilter` / `Fir` / `RingBuffer` (those belong to msfa's other synth modules,
not the FM voice).

| File | Role |
|---|---|
| `dx7note.{cc,h}`     | one 6-op voice — patch → operator params → render |
| `fm_core.{cc,h}`     | the 32-algorithm routing table and the per-block mixer |
| `fm_op_kernel.{cc,h}` | one operator (phase accumulator + sine lookup + gain ramp) |
| `env.{cc,h}`         | the DX-style 4-stage operator envelope |
| `pitchenv.{cc,h}`    | the 4-stage pitch envelope |
| `lfo.{cc,h}`         | the voice LFO |
| `patch.{cc,h}`       | `UnpackPatch()` — 128-byte packed → 156-byte unpacked |
| `freqlut.{cc,h}`     | log-frequency → phase-increment table |
| `sin.{cc,h}`         | sine lookup |
| `exp2.{cc,h}`        | `Exp2` and `Tanh` tables |
| `log2.{cc,h}`        | `Log2` table |
| `synth.h`            | `LG_N` / `N`, `min`/`max`, memory-barrier macro |
| `aligned_buf.h`      | alignment wrapper used by `FmCore` |
| `controllers.h`      | the MIDI controller value struct `Dx7Note::compute` reads |

**`log2.{cc,h}` is currently unreferenced** by this set — upstream only uses
`Log2` from its `main.cc` test harness. It is vendored because the FM engine
spec names it and it costs nothing; drop it if it is still unused when the port
finishes.

## Local modifications — exactly one

`aligned_buf.h` gained `#include <stddef.h>` and `#include <stdint.h>`.

Upstream relies on `size_t` and `intptr_t` arriving through an earlier include,
which held under the 2017 Android NDK but does not under emcc 5.0.7 + libc++:
without them `fm_core.cc` and `dx7note.cc` fail with *"unknown type name
'size_t'"*. The change is marked in the file with a dated `[Parallax
modification]` comment.

Nothing else was touched. If you re-vendor from upstream, this is the only patch
to re-apply.

## Facts confirmed at vendoring (read from the source, not assumed)

- **Render block `N` = 64** (`synth.h`: `LG_N 6`, `N = 1 << LG_N`). Compile-time.
  The worklet ring buffer is written in units of 64, the way `rings-worklet.js`
  uses `RINGS_BLOCK = 24`.
- **Sample-rate wiring is `Freqlut::init(sr)`, `Lfo::init(sr)`,
  `PitchEnv::init(sr)`**, plus rate-free `Exp2::init()`, `Tanh::init()`,
  `Sin::init()`. Upstream's own order is in `synth_unit.cc:49`.
- **`Env` has no sample-rate input at all** in this revision — its increments are
  per-block-of-`N` constants calibrated against msfa's own 44.1 kHz reference
  (`main.cc:274`). Running the engine at 48 kHz therefore makes every operator
  envelope about **8.8 % fast**. Later Dexed-lineage forks added an `Env::init_sr`
  for exactly this reason. Decide the fix at phase 2 (rate-scale the increments,
  or run the engine at 44.1 kHz and let the existing resampler handle it) — do
  not let it pass silently as "close enough".
- **Output is `int32_t` and `Dx7Note::compute` *adds* to the buffer** — the
  caller must zero it first. Upstream converts to `int16` with `>> 4`, a clip at
  ±(1 << 24), then `>> 9` (`synth_unit.cc:270`), i.e. `>> 13` total with
  saturation. That is the reference for the shim's `HEAP16` contract.
- **`Dx7Note::init` takes the *unpacked 156-byte* patch**, despite the header
  declaring the parameter as `const char patch[156]` in the definition
  (`dx7note.cc:131`) and `const char patch[128]` in the header. The header is
  wrong and C++ lets it through — the body indexes past 128. Call `UnpackPatch()`
  first.

## Verification

All eleven translation units pass `emcc -fsyntax-only -O2 -I.` under emcc 5.0.7
(`263db4cffa6f9fc2ec514a70abac81362ea41849`), the same toolchain that built
`braids.wasm` and `rings.wasm`. Linking is phase 2's gate, not this one.
