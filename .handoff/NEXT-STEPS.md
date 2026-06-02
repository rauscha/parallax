# Parallax — running next steps

The single prioritized backlog. `.handoff/SESSION-HANDOFF.md` is the per-session digest; **this file persists across sessions**. Full architecture/roadmap spec: `~/.claude/plans/ok-we-re-in-planning-tingly-pike.md`. Full diagnostic detail behind the "Now" items: `reviews/2026-05-31-deep-review.md` (§ refs below point into it).

Last reconciled: 2026-06-01 (desktop, M3 first slice shipped — sequencer scaffold).

## Now — continue M3
**M3 first slice landed.** Store-wiring (`ab1a74d`) + sequencer scaffold (`1bcdecb`) both pushed, both auto-deployed. The demo melody audibly loops end-to-end. Next is the staff editor; this is multi-session — start fresh.

- [ ] **SVG staff render (read-only first).** Custom SVG, Bravura SMuFL font (needs self-hosting — see Soon list). Draws `melodyStore.events` on a 4-bar / 4/4 treble staff. Target: `src/notation/{StaffEditor.svelte, render.ts}`.
- [ ] **Click-to-place interaction** in `src/notation/interaction.ts`. Writes back to `melodyStore.setKey("events", …)`; the Part rebuild on events-change is already plumbed, so placed notes play immediately.
- [ ] **Snap-to-scale** via `@tonaljs/tonal` (already a dep). Home: `src/sequencer/scales.ts` — folds melody's `key` + `scale` fields into a snap helper.
- [ ] **Playhead animation + loop-region UI.**
- [ ] **Tear out the scratch buttons** in `App.svelte` (footer Play/Stop + staff-slot Load demo/Clear) when the real staff editor + transport bar take over.
- [ ] **Wrap-around for noteOff at loop boundary** in `src/sequencer/part.ts` (currently clipped — simple but loses legato across the wrap).

## Soon (hygiene + smaller catches — deep review §4)
- [ ] Security hardening: CSP via `<meta http-equiv>` in `index.html` (GitHub Pages can't serve a `_headers` file — see hosting note in CLAUDE.md); self-host fonts (**Bravura also lands here — M3 will need it self-hosted anyway**); optional git-secrets hook. *(`dist/` already gitignored ✓; dead `public/icons.svg` deleted ✓ 2026-06-01.)*
- [ ] Smaller bugs: pitch-bend re-baseline, future-note "panic", octave-shift-while-held stranded notes. *(Init-failure node/listener leak ✓ + scope degenerate-frame clamp ✓ both 2026-06-01.)*

## Later milestones (per plan file)
- **M3** — Sequencer + clickable 4-bar/4-4 staff (Tone.Transport/Part, custom SVG notation, snap-to-scale, playhead + loop).
- **M4** — Explain panel (per-model timbre/color text + animated mini-diagrams + knob↔card highlight + "show me" sweep). **Also wire per-model `AD_VCA/TIMBRE/COLOR/FM` amounts** at noteOn via the new shim setters (plumbing landed 2026-06-01; amounts default to 0 today). Percussion/pluck/bell models need it; sustained tones must stay at 0.
- **M5** — v1 finish: MIDI file import/export · shareable URL links (lz-string→hash) · presets (idb-keyval) · PWA install/offline · mobile pass · finalize all 3 themes · delight (patch postcard).
- **M6 (optional)** — 2nd engine (Plaits / Web-MIDI-out) to prove hot-swap.

## Deferred (do not quietly add)
Polyphony · Web MIDI input · audio recording/export · insert FX · Plaits / 2nd engine (until M6).

## Done recently
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
