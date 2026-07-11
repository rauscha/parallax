# Rings Engine #4 Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Port Mutable Instruments Rings (Émilie Gillet's MIT resonator firmware) to WASM as Parallax's 4th engine, with the full model set (including the "Disastrous Peace" easter egg), a complete Explain corpus, and the new warm-dark "Soundboard" theme.

**Architecture:** Same scaffold as the Braids/Plaits ports — an `extern "C"` shim around the firmware DSP compiled with Emscripten, an AudioWorklet that resamples 48 kHz → context rate through a ring buffer, a TypeScript `ISynthEngine` class, and one registry entry. Every cross-cutting system (pickers, serialization, share-URL, Surprise, undo, lineage) is engine-agnostic and inherits Rings automatically. The one genuinely new piece is the 4th theme (`[data-theme="rings"]`).

**Tech Stack:** C++14 via Emscripten (emsdk at `$env:USERPROFILE\emsdk`), plain-JS AudioWorklet, TypeScript (Svelte 5 app, but all new TS is framework-free), Vitest, PowerShell build scripts.

**Spec:** `docs/superpowers/specs/2026-07-11-rings-engine-design.md` (approved 2026-07-11).

## Global Constraints

- **MIT headers intact:** every vendored file keeps Émilie Gillet's copyright header, byte-for-byte. Never edit a file under `dsp/vendor/`.
- **No rebranding:** engine display name "Rings" is factual attribution. Never brand the product "Mutable Instruments" or "Rings".
- **Engine purity:** no Rings-specific strings outside `src/data/rings-models.ts`, `src/audio/engines/RingsEngine.ts`, `dsp/shim/`, `public/rings*`, and the registry/theme entries this plan specifies.
- **Locked decisions:** monophonic (`set_polyphony(1)`); no external audio input; `noteOff` = let the resonator ring out (no-op); theme-follows-engine.
- **Colorblind accessibility (the user is colorblind):** never color-alone meaning; no meaningful translucent color; every text token ≥ 4.5:1 (WCAG AA) on `--bg`.
- **Every task:** `npm test` and `npm run check` must pass before commit. After each clean commit: `git push origin main` (standing user rule — routine pushes to the existing branch need no prompt).
- **Worklets are hand-maintained plain JS in `public/`** — outside the Vite bundle. Runtime asset URLs use `import.meta.env.BASE_URL`.
- **Windows:** build scripts are PowerShell (`.ps1`). File edits/commits can use any shell.
- **Rings ground truth:** whenever this plan says "verify against source", the vendored files under `dsp/vendor/rings/` are the authority. If a verify step's expected output does not match, adjust the dependent constant/order to match the source (each such step says exactly what to adjust) — do not force the expected value.

---

### Task 1: Vendor the Rings DSP core + attribution

**Files:**
- Create: `dsp/vendor/rings/dsp/*.{cc,h}`, `dsp/vendor/rings/dsp/fx/*.h`, `dsp/vendor/rings/resources.{cc,h}` (copied verbatim from upstream)
- Modify: `LICENSE-Braids.txt`, `dsp/vendor/README.md`, `dsp/PROVENANCE.md`

**Interfaces:**
- Consumes: nothing (first task).
- Produces: the `rings::Part`, `rings::StringSynthPart`, `rings::Patch`, `rings::PerformanceState` C++ types plus `rings/resources.h` LUTs, at include paths `rings/dsp/*.h` rooted at `dsp/vendor/` — Task 2's shim includes these. Also produces the **pinned upstream commit hash** recorded in `dsp/PROVENANCE.md`.

- [ ] **Step 1: Clone upstream and record the commit pin**

```powershell
git clone --depth 1 https://github.com/pichenettes/eurorack "$env:TEMP\eurorack-vendor"
git -C "$env:TEMP\eurorack-vendor" rev-parse HEAD
```

**RECORD the printed hash** — it goes into `dsp/PROVENANCE.md` in Step 5. (This is the first vendoring that captures the pin; braids/plaits predate it.)

- [ ] **Step 2: Copy the Rings DSP core (only)**

```powershell
New-Item -ItemType Directory -Force "dsp\vendor\rings\dsp\fx" | Out-Null
Copy-Item "$env:TEMP\eurorack-vendor\rings\dsp\*.cc" "dsp\vendor\rings\dsp\"
Copy-Item "$env:TEMP\eurorack-vendor\rings\dsp\*.h"  "dsp\vendor\rings\dsp\"
Copy-Item "$env:TEMP\eurorack-vendor\rings\dsp\fx\*.h" "dsp\vendor\rings\dsp\fx\"
Copy-Item "$env:TEMP\eurorack-vendor\rings\resources.cc","$env:TEMP\eurorack-vendor\rings\resources.h" "dsp\vendor\rings\"
```

Do NOT copy `rings/drivers/`, `rings/hardware_design/`, `rings/test/`, `rings/ui.*`, `rings/cv_scaler.*`, `rings/settings.*`, `rings/rings.cc`, or the bootloader — DSP core only, matching the Plaits convention.

- [ ] **Step 3: Verify every include resolves inside the vendored tree**

```bash
grep -rhoP '#include "\K[^"]+' dsp/vendor/rings | sort -u
```

Expected: every line starts with `rings/` or `stmlib/`. For each `rings/...` path, the file must exist under `dsp/vendor/` (e.g. `rings/dsp/part.h` → `dsp/vendor/rings/dsp/part.h`). For each `stmlib/...` path, check `dsp/vendor/stmlib/` — the vendored subset already contains `dsp/dsp.h, dsp/units.h, dsp/filter.h, dsp/delay_line.h, dsp/cosine_oscillator.h, dsp/parameter_interpolator.h, dsp/limiter.h, utils/random.h, utils/buffer_allocator.h, utils/dsp.h`, so misses are unlikely. **If a `rings/...` include is missing, copy that one file from the clone (still on disk) into the same relative path.** Only after this passes:

```powershell
Remove-Item -Recurse -Force "$env:TEMP\eurorack-vendor"
```

- [ ] **Step 4: Update LICENSE-Braids.txt** (3 edits, matching the Plaits precedent)

1. First paragraph: change `` `dsp/vendor/braids/`, `dsp/vendor/plaits/`, and `dsp/vendor/stmlib/` `` → `` `dsp/vendor/braids/`, `dsp/vendor/plaits/`, `dsp/vendor/rings/`, and `dsp/vendor/stmlib/` ``.
2. In the "Specifically:" list, after the `plaits/` bullet add:

```
  - rings/  — the Rings resonator firmware: the DSP core only
                  (eurorack/rings/dsp/ + resources.{cc,h}, MIT). None of the
                  hardware drivers, UI, settings, or bootloader are vendored —
                  only the synthesis code the WASM shim drives.
```

3. Trademark sentence: change `"Mutable Instruments", "Braids", and "Plaits" are trademarks` → `"Mutable Instruments", "Braids", "Plaits", and "Rings" are trademarks`. Also update the `stmlib/` bullet's "used by Braids and Plaits" → "used by Braids, Plaits and Rings".

- [ ] **Step 5: Update dsp/vendor/README.md and dsp/PROVENANCE.md**

`dsp/vendor/README.md`: after the `braids/` bullet add:

```
- `plaits/` — the Plaits firmware DSP core (eurorack/plaits)
- `rings/` — the Rings firmware DSP core (eurorack/rings)
```

(The `plaits/` bullet is currently missing from this README — add both.)

`dsp/PROVENANCE.md`, "Source" section: replace the "*not recorded at the original vendoring…*" bullet with:

```
  - **eurorack upstream commit:** `<HASH-FROM-STEP-1>` — pinned at the
    2026-07-11 Rings vendoring. The braids/plaits vendoring predates this pin
    and its upstream HEAD was never captured; treat this hash as authoritative
    for `rings/` only.
```

- [ ] **Step 6: Verify headers intact, then commit**

```bash
head -12 dsp/vendor/rings/dsp/part.cc
```

Expected: Émilie Gillet's copyright + MIT header, untouched.

```bash
npm test && npm run check
git add dsp/vendor/rings LICENSE-Braids.txt dsp/vendor/README.md dsp/PROVENANCE.md
git commit -m "feat(rings): vendor Rings DSP core (MIT, upstream pinned)"
git push origin main
```

---

### Task 2: WASM shim + build script + committed artifacts

**Files:**
- Create: `dsp/shim/rings_shim.cc`, `dsp/shim/build-rings.ps1`, `public/rings.js`, `public/rings.wasm` (build outputs, committed)
- Modify: `package.json` (one script line)

**Interfaces:**
- Consumes: `rings::Part` / `rings::StringSynthPart` / `Patch` / `PerformanceState` from Task 1.
- Produces: WASM exports `_rings_init(uint32 seed)`, `_rings_set_model(int 0..11)`, `_rings_set_note(float midi)`, `_rings_set_structure(float)`, `_rings_set_brightness(float)`, `_rings_set_damping(float)`, `_rings_set_position(float)`, `_rings_strum()`, `_rings_alloc(int)→int16*`, `_rings_free(ptr)`, `_rings_render(ptr, n)` (n multiple of 24; mono int16 @48 kHz), loaded via ES6 factory `createRingsModule`. **Model map: 0–5 = `rings::Part` resonator models in enum order; 6–11 = `StringSynthPart` with `FxType` (model−6).** Task 3's worklet calls these.

