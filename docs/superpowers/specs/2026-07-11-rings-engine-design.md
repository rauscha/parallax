# Rings — engine #4 (design spec)

**Created:** 2026-07-11 · **Status:** approved for planning · **Type:** comprehensive design (one spec, all of it)
**Owner:** autonomous Claude session · **Follows:** the brainstorming approval on 2026-07-11.

This is the v1.2 marquee from `reviews/2026-06-11-next-level-ideas.md` §3.1 — un-defer "more engines" and make the third
WASM port **Rings**, Émilie Gillet's resonator. It is the first engine that adds a *category* (resonant physical
modeling) nothing else in Parallax covers, and — because theme-follows-engine — the first that must author a brand-new
4th theme.

Andrew chose **one comprehensive spec covering the whole port** (DSP + engine + full model corpus + theme + feature
integration), not an incremental first-slice. The port is still *implemented* in ordered, committable phases (§6) so the
implementation plan stays coherent, but the spec scope is the entire engine.

## Why this is more tractable than the "3–5 week / L" estimate implies

The Plaits-port survey (freshest template) found that **every cross-cutting system is engine-agnostic** — `bindings.ts`,
`serialization.ts`, `share-url.ts`, `persistence.ts`, `surprise.ts`, `undo.ts`, `lineage.ts`, and all UI pickers/panels
read everything through `src/audio/registry.ts`. So "feature integration" is almost free: Rings inherits the engine
picker, model picker, Explain panel, share links, presets, undo, lineage, Surprise, and Match the moment it is
registered. The genuinely new work is: the DSP shim + worklet, the engine class, the model/Explain corpus, and — the one
thing no prior engine needed — **a 4th theme**.

---

## Locked decisions (from the 2026-07-11 brainstorm — do not re-litigate)

1. **Scope:** one comprehensive spec, whole port.
2. **Model scope:** the **full** resonator set **including the hidden/"disastrous peace" modes** — the string-reverb
   Easter mode is a separate DSP path (`rings::StringSynthPart`), and it's in.
3. **Excitation model:** **note-driven with Rings' internal exciter.** `noteOn` sets the resonator frequency and fires a
   strum/trigger (mallet/noise burst) into the internal exciter; `noteOff` lets it ring out its physical decay. **Internal
   polyphony pinned to 1** (mono is locked). **No external audio input** — this keeps the note-in/audio-out engine
   contract and honors the locked "no insert-FX / no audio-in voice path" rule.
4. **Theme:** **"Soundboard"** — warm-dark acoustic-resonator identity (walnut/espresso surfaces, brass-amber signal,
   parchment-ivory text, serif headings over the existing sans, scope trace = warm amber sustain-bloom rendered as a
   **luminance-graded shimmer**). Pixels are produced by a `frontend-design` pass at implementation; this spec records the
   direction, the token contract, and the constraints, not hex values.
5. **Naming/attribution:** engine display name **"Rings"** = factual attribution, matching the Braids/Plaits precedent.
   Never brand the *product* as Mutable Instruments / Rings. MIT headers stay intact.

---

## §1. Architecture — how a note becomes sound

Same proven scaffold as the Braids (96 kHz) and Plaits (48 kHz) ports. **Rings renders natively at 48 kHz**; a
`public/rings-worklet.js` (cloned from `plaits-worklet.js`) resamples 48 k → AudioContext rate via a ring buffer +
linear interpolation. Exact native block size is taken from Rings' `dsp.h` constants at implementation.

**DSP shim — `dsp/shim/rings_shim.cc`** (global-instance pattern like `plaits_shim.cc`):
- Holds **two** DSP objects because the full model set is in scope:
  - `rings::Part` — the resonator: all normal resonator models, driven by its built-in exciter.
  - `rings::StringSynthPart` — the "disastrous peace" string-synth/reverb Easter mode.
  - The active model selects which object renders each block; only one is live at a time.
- `extern "C"` exports mirror the Plaits shim: `rings_init(seed)`, `rings_alloc(n)`, `rings_free(ptr)`,
  `rings_render(out, n)`, plus param setters `rings_set_frequency/structure/brightness/damping/position(float)`,
  `rings_set_model(int)`, and a strum/gate input (`rings_set_strum` / `rings_set_gate`). All `EMSCRIPTEN_KEEPALIVE`.
- Rings emits a **stereo pair** (odd/even resonator outputs). We **sum to mono** (mono is locked); the shim writes a
  single int16 stream to the heap buffer the worklet reads via `Module.HEAP16`.
