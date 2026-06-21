# One-loop Audio Export Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Let the user export the current 4-bar loop (active patch + melody + tempo) as a downloadable compressed-audio file via a single `⬇ Export` button in the toolbar.

**Architecture:** A realtime `MediaRecorder` tap on the existing `masterGain` node (the OfflineAudioContext route is blocked — the WASM worklet + Tone scheduler are bound to the live `AudioContext`; see spec §2.1). The exporter drives the transport: stop → rewind → record exactly one loop → pause-and-let-ring for a fixed +2 s release tail → stop recorder → download. Pure helpers (duration math, filename, extension) are split into a Tone-free module so they unit-test under vitest in Node.

**Tech Stack:** TypeScript, Web Audio (`MediaStreamAudioDestinationNode`, `MediaRecorder`), Tone.js Transport (via existing `src/sequencer/transport.ts`), Svelte 5, nanostores, vitest.

## Global Constraints

- **Capture strategy = Strategy A** (realtime MediaRecorder tap on `masterGain`). Strategy B (OfflineAudioContext) is a hard blocker — do not attempt.
- **Exactly one 4-bar loop**, always. No multi-loop selector.
- **Release tail = fixed +2 s** (`RELEASE_TAIL_MS = 2000`). Not patch-adaptive.
- **Export drives the transport**: stop → rewind to beat 0 → record → restore prior play state on completion.
- **Output format negotiated at runtime** (prefer `audio/webm;codecs=opus`, fall back to Ogg/Opus, then container defaults). Filename: `parallax-{MODELCODE}-{tempo}bpm-{YYYY-MM-DD}.{ext}`.
- **Download only** — no `navigator.share`, no in-app preview, no cloud upload.
- **Colorblind-safe UI**: button state is conveyed by label *text* ("⬇ Export" / "Recording… Ns" / "Done"), never by color alone, with `aria-live="polite"`. The `.done` wash is reinforcement only.
- **No new dependencies.** Everything uses platform APIs + existing modules.
- **Loop-duration formula:** `loopDurationMs = 960 / tempo * 1000` (4 bars × 4 beats = 16 beats; 16 beats / tempo BPM × 60 s × 1000 ms = 960000/tempo). Tail is added on top by the orchestrator, NOT inside `computeLoopDurationMs`.
- **Gates:** `npm run test` (vitest) must stay green; `npm run check` (svelte-check + tsc) must be clean (0 errors, 0 warnings) at every commit.

---

### Task 1: Pure export helpers (TDD)

The duration math, filename builder, and mime→extension mapper. These are the only parts unit-testable in Node — they touch no Web Audio, no Tone, no stores, so `export.test.ts` can import them without dragging Tone into the test runtime.

**Files:**
- Create: `src/audio/export.ts`
- Test: `src/audio/export.test.ts`

**Interfaces:**
- Consumes: nothing.
- Produces:
  - `RELEASE_TAIL_MS: number` — the fixed `2000` ms tail constant.
  - `computeLoopDurationMs(tempo: number): number` — `960 / tempo * 1000`.
  - `buildExportFilename(modelCode: string, tempo: number, date: string, ext: string): string` — sanitizes `modelCode` (uppercase, strip non-alphanumeric, fall back to `"PATCH"` if empty) and assembles `parallax-{CODE}-{tempo}bpm-{date}.{ext}`.
  - `extForMimeType(mime: string): string` — maps a MediaRecorder mime string to a file extension (`webm`/`ogg`/`mp4`/`wav`, default `webm`).

- [ ] **Step 1: Write the failing tests**

Create `src/audio/export.test.ts`:

```ts
import { describe, it, expect } from "vitest";
import {
  RELEASE_TAIL_MS,
  computeLoopDurationMs,
  buildExportFilename,
  extForMimeType,
} from "./export";

describe("computeLoopDurationMs (4 bars = 960/tempo seconds)", () => {
  it("is 8000 ms at 120 BPM", () => {
    expect(computeLoopDurationMs(120)).toBe(8000);
  });
  it("is 16000 ms at 60 BPM", () => {
    expect(computeLoopDurationMs(60)).toBe(16000);
  });
  it("is 4800 ms at 200 BPM", () => {
    expect(computeLoopDurationMs(200)).toBe(4800);
  });
  it("is 4000 ms at 240 BPM", () => {
    expect(computeLoopDurationMs(240)).toBe(4000);
  });
});

describe("RELEASE_TAIL_MS", () => {
  it("is the fixed 2 s tail", () => {
    expect(RELEASE_TAIL_MS).toBe(2000);
  });
});

describe("buildExportFilename", () => {
  it("assembles the documented scheme", () => {
    expect(buildExportFilename("csaw", 120, "2026-06-20", "webm")).toBe(
      "parallax-CSAW-120bpm-2026-06-20.webm",
    );
  });
  it("uppercases and strips non-alphanumerics from the model code", () => {
    // Real Braids codes include "SYN-Q", "TOY*", "SQR-", "SWx3".
    expect(buildExportFilename("syn-q", 90, "2026-01-02", "ogg")).toBe(
      "parallax-SYNQ-90bpm-2026-01-02.ogg",
    );
    expect(buildExportFilename("toy*", 120, "2026-01-02", "webm")).toBe(
      "parallax-TOY-120bpm-2026-01-02.webm",
    );
  });
  it("falls back to PATCH when the model code is empty", () => {
    expect(buildExportFilename("", 120, "2026-06-20", "webm")).toBe(
      "parallax-PATCH-120bpm-2026-06-20.webm",
    );
  });
});

describe("extForMimeType", () => {
  it("maps webm/opus to webm", () => {
    expect(extForMimeType("audio/webm;codecs=opus")).toBe("webm");
  });
  it("maps ogg/opus to ogg", () => {
    expect(extForMimeType("audio/ogg;codecs=opus")).toBe("ogg");
  });
  it("maps mp4/aac to mp4", () => {
    expect(extForMimeType("audio/mp4")).toBe("mp4");
  });
  it("defaults to webm for an empty or unknown mime", () => {
    expect(extForMimeType("")).toBe("webm");
    expect(extForMimeType("audio/flac")).toBe("webm");
  });
});
```

- [ ] **Step 2: Run the tests to verify they fail**

