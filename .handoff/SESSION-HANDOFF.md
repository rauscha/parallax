# Session hand-off — 2026-09-14 (machine: desktop · c:\parallax)

## STATE (read this first)
- Branch: `main`, **clean + synced**. One worktree only. The only untracked files are the Impeccable install (`.claude/agents`, `.claude/skills`, `.github/*`) — deliberately not committed, see "Watch out for".
- **The flowsheet redesign is built and pushed.** It was hard to read on a laptop; it now fits 1536×864 with the carriers on screen, legible traces, ghosted dead paths, and a voice picker in the header. 243 tests, `npm run check` clean.
- **NEXT ACTION:** the release gate for `v1.3.0` — Impeccable `init` → `audit` (flowsheet only) → fix material findings → Andrew's eye pass → tag. Order and reasoning below.

## Done this session
1. **Diagnosed the laptop complaint by measurement** (`f08e8d1`, brief at `docs/2026-09-13-flowsheet-redesign-brief.md`). Diagram got 376px of 1536; carriers sat at y 751–883 in an 864 viewport; node traces 144×46. Across all 32 algorithms the diagram is never deeper than 4 rows → reallocation, not rotation; DX7 carriers-at-bottom convention kept.
2. **Real bug: "Fit each" was clamping quiet traces** (`66d6c62`). Absolute `0.002` divide-by-zero floor sat only ~18 dB under the loudest trace, so OP 2 on Parallax Bell (−32 dB, the operator that makes it a bell) drew at 20% of its box while the button said it was fitting. Now `src/viz/trace-gain.ts`, floor relative to the sheet (60 dB). 20% → 96%.
3. **Re-proportioned the sheet** (`9252b8d`). Nodes 216×128 (were 160×132 with ~20px of measured dead slack), scope 200×60 (+81% area). `ROW_PITCH` 148, `OUT_H` 64. Hint paragraph moved behind a `?`. Algorithms wider than `STACK_SUMMARIES_ABOVE = 1000` (4 of 32) stack output/spectrum below. Carriers now bottom at 769 worst case; page height 864, no scrollbar.
4. **Ghosted dead paths** (`46690c6`). Zero-index / zero-volume / zero-feedback wires draw hairline grey, thinner, tighter dash (three channels, not hue). Silent tags now say **"not sounding"** (carrier at vol 0) vs **"not modulating"** (modulator at idx 0). Legend has the third state.
5. **Voice picker in the header** (`563229b`). The voice name is a native `<select>`, 14 voices in 6 families, zero vertical cost. Swept all 14 at 1536×864: no problems; stacking fires on exactly the two algorithm-32 voices. This also closed the one unverified path from step 3.
6. **Tooling:** Impeccable installed (project scope, `npx impeccable install`); `.impeccable/config.json` committed with a scoped ignore for the carrier's 4px left edge (it's the colourblind weight channel, not decoration) (`9a5ec84`). Three flowsheet arrangement mockups published as a Claude Design canvas: https://claude.ai/code/artifact/b5c4af2a-cab8-452e-86a2-a267c5d426bf — **A + two ideas from B** was chosen and is what got built.
7. **Decision recorded:** `v1.3.0` waits for the flowsheet (Andrew, 2026-09-13).
8. **Hardware (not repo work):** RD-700GX over USB fails — Roland vendor driver `RDID1048`, Problem Code 39, 0 MIDI in ports; newest Roland Windows driver is 1.0.1 for Win 8.1, none for 10/11. Plan is DIN MIDI OUT → **ESI M4U eX** (class-compliant, names Windows 11) + a long 5-pin cable. Tool list saved to Mindscape: `D:\mindscape\wiki\design-tools-for-agents.md`.

## Next up
1. **`/impeccable init`** — PRODUCT.md. Without it the audit judges against generic product assumptions (it already mis-flagged the carrier edge once).
2. **`/impeccable audit` on the flowsheet only** — the release delta. The instrument passed its gates at v1.0–1.2; don't re-audit it now. Fix material findings only (accessibility, breakage at 1366/1536, anything against the §6.3 honesty rule); park taste-level ones.
3. **Andrew's flowsheet eye pass** on the real thing (`#view=flowsheet`), paging through all 14 voices with the picker. Still uncleared.
4. **Tag `v1.3.0`** (remote write — his explicit OK). Then `polish`, `document` (DESIGN.md), and the parked list as normal work.
5. Afterwards the roadmap resumes: melody tools (spec `docs/superpowers/specs/2026-06-20-melody-tools.md`).

## Watch out for
- **`patchStore.setKey('modelId', …)` must be lowercase.** `indexForCode` and `bindings.ts` match lowercase; the authored code (`"SINE"`) silently does nothing. Cost a real detour. `voices.test.ts` guards it.
- **The browser pane blocks Web MIDI** (`NotAllowedError`). MIDI input can only be tested in real Chrome. Pane screenshots also letterbox when the emulated viewport is smaller than the pane — measure with JS, or clear emulation for a legible image.
- **`claims.test.ts` never covered drawn pixels** — it checks trace data via `readout.ts`/`fft.ts`, which is why the fit-each clamp survived the §6.3 gate. A known gap, not yet closed.
- **Impeccable install is untracked on purpose** (a Windows `.exe` plus agents/skills). On the laptop, rerun `npx impeccable install` before using it. Its hooks live in `.claude/settings.local.json`: a PostToolUse check per edit and a ~30 s Stop "design deep pass" — disable the Stop hook if it drags.
- **The 60 dB fit-each ceiling is a judgment call** (honesty: don't amplify quantisation noise into a waveform). Deepest real modulator in the corpus is ~32 dB down.
- Session saw ~1800 "dropped" frames in the stats readout during scripted reloads and rapid voice swaps — almost certainly harness churn, but worth a clean-load glance during the eye pass.
