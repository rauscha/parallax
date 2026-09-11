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

## Local modifications — three, all marked in the source

Every one carries a dated `[Parallax modification]` comment at the site. If you
re-vendor from upstream, these are the patches to re-apply, and nothing else was
touched.

### 1. `aligned_buf.h` — `#include <stddef.h>` and `<stdint.h>` (2026-09-10)

Upstream relies on `size_t` and `intptr_t` arriving through an earlier include,
which held under the 2017 Android NDK but does not under emcc 5.0.7 + libc++:
without them `fm_core.cc` and `dx7note.cc` fail with *"unknown type name
'size_t'"*.

### 2 and 3. `Env::update` and `Dx7Note::update` — live parameter changes (2026-09-11)

Both are **additive**: new methods, no existing behaviour changed, nothing
removed. They implement the `// TODO: parameter changes` that `dx7note.h` has
carried since 2012.

The engine builds a voice's entire operator state inside `Dx7Note::init` and
offers no public route in afterwards. `Env::setparam` exists and is clearly meant
for this, but `env_[]` is private to `Dx7Note`, and the `Controllers` struct that
*is* passed to `compute()` every block carries pitch bend and nothing else. So
without these two methods, every macro knob in the Parallax FM engine would only
take effect on the next note-on — a knob turned against a held note would do
nothing at all.

`Dx7Note::update(patch, midinote, velocity)` is `init()` with three differences:
it calls `Env::update` instead of `Env::init`, it does not reset
`params_[op].phase` or `gain[1]`, and it does not call `pitchenv_.set` (which
restarts the pitch envelope, and nothing driving this changes pitch-envelope
bytes).

`Env::update(rates, levels, outlevel, rate_scaling)` assigns the same four fields
`init()` does, then calls `advance(ix_)` to recompute the current stage in place
rather than jumping back to stage 0. It also **shifts `level_` by the change in
`outlevel`**, and that part is not optional — it is the difference between the
knob working and appearing to work:

- `advance()` folds `outlevel_` into the target linearly, so a re-aim on its own
  only moves the level at the current stage's rate.
- Lowering a target therefore changes nothing until the envelope happens to
  arrive there, and on a held note parked at its sustain level it never does:
  `getsample()` deliberately does not integrate at stage 3 while the key is down.
- Measured before the shift was added: raising a modulator's output level
  mid-note barely moved the spectrum, and lowering it was **bit-identical to
  doing nothing**.

The shift is a jump rather than a ramp, but not a step — `FmOpKernel` ramps an
operator's gain linearly across the 64-sample render block, so it lands as a
~1.5 ms fade. `src/data/fm-macros.test.ts` asserts there is no sample-level step
at the swap and no retrigger.

**Phase 7 will add a fourth**, already agreed: an optional per-operator tap
pointer on `FmCore::compute`, null by default. See spec §2.

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
  for exactly this reason. **Resolved at phase 2: the engine runs at 44.1 kHz** and
  the worklet resamples to the context rate, so every rate-dependent constant is
  correct against the calibration it was written for and this tree needs no
  second patch. Do not "simplify" it back to 48 kHz.
- **Output is `int32_t` and `Dx7Note::compute` *adds* to the buffer** — the
  caller must zero it first. Upstream converts to `int16` with `>> 4`, a clip at
  ±(1 << 24), then `>> 9` (`synth_unit.cc:270`), i.e. `>> 13` total with
  saturation. That is the reference for the shim's `HEAP16` contract.
- **Operator indices are reversed from the panel numbering.** msfa indexes operators 0..5 in DX7 sysex order, so
  index 0 is operator 6 and index 5 is operator 1. Read it off algorithm 1 in `fm_core.cc`: `ops[0]` carries the
  feedback flags and `ops[3]` / `ops[5]` are the carriers. Get this backwards and every flowsheet diagram is mirrored.
- **Pitch bend range is hardcoded to ±3 semitones** in `Dx7Note::compute`, read from
  `Controllers::values_[kControllerPitch]` (0x2000 = centre). Widening it means editing vendored code.
- **`Dx7Note::init` takes the *unpacked 156-byte* patch**, despite the header
  declaring the parameter as `const char patch[156]` in the definition
  (`dx7note.cc:131`) and `const char patch[128]` in the header. The header is
  wrong and C++ lets it through — the body indexes past 128. Call `UnpackPatch()`
  first.

## Verification

All eleven translation units compile and link under emcc 5.0.7
(`263db4cffa6f9fc2ec514a70abac81362ea41849`), the same toolchain that built
`braids.wasm` and `rings.wasm` — `npm run wasm:fm` produces a 16 KB
`public/fm.wasm`. `src/audio/fm-wasm.test.ts` then renders real audio through
that binary and asserts block size, pitch and level, so `npm test` catches a
broken rebuild.
