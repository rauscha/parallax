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
**Amended at phase 9: `log2.{cc,h}` is gone.** Nothing in the set ever referenced it, and the rebuilt
`public/fm.wasm` is byte-identical without it — it was being dead-stripped all along. See §9.

**Sample rate and block size — amended 2026-09-10, engine runs at 44.1 kHz.** The original text here pinned 48 kHz.
Phase 1 found why that is wrong: msfa's rate is configured at init through `Freqlut::init(sr)`, `Lfo::init(sr)` and
`PitchEnv::init(sr)`, but **`Env` takes no rate at all** — its increments are per-block constants calibrated against
msfa's own 44.1 kHz reference, so at 48 kHz every operator envelope runs ~8.8 % fast. Rather than hand-patch vendored
DSP and hope the scaling is right, **the engine runs at its calibrated 44.1 kHz** and the existing resampler carries it
to the context rate — the same arrangement Braids already uses at 96 kHz. Every rate-dependent constant is then
simultaneously correct against the calibration it was written for, and the vendored tree needs no second patch.
Render block is `N` = **64** (confirmed: `synth.h`, `LG_N 6`, compile-time). The worklet's ring buffer is written in
units of that block, exactly as `rings-worklet.js` does with `RINGS_BLOCK = 24`.

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

**Reading them requires another modification to vendored code — decided 2026-09-10.** (Written when it would
have been the second; by the time it was built at phase 7 it was the fourth, and the last planned one.) Phase 3's pre-flight read
`FmCore::compute` and found there is no seam outside it. The operator kernels write straight into three shared buses
(`buf_`, private to `FmCore`) and into the output buffer, with `add` flags, so each operator's contribution is
overwritten or summed away in place by the next operator. There is nothing to tap from the shim. Two routes were put to
Andrew and he chose the first: **add an optional per-operator tap-output pointer to `FmCore::compute`, null by default
so behaviour is identical when taps are off**, as a second dated `[Parallax modification]` recorded in
`dsp/vendor/msfa/README.md` as re-apply-on-revendor. The rejected alternative was reimplementing the routing in our own
shim, which would fork the 32-algorithm table — the one thing most likely to drift from the engine and make the
flowsheet lie about the signal it is drawing. Nothing is touched before phase 7.

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

### Built 2026-09-12.

The contract above survived contact intact; three things are worth recording.

**The vendored patch is provably transparent.** Patching someone else's render
path is the kind of change that is either exactly right or quietly wrong, so it
is not left to review: `src/audio/fm-taps.test.ts` renders the same note twice,
taps off and taps on, and requires the int16 output to be **bit-for-bit
identical**. The mechanism is that each operator renders into its own tap block
and the merge into the bus is the kernel's own `add` folded out by hand — same
sum, same order. That test is the licence for the patch; if it fails, the patch
is wrong and the tap design is what changes, not the assertion.

**The feedback wire is restated rather than intercepted.** It lives inside
`FmOpKernel::compute_fb`, one level below the method we agreed to patch. Rather
than spend a fifth modification on the kernel, `FmCore::compute` snapshots
`fb_buf` before the call and replays the kernel's own recurrence — the mean of
the two preceding output samples, shifted — from the operator's tapped output.
That is the real signal, computed with the engine's own arithmetic, and it sits
beside the call that produced it. The cost is a coupling: if that recurrence
ever changes upstream, this must change with it, which both README and source
say at the site.

