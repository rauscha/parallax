# Musical Melody + Transport UX Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Replace the monotone random melody generator with one that applies stepwise motion, phrase contour, and rhythmic variety; and make the Play/Stop button bigger with a Space-bar shortcut.

**Architecture:** Task 1 adds three pure exported helpers (`buildRhythm`, `pickNext`, `findTonicIdx`) to `grid.ts` and covers them with vitest unit tests, following the existing pattern in `grid.test.ts`. Task 2 replaces the body of `randomizeMelody` to use those helpers, verified by integration tests. Task 3 is pure CSS + a keyboard event handler — no new modules needed.

**Tech Stack:** TypeScript, Svelte 5, `@tonaljs/tonal` (`Note.chroma`), vitest (Node), existing `src/notation/grid.ts` / `src/ui/KeyboardHarness.svelte` / `src/App.svelte`.

## Global Constraints

- `npm run check` must report 0 errors, 0 warnings after every task.
- `npm run test` must be fully green after every task.
- `randomizeMelody` signature is **unchanged** — callers (`surprise.ts`, grid UI) need no edits.
- Pure layer stays Node-safe: no DOM, no idb, no `window` in `grid.ts` helpers.
- All new helpers in `grid.ts` are **exported** (vitest tests import them directly — follow the existing `buildRowMidis` / `remapByDegree` export pattern).
- `TOTAL_STEPS` (`= 64`) is already exported from `grid.ts` — reuse it in the new body of `randomizeMelody`; do NOT redefine it.
- Spec: `docs/superpowers/specs/2026-06-20-musical-melody-and-transport-ux.md`.

---

### Task 1: Pure melody helpers + unit tests

Add `buildRhythm`, `pickNext`, `findTonicIdx` to `grid.ts` and cover them in `grid.test.ts`.

**Files:**
- Modify: `src/notation/grid.ts` (add helpers + `DURS` constant above existing `randomizeMelody`)
- Modify: `src/notation/grid.test.ts` (add three new `describe` blocks)

**Interfaces:**
- Consumes: `Note` (already imported from `@tonaljs/tonal` at line 5 of `grid.ts`).
- Produces (used by Task 2):
  - `export function buildRhythm(totalSteps: number, restProb: number): Array<{ start: number; dur: number }>`
  - `export function pickNext(midis: number[], idx: number, targetIdx: number): number`
  - `export function findTonicIdx(midis: number[], key: string): number`

- [ ] **Step 1: Write the failing tests**

Open `src/notation/grid.test.ts`. Add the following imports at the top (replace the existing single import line):

```ts
import { describe, it, expect } from "vitest";
import { remapByDegree, buildRowMidis, buildRhythm, pickNext, findTonicIdx } from "./grid";
```

Then append these three `describe` blocks **after** the existing `buildRowMidis` describe block at the bottom of the file:

```ts
describe("buildRhythm", () => {
  it("produces at least 1 slot for totalSteps > 0", () => {
    expect(buildRhythm(64, 0).length).toBeGreaterThan(0);
  });

  it("returns [] for totalSteps = 0", () => {
    expect(buildRhythm(0, 0)).toEqual([]);
  });

  it("slots never overlap — each start >= previous start + previous dur", () => {
    for (let run = 0; run < 20; run++) {
      const slots = buildRhythm(64, 0.2);
      for (let j = 1; j < slots.length; j++) {
        expect(slots[j].start).toBeGreaterThanOrEqual(
          slots[j - 1].start + slots[j - 1].dur,
        );
      }
    }
  });

  it("last slot ends at or before totalSteps", () => {
    for (let run = 0; run < 20; run++) {
      const slots = buildRhythm(64, 0.2);
      const last = slots.at(-1)!;
      expect(last.start + last.dur).toBeLessThanOrEqual(64);
    }
  });

  it("every duration is >= 1", () => {
    for (let run = 0; run < 20; run++) {
      expect(buildRhythm(64, 0.2).every(s => s.dur >= 1)).toBe(true);
    }
  });
});

describe("pickNext", () => {
  const midis = [60, 62, 64, 65, 67, 69, 71, 72]; // C major 1-octave

  it("always returns a valid index in [0, midis.length − 1]", () => {
    for (let i = 0; i < 100; i++) {
      const result = pickNext(midis, 3, 7);
      expect(result).toBeGreaterThanOrEqual(0);
      expect(result).toBeLessThanOrEqual(midis.length - 1);
    }
  });

  it("returns 0 for a single-element array", () => {
    expect(pickNext([60], 0, 0)).toBe(0);
  });

  it("biases upward when targetIdx > idx (>60% of 100 runs move up or stay)", () => {
    let up = 0;
    for (let i = 0; i < 100; i++) {
      if (pickNext(midis, 1, 7) >= 1) up++;
    }
    expect(up).toBeGreaterThan(60);
  });

  it("biases downward when targetIdx < idx (>60% of 100 runs move down or stay)", () => {
    let down = 0;
    for (let i = 0; i < 100; i++) {
      if (pickNext(midis, 6, 0) <= 6) down++;
    }
    expect(down).toBeGreaterThan(60);
  });
});

describe("findTonicIdx", () => {
  it("returns 0 for C major starting at C (chroma 0 is the first note)", () => {
    const midis = buildRowMidis("C", "major", 3, true, 2);
    expect(findTonicIdx(midis, "C")).toBe(0);
    expect(midis[0] % 12).toBe(0); // C
  });

  it("returns an index > 0 for G major (tonic G is not the first note in the range)", () => {
    // buildRowMidis starts at C3=48; in G major the first note is C3 (chroma 0),
    // so the first G (chroma 7) is at some later index.
    const midis = buildRowMidis("G", "major", 3, true, 2);
    const idx = findTonicIdx(midis, "G");
    expect(idx).toBeGreaterThan(0);
    expect(midis[idx] % 12).toBe(7); // G chroma
  });
});
```

