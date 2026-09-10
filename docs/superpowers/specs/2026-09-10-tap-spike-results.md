# Tap spike results — FM flowsheet phase 0

**Run:** 2026-09-10 · **Machine:** desktop (`crane-desk`) · **Browser:** Chromium 152.0.7977.76 (the in-app browser)
· **AudioContext:** 48 kHz, `baseLatency` 0.010, `outputLatency` 0.040
· **Gate:** §6.1 of `2026-09-10-fm-engine-and-flowsheet.md`
· **Verdict: GREEN — build §2 as specified. No SharedArrayBuffer fallback needed.**

## What was actually run

A copy of `public/rings-worklet.js` with the tap path bolted on (`spike/tap-worklet.js`), running the **real Rings
WASM engine** so the DSP cost underneath the taps is real rather than simulated. Two harnesses:

- `spike/index.html` — realtime `AudioContext`, 15 s per configuration, measuring transport behaviour: snapshot rate,
  pool starvation, audio-thread allocations, heap growth, callback count.
- `spike/cpu.html` — `OfflineAudioContext` rendering 29 timed seconds per configuration, measuring CPU cost, plus a
  synchronous canvas draw benchmark.

Tap counts 0 / 8 / 24 / 48. Eight is the real design (6 operators + feedback + output); 24 and 48 exist to find the
cliff, per §6.1 step 4.

## CPU cost — offline render

| taps | wall ms for 29 s of audio | × realtime | audio-thread duty | Δ vs 0 taps |
|---|---|---|---|---|
| 0 | 3843.4 | 7.5 | **13.253 %** | — |
| **8** | 3859.3 | 7.5 | **13.308 %** | **+0.055 pp** |
| 24 | 3938.7 | 7.4 | 13.582 % | +0.329 pp |
| 48 | 4078.9 | 7.1 | 14.065 % | +0.812 pp |

Output verified non-silent in every run (peak 0.4293, 99.9 % non-silent samples) — an earlier attempt timed 30 s of
*silence* because an `OfflineAudioContext` renders faster than the worklet's async WASM init resolves; the harness now
suspends at 1 s, yields, and times only what follows. The sanity check is retained precisely because that failure is
silent and would have produced a beautiful, meaningless table.

**Reading it:** the real 8-tap design costs **0.055 percentage points of the audio-thread budget — a 0.4 % relative
increase** over the same engine with no taps. Six times the design load (48 taps) costs 0.8 pp and still shows no
inflection. Per-tap cost creeps up slightly with count (0.0069 → 0.0169 pp/tap), consistent with cache pressure as the
capture ring outgrows L1, which is exactly the direction you would expect and nowhere near a cliff.

The 13.25 % baseline is Rings itself plus the per-sample JS resampler loop — the cost that already ships today. Taps
are noise on top of it.

## Transport — realtime run

| | 0 taps | 8 taps | 24 taps | 48 taps |
|---|---|---|---|---|
| quanta in 15 s | 5628 | 5628 | 5625 | 5628 |
| snapshots/sec | — | 53.6 | 53.5 | 53.6 |
| **pool starved** | — | **0** | **0** | **0** |
| audio-thread allocs/sec | 0 | 53.6 | 53.6 | 53.5 |
| JS heap growth over 15 s | +0.01 MB | −1.66 MB | +0.32 MB | −0.20 MB |

- **Pool never starved at any tap count.** The transfer round-trip (worklet → main thread → back) kept up completely,
  which is the single most important result here: the pooled-transferable design works.
- **Zero allocation in `process()`.** The 53.6/sec figure is the one unavoidable allocation named in §2 — a
  `Float32Array` *view* recreated over each pooled buffer after it returns detached. One small view object per frame,
  not per quantum. Against the withdrawn per-quantum design's 3000 array allocations/sec, that is ~56× fewer, and they
  are views rather than buffers.
- **Heap flat.** Growth is GC noise in both directions over 15 s. Nothing accumulates.
- Quanta counts match expectation exactly (15.005 s × 48000 / 128 ≈ 5627); no callbacks were skipped.

**Snapshot rate is 53.6 Hz, not 60.** Not a defect and not a surprise: the interval is `sampleRate/60` = 800 samples,
checked once per 128-sample quantum, so it actually fires every 7 quanta = 896 samples = 53.57 Hz. It matches the
arithmetic to three digits, which is a useful confirmation the counter works. At implementation, either accept 53.6 Hz
(below the display rate, invisible) or count in quanta directly.

## Draw cost — main thread

8 scopes, 1024-sample window, min/max envelope per pixel column, 300 frames timed synchronously:
**0.064 ms/frame — 0.4 % of a 16.67 ms frame budget.** The main thread is not a constraint either.

## What this spike did NOT establish — read before treating it as complete

1. **No per-quantum tail latency.** `performance` is **not exposed in Chrome's `AudioWorkletGlobalScope`** (probed:
   `hasPerf: false`), so in-worklet timing returned zeros and the first realtime run's timing columns were dead. The
   offline render replaces it with a *mean* duty cycle measured on the main thread, where the clock exists. That is
   the right number for "is there headroom", but it is a mean: **there is no p99 or max-quantum figure.** Worth
   recording in the engine's own tests later if jitter is ever suspected.
2. **The CPU number excludes `postMessage`.** Offline mode packs the snapshot but skips the transfer, because an
   `OfflineAudioContext`'s main thread is blocked and can never hand the buffer back. So the 0.055 pp is
   capture + pack only. The transfer path's cost is evidenced *indirectly* — zero pool starvation, flat heap, no
   missed callbacks at 6× load in the realtime run — not measured in microseconds. That is strong evidence, not a
   direct measurement, and the distinction should survive into the implementation.
3. **Chromium only.** Firefox and Safari were **not** tested — I cannot drive them from here, and Safari does not exist
   on this machine. §6.1 step 5 is outstanding and should be run before phase 8 ships, since worklet scheduling and
   transferable handling both differ.
4. **Dummy taps, real cost.** Each tap copies the same block, which costs what a real per-operator tap costs but does
   not prove msfa exposes six separately addressable operator buffers. That is phase 7's problem, and `fm_core.cc`
   suggests it is fine.

## Consequence for the spec

§2 stands as written. The `SharedArrayBuffer` fallback — and with it the `coi-serviceworker` shim that would have
contradicted the GitHub Pages decision — **is not needed and should not be built.**

## Re-running

`spike/index.html` and `spike/cpu.html` are served by the dev server. The worklet must be copied into `public/` first —
Vite refuses to transform a module that imports a file from `public/` (`rings.js` lives there), which is exactly why
the shipped worklets live in `public/` too:

```bash
cp spike/tap-worklet.js public/spike-tap-worklet.js && npm run dev
```

Then open `/spike/index.html` (transport) and `/spike/cpu.html` (CPU). Delete `public/spike-tap-worklet.js` afterwards
so it stays out of the production build.