**Taps are exported in panel numbering, not msfa's.** The shim reverses the
order (msfa's index 0 is panel operator 6) so nothing downstream has to remember
it, and `FM_TAP_LABELS` in `FmEngine.ts` is the one place the names live. Slot 7
is the voice output; the test pins it to the sounding carrier precisely because
a mirrored tap order would otherwise be invisible until the diagram was drawn.

**Measured in the browser, not asserted:** 57 snapshot frames per second against
a ~60 Hz target, **zero dropped frames**, and the pool round-trip holding steady
across a sustained note. Turning taps off stops the frames immediately. The
allocation rule holds for the sample data — nothing per sample and no buffers
after the first enable — with one honest exception: `postMessage` needs a message
object, so there is one small short-lived object per frame.

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

### Built 2026-09-12.

**The wiring had to be derived first.** `FM_ALGORITHMS` carried carriers and the
feedback operator, but not who modulates whom — and the vendored flag bytes do
not answer that directly. They say which bus each operator reads and writes; a
wire is not a property of either endpoint. So the generator simulates
`FmCore::compute`'s three-bus machine, `has_contents` rule included, and records
what was on each operator's in-bus when it rendered.

That data is the one thing here that can be wrong invisibly — a wrong wire does
not throw, does not change a sound, and draws a confident picture of a signal
path the engine does not have. It is therefore asserted **against the engine**:
silence one operator and the wiring predicts exactly which other traces change,
because a trace changes iff the silenced operator can reach it along the wires.
32 algorithms × 6 operators, bit-exact, through the taps.

**One trigger for all eight traces.** Found once on the output and reused for
every node. This is the single most important decision in the view: it makes the
frequency ratio readable *as motion* — an operator at exactly 2× stands still
frame after frame, one at 2.01× walks sideways. Triggering each trace on itself
would lock every one of them and throw that away.

**§9's spectrum question, answered both halves.** `Spectrum.svelte`'s axis was
already logarithmic, so that half needed nothing. The half that did: it
aggregates into 56 peak-held bars, and 56 bars cannot separate adjacent
sidebands — the one thing this pane is for. The flowsheet therefore computes its
own FFT (`src/viz/fft.ts`) from the **output tap**, so the two panes are the same
samples rather than two claims about the same signal. Known limit, kept rather
than papered over: at 1024 points the bins are 43 Hz apart, so below ~400 Hz a
log axis stretches few bins across many pixels and the curve is visibly stepped.
That is the real resolution, and smoothing it would imply detail we do not have.

**Scaling, after measuring.** A single carrier peaks around 0.015 of full scale
and its modulator sits ~30 dB under that, so a fixed ±1 scale drew eight flat
lines — honest and useless. The default is per-trace fit, and the level that
hides is printed instead: each node shows its trace's **measured** peak in dB
against the loudest trace, beside the patch's own IDX/VOL byte. Measurement and
intent, side by side. A shared scale is one click away for comparing heights.

**The route is `#view=flowsheet`.** The fragment looked taken by share links, but
`#p=<blob>` is read with `URLSearchParams`, so it was already a key/value space
with one key in use. A real path would need the GitHub Pages 404 trick; a
separate HTML entry would be a full page load, tearing down the AudioContext and
silencing the voice the view exists to show. The instrument stays **mounted**
while the flowsheet is up, off screen — keyboard, MIDI and transport keep
working, and the note keeps sounding.

**Verified live, not asserted.** A carrier at 258 Hz with a ×2 modulator puts
sidebands at 775 and 1292 Hz; driving Brightness 0.5 → 1.0 lifts the first by
11.8 dB and brings the second into view — the textbook prediction, measured
through the wasm, the taps and the FFT. Gating measured the same way: **zero** tap
frames after leaving the view, and zero while the narrow-screen gate is up.

**Still to do on this view**, deliberately not built at phase 8: editing a node's
ratio / level / envelope *in place* (§4.2). The four macros are live here and
drive the diagram, which covers the "turn it and watch" gesture; per-operator
editing needs a patch-override layer the engine does not have yet, and is worth
doing as its own change rather than smuggled into this one.

---

## §5. Theme

**Named 2026-09-11: `graph`.** Andrew's pick from Blueprint / Drafting / Graph — "I lean graphing". `ThemeId`
gains `"graph"`; the skin's display name is **Graph**.

**Decided (locked #4): the FM theme is designed for the diagram surface** — flatter and higher-contrast than the four
instrument-panel skins that precede it. Where Phosphor/Soundboard/Lab/Sandbox are *surfaces of an instrument*, this one
is a *drafting surface*: the flowsheet is the primary thing it has to serve, and knob panels adapt to it rather than
the reverse. Direction only; pixels come from a `frontend-design` pass at implementation. The contract: a 5th `ThemeId`, a token set in `src/ui/themes/tokens.css`,
entries in `ENGINE_THEME` and `THEME_COLOR`, and a row in `contrast.test.ts`.

**Built 2026-09-12.** Cool paper (`#F2F3F5`), white sheets, ruled hairlines, near-black ink — the highest-contrast
text set of the five themes. Two palette rules follow from the flowsheet's job of *labelling* a signal graph:

1. **Every colour here is text-safe on the paper.** Sandbox needs a separate `--signal-ink` because its hot orange
   cannot be read as text; Graph does not, because a diagram labels the thing it colours. `--signal` is Okabe-Ito
   blue `#0072B2` (4.7:1 on `--bg`) and serves as trace, fill and text alike.
2. **Hue is never the only channel.** `--signal` (blue, audio path) and `--accent` (`#B54600`, vermillion, control
   path) are an Okabe-Ito pair chosen for colourblind separation — but §5's rule stands for phase 8: the wires must
   still be told apart by line style and node label, with colour as reinforcement only.

Three departures from the instrument skins, all deliberate: the scope is a **plot, not a screen** — white field,
`--scope-persist: 0` so every frame is a fresh plot with no phosphor smear, `--scope-bloom: 0` because ink does not
glow, and a drawn hairline frame (the other four get their edge for free from a dark screen sunk into a lit panel);
the grain overlay is off and the body is **ruled in 24 px squares** instead, on the body background rather than the
fixed `::after` layer so the squares never cross prose, the staff, or the scope's own graticule; and the corner radii
drop to 1–3 px — drafted, not moulded. Labels are uppercase at 0.06em tracking, the technical-drawing convention.


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

#### Run 2026-09-12 (phase 9).

**The engine-specific clause is automated**, in `src/ui/flowsheet/claims.test.ts`. The corpus already had
`fm-voices.test.ts`, which asserts the prose against real rendered *audio*; what that cannot catch is the prose
disagreeing with the *picture*, because the view reads the patch through `readout.ts`, draws through `trace.ts` and
analyses through `fft.ts` and no corpus test touches any of them. A wrong byte offset or a stale ratio formula would
print a confident number beside a trace doing something else, and every existing test would still pass. So each
assertion has the same shape: **take what the view would display, check it against the signal the view would draw**,
both from the running engine through the committed binary.

The sharpest is the ratio. A node prints `×2` beside a trace; that is a *prediction about the frequency of that
trace*, and it is checked by measuring the trace — interpolated zero crossings, exact for a sine no matter what its
envelope is doing. Eighteen operator traces across the corpus are checked this way, plus the eight ratios the prose
quotes by name. Traces with no single period to read (a wide-open feedback loop, a hard-modulated carrier) are
skipped by a crossing-uniformity test rather than by a hand-written exception list — and they are exactly the traces
whose cards say the pitch is hard to hear.

Also asserted: the `silent` tag matches a flat trace for all 6 × 14 operators; the feedback wire pane draws only
where a loop is actually running; the shared trigger holds a 2:1 modulator still frame after frame while a 1.41:1 one
walks (**the load-bearing claim of the whole view**, and the reason the trigger is shared); and five spectrum claims
including Parallax Bell's missing even harmonics and Feedback Alone's harmonics against One Operator's.

**One prose claim failed and was fixed.** Hollow Reed said its 3:1 modulator put sidebands "three harmonics apart
around the carrier" with "the harmonics in between" staying thin. The pane says otherwise: the lower sidebands fold
back through zero, so f0−3f0 lands on 2f0 and f0−6f0 on 5f0, and harmonics 2 and 5 measure as strong as 4 and 7.
What is actually missing is every **multiple of three** — measured at about −60 dB against −26 to −39 for the rest.
The description now says that, and the test pins it. This is precisely the failure §6.3 was written to catch: a
caption that is the textbook sentence about FM and still contradicts the picture directly under it.

**Also verified live** (§6.2, for this engine): six rapid model switches under playback with no error; engine swap
FM → Rings → Braids → FM with playback running, clean; share-URL round-trip restoring an FM voice from a cold load;
preset save/load round-trip; and the one-loop export path capturing 106 kB of real audio with the FM model code in
the filename.

**The human half, closed by Andrew 2026-09-12.**

- **Ear pass on the corpus — passed.** All fourteen voices listened through.
- **Eye pass on the `graph` theme — passed**, and it had already happened: it is what produced `f3eb1e2`, the
  gridline fix that took the rule from ink at 6 % to 13 %. The "still outstanding" note carried in this spec and in
  `CLAUDE.md` after phase 6 was simply stale.
- **Firefox/Safari (the §6.1 residual) — deferred, and out of this gate.** Andrew's call: it goes to far-deferred
  work, not to the FM ship list. Nothing about the port or the taps waits on it; what it would tell us is whether
  worklet scheduling on two non-target browsers costs more than Chromium's measured 0.055 pp, and the fallback that
  answer might have argued for (SharedArrayBuffer) is already decided against. Recorded below in §9 so it is a
  known gap rather than a forgotten one.

---

## §7. Phasing (ordered, committable)

| # | Phase | Blocked on |
|---|---|---|
| 0 | ~~**Tap spike** (§6.1) against the Rings worklet~~ — **done 2026-09-10, green** | ✅ |
| 1 | ~~Vendor msfa + `LICENSE-msfa.txt` + `NOTICE`; confirm `N` and the rate wiring~~ — **done 2026-09-10** | ✅ |
| 2 | ~~`fm_shim.cc` + `build-fm.ps1` → renders a tone from a hardcoded patch~~ — **done 2026-09-10** | ✅ |
| 3 | ~~`fm-worklet.js` + `FmEngine.ts` + registry entry → plays from the staff, pitch-calibrated~~ — **done 2026-09-10** | ✅ |
| 4 | ~~Macro parameter set (§3) + schema~~ — **done 2026-09-10** | ✅ |
| 5 | ~~Model corpus + Explain prose (own voices, designed by ear)~~ — **done 2026-09-10**, 14 voices | ✅ |
| 6 | ~~The 5th theme (diagram-first)~~ — **done 2026-09-12**, `graph` | ✅ |
| 7 | ~~Tap exports in the shim + the snapshot protocol in the worklet~~ — **done 2026-09-12** | ✅ |
| 8 | ~~Flowsheet view — graph, scopes, spectrum, freeze/slow, interactions~~ — **done 2026-09-12** | ✅ |
| 9 | ~~Ear + eye gate (§6.3), docs, roadmap and `CLAUDE.md` updates~~ — **done 2026-09-12** | ✅ |

With A–C closed and phase 0 green, **nothing in this plan is blocked.** All nine phases are complete as of
2026-09-12, and the human gate (§6.3) is closed. The Firefox/Safari tap pass, once written here as something to run
before the flowsheet shipped, was **deferred by Andrew on 2026-09-12** and is no longer part of this spec's gate —
see §6.3 and §9.

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

**Answered at phase 2 (shim + build, 2026-09-10)** — measured against the built binary, asserted in
`src/audio/fm-wasm.test.ts`:

- ~~Whether the heap contract stays `HEAP16` or widens to `HEAP32`~~ — **`HEAP16` stands.** Measured peak with
  algorithm 32 (six independent carriers, every output level at 99, velocity 127) is 24576 of 32767 = **−2.5 dBFS,
  no clipping**, using msfa's own `>>13`-with-clip conversion. What the measurement *also* showed: a normal
  single-carrier voice lands around **−17 dBFS**, so the engine needs make-up gain — in the engine's `GainNode`, not
  in the DSP. That is a phase-3 level-matching job, not a width problem.
  **Corrected at phase 3:** −17 dBFS is the distance to *full scale*, which is not the loudness question. Measured
  against Rings over identical 2-second windows at C4, the FM boot patch is **−3.9 dB** in attack RMS
  (−27.1 vs −23.2 dBFS) and −2.1 dB over the whole window, with peak level flat within 0.5 dB from MIDI 36 to 84. The
  make-up is therefore a constant **×1.6 (+4.1 dB)**, not the ×7 that −17 dBFS would imply — which would have made FM
  the loudest engine in the app by a wide margin.
- ~~Pitch calibration offset (expect a Rings-style trim)~~ — **no trim needed.** MIDI 48/60/69/84 measure
  130.8 / 261.6 / 440.0 / 1046.5 Hz by zero-crossing rate, dead on. Worth one confirming look at a spectrum in
  phase 3, but there is no offset to apply.

**Answered at phases 3–5 (2026-09-10):**

- ~~Pitch-bend range~~ — **±3 stands.** `fm_set_pitch_bend` clamps to the engine's own range and the worklet's
  `bend` AudioParam declares the same bounds, so nothing pretends to a range it cannot deliver. Widening it would
  mean editing vendored DSP for a control almost nothing in this app drives; not worth it.
- **New, and it shaped the whole corpus: silencing an operator mid-chain breaks the chain.** `FmCore::compute`
  tracks a `has_contents` flag per modulation bus; an operator under the gain threshold whose flags do not say
  "add" marks its output bus *empty*, and a carrier reading an empty bus renders as a bare sine. "Use algorithm 16
  but only turn on operators 1, 2 and 6" therefore gives a sine, silently. Active operators must form a contiguous
  chain. Caught by measurement — the first draft of the noise voice measured identically to the pure-sine voice.
- **New: a voice only gets a live Feedback knob if it sounds its algorithm's feedback operator.** Algorithm 1 puts
  the flag on operator 6; algorithm 2 wires the same two operators but puts it on operator 2. The boot patch moved
  from 1 to 2 for exactly this reason, with no change to the rendered audio.
- **New: algorithms 4 and 6 have no feedback operator at all** in this engine — the hardware loops a *pair* there
  and msfa's own source says "todo: more than one op in a feedback loop". Asserted in `fm-macros.test.ts`.
- **New: `Dx7Note::init` does not clear `fb_buf_`**, so a voice with feedback running is not bit-identical across
  consecutive note-ons until the loop settles. Harmless for playing; it matters when writing sample-exact tests.
- **Macro timing is the one open ergonomic question** — see "Still open" below.

- ~~Whether macro knobs should reach the note that is already sounding~~ — **yes, decided 2026-09-11 and built.**
  `Env::update` and `Dx7Note::update` are additive local modifications to the vendored engine (patches 2 and 3 of
  three; see `dsp/vendor/msfa/README.md`), implementing the `// TODO: parameter changes` that `dx7note.h` has
  carried since 2012. They re-aim running envelopes instead of restarting them. The load-bearing detail: re-aiming
  alone is *not enough* — `advance()` folds `outlevel_` into the target linearly, so the level only moves at the
  current stage's rate, and on a held note parked at stage 3 `getsample()` does not integrate at all. Measured
  before the fix: raising a modulator's level mid-note barely moved the spectrum and lowering it was bit-identical
  to doing nothing. `Env::update` therefore also shifts `level_` by the change in `outlevel`. Verified live on one
  held note: spectral centroid 649 Hz → 1316 Hz turning Brightness up, → 483 Hz turning it down.

**Still open:**

- **Firefox/Safari tap measurements (§6.1's second half) — deferred 2026-09-12, far-deferred work.** The spike ran
  on Chromium only. Known gap, deliberately carried: worklet scheduling differs between engines, so the 0.055 pp
  tap cost is a Chromium number and nothing more. It is cheap to close whenever someone has those browsers in front
  of them — the spike procedure in §6.1 is still valid — but it gates nothing, because the fallback it might have
  motivated is already decided against.


- ~~Whether the flowsheet's spectrum pane reuses `Spectrum.svelte` unmodified or needs a log-frequency axis~~ —
  **answered at phase 8, and the guess was half right.** That component's axis is *already* logarithmic. The real
  problem was resolution: it aggregates into 56 peak-held bars, which cannot separate adjacent sidebands. The
  flowsheet computes its own FFT from the output tap instead, so the trace and the spectrum are the same samples.
  See §4.
- **New, from phase 8:** per-operator in-place editing (§4.2) is not built. The four macros are live in the view, so
  "turn it and watch which traces move" works; editing one operator's ratio or level needs a patch-override layer
  the engine does not have (it rebuilds from `FM_PATCHES[i]` plus macro positions). Worth its own change.
- ~~Whether `log2.{cc,h}` earns its place~~ — **dropped at phase 9.** Still unused when the port finished, so it
  went. The check that made this safe rather than merely tidy: rebuilding `public/fm.wasm` without it produced a
  **byte-identical binary**, which proves it was being dead-stripped and that nothing reachable ever called it. This
  set only ever *decodes* log-frequency, through `Freqlut`; if something later needs an encoder, take it from
  upstream at the pinned revision rather than reinventing it.
