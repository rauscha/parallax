# FM — engine #5 (msfa port) + the flowsheet teacher (design spec)

**Created:** 2026-09-10 · **Status:** approved for planning; **§6.1 gate PASSED 2026-09-10** (see
`2026-09-10-tap-spike-results.md`) · **Type:** comprehensive
design — engine port, tap instrumentation, and the teaching view in one spec.
**Owner:** Andrew · **Follows:** `docs/ideas/2026-09-10-diy-synth-engine-survey.md` and
`docs/ideas/2026-09-10-fm-flowsheet-teacher.md`, plus the 2026-09-10 decisions below.

Engine #5 is **6-operator FM**, ported from Raph Levien's **msfa** (`google/music-synthesizer-for-android`,
**Apache-2.0**) — the DX7-lineage engine underneath Dexed/MiniDexed. It fills the one sonic category Parallax lacks
(Braids/Plaits are macro-oscillators, Rings is a resonator, Laxsynth is subtractive) and it is the **same port that
provides the substrate for the flowsheet teacher**: `fm_core.cc` holds the algorithm table, `fm_op_kernel.cc` is one
operator, `dx7note.cc` is one voice. One vendoring job, two features. That coupling is why they share a spec.

---

## Locked decisions (2026-09-10 — do not re-litigate)

1. **Engine #5 = msfa 6-op FM.** Apache-2.0, MIT-compatible with notice retained. Plinky (the other licence-clean
   candidate) is not chosen: no model axis, and mono guts it. Survey §Tier-2 recommendation accepted.
2. **Real per-node taps — route 1.** The hedge in the original idea note (a TS teaching model driving the diagram) is
   **withdrawn**. Taps read the actual engine. See §2 and the revised architecture section of the idea note.
3. **The flowsheet teacher is designed for a computer screen.** Not phone, not tablet. See §4.4 for exactly what that
   does and does not mean against the locked "single responsive PWA" decision.
4. **The 5th theme is designed *for* the diagram surface** — flatter and higher-contrast than the other four skins,
   which are instrument-panel skins. The flowsheet is the primary thing this theme has to serve. (Decision A, closed
   2026-09-10.)
5. **Own corpus, built from sound — never from ROM data.** Voices may be *inspired by* classic Yamaha sounds and
   recreated by ear; a waveform is not copyrightable, and a sound designed to land in the same territory is our own
   work. What is off limits is the patch data itself: no factory ROM sysex, no transcribed operator parameter sets.
   Route B1, with the boundary stated in Andrew's terms: **build it from sound, not from the ROM.** (Decision B,
   closed 2026-09-10.)
6. **Model axis = voices**, each carrying its algorithm as a displayed property; the algorithm becomes the explorable
   object in the flowsheet rather than a second picker. (Decision C, closed 2026-09-10.)

## Decision record (A–C closed 2026-09-10; D stands as written)

A, B and C were open when this spec was written and are now closed — see locked decisions 4–6 above. The reasoning is
kept below because the *boundaries* matter at implementation time, especially B.

### A. The 5th theme — **closed: designed for the diagram surface**

Theme-follows-engine is locked, and `src/state/theme.ts` currently types
`ThemeId = "lab" | "sandbox" | "phosphor" | "rings"`. A fifth engine therefore requires a **fifth skin** — name,
direction, token set, plus entries in `ENGINE_THEME` and `THEME_COLOR` and a row in `contrast.test.ts`. Rings set the
precedent that the spec records *direction and contract* while a `frontend-design` pass produces pixels at
implementation. Needed: a direction. One seam worth considering — the flowsheet is a *diagram* surface, which wants
flatter, higher-contrast tokens than any of the four existing skins, so it is worth deciding up front whether the FM
theme is designed **for** that view or merely tolerates it.

### B. The patch corpus — **closed: B1, built from sound, not from the ROM**

The survey note claimed the factory cartridge voices give "a corpus larger than Braids'". That needs a correction on
the record: **msfa's Apache-2.0 licence covers the engine, not Yamaha's patch data.** The factory ROM sysex banks are
Yamaha's — widely circulated, not licensed for redistribution. Shipping them would be the first thing in this repo that
is not licence-clean, in a project whose posture has otherwise been careful enough to vendor `LICENSE-Braids.txt` and
keep per-file MIT headers intact.

