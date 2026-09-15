# Flowsheet audit — `/impeccable audit src/ui/flowsheet`

**Date:** 2026-09-15 · **At:** `c4fb0e7` · **Scope:** `src/ui/flowsheet/Flowsheet.svelte` and the `graph` theme it always renders in (flowsheet requires FM, FM → graph).
**Method:** bundled detector on `src/ui/flowsheet` + `src/ui/themes`; contrast computed for every graph text token on all three surfaces; live dev server, all 14 voices measured at **1536×864** and **1366×768** by script (overflow, carrier/pane positions, clipped nodes, target sizes, rendered font sizes).
**Gate rule (NEXT-STEPS 7a):** fix accessibility, 1366–1536 breakage and §6.3 honesty findings before `v1.3.0`; park taste.

## Audit Health Score

| # | Dimension | Score | Key Finding |
|---|-----------|-------|-------------|
| 1 | Accessibility | 3 | Vermillion `FB` label on a silent node is 4.41:1 (AA needs 4.5) |
| 2 | Performance | 3 | 58–60 fps, 0 dropped; `getComputedStyle` read 7× per frame |
| 3 | Responsive Design | 2 | At 1366×768 the whole subject of *Feedback Alone* is off-screen |
| 4 | Theming | 4 | Fully tokenised; two hard-coded `ui-monospace` stacks |
| 5 | Implementation Integrity | 4 | Coherent, product-specific; both detector hits are false positives here |
| **Total** | | **16/20** | **Good** |

## Implementation Integrity Verdict — PASS

This is a product-specific system, not a template. Every trace is tap data from the running engine, on one shared trigger; wire state is carried by dash, weight and text as well as hue (the colourblind rule is followed, with a written exception for the carrier edge in `.impeccable/config.json`); the voice picker costs no vertical space; the gates explain themselves in plain language. Detector results, verified:

- `bounce-easing` at `tokens.css:73` — `--t-spring` is **defined in every theme and used nowhere** (`grep` finds no consumer). Not a flowsheet issue; a dead token. P3.
- `codex-grid-background` at `base.css:125` (advisory) — **false positive.** The graph theme is a drafting surface by design (spec §5, eye-passed 2026-09-12), and the flowsheet paints `--bg` over it anyway.

## Executive Summary

- **16/20, Good.** Issues: P0 0 · P1 2 · P2 3 · P3 4.
- The redesign holds at **1536×864**: 13 of 14 voices fit with no horizontal scroll; the 4-row algorithms overflow by 1 px.
- **1366×768 is where it breaks**, and the worst case is the voice whose lesson is one node.
- Next: fix the two P1s (layout + one contrast pair), then Andrew's eye pass, then tag.

## Detailed Findings

### [P1] Algorithm 32 and 20/12 clip operators at 1366×768
- **Location:** `layout.ts` (`STACK_SUMMARIES_ABOVE`, node geometry); `Flowsheet.svelte:1065` `.sheet-scroll`; `layout.test.ts` only asserts 1536×864.
- **Category:** Responsive (and §6.3 — the trace beside the claim must be visible to demonstrate it)
- **Measured:**
  - **Feedback Alone** (alg 32): sheet 1448 px in a 1311 px column. **OP 6 — the only sounding operator, and the feedback loop the voice is named for — sits at x 1236–1452, behind an inner horizontal scrollbar.** The feedback-wire pane ends at y 881 against a 768 viewport. Both halves of the lesson are off-screen on landing. *One Operator* shares the layout.
  - **Tine Piano, Reed Piano** (alg 20, 12): sheet 968 px in 938 px; OP 6 cut by 30 px.
- **Impact:** a learner on the most common laptop resolution sees five "not sounding" boxes and a flat output, and has to discover a scrollbar to find the one that matters.
- **Recommendation:** add 1366×768 to `layout.test.ts` as a second asserted size (every algorithm fits, carriers and sounding operators on screen), then let the geometry answer it — e.g. tighter column pitch for 6-wide rows under ~1450 px, or stacking the summaries by available width rather than by diagram width alone. The test is the arbiter, as for 1536.
- **Suggested command:** `/impeccable adapt src/ui/flowsheet`

### [P1] `FB` label fails AA on a silent node
- **Location:** `Flowsheet.svelte:1103` `.node-head .fb` (`--accent`) on `.node.silent` (`--surface-sunken`)
- **Category:** Accessibility · **WCAG** 1.4.3
- **Measured:** `#B54600` on `#E4E7EC` = **4.41:1** at 10.6 px bold. Occurs live on *One Operator* ("FB 0" on silent OP 6). `--signal` on sunken is 4.18:1 too, though no text uses that pair today.
- **Why the test missed it:** `contrast.test.ts` checks text tokens against `--bg` only, never `--surface` or `--surface-sunken`.
- **Recommendation:** darken `--accent` enough to clear 4.5 on sunken (≈ `#A84100`), or drop `.fb` to `--text` on silent nodes; extend `contrast.test.ts` to all three surfaces so the next pair is caught.
- **Suggested command:** `/impeccable colorize` (token) — or a direct one-line fix plus the test

### [P2] Four-row algorithms put the output below the fold at 1366×768
- **Location:** layout of algorithms 1, 2, 18 — *Parallax Bell* (the default voice), *Thumb Bass*, *Growl Bass*, *Hiss*, *Two Operators*.
- **Measured:** carriers bottom at 769, OUTPUT — SUM at 830, viewport 768. (At 1536×864: 1 px overflow, P3.)
- **Impact:** the landing voice shows the sum node only after a scroll; carriers are visible, so the lesson survives.
- **Suggested command:** `/impeccable adapt` (same pass as the P1)