- Header comment documents the exciter/gate model the way `plaits_shim.cc:1-26` does.

**Worklet — `public/rings-worklet.js`** (plain JS, outside the Vite bundle; clone of `plaits-worklet.js`):
- 48 kHz ring buffer + linear resampler (`srcRatio = 48000 / sampleRate`), lazily rendering one native block when the
  ring drains — identical to the Plaits/Braids pattern.
- k-rate macro params via `parameterDescriptors` where it helps; everything else over `this.port`.
- Gate model: `gateOn`/`gateOff` messages carry an audio `time`; a note-on manufactures the strum edge the internal
  exciter needs. `dispose` frees the heap buffer and returns `false` from `process`.

**Engine class — `src/audio/engines/RingsEngine.ts`** implements `ISynthEngine` exactly like `PlaitsEngine`:
`manifest` (id `"rings"`, polyphony 1, `producesAudio: true`, `supportsPitchBend: true`, `modelEnumerable: true`),
`init(ctx)` (worklet `addModule` at `BASE_URL + "rings-worklet.js"`, main-thread wasm fetch with `AbortController` +
timeout, `ready`/`error` port handshake, master `GainNode`), `noteOn/noteOff/allNotesOff`, `setPitchBend`,
`getParameterSchema/setParameter/getParameter`, `dispose`.

**Vendoring — `dsp/vendor/rings/`:** vendor Rings' own `dsp/` subtree (`part`, `string_synth_part`, `resonator`,
`string`, `dsp.h`, etc.) plus its `resources.{cc,h}` (LUTs). `stmlib/` is already vendored from the Plaits port and is
reused. Keep Émilie Gillet's MIT header on every file.

**Build — `dsp/shim/build-rings.ps1`** (clone of `build-plaits.ps1`): `EXPORT_NAME=createRingsModule`,
`EXPORTED_FUNCTIONS` = the `_rings_*` set + `_malloc`/`_free`, sources glob over `dsp\vendor\rings` + the shim + the
shared `stmlib` sources, output to `dsp/build/rings.{js,wasm}` then copied to `public/rings.{js,wasm}`. Keep
`INITIAL_MEMORY=16MB` (safe headroom; tune down only if measured). Add a `"wasm:rings"` script to `package.json`.
> Note: `dsp/shim/` is PowerShell-only today (no `build.sh`). Cross-platform `.sh` companions are **out of scope** here
> (flagged as a standing nice-to-have in the review); do not add them unless separately requested.

## §2. Parameters & the model corpus

**Parameter schema** (`getParameterSchema`) — Rings' four macros are the knob axis:

| id | label | type | apply | notes |
|----|-------|------|-------|-------|
| `model` | Model | discrete | message | selects resonator model (and Part vs StringSynthPart) |
| `structure` | Structure | continuous 0–1 | audioparam | per-model meaning |
| `brightness` | Brightness | continuous 0–1 | audioparam | per-model meaning |
| `damping` | Damping | continuous 0–1 | audioparam | per-model meaning |
| `position` | Position | continuous 0–1 | audioparam | per-model meaning |
| `gain` | Level | continuous | audioparam | master `GainNode` |

Frequency is driven by the incoming note (+ held pitch-bend), not a knob card. Param `group` strings: if Rings
introduces a new group (e.g. `resonator`), add a matching `GROUP_LABELS` entry in `ParamPanel.svelte`.

**Models** — authored **directly** as `RINGS_MODELS: EngineModel[]` + `RINGS_FAMILIES: EngineFamily[]` in
`src/data/rings-models.ts` (no adapter, like Plaits). The exact model enum and their indices are **pinned from the
vendored `rings/dsp/part.cc`** (ground truth) during implementation — expected to be the modal resonator, sympathetic
strings, modulated/inharmonic string, FM voice, quantized sympathetic strings, and the string-reverb Easter mode, grouped
into families (e.g. Modal / Strings / Sympathetic / Alt). **Verify the concrete list from source before authoring prose.**

**Explain corpus** — the product soul. Each model gets `description` + `detail: { listenFor, goodFor }` + the four
macro-card meanings (`knobs[]`, one per Structure/Brightness/Damping/Position), in the conversational voice and at the
depth of the 47-model Braids and 24-model Plaits catalogues. Each `knobs[].id` must equal a `getParameterSchema()` id so
the knob↔Explain-card highlight links up. Protect teaching honesty: the prose describes what Rings *actually* does per
model, verified against the firmware behavior.