**The boundary, in Andrew's words:** *"we've gotta build it from sound — can't copyright soundwaves — not from the
ROM."* That is the correct line and it is worth stating precisely, because the two halves get conflated. Recreating a
famous sound **by ear** is legitimate: timbre is not copyrightable, and the result is our own sound design. Copying the
**patch data** — factory sysex, or a transcribed table of operator ratios, levels and envelopes lifted from the ROM —
is copying someone's authored work regardless of how it is re-encoded. So: name voices in our own language, design
them by listening, document them as "in the territory of" rather than "a clone of", and never let a factory parameter
dump into the repo.

Routes considered:

- **B1 — author our own corpus (recommended).** Hand-design a voice set under our own copyright, chosen to
  *demonstrate* FM principles: a 2-op integer-ratio pair, the same pair detuned inharmonic, a feedback saw, a bell, an
  electric piano, a brass swell with time-varying index. Fully clean, and a *better* teaching corpus than the factory
  bank because every entry exists to make one thing visible. Cost: real sound-design work, and Explain prose that is
  authored rather than researched. Same shape as the Plinky salvage the survey described — and it is what the product
  is actually about.
- **B2 — user-supplied banks.** Ship nothing; let the user import a `.syx` they already own. Clean, but the app boots
  with an empty model picker, which breaks the explain loop on first run. A possible *addition* to B1, not a
  substitute.
- **B3 — ship the factory ROM.** Not recommended. Not without a deliberate, documented decision.

### C. What the model axis *is* — **closed: voices**

The Explain panel needs a discrete model axis (`modelEnumerable: true`). Two candidates, and they are not the same
kind of thing: the **32 algorithms** are topologies (structure, not sound); the **voices** are sounds.
Braids/Plaits/Rings models are all sounds. Recommendation: **model axis = voices** (per B1), with each voice's
**algorithm shown as a property** of it — and the flowsheet view is where the algorithm becomes the explorable object.
That keeps the Explain contract identical across all five engines and gives the teacher a reason to exist instead of
duplicating the model picker.

### D. Naming and attribution — stands as written

The trademark rule applies unchanged. **Never brand the engine or the product "DX7", "Yamaha", or "Dexed".** The
display name should be generic and factual — **"FM"** or **"6-Op FM"** — with attribution prose of the form *"based on
msfa, Raph Levien's open-source 6-operator FM engine (Apache-2.0)."* Apache-2.0 additionally requires the `NOTICE`
file be carried; add `LICENSE-msfa.txt` alongside `LICENSE-Braids.txt`.

---

## §1. Architecture — how a note becomes sound

Same proven scaffold as Braids (96 kHz), Plaits (48 kHz) and Rings (48 kHz).

**Vendoring — `dsp/vendor/msfa/`.** Take the self-contained DSP translation units only: `fm_core.cc`,
`fm_op_kernel.cc`, `dx7note.cc`, `patch.cc`, `env.cc`, `pitchenv.cc`, `lfo.cc`, `freqlut.cc`, `sin.cc`, `exp2.cc`,
`log2.cc` and their headers. No Android/JNI, no `synth_unit` host glue. Roughly ten small TUs — comparable to the
Braids shim. Keep the Apache-2.0 headers on every file; add the `NOTICE`.

**Sample rate and block size.** msfa's rate is configured at init (`Freqlut::init`, `Env::init_sr`, `Lfo::init`), so
pin it to **48 kHz** and reuse the Rings resampler path verbatim. Its render block is a compile-time `N` (64 in the
stock source — **confirm when vendoring**, do not assume). The worklet's ring buffer is written in units of that block,
exactly as `rings-worklet.js` does with `RINGS_BLOCK = 24`.

**Shim — `dsp/shim/fm_shim.cc`** (global-instance pattern, like `plaits_shim.cc`):

- Holds one `Dx7Note` (mono is locked) plus the active patch byte array.
- `extern "C"`, all `EMSCRIPTEN_KEEPALIVE`: `fm_init(sample_rate)`, `fm_alloc(n)`, `fm_free(ptr)`, `fm_render(out, n)`,
  `fm_note_on(midi, velocity)`, `fm_note_off()`, `fm_set_patch(ptr, len)`, `fm_set_pitch_bend(semitones)`, plus the
  live macro setters in §3.
