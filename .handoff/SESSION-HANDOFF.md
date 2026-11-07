# Session hand-off — 2026-11-07 (machine: tikiserv · ~/repos/parallax)

## STATE (read this first)
- Branch `main`, clean and pushed through `68d1c7f`. 137 tests pass, `npm run check` is clean, and
  Impeccable's detector reports nothing across `src/` and `index.html`.
- **FM is retired** (`3b33cad`): engine, flowsheet, `graph` theme, msfa, all of it. Recover from
  the `v1.3.0` tag. Saved FM presets, recent sounds and links load the default engine and keep
  only their melody (`share-url.test.ts`).
- An `/impeccable audit` of the four remaining engines scored 15/20; every finding was fixed in
  one commit per step: layout `8894b8c`, contrast `bba60d6`, type `9aa802e`, headings `a049999`,
  lazy loading `ea832b0`, phone `d644ff0`, polish `68d1c7f`.

## Owed: Andrew's eye
1. **Plaits (sandbox) and Laxsynth (lab) text tokens changed** (`bba60d6`): `--text-muted` and
   `--text-dim` both moved, keeping their step, so dim clears AA on every panel. The earlier note
   said to propose this first since both skins had passed his eye; it was applied under "run
   through them step by step". Revert that one commit if it reads wrong.
2. **Explain at 1440×900**: knob cards now sit side by side and the prose is 13px with an 80ch
   measure. Braids, Plaits and Laxsynth fit; Rings (four long cards) scrolls, with a fade at the
   bottom edge. Grid mode gives the sequencer more height.

## Next up
1. `/impeccable document`: DESIGN.md for the **four** themes (lab, sandbox, phosphor, rings).
   Record the type roles (`--fs-label`, `--fs-prose` in `base.css`) and the new lab/sandbox text
   values.
2. Open question for Andrew: Explain repeats the model code, name, family and one-line
   description that the Controls column already shows. Dropping it from Explain would free ~70px
   for the cards. Not done, since it removes content.
3. Then the roadmap resumes with melody tools (`docs/superpowers/specs/2026-06-20-melody-tools.md`).

## Watch out for
- **The Bash sandbox cannot reach the preview dev server** (`localhost:5173` is refused from Bash). For scripted screenshots:
  - `npm run build`, then run Playwright with the Playwright-managed Chromium at `%LOCALAPPDATA%\ms-playwright\chromium-1234`, using `playwright-core` installed in a scratch folder.
  - Serve `dist/` from an `http.createServer` **inside the script**, bound to `127.0.0.1` and loaded as `localhost` (a secure context is required for `audioWorklet`).
  - `page.route` does **not** intercept worklet module loads, so routing alone fails.
  - Launch with `--autoplay-policy=no-user-gesture-required`, click "Tap to start audio", then the FM button, set `location.hash = "view=flowsheet"`, then click "Hold a note".
- **The hidden browser pane does not run ResizeObserver or resize events** until a screenshot forces a render. Stale canvas widths and a stale "needs a wider screen" gate there are harness artefacts, not bugs; take a screenshot, then measure.
- **Changing a voice leaves the previous voice's release in the dB readouts** for about a second. Measure after a pause.
- **`patchStore.setKey('modelId', …)` must be lowercase.** Still true.
- **`claims.test.ts` checks trace data, never drawn pixels.** Known gap, still open.
- **Impeccable hooks** are in `.claude/settings.local.json`. The design hook stops giving hints on a file after 6 edits in a session.
