# Session hand-off — 2026-11-07 (machine: tikiserv · ~/repos/parallax)

## STATE (read this first)
- Branch `main`, clean and pushed. 137 tests pass, `npm run check` is clean, Impeccable's detector
  reports nothing across `src/` and `index.html`, and `impeccable doctor` has no findings.
- Parallax is four engines now. **FM, the flowsheet and the `graph` theme are retired** (`3b33cad`;
  recover anything from the `v1.3.0` tag). An Impeccable audit (15/20) was fixed end to end, a phone
  pass fixed landscape and narrow screens, and **DESIGN.md exists** ("The Open Panel").
- **Waiting on Andrew's eye before more design work** (`.handoff/PENDING-DECISIONS.md`): the
  Plaits/Laxsynth text colors, the laptop layout, and the phone on a real device.

## Done this session
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
