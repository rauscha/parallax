# Session hand-off — 2026-07-11 (machine: laptop · c:\parallax)

## STATE (read this first)
- Branch: `main`, **clean + synced** (HEAD `d0c1a33` == origin/main). **One worktree only** — nothing stranded.
- One-loop audio export is **fully closed** (Andrew's ear-check confirmed; roadmap marked shipped `a004bfa`). **Rings — engine #4, the v1.2 marquee — is now THE ACTIVE WORK:** spec + implementation plan are written, committed, pushed. **Nothing has been built yet.**
- **NEXT ACTION (fresh session):** execute `docs/superpowers/plans/2026-07-11-rings-engine.md` via **superpowers:subagent-driven-development** — fresh implementer subagent per task (deliberately lower-model implementers; the plan was written on Fable with complete code in every step so they can't wander), review between tasks. The plan is fully self-contained; no conversation context needed. Start at Task 1 (vendor).

## Done this session
1. **Export close-out.** Ear-check confirmed by Andrew → marked shipped in `docs/roadmap-v1.0.md` (`a004bfa`). Feature ② patch-lineage also marked shipped in the same roadmap line.
2. **Rings design — brainstormed with Andrew, all decisions locked** (spec `docs/superpowers/specs/2026-07-11-rings-engine-design.md`, `447bd41`):
   - **One comprehensive spec** for the whole port (his explicit call over incremental slices).
   - **Full model set incl. the "Disastrous Peace" easter egg**: 12 models = 6 `rings::Part` resonator models + 6 `StringSynthPart` FX variants.
   - **Note model:** internal exciter — noteOn = strum, noteOff = ring out (no-op), polyphony pinned 1, no external audio input.
   - **Theme = "Soundboard"** (his pick of 3 directions): warm-dark walnut/espresso + brass-amber + parchment ivory, luminance-led scope shimmer. The first engine that needs a brand-new (4th) theme.
   - Plaits-port survey (subagent): every cross-cutting system is **engine-agnostic via the registry** — Rings inherits pickers/serialization/share-URL/Surprise/undo/lineage free; vendored stmlib already has every header Rings needs; the PWA precache glob picks up `rings.wasm` automatically.
3. **Implementation plan** (`docs/superpowers/plans/2026-07-11-rings-engine.md`, `d0c1a33`): 9 tasks — vendor → shim+build → worklet → engine class → corpus+tests (TDD) → registry+in-app audio verify → Soundboard theme+contrast test (TDD, guards all 4 themes) → Surprise clamp+provenance → **HUMAN GATE** (ear/eye). Complete code in every step; explicit verify-against-source steps for every firmware assumption.

## Next up
1. **Fresh session → /pick-up → subagent-driven execution of the Rings plan.** Tasks 1 and 3–5 need no toolchain; **Task 2 needs emsdk** (`$env:USERPROFILE\emsdk` — desktop has it; check `emcc` before starting Task 2). Commit + push lands after every task.
2. **Task 9 is the human gate** (Andrew's ear/eye pass + docs close-out + consider tagging `v1.2.0`) — everything before it is autonomous-safe.
3. After Rings: **melody tools**, then **Parallax Daily** — both specced with decisions resolved (NEXT-STEPS items 3–4).

## Watch out for
- **The plan's enum orders are best-knowledge, not yet source-verified** (`ResonatorModel`, `FxType`). Task 2 Step 1 / Task 5 Step 1 greps are mandatory; if the source order differs, the shim constants and catalogue order follow the source, not the plan.
- **Pitch convention (note 69 = A440) is assumed** from the Plaits precedent. Task 6 Step 3.5 has the calibration procedure (compare against Braids; fix in the worklet's note push only).
- **PENDING-DECISIONS is empty** — everything for Rings was decided this session and encoded in the spec/plan. Don't re-ask Andrew; just execute.
- Implementer subagents should run on a **smaller model (sonnet-class)** — Andrew's explicit instruction ("plan on running the plan with lower model subagents"). Reviews can stay on the stronger model.
- `.superpowers/sdd/` is git-ignored scratch — per-feature SDD ledgers live there and won't sync across machines; everything durable is in the spec/plan/handoff.
