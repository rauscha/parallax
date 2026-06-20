# Session hand-off — 2026-06-19 (machine: desktop · c:\parallax)

## STATE (read this first)
- Branch: `main`, **clean + synced** (HEAD `f29e045` == origin/main). One worktree
  only — nothing stranded.
- **🚀 Parallax `v1.0.0` is still the live release.** No code changed this session.
- This was a **design session** for the first "After v1.0" item, **patch-lineage
  breadcrumb ("Recent sounds")**. The spec is written, committed, and pushed —
  **ready to build next session.** Nothing is mid-flight in code.

## Done this session
Resumed via /pick-up (clean, synced). Picked roadmap "After v1.0" **#1 patch-lineage
breadcrumb** and ran it through the full brainstorming flow:
- **Design decided** (all questions resolved with the user):
  - A persistent **"Recent sounds"** list (popover), not just a beefed-up toast.
  - Captures **generative actions only** — Surprise rolls + Match-panel Apply. The
    melody-only actions (Clear / MIDI / Randomize) keep today's transient undo toast,
    untouched. Surprise *also* keeps its instant toast and additionally records to the ring.
  - **Ring of 10**, newest-first, dedup against head. **Persisted** via `idb-keyval`
    in its own `parallax-lineage` namespace (survives reload / PWA relaunch).
  - **Restore** reuses the proven `loadState(decodeState(wire))` path (same as presets
    / share-URLs); restoring is itself reversible.
- **Designer sign-off** via the frontend-design skill: the new control is **one more
  `io-btn` (`↺ Recent`) inside the existing `PatchToolbar` `.io-bar` cluster**, right
  after Presets — NOT a new top-bar button (only Surprise is exposed; the rest already
  live in the `⋯` ToolsMenu, so no crowding, mobile untouched). One distinguishing
  signature: each row leads with a **source glyph (`⚄` roll / `◎` match)** + engine·model
  + relative time. No save row, no per-row delete, just a "Clear history" link.
- **Spec written + committed** (`f29e045`):
  `docs/superpowers/specs/2026-06-19-patch-lineage-design.md` — self-contained, with
  §8 "won't break v1" safety argument and §9 exact file-change list (2 new files,
  3 tiny edits).

## Next up
**Execute the patch-lineage spec.** Start a fresh session, then:
1. Read `docs/superpowers/specs/2026-06-19-patch-lineage-design.md`.
2. Run **`npm ci` first** (see Watch out) before any check/test/build.
3. Invoke **writing-plans** to turn the spec into a step-by-step plan.
4. Build it — **TDD on the pure ring logic first** (`pushSnapshot` + entry builder),
   then `src/state/lineage.ts`, then `src/ui/RecentSoundsMenu.svelte`, then the wiring
   (PatchToolbar insert, `recordSound` calls in surprise.ts + MatchPanel, `hydrateLineage`
   on boot). `npm run check` + vitest green, then a browser pass + commit.

Then the rest of the "After v1.0" order: swing + generative melody tools → Parallax
Daily → one-loop audio export → Rings (v1.2).

## Watch out for
- **`npm ci` on a fresh machine first.** Overnight deps (`qrcode-generator`, `vitest`)
  post-dated some `node_modules`; check/test/build fail until a clean install. The
  laptop will need it too after pulling.
- **Preview screenshots don't work here** (backgrounded Claude preview tab → RAF paused,
  `vh`/`%` layouts collapse in measurement). Verify the new popover via computed-style /
  geometry evals + a real-device check, not screenshots.
- **No code was written this session** — purely the spec. The implementation is the
  whole point of the next session; the spec is the contract.
- `.handoff/PENDING-DECISIONS.md` is empty — all lineage design questions were resolved
  live, so there's nothing waiting on the user.
