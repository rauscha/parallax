# FM flowsheet teacher — idea note

**Created:** 2026-09-10 · **Status:** captured idea, not scoped, not approved · **Origin:** Andrew, 2026-09-10.

## The idea, in Andrew's framing

> "A flowsheet-style FM synth teacher, where we can see an oscilloscope of the signal at each node, and how different
> variables (waveform, ratio, feedback, etc.) affect the waveform created there and the output waveform. It's tough
> for me to visualize exactly how FM works, and my physics-trained brain *really* thinks in signal-processing mode."

So: not a patch editor with a diagram next to it. A **signal-flow diagram where every wire is a scope tap.** You see
the modulator's own waveform, you see what it looks like after the ratio and index are applied, you see the carrier's
instantaneous phase being pushed around, and you see the output — all live, all at once, all on the same time base.
Change a ratio and watch which trace changes and which doesn't.

## Why it belongs in Parallax

This is the **same product thesis as the Explain panel**, applied to a mechanism instead of a knob. Parallax exists
because the M8's Macro synth couldn't be learned from the hardware alone; per-model prose plus a live scope closed
that loop. FM has exactly the same problem in a harder form — the DX7 is the canonical example of an instrument
nobody learns from the front panel — and the fix is the same shape, just node-graph-flavoured rather than card-
flavoured. It is not a new product. It is the explain loop pointed at a topology.

It also has an engine consequence: see `2026-09-10-diy-synth-engine-survey.md`. Porting Raph Levien's **msfa**
(Apache-2.0, the DX7 engine underneath MiniDexed/Dexed) would give Parallax a 6-operator FM engine *and* the exact
substrate this teacher needs — `fm_core.cc` has the algorithm table, `fm_op_kernel.cc` is one operator, `dx7note.cc`
is one voice. One port, two features. That is the strongest argument for making FM engine #5.

## What it would have to show (the honest requirements list)

Per node, live, on a shared time base:
- **Operator output waveform** — before it becomes anyone's modulator.
- **Ratio** — the modulator's frequency as a multiple of the carrier's, drawn against the carrier so the periodicity
  relationship is *visible*, not just a number. Integer vs non-integer ratio is the whole harmonic/inharmonic story
  and it should be a thing you can *see* as the traces lock or drift.
- **Index / depth** — how far the carrier's phase is being shoved. This is the parameter people most need to see,
  because "more modulation" reads as "more sidebands" only if you can watch the spectrum grow at the same time.
- **Feedback** — an operator modulating itself, which is where FM stops being intuitive and starts producing
  saw-like and noisy results. A scope on the feedback wire is probably the single most educational trace on the page.
- **Envelope per operator** — because in a real DX7 the index is time-varying, and a static scope lies about what FM
  actually sounds like.
- **Algorithm** — the 32 DX7 topologies as the actual diagram, switchable, with the graph redrawing.

And ideally **spectrum alongside scope at the output**, because the sideband picture (carrier ± n·modulator) is the
frequency-domain half of the same truth, and a physics brain wants both panes.

## Architectural notes — feasibility, honestly assessed

**What's already here and reusable:** `src/viz/Oscilloscope.svelte` and `src/viz/Spectrum.svelte` already render from
an `AnalyserNode`; `MatchPanel.svelte` already proves we can run **two** analysers in parallel (synth + reference
sample) and draw both. So "N scopes on one page" is a solved problem in this codebase — that part is *solid*.

**What's genuinely new — and this is the hard bit.** The DSP runs inside a single AudioWorklet with a ring buffer,
and `AnalyserNode` only taps the Web Audio graph, not the inside of a worklet. There are two routes and they trade
off badly:

1. **Tap inside the worklet.** Have the shim expose per-operator output buffers and post them to the main thread
   alongside audio. Accurate — it's the real signal from the real engine — but it means pushing several extra
   float streams per block across the worklet boundary, and audio-thread hygiene is already a known sensitivity in
   this project (see the v1.0 punch-list items on worklet dispose and audio-thread degradation). *Plausible, needs
   measurement, not a given.*
2. **A separate, non-audio "teaching" model.** Compute the node waveforms in plain TS at a display rate, decoupled
   from the audio engine — a mathematically correct FM model driving the diagram, with the real engine making the
   sound in parallel. Cheap, zero audio-thread risk, and completely under our control for pedagogy (freeze time,
   slow it down, step through phase). The cost: it is a *model of* the engine, not the engine, and if the two ever
   disagree the app is lying — which is the one thing the product's honesty rule forbids. Mitigable by driving both
   from the same parameter values and being explicit in the UI about what's drawn vs. what's heard.

My read, for whenever this gets scoped: **route 2 for the teaching view, route 1 only for the final output trace**
(which we already have for free). Say so plainly in the UI. A didactic diagram that is honest about being a diagram
is fine; a diagram that implies it's a probe on the real signal when it isn't, is not.

**Scope collision to be aware of:** this is a second interaction surface next to the staff editor and the Explain
panel, on a layout that is already tight on a phone. It probably wants to be its own view/route, not another panel
crammed into the main screen.

## Status

Captured only. Not scoped, not estimated, not approved, and deliberately not slotted into any roadmap phase. Next
step whenever Andrew wants it: a design spec in `docs/superpowers/specs/`, following the Rings precedent — and the
FM engine decision (msfa port, yes/no) should be made *first*, because it changes whether route 1 is even available.
