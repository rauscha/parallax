# Musical melody + transport UX — design

- **Date:** 2026-06-20
- **Status:** approved; pending implementation plan
- **Author:** brainstormed with Andrew, 2026-06-20

## 1. Goal

Two independent improvements to the play experience:

1. **Musical melody generation** — replace the fully-random `randomizeMelody` with one that applies three basic principles of tonal melody: *stepwise motion*, *phrase-level contour*, and *rhythmic variety*.
2. **Transport UX polish** — make the Play/Stop button easier to hit (bigger target on both desktop and mobile) and wire `Space` to toggle transport.

---

## 2. Musical melody generation

### 2.1 Problems with the current implementation

`src/notation/grid.ts : randomizeMelody` (lines 135-154):
- **Mono-rhythmic:** every event is exactly 4 steps (one quarter note). Real melodies mix eighth notes, quarters, dotted quarters, and halves.
- **No contour:** each pitch is drawn uniformly from the full 2-octave MIDI pool — the melody wanders with no direction.
- **No phrase shape:** four bars of random notes with no arc, no rise-and-fall, no sense of a sentence.
- **No tonic anchoring:** the melody can end on any pitch, which sounds unresolved.

### 2.2 Design — rewrite `randomizeMelody`

Replace the body with two private pure helpers + a redesigned main loop. The function signature is **unchanged** (key, scale, baseOctave, octaves=2) so all callers (surprise.ts + Parallax Daily later) require no edits.

#### Helper 1: `buildRhythm`

```ts
function buildRhythm(totalSteps: number, restProb: number): Array<{ start: number; dur: number }> 
```

Fills `totalSteps` with a sequence of (start, duration) pairs:
- **Duration palette** `[2, 2, 4, 4, 4, 4, 6, 8]` — eighth (×2), quarter (×4), dotted-quarter, half. Sampling this array uniformly gives a natural weighting: ~25% eighths, ~50% quarters, ~12.5% dotted-quarters, ~12.5% halves.
- After each note, a rest gap of 2–4 steps is inserted with probability `restProb` (call site: 0.20).
- When fewer steps remain than the sampled duration, clamp to what's left (≥ 1 step).
- Returns slots in order; never overlaps; never exceeds `totalSteps`.

#### Helper 2: `pickNext`

```ts
function pickNext(midis: number[], idx: number, targetIdx: number): number
```

Chooses the next pitch index from `midis` with **stepwise bias toward `targetIdx`**:
- 55% — step ±1 toward target (or random ±1 if already at target)
- 25% — step ±2 toward target
- 20% — jump directly to `targetIdx` (allows occasional leaps and snaps the contour on target)
- Clamp to `[0, midis.length − 1]`.

#### Main loop — phrase contour

```
peakIdx = random int in [floor(len*0.60), floor(len*0.80)]

For each slot from buildRhythm(64, 0.20):
  phrasePos = slot.start / 64            // 0..1
  if phrasePos < 0.5:
    targetIdx = round(peakIdx * phrasePos * 2)     // 0 → peakIdx over first half
  else:
    targetIdx = round(peakIdx * (1 − (phrasePos − 0.5) * 2))  // peakIdx → 0 over second half

  idx = pickNext(midis, idx, targetIdx)
  push { startStep: slot.start, durationSteps: slot.dur, midi: midis[idx] }

Override: first event → midis[tonicIdx] (tonic)
Override: last event → midis[tonicIdx] (tonic)

where `tonicIdx` = index of first element in `midis` whose chroma equals `Note.chroma(key)`.
`Note.chroma` is already imported from `@tonaljs/tonal`. Falls back to index 0 if not found (shouldn't happen for a valid key/scale pair, but degrade gracefully).
```

**Result:** the melody starts on the tonic, climbs toward a peak somewhere in bars 2-3 (randomised per roll), then descends and lands on the tonic again — a classic arch contour. Rhythm is varied but quarter-note-dominated.

#### Scope

- **Single file change:** `src/notation/grid.ts` — only the body of `randomizeMelody` and two new private helpers above it.
- **No callers change.** `surprise.ts` and the grid UI call `randomizeMelody(key, scale, octave, 2)` — signature unchanged.