- [ ] **Step 1: Verify the firmware constants and enums this shim depends on**

```bash
grep -n "kMaxBlockSize\|kNumChords\|kSampleRate" dsp/vendor/rings/dsp/dsp.h
grep -n -A 10 "enum ResonatorModel" dsp/vendor/rings/dsp/part.h
grep -n -A 9 "enum FxType" dsp/vendor/rings/dsp/string_synth_part.h
grep -n "SoftLimit" dsp/vendor/stmlib/dsp/dsp.h
grep -n "internal_" dsp/vendor/rings/dsp/part.cc dsp/vendor/rings/dsp/string_synth_part.cc
```

Expected: `kMaxBlockSize = 24`, `kNumChords = 11`, `kSampleRate = 48000`; `ResonatorModel` in order MODAL, SYMPATHETIC_STRING, STRING, FM_VOICE, SYMPATHETIC_STRING_QUANTIZED, STRING_AND_REVERB (then `_LAST`); `FxType` in order FORMANT, CHORUS, REVERB, FORMANT_2, ENSEMBLE, REVERB_2 (then `_LAST`); `SoftLimit` defined in stmlib. **If any differs:** use the source's actual names/order/values in the shim below (and note the deviation in the commit message — Task 5's catalogue order must match whatever is real). If `SoftLimit` lives in a different stmlib header, include that header instead.

- [ ] **Step 2: Write `dsp/shim/rings_shim.cc`**

```cpp
// Parallax — extern "C" shim around rings::Part / rings::StringSynthPart.
//
// Compiled by Emscripten into a WASM module that the AudioWorklet loads.
// The shim itself is original code (MIT). It wraps Émilie Gillet's MIT Rings
// firmware unchanged. See ../../LICENSE-Braids.txt for the vendored attribution.
//
// --- How we drive Rings -----------------------------------------------------
// Rings is a RESONATOR, not an oscillator: you strike it and it rings. On the
// hardware, patching nothing into IN makes the module synthesize its own
// excitation (performance_state.internal_exciter + strum). We use exactly that
// mode as our note model:
//   - noteOn  → set the resonator note, then STRUM once (consumed by the next
//               rendered block)
//   - noteOff → nothing: the voice rings out its natural physical decay.
//               DAMPING is the release. This is the instrument's identity.
// Models 0..5 render through rings::Part (the 3 normal + 3 "hidden" resonator
// models); models 6..11 render through rings::StringSynthPart — the
// "Disastrous Peace" easter-egg string synth — with (model - 6) selecting its
// FX type. Both parts stay initialised; the active model picks which one
// renders. A part left inactive freezes its tail and resumes stale on
// re-select — same as the hardware's mode toggle, acceptable.
// Internal polyphony is pinned to 1 (Parallax is monophonic by locked decision).
//
// --- Block size is load-bearing ---------------------------------------------
// The firmware advances envelopes/LFOs once per Process() call assuming
// kMaxBlockSize (24) samples — always render exactly 24 per call. Native rate
// is 48 kHz; the worklet resamples to the context rate.

#include <cstdint>
#include <cstring>
#include <emscripten.h>

#include "stmlib/utils/random.h"
#include "stmlib/dsp/dsp.h"
#include "rings/dsp/part.h"
#include "rings/dsp/string_synth_part.h"
#include "rings/dsp/patch.h"
#include "rings/dsp/performance_state.h"

using namespace rings;

namespace {

Part             g_part;
StringSynthPart  g_string_synth;
Patch            g_patch;
PerformanceState g_performance;

// 64 KB reverb/echo RAM shared by both parts — matches the firmware's
// `uint16_t reverb_buffer[32768]` (rings.cc).
uint16_t g_reverb_buffer[32768];

float g_in[kMaxBlockSize];    // excitation input — stays silent (internal exciter)
float g_out[kMaxBlockSize];   // ODD output (odd partials / main)
float g_aux[kMaxBlockSize];   // EVEN output (even partials / fx aux)

int  g_model = 0;             // 0..5 = Part models, 6..11 = StringSynth FX 0..5
bool g_strum_pending = false;
bool g_inited = false;

const int kNumPartModels  = 6;    // == RESONATOR_MODEL_LAST
const int kNumTotalModels = 12;   // + 6 StringSynth FX variants

inline int16_t ToInt16(float x) {
  x = stmlib::SoftLimit(x);
  if (x > 1.0f) x = 1.0f;
  if (x < -1.0f) x = -1.0f;
  return static_cast<int16_t>(x * 32767.0f);
}

}  // namespace

extern "C" {

EMSCRIPTEN_KEEPALIVE
void rings_init(uint32_t seed) {
  stmlib::Random::Seed(seed ? seed : 0x12345678u);

  memset(g_reverb_buffer, 0, sizeof(g_reverb_buffer));
  memset(g_in, 0, sizeof(g_in));

  g_part.Init(g_reverb_buffer);
  g_string_synth.Init(g_reverb_buffer);
  g_part.set_polyphony(1);
  g_string_synth.set_polyphony(1);
  g_part.set_model(RESONATOR_MODEL_MODAL);
  g_string_synth.set_fx(FX_FORMANT);

  memset(&g_patch, 0, sizeof(g_patch));
  g_patch.structure  = 0.4f;
  g_patch.brightness = 0.6f;
  g_patch.damping    = 0.55f;
  g_patch.position   = 0.3f;

  memset(&g_performance, 0, sizeof(g_performance));
  g_performance.note  = 48.0f;            // semitones, MIDI-aligned (69 = A440)
  g_performance.tonic = 0.0f;
  g_performance.fm    = 0.0f;
  g_performance.internal_exciter = true;  // nothing patched into IN → self-excite
  g_performance.internal_strum   = false; // WE decide when to strum (noteOn)
  g_performance.internal_note    = false; // WE supply the note
  g_performance.chord = 0;
  g_performance.strum = false;

  g_model = 0;
  g_strum_pending = false;
  g_inited = true;
}

EMSCRIPTEN_KEEPALIVE
void rings_set_model(int m) {
  if (m < 0) m = 0;
  if (m > kNumTotalModels - 1) m = kNumTotalModels - 1;
  g_model = m;
  if (m < kNumPartModels) {
    g_part.set_model(static_cast<ResonatorModel>(m));
  } else {
    g_string_synth.set_fx(static_cast<FxType>(m - kNumPartModels));
  }
}

EMSCRIPTEN_KEEPALIVE void rings_set_note(float n)       { g_performance.note = n; }

EMSCRIPTEN_KEEPALIVE void rings_set_structure(float v)  {
  g_patch.structure = v;
  // The quantized-chords model + the string synth read a discrete chord index
  // instead of raw structure; mirror the firmware cv_scaler's mapping.
  g_performance.chord = static_cast<int32_t>(v * (kNumChords - 1) + 0.5f);
}

EMSCRIPTEN_KEEPALIVE void rings_set_brightness(float v) { g_patch.brightness = v; }
EMSCRIPTEN_KEEPALIVE void rings_set_damping(float v)    { g_patch.damping = v; }
EMSCRIPTEN_KEEPALIVE void rings_set_position(float v)   { g_patch.position = v; }

// One-shot strike: consumed by (and cleared after) the next rendered block.
EMSCRIPTEN_KEEPALIVE void rings_strum(void)             { g_strum_pending = true; }

// Heap buffer JS reads directly via Module.HEAP16.
EMSCRIPTEN_KEEPALIVE
int16_t* rings_alloc(int n_samples) {
  return static_cast<int16_t*>(malloc(sizeof(int16_t) * n_samples));
}

EMSCRIPTEN_KEEPALIVE
void rings_free(int16_t* ptr) { free(ptr); }

// Render n samples (n MUST be a multiple of kMaxBlockSize = 24) of mono int16
// PCM at 48 kHz. One Process() call per block keeps firmware timing correct.
// ODD + EVEN are summed to mono: on hardware, patching only ODD mixes both
// partial groups onto it — the sum IS the module's mono voice.
EMSCRIPTEN_KEEPALIVE
void rings_render(int16_t* out, int n_samples) {
  if (!g_inited || n_samples <= 0) return;
  const int block = static_cast<int>(kMaxBlockSize);
  const int n_blocks = n_samples / block;
  for (int b = 0; b < n_blocks; ++b) {
    g_performance.strum = g_strum_pending;
    g_strum_pending = false;
    if (g_model < kNumPartModels) {
      g_part.Process(g_performance, g_patch, g_in, g_out, g_aux, block);
    } else {
      g_string_synth.Process(g_performance, g_patch, g_in, g_out, g_aux, block);
    }
    int16_t* dst = out + b * block;
    for (int i = 0; i < block; ++i) {
      dst[i] = ToInt16((g_out[i] + g_aux[i]) * 0.5f);
    }
  }
}

}  // extern "C"
```

