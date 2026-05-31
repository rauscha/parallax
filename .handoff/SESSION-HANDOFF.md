# Session hand-off — 2026-05-31 (machine: desktop)

## STATE (read this first)
- **Branch:** `main`, clean, synced with `origin/main` at `890fb2f`. One worktree (main only) — **nothing stranded.**
- This session **rescued the M2 control surface** (it had synced in via Google Drive, uncommitted — now committed `d6389c8`, pushed) and **ran a full deep review** (saved to `reviews/2026-05-31-deep-review.md`, `890fb2f`). Verdict: **on track — the authentic-Braids engine bet landed and the M2 architecture is sound.** Next session's job is the **v0.3.0-m2 polish gate**: work the review's P0/P1 items (see `NEXT-STEPS.md` → "Now"), then tag. **Most urgent and non-code: move the repo OUT of Google Drive** — Drive is syncing `.git`, a real corruption/loss risk and the reason M2 nearly got stranded.

## Done this session
- **Caught + saved stranded M2 work.** `git status` was clean at pick-up; minutes later a full uncommitted M2 surface appeared via GDrive sync (never committed/pushed). Type-checked clean → committed `d6389c8` → pushed. M2 = schema-driven ParamPanel (native **sliders**; Knob built but **parked**), searchable family-grouped ModelPicker, Spectrum view, SCOPE/SPECTRUM toggle, teal favicon.
- **Deep review** — 10 read-only agents across the 7 dimensions → `reviews/2026-05-31-deep-review.md` (committed `890fb2f`, pushed). Re-checked the M2 UI against the *real* committed code (the first pass had seen mid-sync states).
- **Discovered the GDrive/`.git` sync hazard** — saved to memory (`gdrive-git-sync-hazard`).

## Next up
1. **Move the repo out of Google Drive**, sync machines via git push/pull only. *(Your action; report §2.1.)*
2. **Two [P0] audio bugs:** silent WASM-load hang; stuck notes on focus loss. *(report §2.2–2.3.)*
3. **Decide knob vs slider** + define the missing CSS tokens `--surface-sunken`/`--signal-deep` (10 min — picker selection is invisible without them). *(§2.7, §2.4.)*
4. Then the rest of the §2 action plan → re-verify in a browser → tag `v0.3.0-m2`.

## Watch out for
- **GDrive syncs `.git`.** On resume, after `git pull`, wait a beat and re-check `git status` — any surprise uncommitted/staged change is cross-machine work synced by Drive; reconcile (commit/push) before working. This is the real fix for the recurring "stranded work" problem.
- **M2 is committed but deliberately NOT tagged** `v0.3.0-m2` — there's a known visual bug (undefined CSS tokens → invisible picker selection) and it was not browser-verified this session. Tag only after the polish gate + a real eyeball.
- **The "knob" is parked, not shipped** — the live control surface is native sliders. Don't call M2 "auto-knob" until that's decided.
- **Engine is authentic but not bit-accurate** — lo-fi chain order is reversed vs firmware, the AD envelope is faked in JS, DRIFT is a no-op. Don't trust M4 explain text to match the engine until the §2.5 authenticity pass lands.
- Prior gotchas still apply: AudioWorklet `import.meta.url` shim ([[braids-key-architecture]]); Svelte 5 reserves `$` so stores are `themeStore` etc.; mutating a `Set` in `$state` needs a reassign.
- Tailscale `serve` on `:8445` may still be mapped on this desktop (tailnet-only, harmless); the dev server is stopped.
