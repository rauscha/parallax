# Session hand-off — 2026-09-15 (machine: desktop · c:\parallax)

## STATE (read this first)
- Branch: `main`, **clean + synced**. Untracked are still only the Impeccable install (`.claude/agents`, `.claude/skills`, `.github/*`), deliberately left out of git.
- **`v1.3.0` is tagged and pushed** (annotated tag on `0f90a1e`). It covers FM engine #5, the `graph` theme, scope taps, the flowsheet view, its redesign and this session's audit fixes. 277 tests pass and `npm run check` is clean.
- **NEXT ACTION:** run `/impeccable document` in a fresh session. It writes DESIGN.md for **all five themes** (lab, sandbox, phosphor, rings/"Soundboard", graph), derived from the shipped code.

## Done this session
1. **`/impeccable init`**: PRODUCT.md (`c4fb0e7`). Confirmed answers: the primary user is synth-curious learners; success means "they carry it back" to hardware; the build path is deliberately not recorded in `.impeccable/config.json`.
2. **`/impeccable audit` on the flowsheet**: 16/20 (`eae6ebe`), report in `reviews/2026-09-15-flowsheet-audit.md`. That file now ends with a resolution table.
3. **adapt** (`4f69772`): `layout.ts` has `STANDARD` and `COMPACT` geometries, and `geometryFor(viewportW, viewportH)` picks one per window, never per algorithm.
   - Compact: 188×114 nodes with 172×46 scopes.
   - `layout.test.ts` asserts 1920×1080, 1536×864, 1440×900 and 1366×768: no horizontal scroll, carriers and output sum on screen.
   - The output sum no longer wraps. Stacked algorithms lay the three summaries in a row.
4. **Contrast** (`cac7932`): graph `--accent` changed `#B54600` → `#A84100`.
   - Graph `--signal-ink` is now its own `#0066A0`. `--signal` stays `#0072B2` for traces.
   - `contrast.test.ts` checks text tokens (plus `--accent`) on all four grounds in all five themes.
   - `KNOWN_SHORTFALLS` records three older `--text-dim` pairs in lab and sandbox. The list can only shrink: an entry that starts passing fails the test.
5. **clarify** (`a8f3121`): one `explain(op)` function feeds both the visible reading panel (fixed 5 lines) and each node's `aria-describedby`.
   - Nodes are `role="group" tabindex="0"`, not inert buttons.
   - Fixed two wrong claims: "IDX 0 → bare sine" (false on fan-in algorithms), and whole-number feedback operators "standing still".
6. **polish** (`a960240`):
   - Hover emphasis is by line weight, not opacity.
   - The palette is cached per theme; wires redraw only when state changes.
   - Hard-coded monospace stacks now use `var(--font-mono)`. Deleted the unused `--t-spring`. Legend entries no longer split.
7. **Andrew's flowsheet eye pass: PASSED**, from contact sheets of all 14 voices at both sizes. He accepted two tile notes:
   - the idle reading box leaves empty space on algorithm-32 voices
   - Tine and Reed Piano's side column lands 1 px above the 768 fold

## Next up
1. **`/impeccable document`**: load `.claude/skills/impeccable/reference/document.md`; the `impeccable-documenter` subagent exists for it.
   - Theme follows engine: braids→phosphor, plaits→sandbox, laxsynth→lab, rings→rings ("Soundboard"), fm→graph. `:root` mirrors lab.
   - All tokens live in `src/ui/themes/tokens.css`; shared base rules are in `base.css`.
   - Record the **post-audit** graph values (accent `#A84100`, signal-ink `#0066A0`) and the two flowsheet geometries.
   - Graph deliberately has **no fill-only colour**: every colour is text-safe.
2. Optional follow-up: the lab/sandbox `--text-dim` shortfalls. A background task chip was offered this session. Both themes are eye-passed, so propose options with measured ratios before changing tokens.
3. Parked audit items, not gating:
   - Dead-path wires sit at ~2:1 (under the 1.4.11 3:1 guideline) on purpose; dash, weight, legend and node text carry that state.
   - The idle reading box could collapse on stacked layouts.
4. After that the roadmap resumes with melody tools (`docs/superpowers/specs/2026-06-20-melody-tools.md`).

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