- [ ] **Step 2: Run tests — verify they fail with "not a function" errors**

```
npm run test -- grid
```

Expected output: 3 new suites fail with errors like `buildRhythm is not a function`. The existing `remapByDegree` and `buildRowMidis` suites still pass.

- [ ] **Step 3: Add the `DURS` constant and three helper functions to `grid.ts`**

In `src/notation/grid.ts`, insert the following block **immediately before the existing `export function randomizeMelody` function** (currently at line 131). Do not remove the existing `randomizeMelody` — Task 2 replaces its body:

```ts
/** Duration palette (16th-note steps): eighth×2, quarter×4, dotted-quarter, half.
 *  Sampling uniformly gives ~25% eighths, ~50% quarters, ~12.5% dotted, ~12.5% halves. */
const DURS = [2, 2, 4, 4, 4, 4, 6, 8] as const;

/**
 * Fill `totalSteps` 16th-note steps with a sequence of note slots, mixing
 * durations from DURS and inserting silent rest gaps with probability `restProb`.
 * Each slot is { start, dur }; gaps advance the cursor without a slot.
 * Exported for unit tests — internal to the melody generation feature.
 */
export function buildRhythm(
  totalSteps: number,
  restProb: number,
): Array<{ start: number; dur: number }> {
  const slots: Array<{ start: number; dur: number }> = [];
  let pos = 0;
  while (pos < totalSteps) {
    const remaining = totalSteps - pos;
    const valid = (DURS as readonly number[]).filter(d => d <= remaining);
    const dur = valid.length > 0 ? valid[Math.floor(Math.random() * valid.length)] : remaining;
    slots.push({ start: pos, dur });
    pos += dur;
    // Rest gap: advance cursor without adding a slot (silence).
    if (pos < totalSteps && Math.random() < restProb) {
      const rests = [2, 4].filter(d => d <= totalSteps - pos);
      if (rests.length > 0) pos += rests[Math.floor(Math.random() * rests.length)];
    }
  }
  return slots;
}

/**
 * Choose the next index into `midis` with stepwise bias toward `targetIdx`:
 *   55% → ±1 step toward target  |  25% → ±2 steps  |  20% → jump to target.
 * Result is clamped to [0, midis.length − 1].
 * Exported for unit tests — internal to the melody generation feature.
 */
export function pickNext(midis: number[], idx: number, targetIdx: number): number {
  const len = midis.length;
  if (len <= 1) return 0;
  const drift = Math.sign(targetIdx - idx);   // -1, 0, or +1
  const r = Math.random();
  let step: number;
  if (r < 0.55) {
    step = drift !== 0 ? drift : (Math.random() < 0.5 ? 1 : -1);
  } else if (r < 0.80) {
    step = drift !== 0 ? drift * 2 : (Math.random() < 0.5 ? 2 : -2);
  } else {
    step = targetIdx - idx;
  }
  return Math.max(0, Math.min(len - 1, idx + step));
}

/**
 * Index of the first MIDI in `midis` whose pitch class is the root of `key`.
 * Falls back to 0 if the key is unresolvable (won't happen for valid inputs).
 * Exported for unit tests — internal to the melody generation feature.
 */
export function findTonicIdx(midis: number[], key: string): number {
  const chroma = Note.chroma(key);
  if (chroma === undefined) return 0;
  const idx = midis.findIndex(m => ((m % 12) + 12) % 12 === chroma);
  return idx === -1 ? 0 : idx;
}
```

