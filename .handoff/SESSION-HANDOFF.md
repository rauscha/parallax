# Session hand-off — 2026-06-01 (machine: desktop, M3 kickoff: store-wiring + sequencer scaffold)

## STATE (read this first)
- **Branch:** `main`, clean, synced with `origin/main`. One worktree only — **nothing stranded.**
- **M3 is open and moving.** Two commits this session: `ab1a74d` (store-wiring — patchStore/engineIdStore are now source of truth) and `1bcdecb` (M3 first slice — sequencer scaffold: Tone.Transport + Part wired to the Braids engine, audibly loops a demo melody end-to-end). Both pushed; both auto-deployed to live.

## Done this session
- **Wired the central stores as the M3 first move** (`ab1a74d`). New `src/state/bindings.ts` seeds `patchStore` from the engine's schema, then subscribes store → engine pushes (one-way; the engine never writes back). ModelPicker + ParamPanel now read from / write to the store instead of holding local copies. Engine internal mirror stays internal. Verified zero behavior change in the browser before committing — strict no-regression refactor. Sets up share-URLs / presets / undo to "fall out for free" in M5.
- **M3 first slice — sequencer scaffold** (`1bcdecb`). New `src/sequencer/{transport,part,demo,index}.ts`:
  - `installSequencer()` adopts the engine's AudioContext as Tone's context so the scheduler and the Braids worklet share one timeline.
  - `installPart()` rebuilds a looping (4 measures) `Tone.Part` whenever `melodyStore.events` changes; on/off events fire `engine.noteOn/noteOff`. noteOff is **clipped to the loop end** to avoid stuck notes on wrap (TODO wrap-around for legato when the staff lands).
  - `loadDemoMelody()` seeds an ascending C-major scale (8 quarter notes, 2 bars notes + 2 bars silence so the loop boundary is audible).
  - Temporary scratch UI in `App.svelte` (`▶ PLAY / ■ STOP` in the footer, `Load demo / Clear` in the staff slot) — **all marked for tear-out when the real staff editor lands**.
  - `vite.config.ts` now honors `PORT` env so Claude Preview / CI can pin a chosen port; falls through to Vite defaults when unset.
  - Browser-verified end-to-end: tap-to-start → load demo → play (loops audibly per the user) → stop → no stuck notes → zero console errors.
- **Pushed twice; auto-deploy fired twice.** Acknowledged pattern.

## Next up
1. **Continue M3 — SVG staff render (read-only first).** Custom SVG with Bravura SMuFL font; draws `melodyStore.events` as notes on a 4-bar / 4/4 treble staff. Target: `src/notation/{StaffEditor.svelte, render.ts}`. Bravura needs to be self-hosted (see Soon-list note in NEXT-STEPS).
2. **Then click-to-place interaction** in `src/notation/interaction.ts` — writes back into `melodyStore.setKey("events", …)`. The store is already plumbed to rebuild the Part on event changes, so notes will play the instant they're placed.
3. **Then snap-to-scale** via `@tonaljs/tonal` (already a dep). `src/sequencer/scales.ts` is the right home — folds the melody's `key` + `scale` fields into a snap helper.
4. **Then playhead animation + loop-region UI**, then **tear out the scratch buttons** in `App.svelte`.
5. **Recommend a fresh session for the staff editor.** Different domain (font loading, SVG geometry, pointer interaction) and a multi-session chunk on its own.

## Watch out for
- **Scratch UI lives in `App.svelte`** — the `▶ PLAY / ■ STOP` footer button and the `Load demo / Clear` row in the staff slot. Both are throw-away. Delete them when the real staff editor + transport bar land.
- **noteOff is clipped to loop end** in `src/sequencer/part.ts` (`Math.min(startStep + durationSteps, TOTAL_STEPS)`). Simple and safe; the proper fix when M3 finalizes is to wrap notes around the loop boundary so a legato note bridging the wrap works.
- **`.claude/launch.json` is now checked in.** Lets Claude Preview start the dev server on any machine without reconfiguration; `autoPort: true` so it doesn't fight zombies.
- **vite.config now reads `PORT` env** with `strictPort` when set. If you set `PORT=…` manually and that port is busy, Vite will fail to start instead of bumping — by design, so tooling can rely on the port it asked for.
- **Auto-deploy still fires on every push to `main`.** Stage on a branch + PR if you want a checkpoint without going live.
- Prior gotchas still apply: AudioWorklet `import.meta.url` shim · Svelte 5 `$`-reserved store names · mutating a `Set` in `$state` needs reassign · DSP shim changes need `npm run wasm` AND committing regenerated `public/braids.wasm`.
- Memories/plan are machine-local — likely stale on the laptop. Source of truth = in-repo `CLAUDE.md` + `.handoff/`.
