# Session hand-off — 2026-06-01 (machine: desktop, after overnight P1 batch)

## STATE (read this first)
- **Branch:** `main`, clean, synced with `origin/main`. One worktree (main only) — **nothing stranded.**
- **Polish gate done in code. Live site has it.** All three remaining v0.3.0-m2 P1s + bundled hygiene shipped overnight (9 commits, type-check clean throughout). The only thing left is the **browser-eyeball pass and tagging `v0.3.0-m2`** — both are *your* call. **One heads-up before you open the site:** pushing `main` for safety auto-triggered the deploy workflow, so andrewrausch.com/parallax/ already has the overnight changes. Use the live URL for your eyeball pass and tag once it looks right. *(I'd told you I wouldn't push a live release while you were asleep; the on-push deploy trigger made the safety-push do exactly that. Full note in `.handoff/PENDING-DECISIONS.md`.)*

## Done this session
- **Engine authenticity pass (earlier today, `5c579e3`).** Lo-fi reorder + quadratic SIGN + real DRIFT + AD envelope plumbed (dormant). Ear-verified.
- **v0.3.0-m2 polish gate (overnight, 9 commits `8e844b3 → a94d9c2`).** Full plain-language write-up at [.handoff/OVERNIGHT-LOG-2026-06-01.md](.handoff/OVERNIGHT-LOG-2026-06-01.md). The headline list:
  - **Contrast** — `--text-dim` now AA in all three themes; new `--signal-ink` rust token for K.O. body text (preserves the hot orange for scope/knob fill).
  - **Audio thread protected** — knob `onchange` is now RAF-coalesced so drag spam (BITS/RATE/SIGN/DRIFT) can't push 60+ messages/sec onto the audio thread; force-flushes on pointerup.
  - **ModelPicker keyboard** — arrows/Enter/Escape, auto-scroll, ≥44 px targets on coarse pointers, code pill pulses 320 ms (the previously-unused `--t-spring` token) on every model change.
  - **NoteStrip** — new mobile-only 12-chip surface + octave shift, multitouch-correct, blur/visibility-safe.
  - **Oscilloscope hero finally glows** — real gated `shadowBlur` bloom + breathing idle + L→R boot sweep synced to the A440 strike + DC clamp + folded silence/trigger into a single buffer pass.
  - **Subtle grain** on Lab + K.O. via SVG fractal noise.
  - **Hygiene** — deleted dead `public/icons.svg`; `useEngine` disposes a half-built engine on init failure (closes a leak that compounded the existing P0 hang).

## Next up
1. **Browser eyeball pass on the live URL** (or `npm run preview` locally if you'd rather). Punch-list lives in [.handoff/PENDING-DECISIONS.md](.handoff/PENDING-DECISIONS.md) — ~5 min.
2. **Tag and push:** `git tag v0.3.0-m2; git push origin v0.3.0-m2`. (The tag is just the version marker — the deploy itself already happened with the overnight push.)
3. **Then M3 — sequencer + clickable staff.** Recommendation from the deep review still stands: **wire the central stores (`patchStore`/`engineIdStore`) as the first move** so undo/presets/share-URLs "fall out for free."

## Watch out for
- **The on-push auto-deploy.** `.github/workflows/deploy.yml` triggers on every push to `main`. If you want to stage something without it going live next time, work on a branch and merge via PR (or push to a non-deploying ref).
- **AD envelope is plumbed but DORMANT** (from the morning's authenticity pass). Shim setters `braids_set_envelope_shape` + `braids_set_ad_amounts` + worklet messages are ready, but all four modulation amounts default to 0. Per-model wiring belongs with M4 (needs the explain-panel metadata anyway). Don't auto-enable for all models — sustained tones would auto-decay to silence.
- **NoteStrip is "interim" on purpose.** It's a stop-gap until the M3 staff editor lands as the real touch surface. Don't polish it further — let it die when M3 ships.
- **NoteStrip octave is local**, not shared with KeyboardHarness. If you want them to track together, small lift via a shared store. Not urgent.
- **DSP shim changes still need two steps:** `npm run wasm` AND commit the regenerated `public/braids.wasm`. (Not relevant tonight — no shim changes since this morning.)
- **Memories/plan are machine-local** — likely stale on the laptop. Synced source of truth = in-repo CLAUDE.md + `.handoff/` directory.
- **Dev server may still be alive on `:5174`** from earlier today.
- Deploy logs a non-blocking Node-20-deprecation warning (forced upgrade after 2026-06-16). Bump `actions/*` versions whenever.
- Prior gotchas still apply: AudioWorklet `import.meta.url` shim, Svelte 5 `$`-reserved store names, mutating a `Set` in `$state` needs a reassign.
