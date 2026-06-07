# Parallax — running next steps

The single prioritized backlog. `.handoff/SESSION-HANDOFF.md` is the per-session digest; **this file persists across sessions**. Full architecture/roadmap spec: `~/.claude/plans/ok-we-re-in-planning-tingly-pike.md`. Full diagnostic detail behind the "Now" items: `reviews/2026-05-31-deep-review.md` (§ refs below point into it).

Last reconciled: 2026-06-06 (desktop · crane-desk — knob ↔ Explain-card highlight shipped (`751d4b6`) + mobile-grid `1fr`-collapse fix (`d5cee18`); grace-note user-confirmed gone. Added the post-v1 "engine library" vision (Plaits/Edges + other open-source voices) under Later. Earlier the same day: Explain richer-text to all 47 models, scope row shrunk, grace-note REAL fix `0029ccb` (gain ramp opening early). All ✓ + pushed; visual paint of the highlight + the mobile grid awaiting user eye-confirm on the live site.

## Now — Polish + M4

### 🐞 Grace-note on playback — REAL FIX `0029ccb` 2026-06-06 (gain ramp), awaiting user ear-confirm
**Symptom:** a quick grace note of the *wrong* pitch led into the first programmed note on play. User nailed the tell: the grace pitch = **whatever note last sounded** (A4 from the TapToStart blip on the very first play; otherwise the note you stopped on — stop an arp on G → "fractional G" before the C; stop on E → quick E). ~60 ms long → clearly a pitch, not a click.

**Root cause = the GAIN envelope, not the strike.** Diagnosed by capturing post-gain audio in the harness (ScriptProcessor tap) + worklet telemetry, on the same clock:
- The pitch param (stepped `setValueAtTime(newPitch, t)`) and the strike both land *exactly* at the note's scheduled time `t`. ✓
- But the audio *opened ~50 ms before `t`*, playing the lingering previous pitch for ~60 ms, then snapping to the new pitch at `t`.
- Why: `noteOn` opened the gate with `cancelAndHold(g,t)` then `linearRampToValueAtTime(target, t+attack)`. When the most recent gain event is in the **past** (the release ramp from the previous stop/noteOff), `linearRampToValueAtTime` interpolates the attack **from that stale past event**, so the gate starts rising well before `t` — uncovering the pitch still sitting in the (correctly-scheduled-for-`t`) param. Pitch waits for `t`; the gain ramp didn't.

**Fix (`0029ccb`, JS-only, no WASM):** pin the attack ramp's start to `t` with an explicit `g.setValueAtTime(g.value, t)` before the `linearRampToValueAtTime`. Volume and pitch now open together. **Verified by audio capture:** replay onset reads 262 Hz (C) immediately, zero leak — both the stop-mid-arp case (was 60 ms of the held pitch) and the cold-first-note case (was A4).

**The two earlier passes (`3b45652` strike-timing, `d3a81da` strike-carries-pitch) were NOT the fix** for this symptom — they corrected a real but sub-3 ms strike race. **Keep them**: they're still needed, especially for drums, whose one-shot AD envelope must not start decaying ~90 ms before the gate opens (an early strike would leave only the tail audible). So the strike now fires at `t` *and* the gate opens at `t` — both required.

**Open item:** user ear-confirm on the live site (can't ear-test from the harness). No service worker is wired up (vite-plugin-pwa is installed but NOT in `vite.config.ts` — PWA is deferred M5 work), so there's **no stale-cache layer**: a normal refresh gets the new build.

*Possible future polish (only if a faint onset click is reported): move the amplitude gate into the worklet so gain/pitch/strike are all quantum-aligned in one render path.*

### Explain panel (M4) — ACTIVE
Baseline per-model TIMBRE/COLOR text panel shipped (`f9f06df`). User approved it and picked **three** depth directions to build (animated mini-diagrams **skipped** for v1):
1. **Richer per-model text — ✓ DONE 2026-06-06 (`d666c14`).** `detail` field on `BraidsModel` is now `{ listenFor, goodFor }`; `ExplainPanel.svelte` renders the two as labeled lines under the description (left rule kept). **All 47 models** carry detail (user chose full coverage incl. osc-stacks), in the agreed conversational, action-oriented voice; the 4 original exemplars (FM/WTFM/VOWL/WMAP) were converted to the split layout. Drum text matches the engine: KICK/SNAR/CYMB/DRUM = one-shots that ring out, PLUK/BELL = self-decaying. Type-check clean, browser-verified (CSAW + FM).
2. **Knob ↔ card highlight — ✓ DONE 2026-06-06 (`751d4b6`).** Touching/focusing/dragging a knob lights its matching Explain card and vice-versa, via a shared `activeParamStore` (atom in `state/stores.ts`). The Knob publishes on the hover/focus/drag union + self-highlights (`--signal` ring + `--signal-glow`); the Timbre/Color cards mirror it both ways (`--signal-deep` wash, the selected-row colour). Drag is in the union deliberately so the link still works on touch (no hover there). Logic + CSS verified in the harness (both directions, clean teardown, type-check clean); the actual pixel paint is pending a live eye-confirm — the preview screenshot renderer was wedged this session (timed out, and computed-colour readback was unreliable).
3. **"Show me" sweep** — a per-knob button that sweeps TIMBRE/COLOR live so you hear what it does on the current model; animates the engine param over a few seconds + moves the knob; must handle interrupt/restore.

**Grid G0–G4 is shipped** (`5f35124`, 2026-06-04). Pitch-row × step-column grid surface lives behind a Staff/Grid toggle in the Sequencer section. Both surfaces write the same `melodyStore`. Next priorities:

### Grid follow-up polish (small) — ALL DONE 2026-06-04
- [x] **Keyboard nav in grid** — arrow cursor + Space/Enter toggle, Delete removes; follows bar pages; syncs with tap. (`930b3c8`)
- [x] **Swipe between bars** — swipe on the bar-tab strip + pitch-label gutter (kept off the cells, which own note drag-extend). (`5173d21`)
- [x] **Desktop shows 2 bars** — ≥560px panel shows 32 cols with a bar divider; narrower stays at 1 bar. (`5173d21`)

### G5 — Per-step expression (pairs with M4)
Extend `MelodyEvent` with optional per-step params: TIMBRE/COLOR p-locks, slide, accent, ratchet, probability. Long-press (mobile) / modifier-click (desktop) → contextual sheet. Wire into M4's `AD_VCA/TIMBRE/COLOR/FM` amounts. **Do not extend MelodyEvent before this milestone.**

## Later — M4

The active M4 work (Explain panel depth) is under **Now** above. Remaining/related:
- [x] **Per-model AD envelopes wired** ✓ 2026-06-06 (`0419ccd`) — `data/braids-envelopes.ts` table → `BraidsEngine.applyEnvelope()` on `setShape`. Scoped to the 4 unpitched drums as one-shots (`letRing`); PLUK/BELL excluded (self-decay + paraphonic). Values clamped to firmware ranges (attack/decay 0–15, vca 0–1, depths 0–15). **Don't re-enable PLUK/BELL one-shots without re-testing** — that caused discordant overlaps.
- Animated mini-diagrams for the Explain panel — **skipped for v1** (user's call).
- Per-step macro locks tie into grid **G5** below (extend `MelodyEvent` there, not before).

## Soon (small follow-ups + hygiene)
- [x] **CI: Pages actions bumped to Node-24 majors** ✓ 2026-06-06 (`40ea94c`) — ahead of GitHub's 2026-06-16 forced upgrade; deprecation warning gone.
- [x] **First-note spacing** ✓ 2026-06-04 (`0d899e7`) — noteheads now sit a lead-in right of the barline.
- [x] **Key signatures on the staff** ✓ 2026-06-04 (`0d899e7`) — drawn once after the clef; in-key notes no longer repeat the accidental. *(No intra-bar accidental memory yet — rarely visible, noted for later.)*
- [ ] **"Drag past the end → wrap-around" UI.** Wrap is supported in the data model (`part.ts`), but the drag UI clips at the loop end. A future polish could let users explicitly wrap a long legato across the boundary.
- [x] Security hardening: CSP via `<meta http-equiv>` ✓ 2026-06-04 (`fa8ae42`, build-only inject) + fixed `npm run preview` base. *(`dist/` gitignored ✓; dead `public/icons.svg` deleted ✓ 2026-06-01; Bravura self-hosted ✓ 2026-06-02.)* Remaining: optional git-secrets hook; clickjacking (`frame-ancestors`) needs HTTP headers GH Pages can't set.
- [x] Smaller bugs ✓ 2026-06-04 (`98823ed`): pitch-bend re-baseline, future-note "panic", octave-shift-while-held strand all fixed. *(Init-failure leak ✓ + scope clamp ✓ both 2026-06-01.)*

## Later milestones (per plan file)
- **M3** — Sequencer + clickable 4-bar/4-4 staff (Tone.Transport/Part, custom SVG notation, snap-to-scale, playhead + loop).
- **M4** — Explain panel (per-model timbre/color text + animated mini-diagrams + knob↔card highlight + "show me" sweep). **Also wire per-model `AD_VCA/TIMBRE/COLOR/FM` amounts** at noteOn via the new shim setters (plumbing landed 2026-06-01; amounts default to 0 today). Percussion/pluck/bell models need it; sustained tones must stay at 0.
- **M5** — v1 finish: MIDI file import/export · shareable URL links (lz-string→hash) · presets (idb-keyval) · PWA install/offline · mobile pass · finalize all 3 themes · delight (patch postcard).
- **M6 (optional)** — 2nd engine (Plaits / Web-MIDI-out) to prove hot-swap.

## Future — engine library (post-v1, big picture)
The `ISynthEngine` interface is hot-swappable by design (everything routes as MIDI note numbers; Braids-specific code is confined to `engines/braids/` + `data/braids-*`). Once M6 proves the swap with a second engine, grow it into a small **library of voices** the user can pick between. Captured here so the vision isn't lost; not scheduled, not before v1 ships.

**Licensing is the gating constraint.** Parallax ships MIT. Bundling a GPL voice into the shipped app is a relicensing problem, so prefer permissive (MIT/BSD/Apache) sources. Keep Émilie Gillet's MIT notice in every ported MI file (per the trademark/licensing rule in CLAUDE.md) and never brand the product with a module's name — factual attribution only.

1. **More Mutable Instruments modules (the easy wins — already MIT, already in the vendored `pichenettes/eurorack` tree).** Same toolchain as Braids (Émilie Gillet's C++ → Emscripten → WASM-in-worklet), so each is mostly a new shim + `engines/<name>/` + `data/<name>-*`:
   - **Plaits** — the spiritual successor to Braids: 16 synthesis models (analog/wavetable/FM/granular/physical/noise/drums), two macro controls (HARMONICS/TIMBRE/MORPH). The natural flagship 2nd engine for M6; richest payoff per unit work.
   - **Edges** — quad digital chiptune oscillator (square/NES-style). Small, fun, very different character from Braids.
   - **Others worth a look** (voices/oscillators specifically, not the utility/sequencer modules): **Rings** (modal/string resonator), **Elements** (modal/physical-modelling voice), **Warps** (wavefolder/cross-modulation/vocoder), **Tides** (function generator usable as a voice). Skip the non-voice modules (Marbles random source, Grids drum sequencer, Stages segment gen) unless a feature specifically needs them.
2. **Other open-source synth voices (WASM-compilable) — vet the licence first.**
   - Permissive-friendly: **Faust** DSP (export many synths/instruments; MIT-ish), **STK** (Synthesis ToolKit, permissive), classic FM/DX-style or PD/Csound-derived voices where the licence allows.
   - GPL — usable only if we never bundle into the MIT app (or accept relicensing): **Dexed**/DX7 FM, **Surge XT**, **Vital/Vitalium**, **Odin 2**. Note them, don't ship them under MIT.
   - **Web Audio Modules (WAM v2)** as a possible plug-in host path if we ever want third-party voices without vendoring each one.
3. **UX once there's more than one engine:** an engine picker alongside the model picker; per-engine parameter schema + Explain text already fall out of the existing schema-driven UI (`ParamPanel`/`ExplainPanel` read the live engine's schema, so they adapt for free). `engineIdStore` + the patch `engineId` field already exist for this; share-URLs/presets carry it.

## Deferred (do not quietly add)
Polyphony · Web MIDI input · audio recording/export · insert FX · Plaits / 2nd engine (until M6).

## Done recently
- **2026-06-06 (desktop · crane-desk — Explain rollout + scope + grace-note fix):**
  - `0029ccb` fix(audio): grace-note **REAL FIX** — the bug was the GAIN ramp opening ~50 ms before the note's time `t` (linearRamp interpolating from a stale past gain event), uncovering the lingering previous pitch. Pinned the ramp start to `t` via explicit `setValueAtTime`. Diagnosed + verified by post-gain audio capture in the harness. See the "Now" entry.
  - `d3a81da` / `3b45652` fix(audio): two earlier passes (strike-carries-pitch / strike-timing). Correct and kept (needed for drums), but they fixed a sub-3 ms strike race, NOT the audible grace note.
  - `6661ff2` ui: shrink scope row, give the height to the Explain panel (scope ~35%→27%, Explain ~25%→34%).
  - `d666c14` / `427e74d` Explain richer text: `BraidsModel.detail` → `{ listenFor, goodFor }`, rendered as labeled lines; all 47 models covered in the agreed conversational voice.
- **2026-06-06 (desktop · crane-desk — earlier session):** Resolved all three parked decisions; four commits, all pushed + deployed green to andrewrausch.com/parallax/.
  - `0419ccd` M4: per-model AD envelopes — drum one-shots (`letRing`), pitched models self-decay. New `data/braids-envelopes.ts`; `BraidsEngine.applyEnvelope()` clamps to firmware ranges. First pass forced AD VCA + gate-open on 6 models; user ear-test flagged PLUK/BELL as discordant → root-caused (PLUK paraphonic in firmware, both self-decay) → scoped one-shots to the 4 unpitched drums and excluded PLUK/BELL. User keeping decay tuning as-is.
  - `40ea94c` ci: bump Pages workflow actions to Node 24 majors (checkout@v6, setup-node@v6, upload-pages-artifact@v5, deploy-pages@v5) — clears the Node-20 deprecation. (Came from a spawned-task branch, fast-forwarded into main, branch deleted.)
  - `6c60de2` fix: sequencer hidden on mobile — the fixed-viewport layout clipped the bottom (staff/grid) region off-screen. Mobile (<=720px) now scrolls the grid between a pinned top bar + transport; regions size to content (`overflow:visible`) so Controls/Explain don't collapse. Verified at 375px via preview harness (both surfaces render). Desktop untouched.
  - `66416ed` Explain panel: deeper per-model text — optional `detail` field, 4 exemplars (FM/WTFM/VOWL/WMAP). WIP, see "Now". 
- **2026-06-04 (desktop · crane-desk — overnight "go big" run):** Eight tasks shipped, each committed + pushed. Plain-language write-up: `.handoff/OVERNIGHT-LOG-2026-06-04.md`. Three decisions parked for the user in `PENDING-DECISIONS.md` (M4 AD amounts, M4 visuals, staff-lines-under-clef confirm).
  - `f9f06df` M4 groundwork: Explain panel (per-model TIMBRE/COLOR data/text layer)
  - `98823ed` Fix three small audio bugs: octave-strand, pitch-bend, panic
  - `fa8ae42` Security: production CSP via meta tag + fix npm run preview base
  - `0d899e7` Staff: key signatures + first-note breathing room
  - `5173d21` Grid: swipe between bars + responsive 2-bar desktop view
  - `930b3c8` Grid: keyboard navigation — arrow cursor + Space toggle
- **2026-06-04 (desktop · crane-desk — M3 tag + grid sequencer planning):** Tagged `v0.4.0-m3` and pushed (M3 closed). Resolved the staff-vs-grid fork via two research streams (codebase reuse map + hardware/web sequencer survey) → `docs/grid-sequencer-plan.md`. Decisions: **coexist behind a toggle** (grid is a new surface alongside the staff; both write `melodyStore`) and **build scope G0–G4** (MVP + delight; per-step expression deferred to G5 with M4). Layout: pitch-row × time-column ("Song Maker" style), fold-to-scale rows. Planned in Opus; build in Sonnet. Also logged the beat-1-too-tight-to-barline cosmetic nit.
  - `845f0d7` docs: grid sequencer design + build plan (G0–G4)
- **2026-06-03 (desktop, evening — M3 polish round + click-placement fix):** Closed out two rounds of user-feedback on M3.
  - **Polish round (`59afb68`)** — fixed the staff after "kinda garbage" feedback: time-sig glyph alignment (Bravura digits have centered baselines, not bottom — was 1 SP too low); actual monophonic 4/4 placement with trim-previous-on-overlap and drag-extend clamped to next note's start; accidentals + rest tool (sticky toolbar ♮/♯/♭/𝄽); auto-rendered rests in silent gaps (classically aligned — whole rests on bar boundaries, half rests on bar halves, etc.); octave shift toggle (0 / −8va) with gClef8vb swap and localStorage persistence; editable tempo input (40-240 BPM) replacing the static "120 BPM" readout. Added optional `position` + `accidental` to `MelodyEvent` so spelling intent survives a key change.
  - **Click-placement fix (`bbd7c4f`)** — addressed your complaint that imprecise clicks at the bar start stranded a 16th-rest. Ran the deep-research workflow on click-to-place patterns across notation editors and DAWs; the verified finding was that hard `Math.round` is the hobbyist tutorial pattern and the cause, while every serious tool uses either magnetic snap or cell semantics. You chose cell semantics (matches your tracker mental model). Shipped: `xToStep` switched from `Math.round` → `Math.floor` so a click anywhere inside step N's cell lands at step N (never pushes forward); plus a hover ghost preview that paints a translucent note/rest at the cursor's cell on `pointermove` before commit, reflecting active accidental mode + snap-to-scale + octave.
  - `bbd7c4f` M3 polish: cell-semantic floor placement + hover ghost preview
  - `59afb68` M3 polish: monophonic 4/4, accidentals + rest toolbar, octave shift, tempo input, time-sig fix
- **2026-06-02 → 2026-06-03 (desktop, overnight — M3 closeout):** The clickable 4-bar/4/4 staff editor is live. Five commits, plain-language write-up at `.handoff/OVERNIGHT-LOG-2026-06-02.md`. Highlights: Bravura SMuFL font self-hosted under OFL · pure-TS staff geometry in `src/notation/render.ts` · pointer-driven tap-to-place + drag-for-duration + long-press/right-click delete · snap-to-scale via `@tonaljs/tonal` with stays-on-position preference and flat-key spelling · `KeyScalePicker` for picking key + scale · RAF-driven playhead during transport playback · wrap-around `noteOff` at the loop boundary · scratch UI in App.svelte replaced with a contextual empty/populated staff footer · brand-sub bumped "M1" → "M3". Type-check clean throughout (8 commits across the session, 0 errors).
  - `0b9ab7f` M3: tear out scratch UI · contextual staff footer · brand-sub bump
  - `da54405` M3: playhead — RAF-driven vertical sweep during transport playback
  - `964c8da` M3: snap-to-scale + key/scale picker + flat-key spelling
  - `597e68a` M3: staff interaction — tap to place, drag to extend, long-press / right-click to delete
  - `6f4c521` M3: SVG staff render (read-only) + Bravura self-host
- **2026-06-01 (desktop, M3 first slice — sequencer scaffold):** `src/sequencer/{transport,part,demo,index}.ts` lands. `installSequencer()` adopts the engine's AudioContext as Tone's context so the scheduler and Braids worklet share one timeline; `installPart()` rebuilds a looping (4 measures) Tone.Part whenever `melodyStore.events` changes, firing `engine.noteOn/noteOff` with noteOff clipped to loop end. Temporary scratch UI in `App.svelte` (Play/Stop footer button, Load demo / Clear in staff slot) — all marked for tear-out when the real staff editor lands. `vite.config.ts` now honors `PORT` env for tooling. Browser-verified end-to-end: tap-to-start → load demo → audibly loops C-major scale → stop, zero console errors. New `.claude/launch.json` checked in for Claude Preview compatibility on any machine.
  - `1bcdecb` M3: sequencer scaffold — Tone.Transport + Part wired to engine
- **2026-06-01 (desktop, M3 first move — store-wiring):** `patchStore` + `engineIdStore` are now the source of truth. New `src/state/bindings.ts` seeds patch from engine's parameter schema, then subscribes store → engine pushes one-way (engine never writes back). ModelPicker + ParamPanel read from / write to the store; no behavior change in the browser (strict no-regression refactor). Share-URLs / presets / undo will fall out for free in M5.
  - `ab1a74d` M3: wire patchStore + engineIdStore as source of truth
- **2026-06-01 (desktop, post-pickup):** Tagged `v0.3.0-m2` and pushed. Polish gate fully closed out.
- **2026-06-01 (desktop, evening — v0.3.0-m2 eyeball-pass follow-ups):** Verified the overnight batch on the live URL. Three small follow-ups caught and shipped in one bundled commit, deployed, and user-confirmed.
  - `3767b5d` polish: Sandbox rename · dark knob indicator · NoteStrip piano-style two-row layout
    - K.O. Console → **Sandbox** (was too close to TE's KO II / OP-1). Slug `ko` → `sandbox` with a legacy fallthrough in `readInitial()` for any pre-rename stored value. Comments + CLAUDE.md swept.
    - Sandbox `--knob-pointer` was `#E9E5DC` (= `--bg`) → flipped to `#1A1A1A` so needles + hubs read on the warm body.
    - NoteStrip: 14-col grid with naturals (2-col span ~50 px) on the bottom and accidentals positioned between adjacent whites on the top — piano top-down view. Still interim until M3 staff.
- **2026-06-01 (desktop, overnight — v0.3.0-m2 polish gate):** Cleared all three remaining P1s + bundled hygiene in a single unattended run. Full plain-language write-up at `.handoff/OVERNIGHT-LOG-2026-06-01.md`. Highlights: theme contrast pass with new `--signal-ink` for K.O.; RAF-coalesced knob `onchange` (audio-thread protection); ModelPicker keyboard nav + ≥44px touch + 320 ms spring pulse on model change; new mobile-only `NoteStrip` (12 chips + octave shift); oscilloscope hero finally glows — real `shadowBlur` bloom + breathing idle + L→R boot sweep + DC-clamp; subtle fractal-noise grain on Lab + K.O.; deleted dead `public/icons.svg`; init-failure dispose fix on `useEngine`. Type-check clean throughout (8 commits, 0 errors). Browser eyeball + tag deferred to morning verification.
  - `efb8a7c` fix: ModelPicker keyboard handler — scope to search + items, guard empty Enter
  - `557ee4e` hygiene: delete dead icons.svg, dispose half-built engine on init failure
  - `710501e` P1: subtle grain overlay on Lab + K.O. themes
  - `0d54a51` P1: Oscilloscope — real bloom, breathing idle, boot sweep, DC clamp
  - `00286f8` P1: NoteStrip — interim tappable phone surface
  - `a64663a` P1: ModelPicker — keyboard nav, touch targets, pulse on model change
  - `f6c0bdf` P1: RAF-coalesce knob onchange — protect the audio thread
  - `8e844b3` P1: contrast pass — bump --text-dim to AA, add --signal-ink for K.O.
- **2026-06-01 (desktop, morning — engine authenticity pass):** Closed §2.5 of the deep review. Rewrote the shim's render loop to mirror `braids.cc:282-292` — BITS at decimation hold instant → smoothed VCA → SIGN waveshape LAST on the crushed signal, with the firmware's quadratic mix taper. DRIFT now drives the vendored `VcoJitterSource` (was a no-op). The AD envelope is plumbed (`Envelope` class, triggered on strike, rendered per block) but all four modulation amounts default to 0 — per-model wiring waits for M4. New shim setters `braids_set_envelope_shape` + `braids_set_ad_amounts` and matching worklet messages are ready. WASM: 100,527 → 101,293 bytes. Ear-verified.
  - `5c579e3` P1: engine authenticity pass — lo-fi reorder, quadratic SIGN, real DRIFT
- **2026-05-31 (desktop, evening pt.2 — shipped live):** **Parallax is live → https://andrewrausch.com/parallax/** (GitHub Pages; auto-deploys on every push to `main`). Browser-verified the evening batch this session — picker selection visible, compact knobs, no stuck notes on blur, tab-return audio all good. **Hosting finalized: GitHub Pages, superseding the locked Cloudflare Pages** (domain already lived there; the one Cloudflare-only feature wanted — `_headers` CSP — moves to a `<meta>` tag). CLAUDE.md + plan + project memory updated to match.
  - `4e14c48` fix: load worklet/WASM via `import.meta.env.BASE_URL` so assets resolve under `/parallax/` (Vite `base=/parallax/` on build; dev/Tailscale stay at root)
  - `8f74a0f` ci: GitHub Actions Pages workflow + track prebuilt `public/braids.wasm`+`braids.js` so CI ships them without Emscripten
- **2026-05-31 (desktop, evening unattended run):** Cleared both deep-review P0s + two P1s in front of dinner. Knobs tightened a second notch (2.5rem dial / 3.6rem wrapper) and model list trimmed (220→160px) for a roomier control column. Browser verification still pending before tag.
  - `a80b95d` UI: compact knobs + shorter model list
  - `d5d3e8c` **P0** WASM-load timeout (5s fetch + 10s ready) — surfaces silent worklet failures via the existing TapToStart error UI
  - `2531141` **P0** held notes released on window blur / tab-hidden — no more stuck notes after alt-tab
  - `4abb8ec` **P1** `--surface-sunken` / `--signal-deep` defined in all 3 themes — picker selection now visible
  - `7a63243` **P1** AudioContext auto-resume on tab-return + `cancelAndHoldAtTime` for envelope ramps
- **2026-05-31 (desktop, earlier):** Moved repo out of Google Drive — sync risk closed. Reintroduced the vertical-drag Knob as the live control surface (sliders removed). `npm run check` clean.
- **2026-05-31 (desktop):** Recovered the M2 control surface from an uncommitted GDrive-synced state → committed/pushed (`d6389c8`): schema-driven ParamPanel (sliders; Knob parked), searchable family-grouped ModelPicker, Spectrum view, SCOPE/SPECTRUM toggle, teal favicon. Ran the deep review → `reviews/2026-05-31-deep-review.md` (`890fb2f`). Deliberately **not** tagged v0.3.0-m2 (polish gate above).
- **2026-05-31 (desktop, earlier):** audio sanity-listen confirmed; dropdown focus bug fixed (`0d312e0`); Tailscale HTTPS remote-testing (`4d203ad`).
- **2026-05-31 (laptop, overnight):** M0 + M1 shipped (`v0.1.0-m0`, `v0.2.0-m1`); Macroscope → Parallax rename; colorblind-safe UI; scope idle flat-line fix.