- **Plus the tap exports in §2.** This is the only shim in the project that exposes engine internals; its header
  comment must say so, and say why.
- msfa emits mono at higher internal precision than Braids' `int16`. The shim normalises to the same `HEAP16` contract
  the other worklets read, or widens to `HEAP32` if measured headroom says otherwise — decide from a measured peak,
  not from taste.

**Worklet — `public/fm-worklet.js`** (plain JS, outside the Vite bundle; clone of `rings-worklet.js`): 48 kHz ring
buffer + linear resampler, k-rate macro params via `parameterDescriptors`, `gateOn`/`gateOff` carrying an audio-domain
`time`, `dispose` frees the heap buffer and returns `false` from `process`. **Unlike the other four**, it also runs the
tap snapshot loop (§2).

**Engine class — `src/audio/engines/FmEngine.ts`** implements `ISynthEngine` exactly like `RingsEngine`: manifest
(`id: "fm"`, `polyphony: 1`, `producesAudio: true`, `supportsPitchBend: true`, `modelEnumerable: true`), `init(ctx)`
with a `BASE_URL`-relative worklet load, main-thread wasm fetch with `AbortController` + timeout, `ready`/`error`
handshake, a master `GainNode`, and the dispose-owns-the-fade ordering fixed in `98075a2`.

**Build — `dsp/shim/build-fm.ps1`** (clone of `build-rings.ps1`): `EXPORT_NAME=createFmModule`, `EXPORTED_FUNCTIONS` =
the `_fm_*` set plus `_malloc`/`_free`, output to `dsp/build/fm.{js,wasm}` then copied to `public/`. Add a `"wasm:fm"`
script to `package.json`. Commit the built artifacts un-gitignored so CI ships them with no Emscripten toolchain, per
the GitHub Pages decision.

**Registration — `src/audio/registry.ts`.** Everything cross-cutting (`bindings`, `serialization`, `share-url`,
`persistence`, `surprise`, `undo`, `lineage`, and all pickers/panels) reads through the registry, so the engine picker,
model picker, Explain panel, share links, presets, undo, lineage, Surprise and Match all come for free on registration.
The Rings port re-proved this.

---

## §2. Tap instrumentation — the contract

The genuinely new part. Full reasoning lives in the idea note's revised architecture section; this is the contract.

**Where taps are read.** Inside `fm_render`, after each operator kernel writes its block and *before* the algorithm
routing sums or overwrites it. Feedback is read from the kernel's feedback state. Capture is at **engine-native rate,
pre-resample** — the true signal in msfa's own block domain, decoupled from the 128-sample quantum.

**Tap set (8).** Operators 1–6, the feedback wire, and the voice output.

**Transport — pooled transferables, not per-quantum streaming.**

- The worklet owns a **pre-allocated capture ring** per tap, sized to hold at least one display window (~1024 samples)
  plus a frame of slack. Allocated once, at init.
- Each quantum, the shim copies its blocks into the ring: 8 × 128 float writes per quantum, ~380k writes/sec —
  negligible beside running six FM operators.
- Once per display frame (~60 Hz) the worklet packs one **snapshot** — all eight taps at *identical sample offsets* —
  into a pooled `ArrayBuffer` and `postMessage`s it **as a transferable**. The main thread reads it and transfers a
  recycled empty buffer back. Pointer handoff, fixed pool, zero copy.
- **Hard requirement: zero allocation in `process()` after init.** That is the whole design. Anything that allocates on
  the audio thread is a defect, not a tuning question.

**Why identical offsets matter.** Phase coherence *is* the pedagogy — "watch the traces lock at 2:1 and drift at 2.01:1"
only works if every trace shares one time base. This also rules out the naive "wire six `AnalyserNode`s" approach,
which is independently impossible: an `AnalyserNode` taps the Web Audio graph, not the inside of a worklet.

**Trigger.** The main thread aligns the drawn window to a rising zero-crossing of a nominated reference tap (default:
the carrier) so traces do not jitter. Trigger is a *display* concern and stays on the main thread; the worklet ships
raw windows.