## §3. Theme — "Soundboard" (brief + contract; pixels at implementation)

**Direction:** the warm wooden body of a physical resonator — a piano soundboard, a lute. Walnut/espresso surfaces,
brass-amber signal, parchment-ivory text; serif headings over the existing self-hosted sans; the oscilloscope trace glows
warm amber with a long **sustain-bloom** whose intensity is encoded in **luminance** (a viridis/magma-style brightness
ramp), echoing Rings' resonant decay. Warmth is what separates it hard from phosphor's cold green; restraint is what
separates it from sandbox's playful saturation.

**Token contract** — add one `[data-theme="rings"] { … }` block to `src/ui/themes/tokens.css` filling the full token
set (mirroring the `sandbox` block): surface tier (`--bg, --surface, --surface-raised, --surface-sunken, --hairline,
--hairline-soft`), text (`--text, --text-muted, --text-dim`), signal (`--signal, --signal-ink, --signal-dim,
--signal-deep, --signal-glow, --accent, --accent-dim, --on-signal, --danger`), scope (`--scope-bg, --scope-trace,
--scope-trace-w, --scope-glow, --scope-grid, --scope-persist, --scope-bloom`), knob (`--knob-track, --knob-fill,
--knob-pointer, --knob-tick`), label case (`--label-case, --label-tracking`), and `color-scheme: dark`. Then 3 edits to
`src/state/theme.ts`: extend `ThemeId`, add `rings: "rings"` to `ENGINE_THEME`, add the mobile status-bar hex to
`THEME_COLOR`. Application is automatic (`apply()` subscribes to the engine store; `themeForEngine()` falls back to
phosphor).

**Fonts:** reuse the three self-hosted families (Inter, JetBrains Mono, Space Grotesk). If the serif heading calls for a
*new* typeface, add it to `src/ui/themes/fonts.ts` **and** drop the woff2 in `public/fonts/` (Workbox precaches
`fonts/*.woff2`) — otherwise it won't precache and offline/PWA breaks.

**Accessibility (first-class — Andrew is colorblind):** identity is carried by **brightness and material, never hue
alone**. No color-alone meaning; **no meaningful translucent color** (translucent orange especially is invisible to him);
text meets **WCAG AA ≥ 4.5:1** on `--bg`, verified programmatically at build. The scope shimmer must read as brightness,
not just a hue shift.

**Process:** the concrete palette is produced by a `frontend-design` pass at implementation time; this spec is the brief
it works against. Loop: brief → design pass (candidate tokens) → integrate into `tokens.css`/`theme.ts` → verify in the
browser (AA contrast, colorblind luminance, mobile status-bar, scope trace).

## §4. Feature integration & licensing

**Inherited free through the registry** (verified engine-agnostic — no per-engine edits): `EnginePicker`,
`ModelPicker`, `ExplainPanel`, `ParamPanel`, `bindings.ts`, `serialization.ts`, `share-url.ts`, `persistence.ts`,
`undo.ts`, `lineage.ts`, `surprise.ts`, and Match. The registry entry in `src/audio/registry.ts` (import `RingsEngine` +
`RINGS_MODELS`/`RINGS_FAMILIES`, push a 4th `ENGINES` element) is the only wiring.

**The only tuning:** Surprise's Rings parameter ranges/weights, so random rolls land on musical resonator settings
(e.g. sensible Structure/Damping/Position windows per family). Match ranking for Rings suggestions is optional polish, not
required for this spec.

**Licensing / trademark:**
- Keep Émilie Gillet's MIT copyright header on every vendored file.
- Edit `LICENSE-Braids.txt`: add the `dsp/vendor/rings/` directory line, keep the "DSP core only" scope note, add a
  factual "Rings" trademark sentence (matching the Plaits edit).
- Add `dsp/PROVENANCE.md` SHA-256 rows for `rings.wasm`, `rings.js`, and `rings-worklet.js`.
- Engine display name "Rings" is factual attribution only; the product remains "Parallax."

## §5. Testing & verification

- **Node unit tests** (pure, no Tone/DOM — the parts that can be tested headless):
  - Model-catalogue integrity: every `knobs[].id` resolves to a `getParameterSchema()` id; every model has a family;
    families cover all models; codes are unique.
  - Any pure param-mapping/normalization helper extracted from `RingsEngine`.
- **Build & provenance:** run `build-rings.ps1`, commit `public/rings.{wasm,js}` (un-gitignored like the others so CI
  ships them without an Emscripten toolchain), add provenance rows.
