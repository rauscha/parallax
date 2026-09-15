# Product

<!-- impeccable:product-schema 1 -->

## Platform

web

## Users

**Synth-curious learners** (confirmed 2026-09-14): people who want to understand how a macro-oscillator, a resonator or a six-operator FM voice actually makes its sound, usually because they own or want gear that doesn't explain itself. The origin case is a Dirtywave M8 owner whose Macro synth (Braids) can't be learned from the hardware alone. They arrive with curiosity and a vague sense of what the knobs do, and leave knowing *why* the sound changed.

Andrew is one of these learners and the sole developer, but the design serves strangers: a trade-off that only makes sense to the author is the wrong one.

## Product Purpose

Parallax is a browser instrument that runs the real synthesis engines and tells the truth about them while you play. Pick a model, turn a knob, and the prose describing that knob rewrites itself, a readout shows where it sits, the oscilloscope shows what happened, and "Show me" sweeps the control to perform the manual.

**Success** (confirmed): the learner **carries it back** — they take the understanding to real hardware (an M8, a Eurorack module, a DX-style FM synth) and can predict what a control will do there. Playing sounds and understanding them in-app are means to that, not the end.

## Positioning

The WASM ports are table stakes; prior art exists and it will commoditise. What no neighbouring product does is **the self-explaining instrument loop**: per-model prose that rewrites itself, live readouts, knob↔card linking, the "Show me" sweep, and a hand-verified model corpus that is simultaneously the explanation, the search index and the sound-match ranker. For FM, the flowsheet extends the same claim to the picture: every operator's trace is read from the *running engine*, and the ratio printed beside a node is the measured frequency of the trace next to it.

Honesty is the mechanism. A claim the audio or the trace would contradict is a bug.

## Operating Context

- Played from a laptop or desktop browser, and on phones as an installed PWA. Input: the clickable 4-bar staff (or step grid), the on-screen/computer keyboard, and **Web MIDI** controllers (Chromium, secure context).
- Five engines, each with its own skin, switched by selecting the engine: **Braids** (47 models, firmware-verified), **Plaits**, **Laxsynth** (original clean-room wavetable voice, M8 WavSynth class), **Rings** (12 resonator models), **FM** (14 hand-authored voices across the 32 algorithms).
- The **FM flowsheet** (`#view=flowsheet`) is a teaching view designed for a computer screen (fits 1536×864); the instrument stays mounted and playing behind it.
- Sharing and keeping: share URLs (`#p=`), postcards with QR, a preset library (IndexedDB), MIDI file import/export, one-loop audio export, Surprise and Match.

## Capabilities and Constraints

- **Stack (existing):** Svelte 5 + TypeScript + Vite PWA; Tone.js Transport only; custom AudioWorklets running Emscripten-compiled DSP; Nano Stores; custom SVG notation with Bravura. Static hosting on GitHub Pages at andrewrausch.com/parallax/ — no server, CSP via `<meta>`.
- **Locked:** monophonic, treble clef, 120 BPM default, snap-to-scale on by default. Theme follows the engine; there is no manual theme switcher.
- **Deferred, not to be quietly added:** polyphony, insert FX.
- **Engine interface stays pure:** engine-specific names live only in `src/data/` and `src/audio/engines/<engine>/`.
- **Verification is part of the product:** tests check the explain prose against rendered audio (`fm-voices.test.ts`) and against the drawn traces (`src/ui/flowsheet/claims.test.ts`); `contrast.test.ts` guards every theme. Failing prose means the words are wrong.
- Firefox/Safari support for FM scope taps is deferred; the tap budget figure is Chromium-only.

## Brand Commitments

- **Name:** Parallax (repo `rauscha/parallax`).
- **Trademark rule:** never brand the product "Mutable Instruments" or "Braids". Factual attribution only — *"based on the open-source Mutable Instruments Braids firmware (MIT)."* Engine names appear as factual labels for the engine, not as the product's identity.
- **Licensing:** Émilie Gillet's MIT notice stays intact in every ported file (`LICENSE-Braids.txt`); msfa is Apache-2.0 (`LICENSE-msfa.txt`, `NOTICE`); Bravura under `LICENSE-Bravura.txt`.
- **FM voices are our own, built by ear** — never derived from Yamaha ROM patch data.
- **Voice:** the explain prose is literate, specific and plain — it says what a control does *right now* and why, and it is corrected when measurement disagrees.

## Evidence on Hand

- The model corpora: `src/data/braids-models.ts`, `plaits-models.ts`, `laxsynth-models.ts`, `rings-models.ts`, `fm-voices.ts` (+ generated `fm-algorithms.ts`).
- Seven-lens shipping review: `reviews/2026-06-11-executive-summary.md` and the reports beside it.
- Specs and briefs: `docs/superpowers/specs/`, `docs/2026-09-13-flowsheet-redesign-brief.md`.
- **Absent — do not fabricate:** user testimonials, usage numbers, press, endorsements from Mutable Instruments, Dirtywave or Yamaha, and any claim of affiliation.

## Product Principles

1. **Tell the truth about the instrument.** Every explanation, readout and trace must match what the engine is really doing; measure it, and let tests hold it.
2. **Teach toward the hardware.** Prefer understanding that transfers to a real synth over in-app convenience that doesn't.
3. **Deepen the loop before widening the feature list.** Work that strengthens prose ↔ knob ↔ sound ↔ picture compounds; everything else is optional.
4. **Keep playing while learning.** Explanation never stops the sound — views layer over a live instrument rather than replacing it.
5. **Real engines, not models of them.** No placeholder oscillators, no TypeScript stand-ins for what the DSP does.

## Accessibility & Inclusion

- **The developer is colourblind, and learners may be too:** colour is never the only channel. Pair every hue with a label, shape, position, weight or strong luminance contrast; avoid translucent colour for anything meaningful. Okabe-Ito-style palettes and luminance-based colormaps are preferred.
- WCAG AA text contrast in every theme, enforced by `contrast.test.ts`.
- Modal surfaces manage focus; touch inputs avoid iOS zoom (≥16px); the instrument is keyboard- and MIDI-playable.
