# Waiting on you

Updated 2026-06-04 (overnight run — grid polish + staff key-sigs + CSP + audio fixes + M4 groundwork all shipped).

Full detail + the quick eyeball/ear checks are in [OVERNIGHT-LOG-2026-06-04.md](OVERNIGHT-LOG-2026-06-04.md). The three genuine decisions:

## 1. M4 — per-model envelope (AD) amounts (needs your ears)
The shim setters that give each model a built-in attack/decay (so PLUK/BELL/drum models pluck-and-decay instead of droning) are ready but default to 0. Wiring real values changes how every model **sounds**, so it needs ear-tuning — and it pairs with grid **G5** (per-step expression).
- **(a, recommended)** Next session I author conservative amounts for the clearly-percussive models and we ear-tune together.
- **(b)** Leave at 0 until G5.
- **(c)** You hand me a per-model amount table.
*Deferred because I can't ear-test (AudioContext needs a real click), so authoring audible values blind was the wrong call.*

## 2. M4 — Explain-panel visuals (design taste)
The per-model TIMBRE/COLOR **text** panel is shipped. The delight layer isn't: animated mini-diagrams, a knob↔card highlight, and a "show me" sweep that wiggles the macros to demo the sound.
- **(a, recommended)** Design them together interactively.
- **(b)** I take a first pass at simple static diagrams for you to react to.
- **(c)** Skip for v1.
*Deferred because taste-heavy work is a poor fit for an unattended run.*

## 3. Staff: lines now run under the clef — confirm or revert
Adding key signatures surfaced that the staff lines used to start *right of* the clef, leaving the clef + time signature floating in blank space. I extended the lines under the whole header (correct engraving, needed for key sigs to read). This slightly changes the existing staff's look.
- **(recommended)** Keep — it's how real sheet music looks.
- Or say the word and I revert just that part.

## Resolved this session
- ✓ Grid polish: keyboard nav, swipe-between-bars, desktop 2-bar view (`930b3c8`, `5173d21`)
- ✓ Staff: key signatures + first-note breathing room (`0d899e7`)
- ✓ Security: production CSP via meta tag + fixed `npm run preview` (`fa8ae42`)
- ✓ Three small audio bugs: octave-strand, pitch-bend, panic (`98823ed`)
- ✓ M4 groundwork: Explain panel data/text layer (`f9f06df`)