Compile-fix rule: if the compiler reports a mismatched member/signature (e.g. `PerformanceState` lacking a field, `Process` args differing), open the vendored header, match the shim to the real API, and keep the note/strum/model semantics described in the header comment. Do not edit vendored files.

- [ ] **Step 3: Write `dsp/shim/build-rings.ps1`** — copy `dsp/shim/build-plaits.ps1` verbatim, then apply exactly these changes:

- Header comment: `(Plaits)` → `(Rings)`, `plaits_shim.cc` → `rings_shim.cc`, `public/plaits.{js,wasm}` → `public/rings.{js,wasm}`.
- `$plaits_sources = Get-ChildItem -Path (Join-Path $VENDOR_DIR "plaits") ...` → rename the variable to `$rings_sources` and the path to `"rings"` (update both uses).
- `(Join-Path $SHIM_DIR "plaits_shim.cc")` → `"rings_shim.cc"`.
- `EXPORT_NAME=createPlaitsModule` → `EXPORT_NAME=createRingsModule`.
- `EXPORTED_FUNCTIONS=[...]` → `EXPORTED_FUNCTIONS=['_rings_init','_rings_set_model','_rings_set_note','_rings_set_structure','_rings_set_brightness','_rings_set_damping','_rings_set_position','_rings_strum','_rings_alloc','_rings_free','_rings_render','_malloc','_free']`.
- `$out_js`/`$out_wasm` filenames `plaits.js`/`plaits.wasm` → `rings.js`/`rings.wasm` (and the two `Copy-Item` lines + the final `Write-Host` line).
- Keep everything else identical (`-DTEST`, 16 MB `INITIAL_MEMORY`, stack, stmlib sources list, includes).

- [ ] **Step 4: Add the npm script** — in `package.json` scripts, after `"wasm:plaits"` add:

```json
"wasm:rings": "powershell -ExecutionPolicy Bypass -File ./dsp/shim/build-rings.ps1"
```

- [ ] **Step 5: Build and verify the artifacts**

```powershell
npm run wasm:rings
```

Expected: `Built: public/rings.wasm = <N> bytes, public/rings.js = <M> bytes` with no emcc errors (wasm plausibly 100–400 KB). Then:

```bash
grep -c "_rings_init" public/rings.js && grep -c "createRingsModule" public/rings.js
```

Expected: both counts ≥ 1.

- [ ] **Step 6: Commit** (artifacts are intentionally tracked — CI has no Emscripten)

```bash
npm test && npm run check
git add dsp/shim/rings_shim.cc dsp/shim/build-rings.ps1 package.json public/rings.js public/rings.wasm
git commit -m "feat(rings): WASM shim (Part + StringSynthPart) + build script + committed artifacts"
git push origin main
```

---

### Task 3: The Rings AudioWorklet

**Files:**
- Create: `public/rings-worklet.js`

**Interfaces:**
- Consumes: Task 2's WASM exports via `import createRingsModule from "./rings.js"`.
- Produces: `registerProcessor("rings", …)` with k-rate params `note` (default 48), `structure` (0.4), `brightness` (0.6), `damping` (0.55), `position` (0.3); port messages IN `{type:"setModel",value}`, `{type:"gateOn",time}`, `{type:"gateOff"}` (accepted, no-op), `{type:"clearStrikes"}`, `{type:"dispose"}`; messages OUT `{type:"ready"}` / `{type:"error",message}`; constructed with `processorOptions:{wasmBinary, seed}`. Task 5's engine speaks exactly this protocol.

- [ ] **Step 1: Write `public/rings-worklet.js`**

```js
// rings-worklet.js — AudioWorkletProcessor that runs the Rings WASM engine.
//
// Loaded by the main thread via:
//     await ctx.audioWorklet.addModule('/rings-worklet.js');
// then new AudioWorkletNode(ctx, 'rings', { processorOptions: { wasmBinary } }).
//
// Hand-maintained plain JS (stays out of the Vite bundle). The TypeScript
// engine wrapper lives in src/audio/engines/RingsEngine.ts. Mirrors
// plaits-worklet.js; differences are noted inline.
//
// Rings specifics:
//  - Native 48 kHz, rendered in fixed 24-sample blocks (kMaxBlockSize).
//  - Rings is a resonator: a note is a STRUM (one-shot strike), not a held
//    gate. There is no note-off — DAMPING is the release. gateOff is accepted
//    for protocol parity with the other engines and does nothing.
//  - No retrig-gap machinery (Plaits needs a low→high trigger edge; a strum
//    is already a discrete event the shim consumes once per block).

import createRingsModule from "./rings.js";

const RINGS_RATE = 48000;
const RINGS_BLOCK = 24;
const RB_BLOCKS = 64;             // ring-buffer capacity (stays near-empty in practice)

const clamp01 = (x) => (x < 0 ? 0 : x > 1 ? 1 : x);

class RingsProcessor extends AudioWorkletProcessor {
  static get parameterDescriptors() {
    return [
      { name: "note",       defaultValue: 48,   minValue: 0, maxValue: 127, automationRate: "k-rate" },
      { name: "structure",  defaultValue: 0.4,  minValue: 0, maxValue: 1,   automationRate: "k-rate" },
      { name: "brightness", defaultValue: 0.6,  minValue: 0, maxValue: 1,   automationRate: "k-rate" },
      { name: "damping",    defaultValue: 0.55, minValue: 0, maxValue: 1,   automationRate: "k-rate" },
      { name: "position",   defaultValue: 0.3,  minValue: 0, maxValue: 1,   automationRate: "k-rate" },
    ];
  }

  constructor(options) {
    super();
    this.ready = false;
    this.disposed = false;
    this.module = null;
    this.bufPtr = 0;
    this.bufView = null;

    this.rb = new Float32Array(RINGS_BLOCK * RB_BLOCKS);
    this.rbRead = 0;
    this.rbWrite = 0;
    this.rbCount = 0;

    this.srcRatio = RINGS_RATE / sampleRate;
    this.srcPhase = 0;
    this.srcPrev = 0;
    this.srcCurr = 0;

    this.pendingModel = 0;

    // Scheduled strums { t }, sorted ascending by time.
    this.pendingStrums = [];

    this.port.onmessage = (e) => this.onMessage(e.data);

    const wasmBinary = options.processorOptions?.wasmBinary;
    const seed = options.processorOptions?.seed ?? 0x5eed12;
    this.init(wasmBinary, seed).catch((err) => {
      this.port.postMessage({ type: "error", message: String(err?.message || err) });
    });
  }

  async init(wasmBinary, seed) {
    this.module = await createRingsModule({
      wasmBinary,
      locateFile: (p) => p,
      instantiateWasm: (imports, callback) => {
        WebAssembly.instantiate(wasmBinary, imports)
          .then((result) => callback(result.instance, result.module))
          .catch((err) => {
            this.port.postMessage({ type: "error", message: "WASM instantiate failed: " + (err?.message || err) });
          });
        return {};
      },
    });
    this.bufPtr = this.module._rings_alloc(RINGS_BLOCK);
    if (!this.bufPtr) throw new Error("rings_alloc returned NULL");
    this.bufView = new Int16Array(this.module.HEAP16.buffer, this.bufPtr, RINGS_BLOCK);
    this.module._rings_init(seed >>> 0);
    this.module._rings_set_model(this.pendingModel);
    this.ready = true;
    this.port.postMessage({ type: "ready" });
  }

  onMessage(msg) {
    const m = this.module;
    switch (msg.type) {
      case "setModel":
        this.pendingModel = msg.value | 0;
        if (this.ready) m._rings_set_model(this.pendingModel);
        break;
      case "gateOn": {
        const when = typeof msg.time === "number" ? msg.time : currentTime;
        this.queueStrum(when);
        break;
      }
      case "gateOff":
        // Resonator rings out on its own; DAMPING is the release. No-op.
        break;
      case "clearStrikes":
        // Panic: drop scheduled strums. The current ring-out is left to decay —
        // there is no gate to close on a resonator.
        this.pendingStrums.length = 0;
        break;
      case "dispose":
        // Engine swap: stop rendering and free the WASM heap buffer (see the
        // plaits-worklet note — without this the processor leaks per swap).
        this.disposed = true;
        if (this.module && this.bufPtr) {
          try { this.module._rings_free(this.bufPtr); } catch {}
          this.bufPtr = 0;
          this.bufView = null;
        }
        break;
    }
  }

  queueStrum(t) {
    const q = this.pendingStrums;
    let i = q.length;
    while (i > 0 && q[i - 1].t > t) i--;
    q.splice(i, 0, { t });
  }

  // Fire every strum whose time has arrived. The shim latches one pending
  // strum per rendered block, so back-to-back strums in one quantum coalesce —
  // same behaviour as strumming the hardware faster than a block.
  applyDueStrums() {
    const q = this.pendingStrums;
    while (q.length && q[0].t <= currentTime) {
      q.shift();
      this.module._rings_strum();
    }
  }

  // Render one 24-sample block at 48 kHz into the ring buffer.
  renderBlock() {
    const m = this.module;
    m._rings_render(this.bufPtr, RINGS_BLOCK);
    const rb = this.rb, cap = rb.length;
    let w = this.rbWrite;
    for (let i = 0; i < RINGS_BLOCK; ++i) {
      rb[w] = this.bufView[i] / 32768;
      w = (w + 1) % cap;
    }
    this.rbWrite = w;
    this.rbCount += RINGS_BLOCK;
  }

  nextSourceSample() {
    if (this.rbCount === 0) this.renderBlock();
    const s = this.rb[this.rbRead];
    this.rbRead = (this.rbRead + 1) % this.rb.length;
    this.rbCount -= 1;
    return s;
  }

  process(_inputs, outputs, parameters) {
    if (this.disposed) return false;
    const output = outputs[0][0];
    if (!output) return true;
    if (!this.ready) { output.fill(0); return true; }

    // Fire due strums at the quantum boundary, then push the k-rate params
    // into the WASM globals (read by renderBlock() during this quantum).
    this.applyDueStrums();
    const m = this.module;
    m._rings_set_note(parameters.note[0]);
    m._rings_set_structure(clamp01(parameters.structure[0]));
    m._rings_set_brightness(clamp01(parameters.brightness[0]));
    m._rings_set_damping(clamp01(parameters.damping[0]));
    m._rings_set_position(clamp01(parameters.position[0]));

    const ratio = this.srcRatio;
    for (let i = 0; i < output.length; ++i) {
      output[i] = this.srcPrev + (this.srcCurr - this.srcPrev) * this.srcPhase;
      this.srcPhase += ratio;
      while (this.srcPhase >= 1) {
        this.srcPhase -= 1;
        this.srcPrev = this.srcCurr;
        this.srcCurr = this.nextSourceSample();
      }
    }
    return true;
  }
}

registerProcessor("rings", RingsProcessor);
```