**Decimation.** Draw-time only, on the main thread, as a min/max envelope per pixel column. **Do not decimate in the
worklet** — naive decimation aliases, and an aliased modulator trace would be a lie about the signal, which the
product's honesty rule forbids. Full-rate transfer is cheap enough (~2 MB/s of transferables) that cleverness here buys
nothing.

**Gating.** Taps stay off unless the flowsheet view is mounted. The default app path pays nothing.

**Residual unknown and fallback.** Whether `port.postMessage` is genuinely allocation-free with transferables is not
promised by the spec. If §6.1 shows it is not, the fallback is a `SharedArrayBuffer` ring — which **contradicts a
locked decision**: GitHub Pages cannot send COOP/COEP headers, so it is reachable only via a `coi-serviceworker`-style
shim riding the existing PWA service worker, costing a reload on first visit and shakier Safari behaviour. Named here
so the trade is known before the spike, not discovered after. It is not the plan, and it is not adopted without a fresh
decision from Andrew.

---

## §3. Parameters and the model corpus

**Macro axis.** The Explain panel's contract is per-model prose about a small set of macro knobs. A raw DX7-lineage
patch has ~145 parameters; exposing them all would give the Explain panel nothing to say and break the pattern every
other engine follows. So the engine exposes a **small macro set that modulates the loaded patch**, in the spirit of
Plaits' HARMONICS/TIMBRE/MORPH:

| id | label | what it does |
|---|---|---|
| `brightness` | Brightness | scales modulator output levels together — the "more sidebands" axis |
| `ratio` | Ratio | offsets modulator coarse/fine frequency ratios from the patch's values |
| `feedback` | Feedback | the patch's feedback amount |
| `envelope` | Envelope | scales operator EG rates together (percussive ↔ pad) |

The exact mapping is decided at implementation against `patch.cc`; the *count and character* are locked here.
Full per-operator editing is **not** a knob-panel feature — it belongs to the flowsheet view (§4), which is the point.