- [ ] **Step 4: Run tests — verify all 9 new tests pass, existing tests still green**

```
npm run test -- grid
```

Expected: all `describe` blocks pass — the two existing suites (8 tests) plus the three new suites (9 tests) = **17 tests total**, all green.

- [ ] **Step 5: Type-check**

```
npm run check
```

Expected: 0 errors, 0 warnings.

- [ ] **Step 6: Commit**

```bash
git add src/notation/grid.ts src/notation/grid.test.ts
git commit -m "feat(melody): pure rhythm + stepwise helpers for musical melody (+ tests)"
```

---

### Task 2: Replace `randomizeMelody` body + integration tests

Wire the Task 1 helpers into a musically-shaped `randomizeMelody`.

**Files:**
- Modify: `src/notation/grid.ts` (replace the body of `randomizeMelody`)
- Modify: `src/notation/grid.test.ts` (add `randomizeMelody` integration describe block)

**Interfaces:**
- Consumes: `buildRhythm`, `pickNext`, `findTonicIdx` (from Task 1); `TOTAL_STEPS` (already exported const = 64); `buildRowMidis` (existing).
- Produces: `randomizeMelody` — same signature, richer output.

- [ ] **Step 1: Write the failing integration tests**

Append this describe block at the bottom of `src/notation/grid.test.ts`:

```ts
describe("randomizeMelody (musical)", () => {
  it("returns at least one event", () => {
    expect(randomizeMelody("C", "major", 3, 2).length).toBeGreaterThan(0);
  });

  it("first and last event are the tonic — key C (chroma 0)", () => {
    for (let run = 0; run < 10; run++) {
      const ev = randomizeMelody("C", "major", 3, 2);
      expect(ev[0].midi % 12).toBe(0);
      expect(ev.at(-1)!.midi % 12).toBe(0);
    }
  });

  it("first and last event are the tonic — key G (chroma 7)", () => {
    for (let run = 0; run < 10; run++) {
      const ev = randomizeMelody("G", "major", 3, 2);
      expect(ev[0].midi % 12).toBe(7);
      expect(ev.at(-1)!.midi % 12).toBe(7);
    }
  });

  it("all startSteps are in [0, 63]", () => {
    const ev = randomizeMelody("C", "major", 3, 2);
    expect(ev.every(e => e.startStep >= 0 && e.startStep <= 63)).toBe(true);
  });

  it("all durations are >= 1", () => {
    const ev = randomizeMelody("C", "major", 3, 2);
    expect(ev.every(e => e.durationSteps >= 1)).toBe(true);
  });

  it("produces rhythmic variety across 5 runs (more than 1 distinct duration)", () => {
    const durs = new Set<number>();
    for (let run = 0; run < 5; run++) {
      for (const e of randomizeMelody("C", "major", 3, 2)) durs.add(e.durationSteps);
    }
    expect(durs.size).toBeGreaterThan(1);
  });

  it("works for pentatonic scale", () => {
    const ev = randomizeMelody("C", "pentatonic", 3, 2);
    expect(ev.length).toBeGreaterThan(0);
    expect(ev.every(e => e.durationSteps >= 1)).toBe(true);
  });
});
```

Also add `randomizeMelody` to the import at the top of the file:

```ts
import { remapByDegree, buildRowMidis, buildRhythm, pickNext, findTonicIdx, randomizeMelody } from "./grid";
```

- [ ] **Step 2: Run tests to see the integration tests fail**

```
npm run test -- grid
```

Expected: the 6 new integration tests fail (the existing 17 from Task 1 still pass).

- [ ] **Step 3: Replace the body of `randomizeMelody`**

In `src/notation/grid.ts`, replace the **body only** of `randomizeMelody` (keep the JSDoc comment and signature). The function is currently at the bottom of the file (after the helpers you added in Task 1). Replace everything from the opening `{` to the closing `}`:

```ts
/**
 * Generate a musically-shaped in-scale melody:
 * - Varied rhythm (eighth, quarter, dotted-quarter, half).
 * - Phrase contour: rises to a peak around bar 2–3, resolves back to the tonic.
 * - Stepwise bias: prefers ±1–2 scale degrees, occasional leaps toward the target.
 * - Tonic anchors: first and last note are always the key root.
 */
export function randomizeMelody(
  key: string,
  scale: ScaleId,
  baseOctave: number,
  octaves: number = 2,
): Array<{ startStep: number; durationSteps: number; midi: number }> {
  const midis = buildRowMidis(key, scale, baseOctave, true, octaves);
  if (!midis.length) return [];

  const len      = midis.length;
  const tonicIdx = findTonicIdx(midis, key);

  // Peak: upper 60–80% of the MIDI index range, randomised per roll.
  const peakIdx = Math.floor(len * 0.60 + Math.random() * len * 0.20);

  const slots  = buildRhythm(TOTAL_STEPS, 0.20);
  const events: Array<{ startStep: number; durationSteps: number; midi: number }> = [];
  let currentIdx = tonicIdx;

  for (let i = 0; i < slots.length; i++) {
    const { start, dur } = slots[i];
    const isFirst = i === 0;
    const isLast  = i === slots.length - 1;

    if (isFirst || isLast) {
      currentIdx = tonicIdx;   // anchor both ends on the tonic
    } else {
      // Two-phrase contour: 0..0.5 rise toward peak, 0.5..1 fall back to tonic.
      const t = start / TOTAL_STEPS;              // 0..1
      const targetIdx = t < 0.5
        ? Math.round(peakIdx * (t * 2))           // 0 → peakIdx as t goes 0→0.5
        : Math.round(peakIdx * (1 - (t - 0.5) * 2)); // peakIdx → 0 as t goes 0.5→1
      currentIdx = pickNext(midis, currentIdx, targetIdx);
    }

    events.push({ startStep: start, durationSteps: dur, midi: midis[currentIdx] });
  }

  return events;
}
```

- [ ] **Step 4: Run all tests**

```
npm run test
```

Expected: all 5 test files pass; the new `randomizeMelody (musical)` suite (7 tests) is all green. Total: **45 tests, all passing**.

- [ ] **Step 5: Type-check**

```
npm run check
```

Expected: 0 errors, 0 warnings.

- [ ] **Step 6: Commit**

```bash
git add src/notation/grid.ts src/notation/grid.test.ts
git commit -m "feat(melody): musical randomizeMelody — contour, stepwise, rhythmic variety"
```

---

### Task 3: Play/Stop button sizing + Space transport toggle

**Files:**
- Modify: `src/App.svelte` (enlarge `.play-btn`)
- Modify: `src/ui/KeyboardHarness.svelte` (Space handler + imports + hint text)

**Interfaces:**
- Consumes: `isPlayingStore` (from `../state/stores` — already imported in `App.svelte`; new import in `KeyboardHarness`); `playTransport`, `stopTransport` (from `../sequencer` — already imported in `App.svelte`; new import in `KeyboardHarness`).
- No new exports.

> No vitest tests for this task — button sizing is verified by eye and the Space handler is a two-line event branch in an existing event listener whose logic is covered by the type-checker and a manual play pass.

- [ ] **Step 1: Enlarge the play button**

In `src/App.svelte`, find the `.play-btn` style block (around line 382). Replace it with:

```css
  .play-btn {
    font-family: var(--font-mono);
    font-size: 0.8rem;
    letter-spacing: 0.08em;
    padding: 8px 22px;
    min-height: 36px;
    color: var(--text);
    background: var(--surface-raised);
    border: var(--hairline-w) solid var(--hairline);
    border-radius: var(--radius-sm);
    transition: filter var(--t-fast), background var(--t-fast);
  }
```

Then find the `@media (pointer: coarse)` block that contains `.tempo-input` (around line 433) and add `.play-btn` to it:

```css
  @media (pointer: coarse) {
    /* 16px is the magic floor: a smaller font makes mobile browsers auto-zoom
       the whole page on focus (and that zoom is a pain to undo inside a PWA). */
    .tempo-input { padding: 6px 8px; min-height: 32px; width: 3.2em; font-size: 16px; }
    .play-btn { padding: 10px 24px; min-height: 44px; }
  }
```

- [ ] **Step 2: Add Space → transport toggle in KeyboardHarness**