### [P2] The node's explanations are mouse-only
- **Location:** `Flowsheet.svelte:790` `aria-label` on `.node`; `title` on `.ratio`, `.level`, `.meas`, `.silent-tag`
- **Category:** Accessibility
- **Impact:** the `ratioTitle()` text — *"a whole-number ratio locks… that is what you are seeing when the trace walks"* — is the lesson, and it lives only in `title`, which keyboard, touch and screen-reader users don't get. The button's `aria-label` also replaces its content, so the measured dB and the "not modulating" distinction never reach assistive tech. And the node is a `<button>` that does nothing when pressed.
- **Recommendation:** keep focusability (focus drives the wire highlight) but surface the focused/hovered node's explanation as visible text in the side column, and fold dB + silent reason into the accessible name. Consider `role="group"` with `tabindex="0"` instead of an inert button.
- **Suggested command:** `/impeccable clarify src/ui/flowsheet`

### [P2] Ghosted wires and non-hover wires rely on translucency and a 2:1 grey
- **Location:** `drawWires()` — `globalAlpha` 0.25 for un-hovered wires, 0.75 × `--hairline` (1.97:1 on `--bg`) for dead paths
- **Category:** Accessibility · **WCAG** 1.4.11 (non-text contrast)
- **Impact:** dead-path state is backed by dash rhythm, weight and the legend, so meaning survives; but the hover emphasis is carried *only* by translucency, which the project rule says Andrew may not perceive.
- **Recommendation:** add a weight or dash change to the emphasis (lit wires already thicken — make un-lit ones thinner rather than fainter).
- **Suggested command:** `/impeccable polish`

### [P3] Polish
- `palette()` calls `getComputedStyle` 7× per frame (`Flowsheet.svelte:235`); cache on theme/patch change. Measured 58 fps, 0 dropped, so not urgent. `drawWires` also repaints every frame though it only changes on hover/patch. → `/impeccable optimize`
- `OUTPUT — SUM` wraps "1 + 2 + 3 + 4 + 5 + 6" onto two lines at 160 px.
- `.node-foot`, `.stats`, `.out-sub` and the spectrum canvas font hard-code `ui-monospace, monospace` instead of `var(--font-mono)`.
- `--t-spring` (the detector's bounce easing) is unused in every theme — delete it.

## Patterns & Systemic Issues
- **The geometry guard covers one screen.** `layout.test.ts` asserts 1536×864 and the redesign is excellent there; nothing asserts 1366×768, which is where both P1-class layout failures live. Same shape as the fit-each clamp: correct against the thing that's tested.
- **Contrast is guarded against one surface.** The graph theme has three grounds; the test checks one.

## Positive Findings
- Honesty is structural: the ratio printed is the measured frequency (`claims.test.ts`), the dB figure is measured rather than authored, and "not sounding" vs "not modulating" distinguishes the two zeros correctly.
- Colourblind rule followed with discipline: dash/solid/grey, CARRIER text + heavy edge, FB labelled, no meaningful translucent fills.
- Knobs are real sliders (`role="slider"`, `aria-valuetext`), the voice picker is a labelled native select that steps with arrow keys, and every gate message is a plain-language explanation rather than a blank.
- Taps off by default and off on unmount; 58–60 fps with 8 live traces and an FFT.
- Every text token clears AA on `--bg` and `--surface`; all controls in the bar clear the 24 px target minimum.

## Resolution (same day)

| Finding | Commit | Outcome |
|---|---|---|
| [P1] 1366×768 layout | `4f69772` | Compact node geometry chosen per window (`geometryFor`); `layout.test.ts` asserts 1920×1080, 1536×864, 1440×900, 1366×768. Measured live: 0 px horizontal scroll on all 14 voices, carriers and sum on screen, Feedback Alone's OP 6 at x 1274 of 1366. 1536×864 unchanged. |
| [P2] Output below the fold | `4f69772` | Sum bottom 762 of 768 on the four-row voices; the sum no longer wraps; stacked algorithms lay their three summaries side by side. |
| [P1] `FB` contrast | `cac7932` | Graph `--accent` → `#A84100` (4.95:1 on sunken); `--signal-ink` split to `#0066A0` (was 4.18:1 on sunken). `contrast.test.ts` now covers all four grounds in all five themes; three older `--text-dim` shortfalls in lab/sandbox recorded in `KNOWN_SHORTFALLS`, not fixed — they are outside the flowsheet and touch eye-passed themes. |
| [P2] Mouse-only explanations | `a8f3121` | One `explain()` feeds a visible reading panel and each node's `aria-describedby`; nodes are focusable groups, not inert buttons. Two wording errors corrected on the way (IDX 0 "bare sine"; whole-number feedback operators "stand still"). |
| [P2] Wire emphasis by translucency | polish commit | Hover now thickens lit wires and thins the rest at full opacity. Dead paths stay hairline grey at ~2:1, backed by dash rhythm, weight, the legend and node text — still under 1.4.11's 3:1 as a graphic, deliberately. |
| [P3] polish | polish commit | Palette cached per theme; wires redrawn only on hover/patch change; `var(--font-mono)` throughout; `--t-spring` deleted; legend entries no longer split. |

## Recommended Actions
1. **[P1] `/impeccable adapt src/ui/flowsheet`** — add 1366×768 to `layout.test.ts`, then make algorithms 32, 20, 12 fit (and 1/2/18 if the geometry allows).
2. **[P1] contrast fix** — `.fb` on silent nodes; extend `contrast.test.ts` to `--surface` and `--surface-sunken`.
3. **[P2] `/impeccable clarify src/ui/flowsheet`** — keyboard/SR-reachable node explanations.
4. **[P2/P3] `/impeccable polish`** — wire emphasis by weight, the polish items; parked until after the tag unless trivial.
