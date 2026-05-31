# Parallax — running next steps

The single prioritized backlog. `.handoff/SESSION-HANDOFF.md` is the per-session digest; **this file persists across sessions**. Full architecture/roadmap spec: `~/.claude/plans/ok-we-re-in-planning-tingly-pike.md`. Full diagnostic detail behind the "Now" items: `reviews/2026-05-31-deep-review.md` (§ refs below point into it).

Last reconciled: 2026-05-31 (desktop).

## Now — act on the deep review (the v0.3.0-m2 polish gate)
Ordered most-important first. **Both P0s cleared this session; two of the P1s too.** Browser eyeball pending before the tag.

**P1 (remaining):**
- [ ] Engine authenticity pass (shim): reorder lo-fi chain (crush→waveshape, quadratic SIGN), port + gate the AD envelope, implement/remove DRIFT; rebuild WASM; re-listen. *§2.5 · `braids_shim.cc`*
- [ ] ModelPicker keyboard nav (arrow/enter/escape) + ≥44px touch targets + interim tappable note strip for phone. *§2.7*
- [ ] Coalesce the lo-fi slider `postMessage` flood (bits/rate/sign/drift). *§2.9 · `ParamPanel.svelte`*
- [ ] Make the hero glow: real (gated) scope bloom + breathing idle + boot sweep; subtle grain; fix `--text-dim` + K.O. orange contrast; apply `--t-spring` on model change. *§2.8, §2.10, §5*
- [ ] Then re-verify in a browser and tag `v0.3.0-m2`, push.

## Soon (hygiene + smaller catches — deep review §4)
- [ ] Security hardening: CSP `public/_headers`; self-host fonts; delete dead `public/icons.svg`; gitignore `dist/`; optional git-secrets hook.
- [ ] Wire the central stores (`patchStore`/`engineIdStore`) as the first move of M3 so share-URLs/presets/undo "fall out for free."
- [ ] Smaller bugs: pitch-bend re-baseline, init-failure node/listener leak, scope degenerate-frame clamp, future-note "panic", octave-shift-while-held stranded notes.

## Later milestones (per plan file)
- **M3** — Sequencer + clickable 4-bar/4-4 staff (Tone.Transport/Part, custom SVG notation, snap-to-scale, playhead + loop).
- **M4** — Explain panel (per-model timbre/color text + animated mini-diagrams + knob↔card highlight + "show me" sweep).
- **M5** — v1 finish: MIDI file import/export · shareable URL links (lz-string→hash) · presets (idb-keyval) · PWA install/offline · mobile pass · finalize all 3 themes · delight (patch postcard).
- **M6 (optional)** — 2nd engine (Plaits / Web-MIDI-out) to prove hot-swap.

## Deferred (do not quietly add)
Polyphony · Web MIDI input · audio recording/export · insert FX · Plaits / 2nd engine (until M6).

## Done recently
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