- [ ] **Step 2: Sanity-check and commit** (runtime verification happens in Task 6 — a worklet can't run in Node)

```bash
node --check public/rings-worklet.js || node -e "new Function(require('fs').readFileSync('public/rings-worklet.js','utf8'))" 2>/dev/null; echo "syntax note: ES-module import at top means node --check may reject; a clean esbuild/tsc parse is equivalent"
npx tsc --noEmit --allowJs --checkJs false --module esnext --target es2020 public/rings-worklet.js
```

Expected: the `npx tsc` line exits 0 (parses as a valid ES module).

```bash
npm test && npm run check
git add public/rings-worklet.js
git commit -m "feat(rings): AudioWorklet processor — 48k ring buffer + strum scheduling"
git push origin main
```

---

### Task 4: RingsEngine (ISynthEngine implementation)

**Files:**
- Create: `src/audio/engines/RingsEngine.ts`

**Interfaces:**
- Consumes: Task 3's worklet protocol; `ISynthEngine`, `EngineManifest`, `ParameterDescriptor`, `NoteOnOpts`, `NoteOffOpts`, `MidiNote` from `src/audio/types.ts`.
- Produces: `export class RingsEngine implements ISynthEngine` with `manifest.id === "rings"` and `getParameterSchema()` ids exactly: `model` (discrete 0–11), `structure`, `brightness`, `damping`, `position`, `gain` (all continuous 0–1). Task 5's catalogue test and Task 6's registry import this class.

- [ ] **Step 1: Write `src/audio/engines/RingsEngine.ts`**

```ts
import type {
  ISynthEngine, EngineManifest, ParameterDescriptor,
  NoteOnOpts, NoteOffOpts, MidiNote,
} from "../types";

/**
 * RingsEngine — wraps the Rings WASM AudioWorklet behind ISynthEngine.
 *
 * Rings is a RESONATOR: a note is a one-shot STRUM into the physical model,
 * which then rings out on its own — there is no held gate and no release
 * phase to trigger. noteOn sets the pitch param and posts a strum; noteOff is
 * accepted (and tracked) but intentionally does nothing: DAMPING is the
 * release. Amplitude lives inside the model, so the GainNode here is only the
 * master level knob — exactly like PlaitsEngine.
 *
 * Pitch is MIDI-direct: performance_state.note = MIDI number (69 → 440 Hz;
 * verified in-app in the integration pass — if it lands a constant interval
 * off, add the offset in the worklet's note push, not here).
 */
export class RingsEngine implements ISynthEngine {
  manifest: EngineManifest = {
    id: "rings",
    name: "Rings",
    description: "Authentic Mutable Instruments Rings — Émilie Gillet's MIT resonator firmware compiled to WASM.",
    capabilities: {
      polyphony: 1,
      producesAudio: true,
      supportsPitchBend: true,
      supportsGlide: false,
      modelEnumerable: true,
    },
  };

  private ctx: AudioContext | null = null;
  private node: AudioWorkletNode | null = null;
  private gainNode: GainNode | null = null;
  private activeMidi: number | null = null;
  private pitchBend = 0;             // semitones — persists across notes
  private currentModelIndex = 0;     // 0 = modal resonator

  // Mirror of param values for getParameter().
  private params: Record<string, number> = {
    note: 60, structure: 0.4, brightness: 0.6, damping: 0.55, position: 0.3,
    gain: 0.6,
  };

  get output(): AudioNode | null { return this.gainNode; }

  async init(ctx: AudioContext): Promise<void> {
    this.ctx = ctx;

    await ctx.audioWorklet.addModule(import.meta.env.BASE_URL + "rings-worklet.js");

    // Fetch the wasm on the main thread; hand it to the worklet via
    // processorOptions (sidesteps URL resolution quirks inside the worklet).
    const fetchCtl = new AbortController();
    const fetchTimer = setTimeout(() => fetchCtl.abort(), 6000);
    let wasmBinary: ArrayBuffer;
    const wasmUrl = import.meta.env.BASE_URL + "rings.wasm";
    try {
      const wasmResp = await fetch(wasmUrl, { signal: fetchCtl.signal });
      if (!wasmResp.ok) throw new Error(`Failed to load rings.wasm: HTTP ${wasmResp.status}`);
      wasmBinary = await wasmResp.arrayBuffer();
    } catch (e) {
      if ((e as Error).name === "AbortError") throw new Error(`Timed out fetching ${wasmUrl} after 6s. Is the file deployed and reachable?`);
      throw e;
    } finally {
      clearTimeout(fetchTimer);
    }

    this.node = new AudioWorkletNode(ctx, "rings", {
      numberOfInputs: 0,
      numberOfOutputs: 1,
      outputChannelCount: [1],
      processorOptions: { wasmBinary, seed: 0x5eed12 },
    });

    // Wait for the worklet's "ready" (WASM up) or surface an init error/timeout.
    await new Promise<void>((resolve, reject) => {
      const port = this.node!.port;
      let settled = false;
      const finish = (fn: () => void) => {
        if (settled) return;
        settled = true;
        port.removeEventListener("message", onMsg);
        clearTimeout(readyTimer);
        fn();
      };
      const onMsg = (e: MessageEvent) => {
        if (e.data?.type === "ready") finish(() => resolve());
        else if (e.data?.type === "error") finish(() => reject(new Error(e.data.message)));
      };
      port.addEventListener("message", onMsg);
      port.start();
      const readyTimer = setTimeout(() => {
        finish(() => reject(new Error("Rings WASM did not signal ready within 10s — the audio worklet failed to initialise silently. Reload to retry.")));
      }, 10_000);
    });

    // Master output level (the resonator shapes each note's envelope itself).
    this.gainNode = ctx.createGain();
    this.gainNode.gain.value = this.params.gain;
    this.node.connect(this.gainNode);

    // Seed the worklet with current param values.
    this.setModelIndex(this.currentModelIndex);
    this.pushParam("structure", this.params.structure);
    this.pushParam("brightness", this.params.brightness);
    this.pushParam("damping", this.params.damping);
    this.pushParam("position", this.params.position);
  }

  noteOn(midi: MidiNote, opts: NoteOnOpts = {}): void {
    if (!this.ctx || !this.node) return;
    const t = opts.time ?? this.ctx.currentTime;
    this.activeMidi = midi;
    this.params.note = midi;

    // Pitch via the k-rate `note` param (re-apply any held pitch-bend on top).
    const noteParam = this.node.parameters.get("note");
    if (noteParam) noteParam.setValueAtTime(midi + this.pitchBend, t);

    // Strike: a one-shot strum scheduled at the note's audio time. Velocity is
    // intentionally unused — the hardware's internal exciter has no velocity
    // input, and inventing one would break the "authentic firmware" promise.
    this.node.port.postMessage({ type: "gateOn", time: t });
  }

  noteOff(midi: MidiNote, opts: NoteOffOpts = {}): void {
    if (!this.node) return;
    if (this.activeMidi !== null && this.activeMidi !== midi) return;
    this.activeMidi = null;
    // Resonator identity: the note rings out its physical decay (DAMPING).
    // Sent anyway for protocol parity; the worklet no-ops it.
    this.node.port.postMessage({ type: "gateOff", time: opts.time });
  }

  allNotesOff(): void {
    if (!this.node) return;
    // Drop queued strikes. The current ring-out decays naturally — a resonator
    // has no gate to slam shut, and cutting the tail would sound broken.
    this.node.port.postMessage({ type: "clearStrikes" });
    if (this.ctx) this.node.parameters.get("note")?.cancelScheduledValues(this.ctx.currentTime);
    this.activeMidi = null;
  }

  setPitchBend(semitones: number): void {
    if (!this.node || !this.ctx) return;
    this.pitchBend = semitones;
    const noteParam = this.node.parameters.get("note");
    if (noteParam) noteParam.setTargetAtTime(this.params.note + semitones, this.ctx.currentTime, 0.005);
  }

  /** Switch the active resonator model (0..11; 6+ = the string-synth easter egg). */
  private setModelIndex(index: number): void {
    index = Math.max(0, Math.min(11, index | 0));
    this.currentModelIndex = index;
    this.node?.port.postMessage({ type: "setModel", value: index });
  }

  // Push a k-rate macro param into the worklet.
  private pushParam(id: string, value: number, time?: number): void {
    if (!this.node || !this.ctx) return;
    const p = this.node.parameters.get(id);
    if (p) p.setTargetAtTime(value, time ?? this.ctx.currentTime, 0.005);
  }

  getParameterSchema(): ParameterDescriptor[] {
    return [
      { id: "model", label: "Model", group: "shape", type: "discrete", min: 0, max: 11, step: 1,
        default: 0, apply: "message",
        description: "Resonator model — STRUCTURE, BRIGHTNESS, DAMPING and POSITION change meaning per model." },
      { id: "structure", label: "Structure", group: "shape", type: "continuous", min: 0, max: 1, default: 0.4,
        apply: "audioparam" },
      { id: "brightness", label: "Brightness", group: "shape", type: "continuous", min: 0, max: 1, default: 0.6,
        apply: "audioparam" },
      { id: "damping", label: "Damping", group: "envelope", type: "continuous", min: 0, max: 1, default: 0.55,
        apply: "audioparam",
        description: "Decay time — how long the resonator rings after each strike. This IS the release." },
      { id: "position", label: "Position", group: "shape", type: "continuous", min: 0, max: 1, default: 0.3,
        apply: "audioparam" },
      { id: "gain", label: "Gain", group: "output", type: "continuous", min: 0, max: 1, default: 0.6,
        apply: "audioparam" },
    ];
  }

  setParameter(id: string, value: number, time?: number): void {
    if (!this.ctx || !this.node) return;
    this.params[id] = value;
    const t = time ?? this.ctx.currentTime;

    switch (id) {
      case "model":
        this.setModelIndex(value | 0);
        return;
      case "structure":
      case "brightness":
      case "damping":
      case "position":
        this.pushParam(id, value, t);
        return;
      case "gain":
        if (this.gainNode) this.gainNode.gain.setTargetAtTime(value, t, 0.01);
        return;
    }
  }

  getParameter(id: string): number {
    return this.params[id] ?? 0;
  }

  async dispose(): Promise<void> {
    this.allNotesOff();
    // Stop the worklet (free WASM buffer + return false from process()) so the
    // disposed processor is collected, not left rendering on the audio thread.
    if (this.node) { try { this.node.port.postMessage({ type: "dispose" }); } catch { /* */ } }
    if (this.node) { try { this.node.disconnect(); } catch { /* */ } this.node = null; }
    if (this.gainNode) { try { this.gainNode.disconnect(); } catch { /* */ } this.gainNode = null; }
    this.ctx = null;
  }
}
```

Note the param groups: `shape` / `envelope` / `output` all already exist in `ParamPanel.svelte`'s `GROUP_LABELS` — **no ParamPanel edit needed.**

- [ ] **Step 2: Type-check and commit**

```bash
npm run check && npm test
git add src/audio/engines/RingsEngine.ts
git commit -m "feat(rings): RingsEngine — ISynthEngine wrapper (strum note model, 4 macros)"
git push origin main
```

---

### Task 5: Model catalogue + Explain corpus (TDD)

**Files:**
- Create: `src/data/rings-models.test.ts`, then `src/data/rings-models.ts`

**Interfaces:**
- Consumes: `EngineModel`, `EngineFamily` from `src/audio/types.ts`; `RingsEngine` from Task 4 (schema ids for the knob↔card link test).
- Produces: `export const RINGS_MODELS: EngineModel[]` (12 models, indices 0–11 matching Task 2's model map) and `export const RINGS_FAMILIES: EngineFamily[]`. Task 6's registry imports these.

- [ ] **Step 1: Re-verify the enum orders the catalogue indices depend on** (same greps as Task 2 Step 1 — the catalogue's `index` fields must match `ResonatorModel` order for 0–5 and `FxType` order for 6–11):

```bash
grep -n -A 10 "enum ResonatorModel" dsp/vendor/rings/dsp/part.h
grep -n -A 9 "enum FxType" dsp/vendor/rings/dsp/string_synth_part.h
```

If the real order differs from MODAL, SYMPATHETIC_STRING, STRING, FM_VOICE, SYMPATHETIC_STRING_QUANTIZED, STRING_AND_REVERB / FORMANT, CHORUS, REVERB, FORMANT_2, ENSEMBLE, REVERB_2 — **reorder the models below to match the source** (keep index = enum position). Also skim `dsp/vendor/rings/dsp/part.cc` and `string_synth_part.cc` for what STRUCTURE/BRIGHTNESS/DAMPING/POSITION actually drive per model, and correct any prose below that contradicts the code — teaching honesty outranks this plan's draft.

- [ ] **Step 2: Write the failing catalogue-integrity test** — `src/data/rings-models.test.ts`:

```ts
import { describe, it, expect } from "vitest";
import { RINGS_MODELS, RINGS_FAMILIES } from "./rings-models";
import { RingsEngine } from "../audio/engines/RingsEngine";

describe("rings catalogue integrity", () => {
  it("has 12 models with contiguous indices 0..11", () => {
    expect(RINGS_MODELS.length).toBe(12);
    RINGS_MODELS.forEach((m, i) => expect(m.index).toBe(i));
  });

  it("has unique, hardware-style codes", () => {
    const codes = RINGS_MODELS.map((m) => m.code);
    expect(new Set(codes).size).toBe(codes.length);
    for (const c of codes) expect(c.length).toBeLessThanOrEqual(4);
  });

  it("every model belongs to a declared family, every family is used", () => {
    const famIds = new Set(RINGS_FAMILIES.map((f) => f.id));
    for (const m of RINGS_MODELS) expect(famIds.has(m.family)).toBe(true);
    const used = new Set(RINGS_MODELS.map((m) => m.family));
    for (const f of RINGS_FAMILIES) expect(used.has(f.id)).toBe(true);
  });

  it("every knob card links to a real engine parameter (knob↔card highlight)", () => {
    const schemaIds = new Set(new RingsEngine().getParameterSchema().map((p) => p.id));
    for (const m of RINGS_MODELS) {
      expect(m.knobs.length).toBe(4);
      for (const k of m.knobs) expect(schemaIds.has(k.id)).toBe(true);
    }
  });

  it("every model has full Explain depth (description + listenFor + goodFor)", () => {
    for (const m of RINGS_MODELS) {
      expect(m.description.length).toBeGreaterThan(20);
      expect(m.detail?.listenFor?.length ?? 0).toBeGreaterThan(20);
      expect(m.detail?.goodFor?.length ?? 0).toBeGreaterThan(20);
    }
  });
});
```

- [ ] **Step 3: Run it to verify it fails**

Run: `npx vitest run src/data/rings-models.test.ts`
Expected: FAIL — `Cannot find module './rings-models'` (or equivalent resolve error).

- [ ] **Step 4: Write `src/data/rings-models.ts`** (the full corpus — conversational voice, firmware-faithful):

```ts
/**
 * The 12 Rings models: the 6 resonator models of rings::Part (3 normal +
 * 3 "hidden", in the firmware's ResonatorModel enum order —
 * dsp/vendor/rings/dsp/part.h) at indices 0..5, then the "Disastrous Peace"
 * easter-egg string synth (rings::StringSynthPart) at 6..11, one entry per
 * FxType in enum order. The `index` goes straight into rings_set_model();
 * do not reorder.
 *
 * STRUCTURE / BRIGHTNESS / DAMPING / POSITION meanings are paraphrased from
 * Émilie Gillet's official Rings manual + verified against the vendored
 * firmware source, in the same conversational voice as the Braids and Plaits
 * catalogues. They are the whole point of the Explain panel — keep them tight
 * and faithful.
 *
 * Sources:
 *  - https://pichenettes.github.io/mutable-instruments-documentation/modules/rings/manual/
 *  - dsp/vendor/rings/dsp/part.cc, string_synth_part.cc (ground truth)
 */
import type { EngineModel, EngineFamily } from "../audio/types";

export const RINGS_FAMILIES: EngineFamily[] = [
  { id: "modal",   label: "Modal Resonator" },
  { id: "strings", label: "Strings" },
  { id: "fm",      label: "FM Voice" },
  { id: "synth",   label: "String Synth (Disastrous Peace)" },
];

const k = (id: string, label: string, text: string) => ({ id, label, text });

// The four knob cards every Disastrous Peace variant shares, minus POSITION
// (which is where the variants differ — each supplies its own).
const dpChord = k("structure", "Structure", "Chord — picks the chord the paraphonic string voices spell out, from the firmware's built-in chord table.");
const dpReg   = k("brightness", "Brightness", "Registration — the blend of octaves and harmonics feeding the ensemble, like pulling drawbars on an organ.");
const dpEnv   = k("damping", "Damping", "Swell and fade — the envelope of the pad around each strum, from organ-stab to slow string-machine bloom.");

export const RINGS_MODELS: EngineModel[] = [
  // --- rings::Part — the resonator models (indices 0..5) --------------------
  { index: 0, code: "MODL", name: "Modal Resonator", family: "modal",
    description: "A bank of tuned resonant filters — the physics of struck bells, bars, tubes and plates.",
    knobs: [
      k("structure", "Structure", "Material and geometry — sweeps the interval between partials from tight plate-like clusters through wooden-bar spacing out to wide, bell-like inharmonic spreads."),
      k("brightness", "Brightness", "Excitation brightness — felt-muted and dark on the left; hard, metallic, many-partialed shimmer on the right."),
      k("damping", "Damping", "Decay time — from a dry woodblock thud to a ring that hangs in the air for many seconds."),
      k("position", "Position", "Strike position — where the mallet lands. Moving it nulls out different partials, like hitting a bar at its node versus its edge."),
    ],
    detail: {
      listenFor: "A genuinely physical strike. Sweep STRUCTURE slowly and hear the same hit morph from wood to glass to bell — the partials re-space while the attack stays put.",
      goodFor: "Mallet instruments, bells, glassy percussion, gamelan tones — pitched thuds and rings that sit beautifully under a melody." } },

  { index: 1, code: "SYMP", name: "Sympathetic Strings", family: "strings",
    description: "One plucked string surrounded by a set of sympathetic strings that ring along with it.",
    knobs: [
      k("structure", "Structure", "Sympathetic tuning — the intervals of the accompanying strings: unisons and fifths on the left, wider and stranger spreads to the right."),
      k("brightness", "Brightness", "String material — warm nylon to bright steel; the sympathetic halo shimmers more as it opens."),
      k("damping", "Damping", "Decay time of the whole string set — short pluck to long communal ring."),
      k("position", "Position", "Energy balance — how much of the pluck feeds the main string versus its sympathetic partners."),
    ],
    detail: {
      listenFor: "The halo. A single pluck sets the neighbouring strings humming in sympathy, like a sitar's drone strings answering the note.",
      goodFor: "Sitar-ish plucks, rich drones, meditative arpeggios where every note leaves a glow behind it." } },

  { index: 2, code: "STRG", name: "Modulated String", family: "strings",
    description: "A physically modelled string with adjustable stiffness — from perfect harp to detuned, bell-tinged piano wire.",
    knobs: [
      k("structure", "Structure", "Stiffness and dispersion — a perfectly harmonic string on the left; upper partials stretch sharp like piano wire through the middle, then buzz inharmonically at the top."),
      k("brightness", "Brightness", "Pluck brightness — soft thumb to hard pick."),
      k("damping", "Damping", "Decay time — staccato pluck to long singing sustain."),
      k("position", "Position", "Pluck position — comb-filters the attack; near the bridge is thin and nasal, near the middle round and full."),
    ],
    detail: {
      listenFor: "What STRUCTURE does to the overtones — dead-on harmonic low, piano-stretch in the middle, metallic buzz up top. The workhorse string.",
      goodFor: "Plucks, harps, clavs, koto lines — any melody that wants a real string under it." } },

  { index: 3, code: "FMVC", name: "FM Voice", family: "fm",
    description: "A two-operator FM voice hiding inside the resonator — one of the firmware's hidden models.",
    knobs: [
      k("structure", "Structure", "Carrier-to-modulator ratio — steps through a catalogue of tuned ratios, from consonant octaves to clangorous inharmonic pairs."),
      k("brightness", "Brightness", "Modulation index — sine-pure on the left; bright and brassy as the modulator digs in."),
      k("damping", "Damping", "Envelope decay of the internal FM voice — pluck to long bell."),
      k("position", "Position", "Feedback — pushes the modulator into itself for raspier, noisier spectra."),
    ],
    detail: {
      listenFor: "Classic 2-op FM — glassy electric-piano attacks and metallic bell tones — but strummed and rung like a physical instrument.",
      goodFor: "FM bells, DX-flavoured plucks and basses that keep the resonator's natural ring-out." } },

  { index: 4, code: "SYMQ", name: "Quantized Strings", family: "strings",
    description: "Sympathetic strings, quantized — the string set snaps to a table of real chords instead of free intervals. Hidden model.",
    knobs: [
      k("structure", "Structure", "Chord — steps through the firmware's chord table; every strum lands on a recognizable harmony."),
      k("brightness", "Brightness", "String material — warm and dark to bright and steely."),
      k("damping", "Damping", "Decay time of the chordal string set."),
      k("position", "Position", "Energy balance between the plucked string and its chordal partners."),
    ],
    detail: {
      listenFor: "SYMP's halo locked to actual chords — strum once and a tuned, harmonious cloud blooms every time.",
      goodFor: "Chordal drones and pads that always land in key — pairs perfectly with Snap-to-scale." } },

  { index: 5, code: "VERB", name: "String + Reverb", family: "strings",
    description: "The modulated string with a lush reverb wrapped around it — pluck and space in one voice. Hidden model.",
    knobs: [
      k("structure", "Structure", "Stiffness and dispersion of the string — harmonic to piano-stretched to buzzy."),
      k("brightness", "Brightness", "Pluck brightness, and with it how much sparkle feeds the tail."),
      k("damping", "Damping", "Decay of string AND tail together — turns a dry pluck into a wash."),
      k("position", "Position", "Pluck position — the comb-filtered attack colour that the reverb then carries."),
    ],
    detail: {
      listenFor: "The reverb blooming out of each pluck — this is the hidden model people fall in love with.",
      goodFor: "Ambient plucks, intros, codas — anything that should sound finished without any external effects." } },

  // --- rings::StringSynthPart — "Disastrous Peace" (indices 6..11) ----------
  { index: 6, code: "DPFM", name: "Disastrous Peace · Formant", family: "synth",
    description: "The easter-egg paraphonic string synth — a 70s divide-down machine — through a vowel-like formant filter.",
    knobs: [dpChord, dpReg, dpEnv,
      k("position", "Position", "Formant depth — vowel-like filtering over the strings; talk-box territory to the right."),
    ],
    detail: {
      listenFor: "A whole string section that seems to sing vowels — the formant filter makes the chord talk.",
      goodFor: "Vocal pads, retro sci-fi choirs, drones with a human shadow in them." } },

  { index: 7, code: "DPCH", name: "Disastrous Peace · Chorus", family: "synth",
    description: "The easter-egg string synth through a thick stereo-style chorus.",
    knobs: [dpChord, dpReg, dpEnv,
      k("position", "Position", "Chorus depth — from dry strings to wide, seasick ensemble motion."),
    ],
    detail: {
      listenFor: "The chord going liquid as POSITION rises — classic chorused string-machine swim.",
      goodFor: "Warm retro pads, Boards-of-Canada haze, backdrops that move without an LFO." } },

  { index: 8, code: "DPRV", name: "Disastrous Peace · Reverb", family: "synth",
    description: "The easter-egg string synth soaked in a hall reverb.",
    knobs: [dpChord, dpReg, dpEnv,
      k("position", "Position", "Reverb send — the hall grows around the strings until they dissolve into it."),
    ],
    detail: {
      listenFor: "Each strum blooming into the room — the pad and its space are one instrument here.",
      goodFor: "Ambient beds, slow chord changes, endings that fade instead of stopping." } },

  { index: 9, code: "DPF2", name: "Disastrous Peace · Formant II", family: "synth",
    description: "The string synth through a second, sharper formant set — brighter vowels, more consonant bite.",
    knobs: [dpChord, dpReg, dpEnv,
      k("position", "Position", "Formant depth — crisper, more clipped vowel shapes than the first formant mode."),
    ],
    detail: {
      listenFor: "The difference from DPFM — same singing strings, but the vowels are brighter and more articulate.",
      goodFor: "Talking leads over the chord, sharper vocal textures, calls-and-answers with DPFM." } },

  { index: 10, code: "DPEN", name: "Disastrous Peace · Ensemble", family: "synth",
    description: "The string synth through a multi-voice ensemble — the classic string-machine swirl.",
    knobs: [dpChord, dpReg, dpEnv,
      k("position", "Position", "Ensemble depth — the many-LFO shimmer that made 70s string machines sound huge."),
    ],
    detail: {
      listenFor: "That unmistakable Solina-style swirl — dozens of phantom players drifting around the chord.",
      goodFor: "The definitive retro string pad. When in doubt, this is the Disastrous Peace to reach for." } },

  { index: 11, code: "DPR2", name: "Disastrous Peace · Reverb II", family: "synth",
    description: "The string synth in a second, bigger and darker hall.",
    knobs: [dpChord, dpReg, dpEnv,
      k("position", "Position", "Reverb send — a longer, moodier tail than the first reverb mode."),
    ],
    detail: {
      listenFor: "The darker room — same strings as DPRV but the tail is longer, deeper, more distant.",
      goodFor: "Cavernous ambient, film-cue dread, chords that hang like weather." } },
];

export function getRingsModel(index: number): EngineModel | undefined {
  return RINGS_MODELS[index];
}
```

- [ ] **Step 5: Run the test to verify it passes**

Run: `npx vitest run src/data/rings-models.test.ts`
Expected: PASS (5 tests).

- [ ] **Step 6: Commit**

```bash
npm test && npm run check
git add src/data/rings-models.ts src/data/rings-models.test.ts
git commit -m "feat(rings): 12-model catalogue + Explain corpus + integrity tests"
git push origin main
```

---

### Task 6: Registry entry + in-app audio verification

**Files:**
- Modify: `src/audio/registry.ts`

**Interfaces:**
- Consumes: `RingsEngine` (Task 4), `RINGS_MODELS`/`RINGS_FAMILIES` (Task 5).
- Produces: Rings live in the app — EnginePicker, ModelPicker, ExplainPanel, Surprise, share-URLs and presets all inherit it through the registry. Theme is intentionally NOT wired yet: `themeForEngine()` falls back to `phosphor`, which is the agreed temporary skin until Task 7.

- [ ] **Step 1: Add the registry entry** — in `src/audio/registry.ts`, add to the imports:

```ts
import { RingsEngine } from "./engines/RingsEngine";
import { RINGS_MODELS, RINGS_FAMILIES } from "../data/rings-models";
```

and append to the `ENGINES` array after the laxsynth entry:

```ts
  {
    // Rings (resonator) authors its catalogue directly as EngineModel[] too.
    id: "rings",
    name: "Rings",
    createEngine: () => new RingsEngine(),
    models: RINGS_MODELS,
    families: RINGS_FAMILIES,
  },
```

- [ ] **Step 2: Type-check + tests**

```bash
npm run check && npm test
```

Expected: both green (serialization/share-url/bindings are engine-agnostic; nothing else changes).

- [ ] **Step 3: Verify in the running app** — start the dev server and open the app in the browser pane (`npm run dev` via the launch config). Then:

1. Tap to start audio. Open the engine picker — **Rings** appears as a 4th entry. Select it.
2. The app skins to **phosphor** (expected fallback until Task 7) with zero console errors, and the worklet signals ready (no "did not signal ready" toast).
3. Click staff/grid notes or press play — **notes strike and ring out**; the scope shows a decaying waveform after each note-on ends (the tail outlives the note: that's the resonator identity working).
4. Switch through **all 12 models** in the model picker — each changes character audibly; models 6–11 sound like chordal string-synth pads; zero console errors throughout.
5. **Pitch calibration:** play the same melody on Braids, then on Rings. Pitches must match (Braids is verified 69→440 Hz). If Rings lands a constant interval off (e.g. exactly an octave), add the correcting offset **in the worklet's note push** — change `m._rings_set_note(parameters.note[0]);` to `m._rings_set_note(parameters.note[0] + OFFSET);` with a comment citing `part.cc`'s note handling — then rebuild nothing (worklet is plain JS), re-verify, and include the change in this commit.
6. Turn **Damping** down — notes become short thuds; up — long rings. Turn **Structure/Brightness/Position** — audible change. The Explain panel shows the 4 knob cards and knob↔card highlight works (touch a knob, its card lights).
7. Sequencer stop (panic) while a note rings: the tail **decays naturally** (does not hard-cut) and no stuck repeated strums occur.

- [ ] **Step 4: Commit**

```bash
git add src/audio/registry.ts public/rings-worklet.js
git commit -m "feat(rings): register engine #4 — playable in-app (temp phosphor skin)"
git push origin main
```

(`public/rings-worklet.js` included only if Step 3.5 added a note offset; otherwise drop it from the add.)

---

### Task 7: The "Soundboard" theme (TDD via contrast test)

**Files:**
- Create: `src/ui/themes/contrast.test.ts`
- Modify: `src/ui/themes/tokens.css`, `src/state/theme.ts`

**Interfaces:**
- Consumes: the theme machinery (`themeForEngine`, `[data-theme]` token blocks) — no new API.
- Produces: `ThemeId` includes `"rings"`; `ENGINE_THEME.rings === "rings"`; a complete `[data-theme="rings"]` token block. Design brief (from the approved spec): **warm-dark walnut/espresso body, brass-amber signal, parchment-ivory text, amber sustain-bloom scope with luminance-led shimmer.** Typography: reuse the three self-hosted families (no new font — the spec's optional serif heading is deferred as polish; record nothing else).

- [ ] **Step 1: Write the contrast test first** (it guards ALL four themes, not just rings) — `src/ui/themes/contrast.test.ts`:

```ts
import { describe, it, expect } from "vitest";
import { readFileSync } from "node:fs";

/**
 * WCAG AA guard for every theme's text-on-background pairs. The user is
 * colorblind: luminance contrast is the one channel guaranteed to work, so
 * these floors are hard gates, not lint.
 */
const css = readFileSync(new URL("./tokens.css", import.meta.url), "utf8");

const THEMES = ["lab", "sandbox", "phosphor", "rings"] as const;
const TEXT_TOKENS = ["--text", "--text-muted", "--text-dim", "--danger", "--signal-ink"];

function block(theme: string): string {
  const m = css.match(new RegExp(`\\[data-theme="${theme}"\\]\\s*\\{([^}]+)\\}`));
  if (!m) throw new Error(`theme block not found: ${theme}`);
  return m[1];
}

function token(body: string, name: string): string {
  const m = body.match(new RegExp(`${name}:\\s*([^;]+);`));
  if (!m) throw new Error(`token ${name} missing`);
  const v = m[1].trim();
  const ref = v.match(/^var\(\s*(--[\w-]+)\s*\)$/);
  return ref ? token(body, ref[1]) : v;
}

function lum(hex: string): number {
  const h = hex.replace("#", "");
  const n = h.length === 3 ? h.split("").map((c) => c + c).join("") : h;
  const [r, g, b] = [0, 2, 4]
    .map((i) => parseInt(n.slice(i, i + 2), 16) / 255)
    .map((c) => (c <= 0.03928 ? c / 12.92 : ((c + 0.055) / 1.055) ** 2.4));
  return 0.2126 * r + 0.7152 * g + 0.0722 * b;
}

function contrast(a: string, b: string): number {
  const [hi, lo] = [lum(a), lum(b)].sort((x, y) => y - x);
  return (hi + 0.05) / (lo + 0.05);
}

describe("theme token contrast (WCAG AA)", () => {
  for (const theme of THEMES) {
    it(`${theme}: text tokens ≥ 4.5:1 on --bg`, () => {
      const body = block(theme);
      const bg = token(body, "--bg");
      for (const name of TEXT_TOKENS) {
        const c = contrast(token(body, name), bg);
        expect(c, `${theme} ${name} = ${c.toFixed(2)}:1`).toBeGreaterThanOrEqual(4.5);
      }
    });
    it(`${theme}: --on-signal ≥ 4.5:1 on --signal`, () => {
      const body = block(theme);
      const c = contrast(token(body, "--on-signal"), token(body, "--signal"));
      expect(c, `${theme} on-signal = ${c.toFixed(2)}:1`).toBeGreaterThanOrEqual(4.5);
    });
  }
});
```

- [ ] **Step 2: Run it to verify it fails on the missing rings block**

Run: `npx vitest run src/ui/themes/contrast.test.ts`
Expected: lab/sandbox/phosphor tests PASS; both `rings` tests FAIL with `theme block not found: rings`. (If an existing theme fails a floor, STOP and report — do not adjust existing themes silently.)

- [ ] **Step 3: Add the Soundboard token block** — append to `src/ui/themes/tokens.css` (before the phosphor `.scanlines` rule at the end):

```css
/* —— Rings — "Soundboard": warm walnut body, brass signal ————————————
   The wooden body of an acoustic resonator. Identity is carried by warmth
   and LUMINANCE (colorblind-safe): walnut→ivory brightness axis, brass
   signal bright enough to read as text, scope trace brighter still. */
[data-theme="rings"] {
  --bg:               #221A13;
  --surface:          #2B2118;
  --surface-raised:   #362A1E;
  --surface-sunken:   #1B140E;
  --hairline:         #4A3B2A;
  --hairline-soft:    rgba(242, 233, 219, 0.07);

  /* Text — every shade meets WCAG AA (≥4.5:1) against --bg. */
  --text:             #F2E9DB;        /* parchment ivory — ~14.2:1 */
  --text-muted:       #C9B99F;        /* ~8.9:1 */
  --text-dim:         #A89877;        /* ~6.0:1 */

  --signal:           #E3A94C;        /* brass — ~8.2:1 on --bg, text-safe */
  --signal-ink:       var(--signal);
  --signal-dim:       rgba(227, 169, 76, 0.35);
  --signal-deep:      rgba(227, 169, 76, 0.16);
  --signal-glow:      rgba(227, 169, 76, 0.5);
  --accent:           #E77E52;        /* ember copper — ~6.1:1 */
  --accent-dim:       rgba(231, 126, 82, 0.35);
  --on-signal:        #221A13;        /* walnut on brass — ~8.2:1 */
  --danger:           #FF8A70;        /* ~7.4:1 on --bg */

  /* Scope: the resonance bloom — the trace reads by BRIGHTNESS (a step above
     --signal), with long persistence echoing Rings' sympathetic decay. */
  --scope-bg:         #140E08;
  --scope-trace:      #FFC46B;
  --scope-trace-w:    1.5px;
  --scope-glow:       rgba(255, 196, 107, 0.5);
  --scope-grid:       rgba(255, 196, 107, 0.07);
  --scope-persist:    0.90;           /* long decay — sympathetic shimmer */
  --scope-bloom:      1.3;            /* warm halo: between sandbox (1.0) and phosphor (1.7) */

  --knob-track:       #362A1E;
  --knob-fill:        var(--signal);
  --knob-pointer:     var(--text);
  --knob-tick:        var(--text-dim);

  /* Type: inherit the :root stacks (Space Grotesk headings / Inter body /
     JetBrains Mono readouts). A serif heading face is deferred polish. */
  --label-case:       none;
  --label-tracking:   0.02em;

  color-scheme: dark;
}
```

- [ ] **Step 4: Wire the theme** — in `src/state/theme.ts`, three edits:

```ts
export type ThemeId = "lab" | "sandbox" | "phosphor" | "rings";
```

```ts
const ENGINE_THEME: Record<string, ThemeId> = {
  braids: "phosphor",   // vintage CRT green
  plaits: "sandbox",    // warm TE-style body
  laxsynth: "lab",      // SNES-inspired indigo
  rings: "rings",       // Soundboard — warm walnut + brass
};
```

```ts
const THEME_COLOR: Record<ThemeId, string> = {
  lab: "#24232B",
  sandbox: "#E9E5DC",
  phosphor: "#0A0805",
  rings: "#221A13",
};
```

- [ ] **Step 5: Run the contrast test to verify it passes**

Run: `npx vitest run src/ui/themes/contrast.test.ts`
Expected: PASS — all 8 tests (4 themes × 2).

- [ ] **Step 6: Visual verification in the browser** — dev server, select Rings:

1. The whole app re-skins to Soundboard: dark walnut surfaces, ivory text, brass knobs/signal. Selecting any other engine swaps back (theme-follows-engine intact both directions).
2. Scope trace is a **bright warm amber** clearly brighter than every surface, with visible persistence/afterglow on decaying notes.
3. Every label/readout is comfortably readable; no meaningful UI element relies on a translucent color. Check the ModelPicker, ExplainPanel, transport, toolbar, and staff.
4. Mobile check: resize to 375×812 — the browser-chrome/status-bar area matches the walnut `#221A13`, no layout seams, top bar wraps as in other themes.
5. Screenshot for the record.

- [ ] **Step 7: Commit**

```bash
npm test && npm run check
git add src/ui/themes/tokens.css src/ui/themes/contrast.test.ts src/state/theme.ts
git commit -m "feat(rings): Soundboard theme — walnut/brass, AA-guarded by contrast test"
git push origin main
```

---

### Task 8: Surprise tuning + provenance + full pass

**Files:**
- Modify: `src/state/surprise.ts` (one clamp), `dsp/PROVENANCE.md`

**Interfaces:**
- Consumes: everything shipped in Tasks 1–7.
- Produces: musical Surprise rolls on Rings; a complete provenance record for the three new artifacts.

- [ ] **Step 1: Tame DAMPING in Surprise rolls** — in `src/state/surprise.ts`, in `randomParamValue`, after the existing `drift`/`signature` clamp line add:

```ts
  if (id === "damping") v = Math.min(v, d.min + span * 0.85);   // Rings: full damping ≈ endless ring — keep rolls finite
```

(Generic by id, like the neighbouring clamps — inert for engines without a `damping` param.)

- [ ] **Step 2: Verify a Surprise roll lands on Rings sanely** — in the browser: tap Surprise repeatedly until Rings comes up (≤ a few taps among 4 engines). The roll must produce audible, decaying notes (no permanent drone), a random model, and the Soundboard skin. Check the Recent-sounds trail records the roll.

- [ ] **Step 3: Record provenance** — compute hashes and emcc version:

```bash
sha256sum public/rings.wasm public/rings.js public/rings-worklet.js
```

```powershell
emcc --version   # after sourcing emsdk_env.ps1 if needed
```

Edit `dsp/PROVENANCE.md`:
1. "What's opaque vs. readable": add `public/rings.wasm` + glue `public/rings.js` to the opaque list; add `public/rings-worklet.js` to the hand-maintained list.
2. Hash table: add the three rows with the values from above; extend the `sha256sum` regeneration command to include them.
3. "Rebuild" section: add `npm run wasm:rings   # -> dsp/shim/build-rings.ps1 (rings.wasm + rings.js)` and note the emcc version used for this build (the Task 1 upstream pin is already recorded in "Source").

- [ ] **Step 4: Full pass + commit**

```bash
npm test && npm run check && npm run build
git add src/state/surprise.ts dsp/PROVENANCE.md
git commit -m "feat(rings): surprise damping clamp + provenance rows (hashes, emcc, upstream pin)"
git push origin main
```

Expected: all tests green, svelte-check 0 errors/0 warnings, production build succeeds.

---

### Task 9: HUMAN GATE — ear/eye pass + docs close-out

**This task requires Andrew** (real listening + colorblind-eye judgment). Prepare everything, then stop and hand him this checklist:

- [ ] **Step 1: Andrew's ear pass** (dev server or deployed build)
  - Rings sounds like Rings: physical, resonant, the ring-out tail after every note. No clicks/pops/zipper noise on knob moves or model switches.
  - All 12 models distinct; the 6 Disastrous Peace pads are lush, not broken.
  - Melody in a non-C key: in tune against Braids playing the same line.
  - Surprise onto Rings a few times: rolls are playable, never a stuck drone.
  - Export one loop on Rings: the tail survives into the file's 2 s release.
- [ ] **Step 2: Andrew's eye pass** — Soundboard on desktop + phone: readable everywhere, scope shimmer reads as brightness, nothing conveyed by color alone, status bar matches on mobile.
- [ ] **Step 3: Docs close-out (after both passes)** —
  - `docs/roadmap-v1.0.md`: mark ⑤ Rings **✅ shipped** in the "After v1.0" line (same style as ① and ④).
  - `CLAUDE.md`: "All three themes" line → four themes, add `rings → soundboard` to the theme-follows-engine mapping; update the deferred-list note ("Plaits + Laxsynth engines shipped 2026-06-07" → add Rings with date).
  - Commit `docs(rings): mark engine #4 shipped after ear/eye gate`, push, and consider tagging `v1.2.0`.

---

## Self-review notes (kept for the record)

- **Spec coverage:** §1 architecture → Tasks 1–3; §2 params+corpus → Tasks 4–5; §3 theme → Task 7; §4 integration+licensing → Tasks 1, 6, 8; §5 testing → Tasks 5, 7, 8 + browser steps in 6/7 + human gate 9; §6 phasing → task order mirrors P1–P5. Spec's "pinned to implementation" items each have an explicit verify step (Task 2 Step 1, Task 5 Step 1, Task 6 Step 3.5).
- **Known judgment calls encoded here:** ODD+EVEN summed at 0.5 with SoftLimit (mono-sum = the hardware's only-ODD-patched mix); velocity intentionally unused (no velocity input on the hardware exciter); `allNotesOff` lets tails decay (a resonator has no gate); serif heading deferred (no new font machinery); StringSynth chord index mirrors cv_scaler's `structure × (kNumChords−1)` mapping.
- **Type consistency:** export names (`_rings_*`), worklet message types (`setModel/gateOn/gateOff/clearStrikes/dispose`), processor name (`"rings"`), factory (`createRingsModule`), schema ids (`model/structure/brightness/damping/position/gain`), and catalogue knob ids were cross-checked across Tasks 2→6.