### 2.3 Testing

Pure unit tests (vitest, Node-safe) for the two helpers:

**`buildRhythm`:**
- All slots are non-overlapping and in order.
- Total covered steps ≤ `totalSteps`.
- Every duration is ≥ 1 and comes from the palette (or is a final clamp).
- Rest gaps are never negative.

**`pickNext`:**
- Returns a value in `[0, midis.length − 1]` always.
- When `targetIdx > idx`, returned index is ≥ idx (biased correctly).
- When `targetIdx < idx`, returned index is ≤ idx.
- Never throws on edge cases (idx = 0, idx = last, single-element array).

Full `randomizeMelody` integration: call with key="C"/scale="major" and verify first and last midi == C at baseOctave (Note.chroma matches 0), length > 0, all startSteps in [0, 63], all durations ≥ 1. Also call with key="G" and verify first/last chroma == 7 (G).

---

## 3. Transport UX polish

### 3.1 Play/Stop button sizing

**File:** `src/App.svelte`, `.play-btn` style block.

Current: `padding: 5px 12px; font-size: 0.72rem` — no explicit `min-height`.

New:
```css
.play-btn {
  font-size: 0.8rem;
  padding: 8px 22px;
  min-height: 36px;   /* desktop — comfortable click target */
}
@media (pointer: coarse) {
  .play-btn { min-height: 44px; padding: 10px 24px; }   /* mobile / touch */
}
```

The coarse-pointer block already exists for `.io-btn`; add `.play-btn` to it (or add a new block just for `.play-btn` in the existing `@media (pointer: coarse)` section).

### 3.2 Spacebar transport toggle

**File:** `src/ui/KeyboardHarness.svelte`.

KeyboardHarness already owns all keyboard event handling and has the correct guards (`isEditableTarget`, `!ready`, `e.metaKey`, `e.repeat`). Adding `Space` here is the natural fit.

Add imports at the top of the `<script>` block:
```ts
import { isPlayingStore } from "../state/stores";
import { playTransport, stopTransport } from "../sequencer";
```

Add to `onKeyDown`, before the `midiFor` check:
```ts
if (e.code === "Space") {
  if (isPlayingStore.get()) stopTransport();
  else playTransport();
  e.preventDefault();   // prevent page scroll
  return;
}
```

The existing guards (`isEditableTarget`, `!ready`, `e.repeat`, modifier keys) already protect this branch — `Space` won't fire in an input field, won't repeat-spam, won't interfere with Cmd+Space or similar.

Update the keyboard hint text to mention `Space`:
```svelte
<span class="readout">
  Z–M = oct <strong>{octave}</strong>, Q–U = oct <strong>{octave + 1}</strong> ·
  <kbd>[</kbd>/<kbd>]</kbd> shift · <kbd>Space</kbd> play/stop ·
  {held.size > 0 ? `${held.size} note${held.size > 1 ? 's' : ''} held` : 'idle'}
</span>
```

### 3.3 No testing needed for §3

Button sizing is CSS — verified by eye. Spacebar is a two-line event handler in an existing, tested harness; the existing keyboard tests are `check`-only (no vitest suite for KeyboardHarness).

---

## 4. File-change summary

| File | Change |
|------|--------|
| `src/notation/grid.ts` | Replace `randomizeMelody` body; add `buildRhythm` + `pickNext` private helpers |
| `src/notation/grid.test.ts` | Add tests for `buildRhythm`, `pickNext`, and `randomizeMelody` integration (export helpers for tests only, or test via the integration path) |
| `src/App.svelte` | Enlarge `.play-btn` + add to coarse-pointer block |
| `src/ui/KeyboardHarness.svelte` | Add `Space` → transport toggle + update hint text |

---

## 5. Non-goals

- No change to the melody *data model* (`MelodyEvent`, stores, serialization).
- No change to Surprise's other behaviour (engine swap, param randomisation).
- No per-model melody style (could be a future "After v1.0" idea).
- No change to the grid editor or staff — user-placed notes are untouched.
- No other keyboard shortcuts beyond `Space`.
