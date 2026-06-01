# Session hand-off — 2026-06-01 (machine: desktop, morning)

## STATE (read this first)
- **Branch:** `main`, clean, synced with `origin/main`. One worktree (main only) — **nothing stranded.**
- **Parallax is LIVE → https://andrewrausch.com/parallax/** (auto-redeployed by this session's push). The **engine authenticity pass (§2.5 of the deep review) is DONE and ear-verified** — lo-fi chain now mirrors the firmware order, SIGN follows the quadratic taper, DRIFT is real, and the AD envelope is plumbed (dormant by default — per-model wiring lives with M4). The **v0.3.0-m2 polish gate is now down to three remaining P1s** (ModelPicker keyboard/touch, postMessage coalesce, hero glow) then a final eyeball + tag. Those three are all UI/CSS/Svelte work — a **different domain from this session's DSP work**, so start the next batch fresh.

## Done this session
- **Engine authenticity pass (`5c579e3`).** Rewrote the per-block + per-sample render loop in [`dsp/shim/braids_shim.cc`](dsp/shim/braids_shim.cc) to mirror `braids/braids.cc:282-292`:
  - **Lo-fi order corrected.** BITS now applies at the decimation hold instant; SIGN now runs LAST on the already-crushed signal (was reversed). Audible.
  - **SIGN is quadratic.** Mix weight is now `amt²` (was linear `>> 8`), matching the firmware's `signature² × 4095`. SIGN at low values is subtle now; the top quarter does the work.
  - **DRIFT is real.** Drives the vendored `VcoJitterSource` per render block against a cached pitch (was a stored-but-unused no-op).
  - **AD envelope plumbed.** `Envelope` class included, triggered on strike, rendered per block — but all four modulation amounts (VCA/TIMBRE/COLOR/FM) default to 0. Two new shim setters (`braids_set_envelope_shape`, `braids_set_ad_amounts`) and matching worklet message types (`setEnvelopeShape`, `setAdAmounts`) are ready for per-model wiring in M4.
  - WASM: 100,527 → 101,293 bytes. `npm run check` clean. Committed `public/braids.{wasm,js}` alongside the shim, so CI ships the new binary.

## Next up
1. **(Fresh session — UI domain) Remaining polish-gate P1s, all together:**
   - **ModelPicker** keyboard nav (arrow / Enter / Escape) + ≥44px touch targets + interim tappable note strip for phone. *§2.7*
   - **Coalesce the lo-fi `postMessage` flood** (bits/rate/sign/drift) — at most one update per animation frame or commit on pointer-up. *§2.9 · `ParamPanel.svelte`*
   - **Make the hero glow:** real (gated) scope bloom + breathing idle + boot sweep; subtle grain; fix `--text-dim` + K.O. orange contrast; apply `--t-spring` on model change. *§2.8, §2.10, §5*
2. **Final browser eyeball → tag `v0.3.0-m2` → push** (auto-deploys live).
3. **Then M3 — sequencer + clickable staff.** Wire the central stores (`patchStore`/`engineIdStore`) as the *first* move so undo/presets/share-URLs "fall out for free."

## Watch out for
- **AD envelope is plumbed but DORMANT.** The shim renders the envelope every block, but `g_ad_vca/timbre/color/fm` all default to 0 → no audible effect. To actually use it per-model (percussion, plucks, bells), wire the four amounts in [`src/audio/engines/BraidsEngine.ts`](src/audio/engines/BraidsEngine.ts) — likely at `noteOn`, reading per-model defaults from [`src/data/braids-models.ts`](src/data/braids-models.ts). That belongs with **M4 (explain panel)** since the per-model metadata is needed for both. Don't quietly turn it on for all models — sustained tones would auto-decay to silence and that's wrong.
- **DSP shim changes still need two steps:** `npm run wasm` AND commit the regenerated `public/braids.wasm` — easy to forget. (Caught it correctly this session.)
- **Dev server is still running on this desktop on `:5174`** (vite picked it because `:5173` was already taken by yesterday's Tailscale `serve`). Both background processes from the last 24h are alive.
- **Memories/plan are machine-local and stale on the laptop.** Memory dir still at OLD slug `~/.claude/projects/C--GDrive-Braids-tester/memory/` (not `c--parallax`). Worth migrating at some point. Synced source of truth = in-repo CLAUDE.md + NEXT-STEPS.
- **`npm run preview` serves at root, not `/parallax/`** (conditional base). For the real production artifact: `npx vite preview --base /parallax/`.
- **Tag `v0.3.0-m2` is still NOT applied** — gated on the three remaining P1s + a final eyeball.
- Deploy logs a non-blocking Node-20-deprecation warning (forced upgrade after 2026-06-16). Bump `actions/*` versions whenever.
- Prior gotchas still apply: AudioWorklet `import.meta.url` shim, Svelte 5 `$`-reserved store names, mutating a `Set` in `$state` needs a reassign.