Run: `npx vitest run src/audio/export.test.ts`
Expected: FAIL — `Failed to resolve import "./export"` (the module doesn't exist yet), or once the file exists but is empty, "computeLoopDurationMs is not a function".

- [ ] **Step 3: Write the minimal implementation**

Create `src/audio/export.ts` with the pure helpers only (the `AudioExporter` class is added in Task 2):

```ts
/**
 * One-loop audio export — realtime MediaRecorder tap on the master bus.
 *
 * Pure helpers (duration math, filename, extension) live here with NO Tone /
 * store / AudioEngine imports, so they unit-test in Node. The transport-driving
 * orchestrator that needs those lives in `export-loop.ts`.
 */

/** Fixed release tail appended after the loop so the last note's decay isn't cut. */
export const RELEASE_TAIL_MS = 2000;

/**
 * Length of one 4-bar loop in milliseconds at the given tempo.
 * 4 bars × 4 beats = 16 beats; 16 beats / tempo BPM × 60 s = 960 / tempo s.
 */
export function computeLoopDurationMs(tempo: number): number {
  return (960 / tempo) * 1000;
}

/**
 * Download filename: `parallax-{MODELCODE}-{tempo}bpm-{date}.{ext}`.
 * `modelCode` is uppercased and reduced to [A-Z0-9] (real codes include
 * "SYN-Q", "TOY*", "SWx3"); an empty code falls back to "PATCH".
 */
export function buildExportFilename(
  modelCode: string,
  tempo: number,
  date: string,
  ext: string,
): string {
  const safe = modelCode.toUpperCase().replace(/[^A-Z0-9]/g, "") || "PATCH";
  return `parallax-${safe}-${tempo}bpm-${date}.${ext}`;
}

/** Map a MediaRecorder mime type to a download file extension. */
export function extForMimeType(mime: string): string {
  if (mime.includes("ogg")) return "ogg";
  if (mime.includes("webm")) return "webm";
  if (mime.includes("wav")) return "wav";
  if (mime.includes("mp4") || mime.includes("mpeg") || mime.includes("aac")) return "mp4";
  return "webm";
}
```

- [ ] **Step 4: Run the tests to verify they pass**

Run: `npx vitest run src/audio/export.test.ts`
Expected: PASS — all describe blocks green.

- [ ] **Step 5: Run the full suite to confirm no regressions**

Run: `npm run test`
Expected: PASS — prior tests (60) plus the new export tests.

- [ ] **Step 6: Commit**

```bash
git add src/audio/export.ts src/audio/export.test.ts
git commit -m "feat(export): pure helpers for one-loop audio export (duration, filename, ext)"
```

---

### Task 2: MediaRecorder capture core + AudioEngine tap point

Add the browser-only capture machinery to `export.ts` and expose `masterGain` from `AudioEngine` as the tap point. None of this is unit-testable (MediaRecorder/AudioContext don't exist in the vitest Node runtime), so the gate is: the module still *imports* cleanly under vitest (Task 1's tests still pass — proving no module-level side effects were introduced) and `npm run check` is clean. Real capture behavior is verified in the browser in Task 5.

**Files:**
- Modify: `src/audio/export.ts` (append capture code)
- Modify: `src/audio/AudioEngine.ts:112` (add `masterGainNode` getter beside `analyserNode`)

**Interfaces:**
- Consumes: `RELEASE_TAIL_MS`, `extForMimeType` (Task 1, same module).
- Produces:
  - `isExportSupported(): boolean` — true when `MediaRecorder` exists.
  - `pickMimeType(): string` — first supported preferred mime, or `""`.
  - `class AudioExporter` with: `constructor(ctx: AudioContext, source: GainNode)`, `readonly mimeType: string`, `start(): void`, `stop(): Promise<Blob>`.
  - `AudioEngine.masterGainNode: GainNode | null` (getter).

- [ ] **Step 1: Add the `masterGainNode` getter to `AudioEngine`**

In `src/audio/AudioEngine.ts`, add the getter immediately after the `analyserNode` getter (currently line 112):

```ts
  get analyserNode(): AnalyserNode | null { return this.analyser; }
  get masterGainNode(): GainNode | null { return this.masterGain; }
```

- [ ] **Step 2: Append the capture core to `export.ts`**

Add to the end of `src/audio/export.ts`:

```ts
/** Preferred capture mime types, best-first. Opus is transparent for synth material. */
const PREFERRED_TYPES = [
  "audio/webm;codecs=opus",
  "audio/webm",
  "audio/ogg;codecs=opus",
  "audio/ogg",
  "audio/mp4",
];

/** True when the browser can record audio at all. */
export function isExportSupported(): boolean {
  return typeof MediaRecorder !== "undefined";
}

/** First supported preferred mime type, or "" to let MediaRecorder pick its default. */
export function pickMimeType(): string {
  if (typeof MediaRecorder === "undefined") return "";
  for (const t of PREFERRED_TYPES) {
    if (MediaRecorder.isTypeSupported(t)) return t;
  }
  return "";
}

/**
 * Taps a GainNode (the master bus) into a MediaStream and records it. The tap is
 * a SECOND consumer of `source` — the existing `source → analyser → destination`
 * path is untouched, so the user keeps hearing the loop while it records.
 *
 *   source → analyser → destination        (unchanged)
 *        ↘ MediaStreamDestination → MediaRecorder
 */
export class AudioExporter {
  private readonly tap: MediaStreamAudioDestinationNode;
  private readonly recorder: MediaRecorder;
  private readonly chunks: Blob[] = [];
  readonly mimeType: string;

  constructor(private readonly ctx: AudioContext, private readonly source: GainNode) {
    if (typeof MediaRecorder === "undefined") {
      throw new Error("Audio export is not supported in this browser.");
    }
    this.mimeType = pickMimeType();
    this.tap = ctx.createMediaStreamDestination();
    source.connect(this.tap);
    this.recorder = this.mimeType
      ? new MediaRecorder(this.tap.stream, { mimeType: this.mimeType })
      : new MediaRecorder(this.tap.stream);
    this.recorder.ondataavailable = (e) => {
      if (e.data && e.data.size > 0) this.chunks.push(e.data);
    };
  }

  /** Begin recording immediately. */
  start(): void {
    this.recorder.start();
  }

  /** Stop recording, disconnect the tap, and resolve with the assembled Blob. */
  stop(): Promise<Blob> {
    return new Promise<Blob>((resolve) => {
      this.recorder.onstop = () => {
        try { this.source.disconnect(this.tap); } catch { /* already disconnected */ }
        const type = this.recorder.mimeType || this.mimeType || "audio/webm";
        resolve(new Blob(this.chunks, { type }));
      };
      this.recorder.stop();
    });
  }
}
```

- [ ] **Step 3: Type-check**

Run: `npm run check`
Expected: clean — 0 errors, 0 warnings. (`MediaStreamAudioDestinationNode`, `MediaRecorder`, `GainNode`, `AudioContext` are all in `lib.dom`.)

- [ ] **Step 4: Confirm the test runtime still imports the module cleanly**

Run: `npm run test`
Expected: PASS — Task 1's tests still pass, proving the appended capture code added no module-level side effects that break the Node import (constructor/`pickMimeType` reference `MediaRecorder` only when called, not at import).

- [ ] **Step 5: Commit**

```bash
git add src/audio/export.ts src/audio/AudioEngine.ts
git commit -m "feat(export): AudioExporter MediaRecorder tap + masterGainNode getter"
```

---

### Task 3: Transport pause helper + export orchestrator

Add a `pauseTransport()` that halts the scheduler *without* the hard `allNotesOff()` cut (so the last note rings into the tail), then write `exportOneLoop()` — the orchestrator that drives the transport, records, and triggers the download. This module imports Tone-touching transport + stores, so it is kept SEPARATE from `export.ts` (which the Node test imports).

**Files:**
- Modify: `src/sequencer/transport.ts` (add `pauseTransport`)
- Create: `src/audio/export-loop.ts`

**Interfaces:**
- Consumes:
  - `audioEngine.audioContext`, `audioEngine.masterGainNode` (Task 2).
  - `melodyStore`, `isPlayingStore`, `patchStore` from `../state/stores`.
  - `playTransport`, `stopTransport`, `pauseTransport` from `../sequencer/transport`.
  - `AudioExporter`, `computeLoopDurationMs`, `RELEASE_TAIL_MS`, `extForMimeType`, `buildExportFilename`, `isExportSupported` from `./export`.
- Produces:
  - `pauseTransport(): void` (in transport.ts) — `Tone.getTransport().pause()` + `isPlayingStore.set(false)`; no reset, no `allNotesOff`.
  - `exportOneLoop(): Promise<void>` (in export-loop.ts) — full capture + download.

- [ ] **Step 1: Add `pauseTransport` to `transport.ts`**

Append to `src/sequencer/transport.ts` (after `stopTransport`):

```ts
/**
 * Halt the scheduler at the current position WITHOUT silencing sounding notes —
 * their envelope release rings out naturally. Used by audio export to capture
 * the release tail after the loop ends. Unlike stopTransport(), it does NOT
 * reset to beat 0 and does NOT call allNotesOff().
 */
export function pauseTransport(): void {
  Tone.getTransport().pause();
  isPlayingStore.set(false);
}
```

- [ ] **Step 2: Create the orchestrator `export-loop.ts`**

Create `src/audio/export-loop.ts`:

```ts
/**
 * One-loop audio export orchestrator. Drives the transport for a clean capture:
 * stop → rewind → record exactly one 4-bar loop → pause-and-let-ring for the
 * fixed release tail → stop recorder → restore prior play state → download.
 *
 * Lives apart from `export.ts` because it imports Tone (via transport) + stores;
 * keeping `export.ts` Tone-free lets its pure helpers unit-test under vitest.
 */
import { audioEngine } from "./AudioEngine";
import { melodyStore, isPlayingStore, patchStore } from "../state/stores";
import { playTransport, stopTransport, pauseTransport } from "../sequencer/transport";
import {
  AudioExporter,
  RELEASE_TAIL_MS,
  computeLoopDurationMs,
  buildExportFilename,
  extForMimeType,
  isExportSupported,
} from "./export";

const delay = (ms: number): Promise<void> => new Promise((r) => setTimeout(r, ms));

function triggerDownload(blob: Blob, filename: string): void {
  const url = URL.createObjectURL(blob);
  const a = document.createElement("a");
  a.href = url;
  a.download = filename;
  document.body.appendChild(a);
  a.click();
  a.remove();
  // Revoke after a tick so the navigation/download has grabbed the URL.
  setTimeout(() => URL.revokeObjectURL(url), 1000);
}

/**
 * Capture the current loop and download it. Resolves once the file download has
 * been triggered. Throws if audio isn't started or export is unsupported.
 */
export async function exportOneLoop(): Promise<void> {
  if (!isExportSupported()) throw new Error("Audio export is not supported in this browser.");
  const ctx = audioEngine.audioContext;
  const masterGain = audioEngine.masterGainNode;
  if (!ctx || !masterGain) throw new Error("Audio engine not started.");

  const { tempo } = melodyStore.get();
  const loopMs = computeLoopDurationMs(tempo);
  const wasPlaying = isPlayingStore.get();

  // Clean start: halt + rewind to beat 0, then begin recording, then play.
  stopTransport();
  const exporter = new AudioExporter(ctx, masterGain);
  exporter.start();
  playTransport();

  // One full loop, then halt scheduling (no hard cut) so the last note rings
  // into the fixed release tail; stop the recorder once the tail elapses.
  await delay(loopMs);
  pauseTransport();
  await delay(RELEASE_TAIL_MS);
  const blob = await exporter.stop();

  // Restore the transport to its pre-export state.
  if (wasPlaying) playTransport();
  else stopTransport();

  // Build the filename from the live patch + tempo + today's date.
  const { modelId, engineId } = patchStore.get();
  const ext = extForMimeType(blob.type || exporter.mimeType);
  const date = new Date().toISOString().slice(0, 10);
  const filename = buildExportFilename(modelId ?? engineId, tempo, date, ext);
  triggerDownload(blob, filename);
}
```

- [ ] **Step 3: Type-check**

Run: `npm run check`
Expected: clean — 0 errors, 0 warnings.

- [ ] **Step 4: Confirm tests still pass**

Run: `npm run test`
Expected: PASS — no regressions (export-loop.ts isn't imported by any test, but this confirms transport.ts still compiles/loads).

- [ ] **Step 5: Commit**

```bash
git add src/sequencer/transport.ts src/audio/export-loop.ts
git commit -m "feat(export): pauseTransport + exportOneLoop orchestrator (record + download)"
```

---

### Task 4: ExportButton component + toolbar wiring

A single `.io-btn` with a text-only three-state label and a screen-reader live region, placed in the `io-bar` alongside Share/Postcard. The `.io-btn` CSS is duplicated into this component's scoped `<style>` — the established pattern (each sibling menu component carries its own copy; there is no global `.io-btn`).

**Files:**
- Create: `src/ui/ExportButton.svelte`
- Modify: `src/ui/PatchToolbar.svelte` (import + place `<ExportButton />`)

**Interfaces:**
- Consumes: `audioReadyStore`, `melodyStore` from `../state/stores`; `computeLoopDurationMs`, `RELEASE_TAIL_MS`, `isExportSupported` from `../audio/export`; `exportOneLoop` from `../audio/export-loop`.
- Produces: a self-contained component (no props).

- [ ] **Step 1: Create `ExportButton.svelte`**

Create `src/ui/ExportButton.svelte`:

```svelte
<script lang="ts">
  /**
   * Export the current 4-bar loop as a downloadable audio file. One inline
   * io-btn whose label cycles "⬇ Export" → "Recording… Ns" (live countdown) →
   * "Done". State is conveyed by label TEXT + aria-live, never color alone
   * (house accessibility rule); the .done wash is reinforcement only.
   */
  import { onDestroy } from "svelte";
  import { audioReadyStore, melodyStore } from "../state/stores";
  import { computeLoopDurationMs, RELEASE_TAIL_MS, isExportSupported } from "../audio/export";
  import { exportOneLoop } from "../audio/export-loop";

  let ready = $state(audioReadyStore.get());
  const unsubReady = audioReadyStore.subscribe((v) => { ready = v; });

  const supported = isExportSupported();
  let label = $state("⬇ Export");
  let recording = $state(false);
  let countdownTimer = 0;
  let resetTimer = 0;

  onDestroy(() => {
    unsubReady();
    clearInterval(countdownTimer);
    clearTimeout(resetTimer);
  });

  async function onExport() {
    if (recording || !ready || !supported) return;
    recording = true;
    clearTimeout(resetTimer);

    const tempo = melodyStore.get().tempo;
    const totalMs = computeLoopDurationMs(tempo) + RELEASE_TAIL_MS;
    const endAt = performance.now() + totalMs;
    const tick = () => {
      const remaining = Math.max(0, Math.ceil((endAt - performance.now()) / 1000));
      label = remaining > 0 ? `Recording… ${remaining}s` : "Recording…";
    };
    tick();
    countdownTimer = window.setInterval(tick, 250);

    try {
      await exportOneLoop();
      label = "Done";
    } catch {
      label = "Failed";
    } finally {
      clearInterval(countdownTimer);
      recording = false;
      resetTimer = window.setTimeout(() => { label = "⬇ Export"; }, 1800);
    }
  }

  const tip = supported
    ? "Record one 4-bar loop of this sound + melody and download it (plus a 2s tail)"
    : "Audio export isn't supported in this browser";
</script>

<button
  class="io-btn"
  class:done={recording || label === "Done"}
  onclick={onExport}
  disabled={!ready || recording || !supported}
  aria-live="polite"
  title={tip}
>{label}</button>

<style>
  .io-btn {
    font-family: var(--font-mono);
    font-size: 0.7rem;
    letter-spacing: 0.04em;
    padding: 5px 12px;
    color: var(--text);
    background: var(--surface-raised);
    border: var(--hairline-w) solid var(--hairline);
    border-radius: var(--radius-sm);
    cursor: pointer;
    white-space: nowrap;
    transition: filter var(--t-fast), border-color var(--t-fast), color var(--t-fast);
  }
  .io-btn:hover:not(:disabled) { filter: brightness(1.1); border-color: var(--signal); }
  .io-btn:focus-visible { outline: 2px solid var(--signal); outline-offset: 1px; }
  .io-btn:disabled { opacity: 0.4; cursor: not-allowed; }
  .io-btn.done {
    color: var(--signal-ink);
    background: var(--signal-deep);
    border-color: var(--signal);
  }
  @media (pointer: coarse) {
    .io-btn { padding: 8px 12px; min-height: 36px; }
  }
</style>
```

- [ ] **Step 2: Wire `<ExportButton />` into the toolbar**

In `src/ui/PatchToolbar.svelte`, add the import alongside the other component imports (after the `PostcardModal` import, ~line 18):

```ts
  import PostcardModal from "./PostcardModal.svelte";
  import ExportButton from "./ExportButton.svelte";
```

Then place it in the `io-bar`, after the Share button (the current last child of `.io-bar`, ~line 60). The closing `</div>` of `.io-bar` is on line 61:

```svelte
  <button
    class="io-btn"
    class:done={shareLabel !== "Share"}
    onclick={share}
    disabled={!ready}
    title="Copy a link that recreates this exact sound + melody"
  >⤴ {shareLabel}</button>
  <ExportButton />
</div>
```

- [ ] **Step 3: Type-check**

Run: `npm run check`
Expected: clean — 0 errors, 0 warnings.

- [ ] **Step 4: Commit**

```bash
git add src/ui/ExportButton.svelte src/ui/PatchToolbar.svelte
git commit -m "feat(export): inline Export button in the patch toolbar io-bar"
```

---

### Task 5: Verification (automated gates + browser ear-check)

The pure helpers are unit-tested; everything downstream of `MediaRecorder` requires a real browser and a human ear. This task runs the automated gates, then performs the manual browser verification that the spec (§5) flags as required before the feature is considered shipped.

**Files:** none (verification only).

- [ ] **Step 1: Full automated gate**

Run: `npm run test`
Expected: PASS — all suites green (60 prior + the new export tests).

Run: `npm run check`
Expected: clean — 0 errors, 0 warnings.

- [ ] **Step 2: Start the dev server**

Run: `npm run dev` (or use the preview tooling). Open the app, click to start audio (TapToStart), and confirm the `⬇ Export` button appears in the toolbar io-bar and is enabled once audio is ready.

- [ ] **Step 3: Browser ear-check (manual — cannot be automated)**

With audio started and a melody loaded (use Surprise if empty):
1. Click `⬇ Export`. Confirm the label shows "Recording… Ns" counting down and the loop plays/audibly records.
2. Confirm a file downloads named `parallax-{CODE}-{tempo}bpm-{date}.{webm|ogg}`.
3. Open the downloaded file and listen: the full loop is present, in tune, and the last note's release is NOT abruptly cut (the +2 s tail did its job).
4. Press Play, then click Export while playing — confirm it captures one clean loop and **restores playback** afterward.
5. Click Export while stopped — confirm it captures one clean loop and returns to stopped.

Note: unattended/preview sessions background the tab, which suspends audio capture — this ear-check must be done by a human in a foreground browser tab. Record the result in the roadmap "After v1.0" checklist.

- [ ] **Step 4: Finalize**

Once the ear-check passes, the feature is done. Update `docs/roadmap-v1.0.md` (or the relevant "After v1.0" tracking doc) to mark one-loop audio export shipped, and note the known limitations (compressed WebM/Opus output, not WAV; fixed 2 s tail).

---

## Self-Review

**Spec coverage:**
- Goal (export current loop, downloadable) → Tasks 1–4. ✔
- §2.1 Strategy A only, B blocked → Global Constraints + Task 2 (`AudioExporter` taps `masterGain`). ✔
- §2.2 thin `AudioExporter`, no Svelte dep → Task 2. ✔
- §2.3 loop math `960/tempo` → Task 1 `computeLoopDurationMs`. ✔
- §2.4 transport coordination (snapshot wasPlaying, stop, record, play, restore) → Task 3 `exportOneLoop`. ✔
- §2.4 countdown label → Task 4 ExportButton (250 ms tick). ✔
- §2.5 colorblind safety (text + aria-live, .done reinforcement) → Task 4 + Global Constraints. ✔
- Decision 2 fixed +2 s tail → `RELEASE_TAIL_MS` (Task 1) used in Task 3. ✔
- Decision 3 one loop always → no selector; Global Constraints. ✔
- Decision 4 export drives transport + restore → Task 3. ✔
- Decision 5 negotiated format + filename scheme → Task 1 (`buildExportFilename`, `extForMimeType`) + Task 2 (`pickMimeType`). ✔
- Decision 6 inline io-bar button, ⬇ Export glyph → Task 4. ✔
- Decision 7 download only → Task 3 `triggerDownload`, no `navigator.share`. ✔
- §5 testing (Node-testable pure fns; browser ear-check) → Task 1 (unit) + Task 5 (manual). ✔
- §6 file-change summary → all files covered; **deviation:** the orchestrator is split into `src/audio/export-loop.ts` instead of living in `export.ts`, so the Node test can import the pure helpers without dragging Tone into the runtime. `AudioExporter` stays in `export.ts` as the spec lists. Documented in Task 3.

**Placeholder scan:** No TBD/TODO/"handle edge cases" — every code step shows complete code. ✔

**Type consistency:** `computeLoopDurationMs(tempo)`, `buildExportFilename(modelCode, tempo, date, ext)`, `extForMimeType(mime)`, `RELEASE_TAIL_MS`, `AudioExporter(ctx, source)` / `.start()` / `.stop(): Promise<Blob>` / `.mimeType`, `pauseTransport()`, `exportOneLoop()`, `masterGainNode` getter, `isExportSupported()`, `pickMimeType()` — names and signatures match across every task that references them. ✔
