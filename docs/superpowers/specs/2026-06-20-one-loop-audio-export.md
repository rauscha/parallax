# One-loop audio export — design spec

- **Date:** 2026-06-20
- **Status:** DRAFT — pending Andrew's decisions
- **Author:** drafted autonomously overnight 2026-06-20

---

## 1. Goal

Let the user export the current 4-bar loop as a downloadable audio file — the agreed first un-deferral after v1.0.0 (roadmap "After v1.0", item #5). The loop contains the active patch (engine + model + params) playing the current melody at the current tempo.

**Why it matters:** the self-explaining instrument loop is the product's identity. Export completes the loop — users learn a sound, dial it in, and now can take it away. It also makes Parallax a compositing tool: grab the CSAW bass, the PLUK lead, layer them in a DAW.

---

## 2. Design

### 2.1 Capture strategy analysis

Two strategies were considered. The analysis is grounded in the actual audio graph (`src/audio/AudioEngine.ts`) and worklet implementation (`public/braids-worklet.js`, `src/audio/engines/BraidsEngine.ts`).

#### Strategy A — Realtime MediaRecorder tap on `masterGain` (roadmap's suggestion)

The live audio graph (`currentEngine.output → masterGain → analyser → ctx.destination`) exposes `masterGain` (a `GainNode`) as the natural tap point. The WebAudio API allows connecting a `MediaStreamDestination` node as a second consumer of `masterGain` without affecting the existing path:

```
masterGain → analyser → destination          (unchanged — user still hears it)
          ↘
           MediaStreamDestinationNode
             └─ MediaStream → MediaRecorder
```

Flow:
1. User clicks "⬇ Export". `AudioEngine` is asked if started (`audioEngine.isStarted`).
2. Create a `MediaStreamDestinationNode` from the live `AudioContext`, connect `masterGain` to it.
3. Create a `MediaRecorder` from the destination's stream with `audio/webm;codecs=opus` (Chrome/Edge) or `audio/ogg;codecs=opus` (Firefox).
4. If transport is already playing, stop it and rewind first (for a clean loop start). Start transport + start recording at the same time.
5. Listen for the Tone.js transport loop point. One loop = `"4m"` — duration in seconds = `(4 × 4 / tempo) × 60`. At 120 BPM this is 8 s; at 60 BPM, 16 s; at 200 BPM, 4.8 s.
6. After one loop elapses, optionally wait a release tail (Decision 2), then stop the `MediaRecorder`. Disconnect and discard the tap node.
7. Collect `Blob` chunks, create an object URL, trigger a `<a download>` click.

**Pros:**
- Captures the live WASM worklet exactly as the user hears it — no re-instantiation, no parallel context.
- Works with all three engines (Braids, Plaits, Laxsynth) without any engine-level changes.
- The existing `masterGain.gain` value (0.8) and the analyser chain are untouched — user hears the loop while it records.
- Browser support is broad: MediaRecorder is available in Chrome 49+, Firefox 29+, Safari 14.1+.

**Cons:**
- Real-time: a 4-bar loop at 60 BPM takes 16 s to capture; the user must wait.
- Output is lossy compressed (WebM/Opus or Ogg/Opus). Not WAV. Audio quality is good (Opus at 128 kbps is transparent for synth material) but not bit-perfect.
- Timing of `stop()` vs actual silence is imprecise at the millisecond level — a small amount of tail audio may be cut if the release tail allowance is underestimated.
- Tab must remain visible for the full duration (mobile browsers may suspend the audio context on tab-hide; Android Chrome is particularly aggressive). This is a known constraint the app already handles (`onVisibility` in `AudioEngine.ts:68-73`).

#### Strategy B — OfflineAudioContext render

Renders faster than real-time and would produce a raw PCM buffer (encodeable to WAV via a simple manual interleave). **However, this strategy is a hard blocker for the current codebase — not recommended.**

**Why it is blocked:**

1. **AudioWorklet scope is context-bound.** The Braids worklet is registered via `ctx.audioWorklet.addModule(...)` on the live `AudioContext` (`BraidsEngine.init`, line 73). An `OfflineAudioContext` is a separate context; `addModule` must be called again on it, and the worklet processor class is re-evaluated in the new scope. This is possible in principle but requires duplicating the full init/WASM-load sequence.

2. **WASM binary re-instantiation.** The worklet fetches `braids.wasm`, passes it as `processorOptions.wasmBinary`, and the processor calls `WebAssembly.instantiate()` inside the worklet (`public/braids-worklet.js`). An OfflineAudioContext would need to redo this fetch + instantiation. The WASM is ~150 KB and takes up to 5 s on a slow connection (the fetch timeout in `BraidsEngine.ts:79`). In offline rendering you'd pay this cost again up-front.

3. **Scheduling complexity.** The Tone.js transport (`src/sequencer/transport.ts`) runs against the live `AudioContext` timeline via `Tone.setContext(ctx)` (`transport.ts:17`). Re-driving the part and note scheduling against an `OfflineAudioContext`'s timeline requires either re-implementing the Tone scheduler or hacking `Tone.setContext` to an offline context — both are significant work, and Tone.js's internal scheduler assumes wall-clock time.

4. **Message-port timing.** Strike messages (`gateOn`, `gateOff`, `setShape`, `clearStrikes`) are delivered via `postMessage` and processed asynchronously by the worklet. In an `OfflineAudioContext`, there is no audio render callback until `startRendering()` is called; messages posted before `startRendering` may not be processed at the right sample offset.

**Conclusion:** Strategy B would require rebuilding the engine init lifecycle, replacing the Tone scheduler against an offline clock, and re-solving the message-timing problem. That is a week-plus of infrastructure work — disproportionate for v1's first export feature. **Strategy A (MediaRecorder) is the right choice for this iteration.** WAV encoding can be added in a v2 as an enhancement if users request it (see §7).

### 2.2 Recommended approach: Realtime MediaRecorder tap

The implementation adds a thin `AudioExporter` module (`src/audio/export.ts`) that:
- Holds the tap node and `MediaRecorder` state.
- Accepts a `durationMs` argument (loop length + release tail).
- Returns a `Promise<Blob>` that resolves when recording ends.
- Has no Svelte/UI dependency — pure TS, testable.

The UI (`src/ui/ExportButton.svelte`) adds a single `"⬇ Export"` button to the `io-bar` cluster in `src/ui/PatchToolbar.svelte`. The button has three text states — **"⬇ Export"**, **"Recording… Ns"** (countdown label + aria-live for screenreaders), **"Done"** — transitions that convey state through label text, not color alone (colorblind-safe).

### 2.3 Loop-length math

```
loopDurationSec = (4 × 4 / tempo) × 60
               = 960 / tempo
```

At 120 BPM: 8 s. At 60 BPM: 16 s. At 200 BPM: 4.8 s. The exporter reads `melodyStore.get().tempo` at the moment export starts and computes `durationMs` once — if the user changes tempo mid-export the capture continues for the originally-computed duration (this is the correct behaviour: the export is a snapshot).

### 2.4 Transport coordination

The exporter must own the transport for the duration of the capture to guarantee exactly one clean loop. Recommended flow:

1. Snapshot `isPlayingStore.get()` as `wasPlaying`.
2. `stopTransport()` (no-op if already stopped).
3. Start `MediaRecorder`.
4. `playTransport()` — rewinds to beat 0 before start (Tone's transport `.stop()` resets position).
5. After `durationMs`, `stopTransport()`, stop `MediaRecorder`.
6. If `wasPlaying`, call `playTransport()` to restore prior state.

The `"Recording… Ns"` label counts down using a `setInterval` at 250 ms granularity (text update: "Recording… 8s", "Recording… 7s", ...) — no color dependency.

### 2.5 Colorblind safety

All status is conveyed through button label text and an `aria-live="polite"` region — zero reliance on color. The button may use the existing `.done` CSS class (the same signal-deep wash used by the Share button) for visual reinforcement, but the label alone conveys the state.

---

## 3. Decisions for Andrew

### Decision 1 — Capture strategy

**Question:** Realtime MediaRecorder (Strategy A) or OfflineAudioContext (Strategy B)?

**Options:**
- A. Realtime MediaRecorder tap on `masterGain` (recommended)
- B. OfflineAudioContext offline render

**Recommendation: A.** Strategy B is a hard blocker — see §2.1 for the full analysis. The WASM worklet, the Tone scheduler, and the message-port timing model are all tightly bound to the live `AudioContext`. Strategy A works with the codebase as-is and is the natural fit for "first export." WAV output can be added later via a manual PCM encoder layered on top of MediaRecorder's captured audio, but that is a separate task.

---

### Decision 2 — Export length: include release tail?

**Question:** Should the capture run for exactly one 4-bar loop, or add a release tail so the last note's decay isn't cut off?

**Options:**
- A. Exactly one loop (`durationMs = 960 / tempo * 1000`). Clean, deterministic. May cut the last note's release.
- B. Loop + fixed tail (e.g. +2 s). Simple. May be too short at high Release settings (max 4 s per `BraidsEngine.ts` param schema), or too long if the last note is a short hit.
- C. Loop + `releaseParam` tail (read `audioEngine.currentEngine.getParameter("release")` and add that many seconds). Adapts to the actual patch but adds coupling to the engine's parameter schema.
- D. Loop + configurable tail, exposed in a small modal (Decision 6 interaction).

**Recommendation: B — fixed +2 s tail.** Covers the default release (0.18 s) and all but the most extreme settings. Simple to implement and explain. Users who need a longer tail will learn to increase the loop count (Decision 3) or we add the modal later. Document the limitation in the button tooltip.

---

### Decision 3 — How many loops to export?

**Question:** Should the export always capture exactly one 4-bar loop, or offer 1 / 2 / 4 loops?

**Options:**
- A. Always 1 loop. Simplest UI.
- B. 1 / 2 / 4 loop selector (e.g. a small toggle group or a number input adjacent to the button).
- C. 1 loop always, but revisit after shipping.

**Recommendation: A — one loop, always.** The feature request says "one-loop audio export." A loop selector adds a UI decision and complicates the `durationMs` logic. Ship simple; if users ask for multi-loop, add the selector then.

---

### Decision 4 — Does export drive the transport, or only work while already playing?

**Question:** Should clicking Export start the transport automatically (always captures a clean loop from beat 0), or only work if the user has already pressed Play?

**Options:**
- A. Export drives transport: always stops, rewinds to beat 0, records one loop, restores prior play state. No precondition. (Recommended.)
- B. Only works while playing. Simpler but surprising — user must know to press Play first. The loop capture position relative to the loop boundary is undefined.
- C. Only works while stopped. Captures from beat 0 cleanly but the user can't preview while recording.

**Recommendation: A.** Driving the transport from the exporter produces the most predictable result (a clean loop from beat 0 every time) and requires no user setup. Restore `wasPlaying` state on completion.

---

### Decision 5 — Output format and filename

**Question:** What format should the exported file have, and what filename?

**Options:**
- A. `audio/webm;codecs=opus` → `.webm`. Chrome/Edge native. Firefox may fall back to `audio/ogg;codecs=opus` → `.ogg`.
- B. WAV (PCM) via manual encode from a captured float buffer. Platform-independent, lossless. Requires a separate WAV encoding step (e.g. a small inline encoder or `audiobuffer-to-wav`). Not achievable with MediaRecorder alone — needs the OfflineAudioContext path or an alternative like ScriptProcessorNode capture (deprecated).
- C. Accept whatever MediaRecorder produces (negotiate `isTypeSupported` at runtime; prefer WebM, fall back to Ogg). Name the file with the correct extension.

**Recommendation: C — negotiate at runtime.** `MediaRecorder.isTypeSupported('audio/webm;codecs=opus')` returns true in Chrome/Edge; `audio/ogg;codecs=opus` covers Firefox and older Safari (14.1+ with Opus). Detect at creation time and set the file extension accordingly. Filename scheme: `parallax-{modelCode}-{tempo}bpm-{date}.{ext}`, e.g. `parallax-CSAW-120bpm-2026-06-20.webm`. The model code and tempo are available from `patchStore` and `melodyStore`.

WAV as a target format (Option B) remains worthwhile but belongs to a follow-up — it requires either an alternative capture path or a post-processing encode step that adds a non-trivial dependency.

---

### Decision 6 — UI entry point and interaction

**Question:** A bare button with status label in the `io-bar`, or a modal with progress and preview?

**Options:**
- A. Inline button in `io-bar` (like `⬇ Export`), label cycles through Export / Recording… Ns / Done. No modal. Minimal new UI.
- B. Small modal: "Export audio — one loop at [tempo] BPM (~Ns). [Export] [Cancel]" with a progress bar or countdown. Gives the user a chance to confirm duration and cancel mid-capture.
- C. Inline button that opens a tiny popover (like `PresetMenu`) — shows the format/filename, a countdown during recording, and a "download again" link after.

**Recommendation: A — inline button in `io-bar`.** The io-bar already has Share, Postcard, Recent — another `.io-btn` follows the established pattern. The label countdown ("Recording… 8s") is sufficient feedback. A modal adds friction for what is a single-action workflow. If the export takes > 5 s (slow tempo) the countdown reassures the user; there is no case where a "cancel" is worth the modal overhead at this stage. A popover (C) is a nice future enhancement.

**Glyph:** `⬇ Export` — the downward arrow plus the word. Avoids audio/sound glyphs that are less universally recognizable. Character is US-ASCII compatible (Unicode U+2B07 DOWNWARD BLACK ARROW is rendered reliably in all modern browsers).

---

### Decision 7 — Web Share API integration

**Question:** After generating the file, should Export offer a `navigator.share()` call (the existing share pattern) in addition to download?

**Options:**
- A. Download only (`<a download>` trigger). Simple.
- B. `navigator.share({ files: [blob] })` if `canShare({ files })` returns true (mobile Chrome/Safari), else fall back to download.
- C. Both: download first, then offer "Share" as a secondary action in the `io-bar` state.

**Recommendation: A — download only for v1.** The Web Share API's file-sharing support is inconsistently implemented (Safari 15+ only, Chrome on Android, no desktop Chrome as of 2026). The `Blob` URL as a plain download is universally reliable. Adding `navigator.share` is a one-liner enhancement for a follow-up once the core capture is verified. The existing share URL feature (for patches) uses the clipboard/address-bar pattern, not `navigator.share` — keep consistency.

---

## 4. Implementation outline

> Full code-level plan to be written once Decisions 1–7 are confirmed. The following is task-level ordering.

1. **New file: `src/audio/export.ts`** — `AudioExporter` class (or plain function `exportLoop(opts): Promise<Blob>`).
   - Takes `audioContext: AudioContext`, `masterGain: GainNode`, `durationMs: number`.
   - Creates `MediaStreamDestinationNode`, connects it to `masterGain`, creates `MediaRecorder` (negotiating webm/opus → ogg/opus).
   - Resolves with a `Blob` when `MediaRecorder.onstop` fires.
   - Exposes a `cancel()` method that stops the recorder and disconnects the tap without saving.

2. **Add `startExport()` to `AudioEngine`** (or expose `masterGain` as a getter) — whichever surface is cleaner. Exposing a `masterGainNode` getter (like the existing `analyserNode` getter at `AudioEngine.ts:113`) is simpler and avoids putting recorder logic in `AudioEngine`.

3. **Transport coordination in the export flow** — a free function `exportOneLoop(): Promise<void>` in `src/audio/export.ts` or a new `src/audio/export-loop.ts`:
   - Reads `melodyStore.get().tempo` to compute `durationMs`.
   - Snapshots `isPlayingStore.get()`.
   - Calls `stopTransport()`, waits one render quantum (`await audioContext.resume()` or a microtask), then starts recording, then `playTransport()`.
   - After `durationMs` (via `setTimeout`), calls `stopTransport()`.
   - Awaits the `Blob` from `AudioExporter`.
   - If `wasPlaying`, calls `playTransport()`.
   - Computes filename from `patchStore` + `melodyStore` + today's date.
   - Triggers download via a temporary `<a>` element.

4. **New component: `src/ui/ExportButton.svelte`** — a single `.io-btn` button.
   - Three text states: "⬇ Export" / "Recording… Ns" (countdown) / "Done".
   - `aria-live="polite"` wrapper so the state change is announced to screen readers.
   - Disabled when `!ready` (same guard as other `io-btn` items).
   - Uses `setInterval` at 250 ms for the countdown.
   - Import and place in `src/ui/PatchToolbar.svelte` alongside existing buttons.

5. **PatchToolbar update** — add `<ExportButton />` to the `<div class="io-bar">` in `src/ui/PatchToolbar.svelte`.

6. **Type-check pass** — `npm run check` must pass clean.

---

## 5. Testing approach

### Node-testable (vitest, no browser required)

- **Loop-duration math:** `computeLoopDurationMs(tempo: number): number` — pure function, test at BPM 60/120/200/240, verify the formula `960 / tempo * 1000`.
- **Filename generation:** `buildExportFilename(modelCode, tempo, date): string` — pure function. Test that it produces valid ASCII filename strings, sanitizes unusual model codes.

### Requires a real browser (cannot be automated in this project's test setup)

- **MediaRecorder negotiation:** `isTypeSupported` calls only work in a real browser context. Verify manually in Chrome and Firefox.
- **Blob download:** the `<a download>` trigger requires a real DOM.
- **Audio capture quality:** a human ear check — play the loop, export, open the file, verify it sounds correct and the last note isn't cut off.
- **Transport restore:** verify that clicking Export while playing, then Export again, correctly restores and re-pauses.
- **Tab-hidden capture:** on mobile, verify the export completes if the tab is briefly hidden (the `onVisibility` handler should resume the context).

Note: the preview tab is backgrounded in unattended sessions, so audio playback and capture cannot be auto-verified. A manual download-and-listen check is required before shipping this feature. Add this to the Phase D checklist.

---

## 6. File-change summary

| File | Change |
|------|--------|
| `src/audio/export.ts` | New — `AudioExporter` class + `exportOneLoop()` orchestrator |
| `src/audio/AudioEngine.ts` | Add `masterGainNode` getter (expose `masterGain` like `analyserNode`) |
| `src/ui/ExportButton.svelte` | New — `.io-btn` with three-state label and countdown |
| `src/ui/PatchToolbar.svelte` | Add `<ExportButton />` to the `io-bar` div |
| `src/audio/export.test.ts` | New — vitest tests for `computeLoopDurationMs` and `buildExportFilename` |

---

## 7. Non-goals

- **No WAV / lossless export** in this iteration. The MediaRecorder path produces compressed audio (WebM/Opus or Ogg/Opus). WAV requires either an OfflineAudioContext path (blocked — see §2.1) or a post-capture re-encode step with a PCM encoder dependency. Both are follow-up work.
- **No multi-loop capture** (2-bar, 8-bar, etc.). Always one 4-bar loop.
- **No stems or multi-track export.** The engine is monophonic; there is only one output channel.
- **No insert FX.** The spec note says "Insert FX slot will live between masterGain and analyser when added in v1+" (`AudioEngine.ts:8`). When that lands, the `masterGain` tap point automatically captures any insert FX in the chain — no change to the exporter needed.
- **No audio preview in-browser before download.** The Blob can be decoded and played back via `decodeAudioData`, but this adds complexity with no clear user need.
- **No cloud upload / sharing service.** Download to disk only (Decision 7).
- **No recording of the reference-sample chain** (the `sampleGain → sampleAnalyser` path). The export captures the synth output only — tapping `masterGain` excludes the `sampleGain` branch by design.