In `src/ui/KeyboardHarness.svelte`, add two imports to the `<script>` block, right after the existing `import { audioEngine } from "../audio/AudioEngine"` line:

```ts
  import { audioReadyStore, publishActiveNotes } from "../state/stores";
  import { isPlayingStore } from "../state/stores";
  import { playTransport, stopTransport } from "../sequencer";
```

Wait — `audioReadyStore` and `publishActiveNotes` are already imported on that line. Combine correctly:

```ts
  import { audioReadyStore, publishActiveNotes, isPlayingStore } from "../state/stores";
  import { playTransport, stopTransport } from "../sequencer";
```

Replace the existing two-line stores import (`import { audioReadyStore, publishActiveNotes } from "../state/stores";`) with the combined version, then add the sequencer import on the next line.

In `onKeyDown`, add the Space branch **immediately after the octave-shift checks and before `const midi = midiFor(e.code)`**:

```ts
    if (e.code === "Space") {
      if (isPlayingStore.get()) stopTransport(); else playTransport();
      e.preventDefault();   // prevent the browser's default page-scroll on Space
      return;
    }
    const midi = midiFor(e.code);
```

- [ ] **Step 3: Update the keyboard hint to mention Space**

In `src/ui/KeyboardHarness.svelte`, find the `<span class="readout">` element and replace it:

```svelte
    <span class="readout">
      Z–M = oct <strong>{octave}</strong>, Q–U = oct <strong>{octave + 1}</strong> ·
      <kbd>[</kbd>/<kbd>]</kbd> shift · <kbd>Space</kbd> play/stop ·
      {held.size > 0 ? `${held.size} note${held.size > 1 ? 's' : ''} held` : 'idle'}
    </span>
```

- [ ] **Step 4: Type-check + full test suite**

```
npm run check
```

Expected: 0 errors, 0 warnings.

```
npm run test
```

Expected: 45 tests, all green (no change — Task 3 has no vitest tests).

- [ ] **Step 5: Commit**

```bash
git add src/App.svelte src/ui/KeyboardHarness.svelte
git commit -m "feat(ux): bigger play/stop button + Space bar transport toggle"
```

---

## Self-Review

**Spec coverage:**
- §2.2 `buildRhythm` duration palette + rest probability → Task 1 helper + DURS const ✓
- §2.2 `pickNext` 55/25/20 weights → Task 1 helper ✓
- §2.2 `findTonicIdx` using `Note.chroma` + fallback to 0 → Task 1 helper ✓
- §2.2 phrase contour formula (t < 0.5 rise, t ≥ 0.5 fall) → Task 2 body ✓
- §2.2 tonic anchors (first + last) → Task 2 body, covered by integration tests ✓
- §2.2 `peakIdx` in upper 60-80% → Task 2 body ✓
- §2.2 unchanged signature → no callers touched ✓
- §2.3 `buildRhythm` tests (no-overlap, ≤ totalSteps, dur ≥ 1, empty case) → Task 1 ✓
- §2.3 `pickNext` tests (valid index, single-element, directional bias) → Task 1 ✓
- §2.3 `findTonicIdx` tests (C at 0, G at index > 0) → Task 1 ✓
- §2.3 integration tests (length > 0, tonic first/last for C and G, startStep range, dur ≥ 1, rhythmic variety, pentatonic) → Task 2 ✓
- §3.1 play button font-size 0.8rem, padding 8px 22px, min-height 36px desktop → Task 3 step 1 ✓
- §3.1 coarse-pointer 44px min-height → Task 3 step 1 ✓
- §3.2 Space in `onKeyDown` with `isEditableTarget` / `!ready` / `e.repeat` guards already in place → Task 3 step 2 (the existing guards wrap the entire onKeyDown body) ✓
- §3.2 `e.preventDefault()` to block page scroll → Task 3 step 2 ✓
- §3.2 hint text updated with `<kbd>Space</kbd>` → Task 3 step 3 ✓
- §3.3 no vitest for CSS/event handler → documented in task header ✓

**Placeholder scan:** No TBDs, no "similar to Task N" references, no missing code blocks.

**Type consistency:** `buildRhythm` returns `Array<{start:number;dur:number}>` in Task 1 definition; destructured as `const {start,dur}` in Task 2 body ✓. `findTonicIdx(midis, key)` used with same signature in both tasks ✓. `pickNext(midis, currentIdx, targetIdx)` used with matching signature ✓.
