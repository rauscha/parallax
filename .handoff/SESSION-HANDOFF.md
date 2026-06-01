# Session hand-off — 2026-05-31 (machine: desktop, evening pt.2)

## STATE (read this first)
- **Branch:** `main`, clean, synced with `origin/main`. One worktree (main only) — **nothing stranded.**
- **Parallax is LIVE → https://andrewrausch.com/parallax/** (GitHub Pages; auto-deploys on every push to `main`, ~30s). This session hardened the app for sub-path hosting, stood up the GitHub Pages auto-deploy, shipped it, and **finalized the hosting decision as GitHub Pages (superseding the old locked Cloudflare Pages).** The **v0.3.0-m2 polish gate is still open**: the evening batch (both P0s + two P1s) was **browser-verified this session and looks good**, but **four P1s remain** (engine authenticity, ModelPicker keyboard/touch, postMessage coalesce, hero glow), then a final eyeball + tag. Next session's first real work — the **engine authenticity pass** (C++/DSP shim) — is a different domain, so **start it fresh**.

## Done this session
- **Shipped Parallax live** on GitHub Pages at andrewrausch.com/parallax/. Verified `200` + `application/wasm` (98 KB) over the public internet; build ✓ 17s, deploy ✓ 10s.
- **Hardened asset loading for sub-path deploy** (`4e14c48`): worklet `addModule` + WASM `fetch` now use `import.meta.env.BASE_URL`; Vite `base` = `/parallax/` on build, `/` for dev (Tailscale test URL stays at root).
- **GitHub Pages auto-deploy** (`8f74a0f`): `.github/workflows/deploy.yml` (npm ci + vite build → `actions/deploy-pages`); **un-gitignored + committed the prebuilt `public/braids.wasm` + `braids.js`** so CI ships them with no Emscripten toolchain.
- **Browser-verified the evening batch** (user, via Tailscale): picker selection visible, compact knobs, no stuck notes on blur, tab-return audio — all good.
- **Finalized hosting = GitHub Pages** (skip Cloudflare). Updated CLAUDE.md, the plan file, the project memory, and NEXT-STEPS to match.

## Next up
1. **(Fresh session) Engine authenticity pass** — reorder lo-fi chain (crush→waveshape, quadratic SIGN), port + gate the AD envelope, implement/remove DRIFT; rebuild WASM (`npm run wasm`) + **commit the new `braids.wasm`**; re-listen. *§2.5 · `braids_shim.cc`*
2. **Remaining polish-gate P1s:** ModelPicker keyboard nav + ≥44px touch targets + phone note-strip; coalesce the lo-fi `postMessage` flood; make the hero glow (scope bloom, breathing idle, contrast fixes).
3. **Final browser eyeball → tag `v0.3.0-m2` → push** (auto-deploys live).

## Watch out for
- **Memories/plan are machine-local and stale on the laptop.** The project's memory files still live under the OLD slug `~/.claude/projects/C--GDrive-Braids-tester/memory/` (not `c--parallax`) — they may not auto-load next session, and the **laptop's copies still say "Cloudflare" and lack today's edits**. The synced source of truth is **in-repo CLAUDE.md + NEXT-STEPS**. Worth migrating the memory dir to the new slug at some point.
- **DSP shim changes need two steps:** `npm run wasm` AND commit the regenerated `public/braids.wasm` (now tracked) — else CI ships the old binary. Easy to forget.
- **`npm run preview` serves at root, not `/parallax/`** (conditional base). To preview the real production artifact: `npx vite preview --base /parallax/`.
- **Tag `v0.3.0-m2` is still NOT applied** — gated on the four remaining P1s + a final eyeball.
- Deploy logs a **non-blocking** Node-20-deprecation warning (GitHub forces Node 24 after 2026-06-16); the workflow still passes. Bump `actions/*` versions whenever.
- The dev server (Tailscale `serve` on `:8445` → localhost:5173) may still be running on this desktop from this session.
- Prior gotchas still apply: AudioWorklet `import.meta.url` shim ([[braids-key-architecture]]); Svelte 5 reserves `$` so stores are `themeStore` etc.; mutating a `Set` in `$state` needs a reassign.
