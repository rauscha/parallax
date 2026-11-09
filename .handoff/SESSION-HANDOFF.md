# Session hand-off — 2026-11-09 (machine: tikiserv · ~/repos/parallax)

## STATE (read this first)
- Branch `main` (the only branch), clean and pushed; no worktrees. 152 tests pass, `npm run check` clean, Impeccable detector clean on every explain-loop file.
- **Explain-loop critique: 25 → 27/40** (`9b259ba`…`f87294e`); that score predates round 3 and knobs-in-cards, so re-run it. Knobs sound when turned from silence; Show me steps and re-strikes on struck models; macro knobs live in their Explain cards (`a847fe2`), which carry a ruler with end words from their own text (Rings, Plaits); knobs without a card show a slim one; a phone strip for knobs without a card; on a phone the order is scope (118px, one small toggle), Explain, Controls, sequencer; type floor fixed app-wide. `LICENSE` (MIT) added, `package.json` matches; the three stale `claude/*` branches are deleted, so `main` is the only branch.
- Everything is deployed at andrewrausch.com/parallax, but none of this session's work has had a human ear or a real phone on it (headless Chromium and measured output only).
- **Waiting on Andrew's eye and ear** (`.handoff/PENDING-DECISIONS.md`, top section) before more design work.

## Done this session
- Critique + snapshots (`.impeccable/critique/`, 3 runs). Audition (`src/state/audition.ts`), `EngineModel.struck`, stepped Show me, `ui/readout.ts`, `KnobRange` ruler words + a test that holds every ruler word to the card's text, `EngagedStrip.svelte`, 53 sub-floor font sizes → `--fs-label`, Laxsynth SINE/PULS text fixed to match the DSP.

## Next up
1. Andrew's eye+ear pass (PENDING-DECISIONS top). Act on it first.
2. Braids card text (the landing engine is the thinnest explanation); verify direction claims before writing ruler words.
3. Struck-model picture for stepped Show me; roving tabindex in ModelPicker.
4. Then melody tools (NEXT-STEPS item 3).

## Watch out for (new)
- **Ruler words must appear in the card text** (`registry.test.ts`): reword the range, not the test.
- **`EngineModel.struck`** drives both audition re-strike and stepped Show me; set it on any new percussive model.
- **Phone Scope/Spectrum**: `.viz-flip` replaces `.viz-toggle` inside the phone media query in `App.svelte`; desktop keeps the two-part switch.
- **`Knob bare`** is the knob inside its card: no label, no ring, hover ignored (the card handles it). `ParamPanel` skips any knob the current model has a card for.
- Stop a preview with `fuser -k 4317/tcp`: `pkill -f` matches its own shell and kills the command.
- Scripted audio checks: scratchpad `v/lib.js` taps the output into an analyser (`window.__tap`) so RMS can be measured headless.

## Earlier this day (afternoon session)

- **FM out** (`3b33cad`): engine, flowsheet, route, `graph` theme, msfa, licence/NOTICE, spike.
  A saved FM preset, recent sound or share link now boots the default engine and keeps only its
  melody (`applySharedState`, covered by `share-url.test.ts`). tend's FM patch note closed as moot.
- **Audit fixes**, one commit each: Explain cards side by side and rows rebalanced (`8894b8c`);
  lab/sandbox text AA on every ground, `KNOWN_SHORTFALLS` now empty (`bba60d6`); type roles
  `--fs-label` / `--fs-prose` with an 11px floor (`9aa802e`); real headings (`a049999`); Match,
  Postcard and MIDI file I/O lazy-loaded, bundle 602 → 526 KB (`ea832b0`); phone toasts and
  transport (`d644ff0`); polish (`68d1c7f`).
- **Explain no longer repeats the model header** the Controls column shows (`63404aa`, Andrew's call).
  All four engines fit at 1440×900.
- **Mobile pass** (`02f24e5`): short touch screens get the phone layout; note keys stack under an
  octave row below 560px; overflow-menu panels are sheets; selects 16px on touch; 320px fits.
- **DESIGN.md + `.impeccable/design.json`** (`670d9fd`). North Star, mood ("bench instrument") and
  "quiet until touched" are Andrew's picks. Colors named by material and brightness, not hue.

## Older gotchas, still true
- **The phone breakpoint is one long media query repeated in several files**:
  `(max-width: 720px), (pointer: coarse) and (max-height: 500px)` (App, ToolsMenu, Knob,
  KeyboardHarness, MatchPanel, GridEditor CSS and its `matchMedia`, the three menu sheets). Change
  it everywhere or not at all. Desktop-only rules use the inverse
  `(min-width: 721px) and (min-height: 501px), (min-width: 721px) and (pointer: fine)`.
- **Svelte drops CSS selectors for attributes set from script** (`[data-more-below]` on Explain).
  Wrap them in `:global(...)` or they silently vanish from the build.
- **Explain's row height is tuned to Rings' four cards at 1440×900** (rows 0.8/1.8/0.9): the cards fit, and Listen for / Good for scroll. Taking height back for the scope cuts into the cards.
- **Scripted screenshots on tikiserv:** `npm run build`, `npx vite preview --port 4317`, then node
  with `NODE_PATH=/home/andrew/repos/backlot/node_modules` and
  `executablePath: ~/.cache/ms-playwright/chromium-1234/chrome-linux64/chrome` (the module's own
  bundled browser version doesn't match). On the desktop the old recipe still applies: Playwright
  Chromium at `%LOCALAPPDATA%\ms-playwright\chromium-1234`, serve `dist/` inside the script on
  `localhost` (audioWorklet needs a secure context).
- **`patchStore.setKey('modelId', …)` must be lowercase.** Still true.