**Model corpus.** Decided (locked #5): own voices, designed by ear, never lifted from ROM patch data. The shape is a hand-authored voice set where each entry
demonstrates one FM idea, carrying the standard `EngineModel` fields (`code`, `name`, `family`, `description`, `knobs`,
`detail.listenFor` / `detail.goodFor`) in `src/data/fm-models.ts`. Families are the natural FM taxonomy: bells and
metallic, electric pianos, brass and winds, basses, inharmonic and noise, and teaching primitives.

**Honesty rule for the prose.** Every claim in the Explain corpus must be verifiable against the vendored source or
against what the running engine actually does — the same standard as the firmware-verified Braids/Plaits/Rings corpora.
No repeating DX7 folklore we have not checked.

---

## §4. The flowsheet view

### 4.1 What it shows

A node graph of the current algorithm — six operator nodes, their modulation wires, the output sum — where **every node
and wire carries a live scope** on the shared time base of §2. Per the idea note's requirements list: operator output,
ratio (drawn *against* the carrier so integer vs non-integer reads as lock vs drift), index/depth, feedback,
per-operator envelope, and the algorithm itself as the diagram. Plus a **spectrum pane at the output**, because the
sideband picture is the frequency-domain half of the same truth and a physics brain wants both panes.

### 4.2 Interactions

- Switch algorithm → the graph redraws, wires re-route, traces update live.
- Edit a node's ratio / level / feedback / envelope in place → hear it, and see which traces change and which do not.
- **Freeze** — hold the last snapshot while audio keeps running.
- **Slow** — draw a shorter window from the same full-rate capture. Real slow motion, not a re-render.
- Knob ↔ trace highlight, mirroring the existing knob ↔ Explain-card link (`activeParamStore`).

### 4.3 Reuse

`src/viz/Oscilloscope.svelte` and `Spectrum.svelte` already render traces, and `MatchPanel.svelte` already proves
multiple simultaneous analysers. The renderers are reusable; what changes is their *source* — a snapshot slice instead
of an `AnalyserNode` — so factor a shared trace-drawing primitive rather than forking the components.

### 4.4 Desktop-screen scope — what it does and does not mean

Locked decision 3 is **not** a retreat from "single responsive PWA". Concretely:

- The app stays one responsive PWA. Nothing about the existing layout changes.
- The flowsheet is **its own route/view**, not another panel crammed into the main screen.
- On viewports too narrow to carry the graph honestly, that route shows a plain, non-apologetic note that it needs a
  wider screen — **not** a degraded miniature. Six nodes and eight scopes on 375 px would be illegible, and an
  illegible teaching diagram fails the same honesty rule as an inaccurate one.
- The rest of the FM engine — picker, knobs, Explain panel, staff, share links — stays fully responsive like every
  other engine. Only the teacher is desktop-scoped.

---

## §5. Theme

**Decided (locked #4): the FM theme is designed for the diagram surface** — flatter and higher-contrast than the four
instrument-panel skins that precede it. Where Phosphor/Soundboard/Lab/Sandbox are *surfaces of an instrument*, this one
is a *drafting surface*: the flowsheet is the primary thing it has to serve, and knob panels adapt to it rather than
the reverse. Direction only; pixels come from a `frontend-design` pass at implementation. The contract: a 5th `ThemeId`, a token set in `src/ui/themes/tokens.css`,
entries in `ENGINE_THEME` and `THEME_COLOR`, and a row in `contrast.test.ts`.

**Accessibility is non-negotiable, and this feature is the hardest case in the app.** Nothing in the flowsheet may
carry meaning by hue alone. Wires and traces are distinguished by *luminance*, line weight, dash pattern, and a text
label at the node. Translucent fills are out — they read as invisible. Assume the diagram will be read by someone who
cannot separate the two colours you were about to use, because it will be.

---

## §6. Testing and verification

### 6.1 The tap spike — **PASSED 2026-09-10**

> **Result:** green. 8 taps cost **0.055 percentage points** of the audio-thread budget (13.253 % → 13.308 % duty, a
> 0.4 % relative increase); 48 taps cost 0.812 pp with no inflection. Pool never starved at any tap count, heap flat,
> zero per-quantum allocation, draw cost 0.064 ms/frame. **The SAB fallback is not needed and should not be built.**
> Two things the spike could not establish — no per-quantum tail figure (`performance` is not exposed in Chrome's
> `AudioWorkletGlobalScope`), and Chromium only (Firefox/Safari outstanding). Full detail and caveats:
> `2026-09-10-tap-spike-results.md`.

As run, against `public/rings-worklet.js`, before any msfa work exists. Roughly 40 lines.

1. Add 8 dummy taps (copy the render block eight times into a capture ring) plus the pooled-transferable snapshot path.
2. **Zero steady-state allocation in `process()`** — verify by inspection and a flat worklet heap in the Chrome memory
   profiler.
3. **Glitch detection using machinery we already have:** record 60 s of a sustained note through
   `src/audio/export-loop.ts` with taps on versus off, and diff for sample discontinuities. That is a real dropout
   test, not a proxy metric.
4. **Find the cliff, do not just pass.** Scale to 24 and 48 taps. If 48 is clean, 8 stops being a question.
5. Run on Chrome (the target), plus Firefox and Safari — it is a PWA, and worklet scheduling differs.

Outcome was green → §2 stands as written. (Had it been red at 8 taps, the SAB fallback would have needed a *fresh*
decision, not an automatic escalation.)

### 6.2 Engine tests

Mirror the Rings suite: pitch calibration across the range (Rings needed a ±8¢ trim — expect the same class of work),
model-switch stability, dispose/swap with no click and no leak, `allNotesOff`, share-URL round-trip, preset save/load,
and the export path.

### 6.3 Ear and eye gate

The same gate as every prior engine — an ear pass on the corpus, an eye pass on the theme — **plus one specific to this
engine:** verify that a trace shown next to a claim in the Explain prose actually demonstrates that claim. A scope that
disagrees with its own caption is the worst failure mode this feature has.

---

## §7. Phasing (ordered, committable)

| # | Phase | Blocked on |
|---|---|---|
| 0 | ~~**Tap spike** (§6.1) against the Rings worklet~~ — **done 2026-09-10, green** | ✅ |
| 1 | ~~Vendor msfa + `LICENSE-msfa.txt` + `NOTICE`; confirm `N` and the rate wiring~~ — **done 2026-09-10** | ✅ |
| 2 | `fm_shim.cc` + `build-fm.ps1` → renders a tone from a hardcoded patch | 1 |
| 3 | `fm-worklet.js` + `FmEngine.ts` + registry entry → plays from the staff, pitch-calibrated | 2 |
| 4 | Macro parameter set (§3) + schema | 3 |
| 5 | Model corpus + Explain prose (own voices, designed by ear) | 4 |
| 6 | The 5th theme (diagram-first) | 5 |
| 7 | Tap exports in the shim + the snapshot protocol in the worklet | 3 |
| 8 | Flowsheet view — graph, scopes, spectrum, freeze/slow, interactions | 7 |
| 9 | Ear + eye gate (§6.3), docs, roadmap and `CLAUDE.md` updates | all |

With A–C closed and phase 0 green, **nothing in this plan is blocked.** The remaining §6.1 item is the Firefox/Safari
pass, which is not a blocker for phases 1–7 but should be run before the flowsheet view ships.

---

## §8. File checklist

**New:** `dsp/vendor/msfa/**`, `dsp/shim/fm_shim.cc`, `dsp/shim/build-fm.ps1`, `public/fm-worklet.js`,
`public/fm.{js,wasm}`, `src/audio/engines/FmEngine.ts`, `src/data/fm-models.ts`, `LICENSE-msfa.txt`, `NOTICE`, the
flowsheet view and its route, and a shared trace-drawing primitive under `src/viz/`.

**Touched:** `src/audio/registry.ts`, `src/state/theme.ts` (5th `ThemeId`, `ENGINE_THEME`, `THEME_COLOR`),
`src/ui/themes/tokens.css`, `src/ui/themes/contrast.test.ts`, `package.json` (`wasm:fm`), `CLAUDE.md`, and the roadmap.

---

## §9. Open items pinned to implementation (not blockers)

**Answered at phase 1 (vendoring, 2026-09-10)** — read from the source, recorded in
`dsp/vendor/msfa/README.md`:

- ~~msfa's render block `N`~~ — **64** (`synth.h`: `LG_N 6`). Compile-time.
- ~~The int width coming out of `fm_render`~~ — `Dx7Note::compute` writes **`int32_t`** and
  **adds** to the buffer, so the shim must zero it first. Upstream's own `int16` conversion is
  `>> 4`, clip at ±(1 << 24), `>> 9` — `>> 13` total with saturation (`synth_unit.cc:270`). That is
  the reference for the `HEAP16` contract; the measured-peak check at phase 2 now has a baseline to
  argue against rather than a blank page.
- **New, and it matters: `Env` is sample-rate-blind in this revision.** `Freqlut`, `Lfo` and
  `PitchEnv` all take the rate at init; `Env` does not — its increments are per-block-of-`N`
  constants calibrated against msfa's 44.1 kHz reference (`main.cc:274`). At the spec's pinned
  48 kHz every operator envelope runs **~8.8 % fast**. Later Dexed-lineage forks added `Env::init_sr`
  for exactly this. Phase 2 decides: rate-scale the increments, or run the engine at 44.1 kHz and
  let the existing resampler carry it. Do not let this pass as "close enough" — attack and decay
  times are most of what makes an FM voice recognisable.
- **New:** `Dx7Note::init` needs the **unpacked 156-byte** patch, not the packed 128-byte sysex
  block. The header declares `const char patch[128]` and the definition declares `[156]`; the body
  indexes past 128, so the header is simply wrong and C++ decay hides it. Call `UnpackPatch()` first.

**Still open:**

- Whether the heap contract stays `HEAP16` or widens to `HEAP32` — decide from a measured peak.
- Pitch calibration offset (expect a Rings-style trim).
- Whether the flowsheet's spectrum pane reuses `Spectrum.svelte` unmodified or needs a log-frequency axis for the
  sideband picture to read correctly. It probably needs the log axis; confirm by looking at one.
- Whether `log2.{cc,h}` earns its place — vendored per this spec, but upstream only uses `Log2` from its test
  harness and nothing in our set references it. Drop it at phase 9 if it is still unused.
