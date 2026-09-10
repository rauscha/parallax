# FM flowsheet teacher — idea note

**Created:** 2026-09-10 · **Status:** **scoped and approved for planning 2026-09-10** — see
`docs/superpowers/specs/2026-09-10-fm-engine-and-flowsheet.md` · **Origin:** Andrew, 2026-09-10.

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

## Architectural notes — feasibility, measured against the real worklets

*Revised 2026-09-10 after reading `public/rings-worklet.js` and `src/audio/AudioEngine.ts`. The original version of this
section recommended a hedge (a TS teaching model for the diagram, real signal only at the output). **That
recommendation is withdrawn.** It rested on a cost premise that does not survive contact with the code, and on an
honesty trade that is worse than it looked. Real per-node taps are the plan.*

**What's already here and reusable:** `src/viz/Oscilloscope.svelte` and `src/viz/Spectrum.svelte` already render from an
`AnalyserNode`; `MatchPanel.svelte` already runs **two** analysers in parallel and draws both. "N scopes on one page" is
a solved problem in this codebase.

**The premise that was wrong.** The first draft assumed per-node taps meant a `postMessage` per render quantum — several
float streams crossing the worklet boundary 375 times a second, each allocating. That *is* the expensive shape, and it
is not the shape the feature needs. A scope is a **display**: it needs ~60 coherent snapshots per second of ~1024
samples, not 375 fragments.

At 48 kHz / 128-sample quanta (2.67 ms per quantum, 375 quanta/sec), with 8 taps (6 operators + the feedback wire +
output):

| approach | messages/sec | steady-state allocations | bandwidth |
|---|---|---|---|
| per-quantum streaming *(the withdrawn premise)* | 375 | 375 x 8 arrays | ~1.5 MB/s |
| **frame-rate snapshot, pooled + transferred** | **60** | **0** | ~2 MB/s |

**The design that makes it cheap.** The shim copies each operator's output block into a pre-allocated capture ring
*inside* the worklet — 8 x 128 float writes per quantum, ~380k writes/sec, negligible beside running six FM operators.
Once per display frame the worklet posts the snapshot buffer **as a transferable**, and the main thread transfers a
recycled empty buffer back. Pointer handoff, fixed pool, zero copy, no allocation in `process()` after init. For scale:
a 6-op mono voice costs on the order of tens of microseconds against a 2667 us budget. This was never a CPU problem.
The only thing that could hurt is allocation and message churn on the audio thread — a design choice, not a limit.

**Two reasons route 2 loses even if cost were free.**

1. **Phase coherence.** Independent analysers each capture on their own window, so the traces drift against each other.
   But *"watch the modulator and carrier lock at a 2:1 ratio and drift at 2.01:1"* **is the lesson.** Same-offset capture
   of every tap in one snapshot is the only thing that delivers it, and the pooled-snapshot design gives it for free.
   (This also rules out the naive "just wire six `AnalyserNode`s" idea independently of the fact that an `AnalyserNode`
   cannot see inside a worklet at all.)
2. **The DX7 is not textbook FM.** A TS model draws a clean sine. msfa produces log-domain output through a quarter-sine
   LUT with fixed-point envelope arithmetic, and feedback is a nonlinear recursion over the previous output samples. So
   the two traces most worth looking at — feedback, and an operator at high index — are exactly the two a model gets
   wrong. Writing a TS model faithful enough not to lie means reimplementing msfa in TypeScript. Under the product's
   honesty rule that is not a cheaper option; it is the same option with a bug budget.

**Residual unknown, and the fallback.** The one thing genuinely unmeasured is whether `port.postMessage` is
allocation-free even with transferables — the spec does not promise it. If a spike shows it is not, the fallback is a
`SharedArrayBuffer` ring, which needs cross-origin isolation. **That would contradict a locked decision:** GitHub Pages
cannot send COOP/COEP headers, so it is reachable only via a `coi-serviceworker`-style shim riding the existing PWA
service worker, at the cost of a reload on first visit and shakier Safari behaviour. Named here so the trade is known
*before* the spike, not discovered after. It is not the plan.

**Capture domain.** Taps are captured at **engine-native rate, pre-resample** — the true signal in msfa's own block
domain — not at context rate downstream of the linear interpolator. The tap ring is therefore decoupled from the
128-sample quantum.

**Scope collision.** This is a second interaction surface next to the staff editor and the Explain panel. It wants to be
its own view/route. Andrew's 2026-09-10 call: **design it for a computer screen**, not phone or tablet — see the spec
for what that does and does not mean for the locked "single responsive PWA" decision.

## Status

**Superseded by the spec.** On 2026-09-10 Andrew made the two decisions this note was waiting on: **msfa is engine #5**
("if we're doing an FM synth teacher there's really no other option than a DX7"), and the teacher is **designed for a
computer screen**, not phone or tablet. The architecture question was then re-examined against the real worklets and
resolved in favour of **real per-node taps** (see above).

Live document is now `docs/superpowers/specs/2026-09-10-fm-engine-and-flowsheet.md`. This note is kept as the origin
record and the reasoning trail; the spec is what gets implemented. Three decisions remain open there — the 5th theme,
the patch corpus (there is a **licensing catch** on the factory voices), and what the model axis is.