- **Browser gate (human ear + eye — the export-style human-only pass):** select Rings → hear resonant physical-modeling
  voices; switch across all models incl. the string-reverb Easter mode; confirm notes ring out their physical decay with
  no clicks/pops; confirm the Soundboard theme loads on engine-select; run the AA-contrast + colorblind-luminance checks;
  confirm the mobile status-bar color and the scope-trace shimmer. This is the ship gate, like the audio export.

## §6. Phasing (one spec, ordered committable phases)

Each phase ends at a clean commit; the whole is one spec.

- **P1 — DSP:** vendor `dsp/vendor/rings/`, write `rings_shim.cc` + `build-rings.ps1` + `wasm:rings`, clone
  `rings-worklet.js`. Exit: renders sound in isolation (a harness note strikes and rings).
- **P2 — Engine + registry:** `RingsEngine.ts` + registry entry + a **minimal** `rings-models.ts` (correct enum,
  placeholder prose). Exit: select Rings in-app, play notes, switch models — audible on a temporary reused theme.
- **P3 — Corpus:** full `RINGS_MODELS`/`RINGS_FAMILIES` + complete Explain prose (description, listenFor/goodFor, four
  macro cards per model). Exit: Explain panel is honest and complete for every model.
- **P4 — Theme:** `frontend-design` pass → the Soundboard `[data-theme="rings"]` token block + `theme.ts` edits (+ font
  work only if a new face is chosen). Exit: AA + colorblind + mobile-status-bar + scope-shimmer verified in-browser.
- **P5 — Integration & polish:** Surprise Rings-range tuning; `LICENSE-Braids.txt` + `PROVENANCE.md`; final ear/eye gate.
  Exit: shippable engine #4.

---

## File checklist (from the Plaits-port survey)

**Create:**
- `dsp/vendor/rings/…` — Rings DSP core + `resources.{cc,h}` (MIT headers intact; `stmlib` already vendored).
- `dsp/shim/rings_shim.cc` — shim around `rings::Part` + `rings::StringSynthPart`.
- `dsp/shim/build-rings.ps1` — clone of `build-plaits.ps1`.
- `public/rings-worklet.js` — clone of `plaits-worklet.js` (48 k ring buffer + resampler + strum/gate).
- `src/audio/engines/RingsEngine.ts` — `implements ISynthEngine`.
- `src/data/rings-models.ts` — `RINGS_MODELS` + `RINGS_FAMILIES`.
- `public/rings.js` + `public/rings.wasm` — committed build artifacts.
- Test file(s) for catalogue integrity + any pure helper.
- (Conditional) a new woff2 in `public/fonts/` only if the theme adds a typeface.

**Modify:**
- `package.json` — add `"wasm:rings"`.
- `src/audio/registry.ts` — import + push the 4th `ENGINES` entry.
- `src/state/theme.ts` — `ThemeId`, `ENGINE_THEME`, `THEME_COLOR` (3 edits).
- `src/ui/themes/tokens.css` — add `[data-theme="rings"]` token block.
- `src/ui/themes/fonts.ts` — only if a new typeface is used.
- `src/ui/ParamPanel.svelte` — `GROUP_LABELS` entry only if Rings adds a new param group.
- `src/state/surprise.ts` (or its data) — Rings parameter ranges for Surprise. *(This is the one "engine-agnostic"
  file that gets a tuning touch; behavior is generic but the value ranges are per-engine.)*
- `LICENSE-Braids.txt` — add rings dir + trademark line.
- `dsp/PROVENANCE.md` — SHA-256 rows for the three new artifacts.

**Do NOT need edits** (engine-agnostic via the registry): `bindings.ts`, `serialization.ts`, `share-url.ts`,
`persistence.ts`, `undo.ts`, `lineage.ts`, `AudioEngine.ts`, `suggest.ts`, and all UI pickers/panels except the two
conditional cases above.

## Open items pinned to implementation (not blockers — resolved from source/at build)

- Exact Rings model enum + indices, and the precise per-model meaning of Structure/Brightness/Damping/Position — read
  from `rings/dsp/part.cc` / the model implementations before authoring the corpus.
- Native block size and stereo-sum details — from Rings' `dsp.h`.
- Whether the internal exciter alone is loud/characterful enough note-driven, or needs a small fixed excitation shaping —
  tuned by ear in P1/P2 (the strum trigger is the knob).
- Final `INITIAL_MEMORY` — start at 16 MB, measure, trim if safe.
