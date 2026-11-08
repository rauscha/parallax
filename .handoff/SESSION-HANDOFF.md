# Session hand-off — 2026-11-07 evening (machine: tikiserv · ~/repos/parallax)

## STATE (read this first)
- Branch `main`, clean and pushed. 152 tests pass, `npm run check` clean, Impeccable detector clean on every explain-loop file.
- **Explain-loop critique: 25 → 27/40** over three fix rounds (`9b259ba`…`f87294e`). Knobs sound when turned from silence; Show me steps and re-strikes on struck models; macro knobs live in their Explain cards (`a847fe2`), which carry a ruler with end words from their own text (Rings, Plaits); knobs without a card show a slim one; phone strip; type floor fixed app-wide.
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

## Next up
1. Andrew's eye pass on today's changes (three items in PENDING-DECISIONS). Act on what he says first.
2. **`/impeccable critique`, aimed at the explain loop** (knob → card → Show me → prose). DESIGN.md
   and PRODUCT.md now load as context. Likely follow-ups: `onboard` (start screen, empty sequencer),
   `clarify`, `delight`.
3. Re-run `/impeccable audit` to rescore.
4. Then melody tools (NEXT-STEPS item 3, spec `docs/superpowers/specs/2026-06-20-melody-tools.md`).

## Watch out for
- **The phone breakpoint is one long media query repeated in several files**:
  `(max-width: 720px), (pointer: coarse) and (max-height: 500px)` (App, ToolsMenu, Knob,
  KeyboardHarness, MatchPanel, GridEditor CSS and its `matchMedia`, the three menu sheets). Change
  it everywhere or not at all. Desktop-only rules use the inverse
  `(min-width: 721px) and (min-height: 501px), (min-width: 721px) and (pointer: fine)`.
- **Svelte drops CSS selectors for attributes set from script** (`[data-more-below]` on Explain).
  Wrap them in `:global(...)` or they silently vanish from the build.
- **Explain row heights are tuned to Rings' four cards at 1440×900.** Braids/Plaits/Laxsynth have
  spare room under their cards on purpose; giving it to the scope pushes Rings back over.
- **Scripted screenshots on tikiserv:** `npm run build`, `npx vite preview --port 4317`, then node
  with `NODE_PATH=/home/andrew/repos/backlot/node_modules` and
  `executablePath: ~/.cache/ms-playwright/chromium-1234/chrome-linux64/chrome` (the module's own
  bundled browser version doesn't match). On the desktop the old recipe still applies: Playwright
  Chromium at `%LOCALAPPDATA%\ms-playwright\chromium-1234`, serve `dist/` inside the script on
  `localhost` (audioWorklet needs a secure context).
- **`patchStore.setKey('modelId', …)` must be lowercase.** Still true.
- **`.impeccable/config.json` still ignores a rule for the deleted `Flowsheet.svelte`.** Harmless;
  drop it next time that file is touched.
