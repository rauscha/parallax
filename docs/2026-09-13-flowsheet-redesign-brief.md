# Flowsheet redesign — design brief

**Date:** 2026-09-13 · **For:** a Claude Design canvas session · **Target file(s) the winner lands in:**
`src/ui/flowsheet/layout.ts`, `src/ui/flowsheet/Flowsheet.svelte`

This brief exists so the design session does not have to re-derive measurements from a
running app. Everything below was measured live in Chromium at 1536×864 on 2026-09-13.

---

## 1. What this screen is

The **flowsheet teacher** for Parallax's engine #5, a 6-operator FM synth ported from msfa.
Route `#view=flowsheet`. It draws the loaded voice's *algorithm* as a node graph — one node
per operator — with a **live oscilloscope trace read out of the real engine** on every node,
plus the summed output trace and its spectrum.

It is not decoration. The project's identity is the **self-explaining instrument loop**: the
claim printed beside a trace must be demonstrated *by* that trace, and there is an automated
test (`src/ui/flowsheet/claims.test.ts`, the §6.3 gate) that fails the build if the prose and
the picture disagree. Design accordingly: this screen's job is to make **"which operator is
doing what to the sound I hear"** answerable in one glance.

**Audience:** someone who owns a DX7-descendant (a Dirtywave M8, in the author's case) and
could not learn the algorithm from the hardware alone.

## 2. The complaint

On a laptop it is hard to read. The carriers — the operators you actually hear — fall below
the fold, the six traces you are asked to compare are rendered at 144×46, and roughly a third
of the screen is empty.

## 3. Measurements (1536×864, Chromium, taken live)

| Element | Measured | Note |
|---|---|---|
| Diagram (`.sheet`) | **376 × 748** | the subject of the view gets **25%** of the width |
| Side panel (`.side`) | **1077 × 432** | summaries get **73%**, leaving a 1077×320 empty rect |
| Page `scrollHeight` | **1027** vs 864 viewport | 163px below the fold |
| OP 1 / OP 3 (carriers) | top 751, **bottom 883** | **cut off** — must scroll to see them |
| Chrome above diagram | **243px** | sticky bar 57 + a 445-char hint paragraph at 142 |
| Node box | 160 × 132 | nearly square |
| Node scope canvas | **144 × 46** | ×6 — the things being compared |
| Node envelope canvas | 144 × 16 | |
| Output trace canvas | **1077 × 96** | 7.5× the width of a node trace |
| Spectrum canvas | 1077 × 132 | |
| Silent operators, this voice | **4 of 6** | four identical near-empty boxes |

**Root cause, one line:** the view spends its scarce axis (vertical) on prose, and its
abundant axis (horizontal) on the two least diagnostic signals.

## 4. The constraint that decides everything

Node positions are **generated**, not hand-placed, by `layoutAlgorithm()` in `layout.ts`,
for all 32 DX7 algorithms. Measured across all 32:

- **Row depth:** 1 row ×1 algorithm · 2 rows ×14 · 3 rows ×14 · **4 rows ×3** (algorithms 1, 2, 18)
- **Max natural box:** 1112 × 748 — widest is algorithm 32 (six carriers in a row)

So the diagram is **never deeper than 4 rows** and nearly fits a laptop already. This is a
*reallocation* problem, not a rotation problem.

Current geometry constants (`layout.ts`): `NODE_W 160`, `NODE_H 132`, `COL_PITCH 184`,
`ROW_PITCH 164`, `OUT_H 92`, `PAD 16`.

## 5. Hard constraints — do not break these

1. **Keep carriers along the bottom, modulators stacked above, signal flowing down.**
   `layout.ts` argues for this deliberately: it is the convention every FM panel and manual
   uses, and someone who has seen an algorithm chart should recognise this one. Rotating to
   a left-to-right flow was considered and rejected.
2. **The `graph` theme is locked and already passed its eye pass.** Do not propose a new
   palette or typeface. Tokens live in `src/ui/themes/tokens.css` and are guarded by
   `contrast.test.ts` across five themes. Key values:
   `--bg` cool paper with a 24px ruled grid · `--surface #FFFFFF` · `--hairline #A8B0BC` ·
   `--text #14161A` (16.3:1) · `--text-muted #3D444F` (8.7:1) · `--text-dim #5A626F` (5.6:1) ·
   `--signal #0072B2` Okabe-Ito blue (4.7:1) · `--accent #B54600` Okabe-Ito vermillion (5.0:1) ·
   `--scope-persist: 0`, `--scope-bloom: 0` (the scope is a **plot** in this theme, not a CRT).
3. **The author is colorblind.** Never encode meaning in hue alone — pair every colour cue
   with a second channel (dash pattern, weight, label, position, luminance). Avoid
   low-opacity colour for anything meaningful; translucent orange in particular reads as
   invisible. *(The existing wires already do this correctly — dashed = modulation, solid =
   audio, both at full-strength Okabe-Ito. Preserve that.)*
4. **Design for a computer screen.** This view has its own route precisely so it does not
   have to be responsive down to a phone. The rest of the app is a responsive PWA; this
   isn't. Target 1536×864 and 1366×768.
5. **Silence must stay visible as silence.** A silent operator is information — the teaching
   line is "turn these and watch which traces move." It may be drawn *smaller* or quieter,
   but it may not be hidden.

## 6. What the design must answer

These are the questions a static comp usually gets wrong, so please address them explicitly:

- **a.** Does the arrangement hold for a **4-row** algorithm (1, 2, 18) *and* for
  **algorithm 32's six carriers side by side** (1112px natural width)?
- **b.** Is the node trace legible at the proposed size, with real signal in it?
- **c.** Does a **silent** operator still read as an operator rather than as an error?
- **d.** Where does the 445-character hint paragraph go? It costs 142px on every visit for
  something read once.

## 7. Direction already proposed (a starting point, not a constraint)

From the `frontend-design` pass — treat this as one candidate to beat:

1. **The output is the diagram's destination, not its sidebar.** In the signal flow the
   output *is* the bottom of the chart; `layout.ts` already reserves `OUT_H = 92` for it.
   Moving output + spectrum to a full-width footer strip under the carriers kills the
   two-column split, reclaims the dead rectangle, and puts the summary where the eye already
   travels.
2. **Nodes wider and shorter, because a waveform is.** ~216×112 with a ~204×56 trace: bigger
   trace in *both* axes, ~20px less height per row. Vertical is the scarce axis.
3. **Silence drawn as silence** — flat line and label, not an identical detailed box.
4. **One live thing: the lit path.** Draw the wire from a sounding modulator at full weight
   and a zero-index wire as a hairline ghost, so the actual signal path through the algorithm
   is visible at a glance. Currently that is only recoverable by reading six "IDX 0 / SILENT"
   labels.

Rough fit check for that candidate: worst case 56 + 72 + 552 + 180 + gaps ≈ **910** against
864 — about 50px of scroll with the carriers visible on load. 29 of 32 algorithms fit outright.

## 8. Deliverable

Artboards at **1536×864** and **1366×768**, using the real tokens above and, where a trace is
shown, real captured waveform data rather than a drawn approximation. Two or three genuinely
different arrangements are more useful than one refined one.

**Out of scope for the canvas:** verifying against the live engine and the 32 generated
algorithms, and updating `layout.test.ts` / `readout.test.ts` / `claims.test.ts`. That work
happens in the repo after an arrangement is chosen.
