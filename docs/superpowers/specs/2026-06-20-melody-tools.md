# Melody tools — swing, Euclidean, arp, mutate

- **Date:** 2026-06-20
- **Status:** DRAFT — pending Andrew's decisions (see §3)
- **Author:** drafted autonomously overnight 2026-06-20

---

## 1. Goal (+ why)

`randomizeMelody` (shipped as part of the musical-melody + transport UX work) generates a single arch-contour melody in one shot. That covers "give me something new," but it leaves a gap: the user has no way to *shape* or *evolve* what's already there. Four tools fill that gap:

| Tool | One-line job |
|---|---|
| **Mutate** | Take the current melody and vary it slightly — evolve rather than replace. |
| **Euclidean** | Generate a new rhythm with k pulses spread evenly across n steps, mapped onto scale pitches. |
| **Arp** | Turn the current melody's distinct pitches into an arpeggiated pattern at a chosen rate. |
| **Swing** | Delay every off-beat note so the melody grooves. |

These are *melody tools*, not voice/patch tools. They operate purely on the `events: MelodyEvent[]` array in `melodyStore` (or, for swing, on playback timing). They respect the established constraints: monophonic, snap-to-scale, 4 bars / 64 steps.

**Why now:** the roadmap's "After v1.0 item #3" explicitly names this cluster. The pure-function pattern established in `src/notation/grid.ts` (with `buildRhythm`, `pickNext`, etc.) and proven by `grid.test.ts` means new generators/transforms slot in cleanly and are Node/vitest-testable without a browser.

---

## 2. Design

All four tools follow the established model: pure exported functions in `src/notation/grid.ts` (or a new peer file), invoked by a UI handler that calls `captureUndo` then writes the result into `melodyStore`. The UI handler pattern is already fully established in `GridEditor.svelte:handleRandomize`.

---

### 2.1 Mutate

**Concept:** Take the current `MelodyEvent[]` and make small, controlled random perturbations — nudge pitches by ±1 scale degree, flip individual notes to rests, or shift rhythm slightly. The result is recognisably related to the original. The user can hit Mutate repeatedly to "evolve" a melody rather than scrapping it.

**Pure function signature:**

```ts
// src/notation/grid.ts
export function mutateMelody(
  events: ReadonlyArray<MelodyEvent>,
  key: string,
  scale: ScaleId,
  baseOctave: number,
  octaves: number,
  strength: number,   // 0.0–1.0 — fraction of notes to alter
): MelodyEvent[]
```

**Algorithm:**

1. Build `rowMidis = buildRowMidis(key, scale, baseOctave, true, octaves)` — the valid in-scale MIDI pool.
2. For each event, independently decide (with probability `strength`) whether to mutate it. Default `strength` = 0.3 (30% of notes altered per call).
3. For mutated events, pick one operation with equal probability:
   - **Pitch nudge:** find the current MIDI in `rowMidis`; step ±1 or ±2 scale degrees (same distribution as `pickNext`).
   - **Octave jump:** shift the MIDI up or down by 12, keeping within the MIDI range `buildRowMidis` spans. Only applies if the note is in scale.
   - **Rest toggle:** if the note is short (≤ 2 steps), mark it as a rest by removing it from the array (leave the time slot silent). If it is already absent (rest gap), skip — mutate doesn't create notes from rests.
4. Always keep the first and last events at the tonic (same anchor as `randomizeMelody`) — mutating the endpoints sounds unresolved.
5. All output MIDI values must be in `rowMidis` (i.e. snap-to-scale is enforced). If a nudge would step out of `rowMidis`, clamp to the nearest boundary.

**Rhythm mutation (conservative):** Mutate does NOT change `startStep` values. Changing start times while leaving durations alone would create overlaps; changing both is complex and risks destroying the listener's sense of continuity. Rhythm stays untouched; only pitch and rests change. (A `strength`-gated duration jitter is a future option, post-decision.)

**UI wiring:** `handleMutate` in `GridEditor.svelte` — same 3-line pattern as `handleRandomize`. Calls `captureUndo("Melody mutated")` first.

---

### 2.2 Euclidean

**Concept:** Generate a new melody from scratch using a Euclidean rhythm — k pulses spread as evenly as possible across n steps (Bjorklund / Toussaint algorithm). The n steps map onto the 64-step grid as a repeating cycle; each pulse gets an in-scale pitch via `pickNext` with the same arch-contour logic as `randomizeMelody`.

**Pure function signatures:**

```ts
// src/notation/grid.ts

/** Bjorklund algorithm — returns array of length n; true = pulse, false = rest. */
export function euclideanRhythm(k: number, n: number): boolean[]

/** Generate a melody whose rhythm is Euclidean(k, n) tiling 64 steps. */
export function euclideanMelody(
  k: number,
  n: number,
  key: string,
  scale: ScaleId,
  baseOctave: number,
  octaves: number,
): MelodyEvent[]
```

**`euclideanRhythm(k, n)`:**

Bjorklund's algorithm (the standard iterative implementation):
1. Start with k ones and (n − k) zeros.
2. Repeatedly take the shorter "remainder" group and interleave it into the longer group until one group has length 1 or 0.
3. Returns a `boolean[]` of length n with k true values spaced as evenly as possible.
Example: `euclideanRhythm(3, 8)` → `[T,F,F,T,F,F,T,F]` (the classic Afro-Cuban clave approximation).

**`euclideanMelody(k, n, …)`:**

1. Get the rhythm pattern via `euclideanRhythm(k, n)`.
2. Tile it across 64 steps: for step i in 0..63, pattern[i % n] tells whether step i is a pulse.
3. Turn pulses into events: each pulse at step i gets `durationSteps = 2` (8th note, the smallest meaningful duration). Duration is fixed at 2 so consecutive pulses are clearly articulated.
4. Assign pitches: walk `rowMidis` using `pickNext` with an arch contour (same logic as `randomizeMelody`), anchoring on the tonic at the first and last pulses.

**Constraints:** k must be in [1, n]; n must be in [2, 32] (so tiling fills 64 steps evenly or overhangs cleanly at worst by < n steps). The UI clamps these.

**Monophonic:** the rhythm is inherently monophonic — only one pulse fires per step. No chord-mode concern.

**Decision pending (see §3 D2):** which pitches fill the pulses? Options are tonic-only, stepwise walk, or `pickNext` arch. Recommendation: `pickNext` arch (same logic as `randomizeMelody`) because it produces musically shaped lines rather than single-pitch ostinatos.

---

### 2.3 Arp

**Concept:** Collect the distinct MIDI pitches from the current melody, sort them into a scale-degree order, and re-sequence them as a repeating arpeggio pattern at a user-chosen rhythmic rate, filling the full 64 steps.

**The monophonic tension:** a classical arp arpeggios a *chord* — multiple simultaneous notes. Parallax is monophonic. Resolution: treat the current melody's **distinct scale degrees** as the source pool, regardless of how they arrived there. This gives the user "shape the pool by editing the melody, then arp it into a new pattern." It's musically coherent and respects monophony.

**Pure function signature:**

```ts
// src/notation/grid.ts
export type ArpOrder = "up" | "down" | "updown" | "random";

export function arpMelody(
  events: ReadonlyArray<MelodyEvent>,
  key: string,
  scale: ScaleId,
  baseOctave: number,
  octaves: number,
  order: ArpOrder,
  rateDivision: 2 | 4,   // 2 = 8th notes (2 steps), 4 = 16th notes (1 step)
  octaveRange: 1 | 2,    // 1 = stay in base octave, 2 = double up
): MelodyEvent[]
```

**Algorithm:**

1. Extract distinct MIDI values from `events`. Filter to those in `buildRowMidis(…, true, octaves)` (snap-to-scale, discard any chromatic outliers).
2. Sort by MIDI ascending. If `octaveRange === 2`, append the same degrees shifted +12 if they're still in `[MIDI_MIN, MIDI_MAX]`.
3. Build the arp sequence from the sorted pool according to `order`:
   - `up`: cycle forward through the pool.
   - `down`: cycle backward.
   - `updown`: go up then down, excluding repeated top/bottom notes on the turnaround (so `[C,E,G]` → `C E G E C E G …` not `… G G C C …`).
   - `random`: shuffle the pool each cycle (consistent within a cycle for musical coherence).
4. Fill 64 steps at the chosen rate. Each note gets `durationSteps = rateDivision` (8th or 16th note). Total events = 64 / rateDivision.
5. If `events` is empty or has only one distinct pitch, generate a scale-walking arp using `buildRowMidis` as the pitch pool (graceful fallback — an arp of one note is a trill).

**Edge case — no current melody:** fall back to generating an arp on the full `buildRowMidis` pool, starting from `tonicIdx`. This matches the spirit of "arp from the scale."

**Monophonic check:** the arp is by construction monophonic (one note per time slot, no overlaps).

---

### 2.4 Swing

**Concept:** Delay off-beat notes (those falling on even-numbered 8th-note positions: steps 2, 6, 10, 14, … of each 4/4 bar) by a fraction of the 8th-note duration, creating a shuffle or groove feel.

**The two implementation models:**

#### Model A — Tone.js transport swing (playback-only)

```ts
// src/sequencer/transport.ts
const transport = Tone.getTransport();
transport.swing = 0.5;              // 0 = straight, 1 = full dotted
transport.swingSubdivision = "8n";  // which subdivision to swing
```

- Affects **only playback**. The `MelodyEvent[]` data stays at integer step values.
- Works by Tone delaying odd 8th-note positions inside its scheduler.
- Pro: zero data-model change; swing is a transport knob, not a grid mutation.
- Con: the grid display still shows straight-time note positions — what you see and what you hear diverge. The swing value is a separate piece of state that needs its own store key and persistence/share-URL slot.

#### Model B — Bake offsets into event startSteps (data model)

Convert swing into fractional `startStep` offsets on off-beat notes and write them back into `MelodyEvent[]`. Because `startStep` is currently an integer and `stepToBBS` assumes integer steps, this requires either:
- Extending `MelodyEvent` to allow `startStep: number` (it's already typed that way — it's a number, not constrained to integers), AND
- Updating `stepToBBS` / `expand` to handle sub-step fractions (converting to Tone time strings like `"0:1:0.5"`).

- Pro: the timing is visible in the grid; exported MIDI files would carry the swing; share URLs encode it correctly.
- Con: more invasive — requires `part-expand.ts` changes, store schema changes, serialization changes, and the grid renderer would need to handle non-integer positions.

**Recommendation: Model A for the first iteration** (see §3 D1 for the full trade-off question). Rationale: swing is conceptually a playback feel, not a note-placement decision. Baking it into data conflates the grid (which is a step sequencer) with groove quantization (which is a playback layer). Model A is clean, reversible, and safe. Model B can always be adopted later if MIDI export or visual grid representation of swing becomes a priority.

**Under Model A, the new state and wiring:**

```ts
// src/state/stores.ts — add to Melody interface
swing: number;    // 0.0–0.7, default 0.0 (0 = straight, 0.7 ≈ hard shuffle)
```

```ts
// src/sequencer/transport.ts — in installSequencer(), add to the melodyStore.subscribe block:
if (m.swing !== lastSwing) {
  lastSwing = m.swing;
  transport.swing = m.swing;
  transport.swingSubdivision = "8n";
}
```

**No new function in `grid.ts`** — swing is a transport parameter, not a grid transform. The UI writes `melodyStore.setKey("swing", value)` directly, same as tempo.

**Persistence / share URL:** `swing` must be added to the serialization schema (alongside `tempo`, `key`, `scale`) so share links and presets carry the groove. This is a small but non-trivial addition — see §4 task S3.

---

## 3. Decisions for Andrew

### D1 — Swing implementation model

**Question:** Should swing be a playback-only transport parameter (Tone's built-in), or should it bake fractional offsets into the `MelodyEvent` start times?

**Options:**
- A. Tone transport `swing`/`swingSubdivision` — clean, zero data-model impact, but grid display stays straight-time and exported MIDI is unswung.
- B. Bake into `startStep` as a float — visible in grid and MIDI exports, but requires schema + serialization + renderer changes.

**Recommendation: A (transport-only) for now.** The grid is a step sequencer; its steps are logically quantized. Swing is groove feel, not a note-placement decision. MIDI export of a swung file is a nice-to-have that can be revisited when the one-loop audio export feature lands (the first planned un-deferral). Start simple.

---

### D2 — Euclidean pitch assignment

**Question:** What pitches fill the Euclidean pulses?

**Options:**
- A. Tonic only (single-note ostinato / drum-like).
- B. Stepwise scale walk (always ±1 scale degree, no contour).
- C. `pickNext` arch contour (same algorithm as `randomizeMelody` — rises to a peak then resolves to tonic).

**Recommendation: C.** Options A and B are less musically interesting. The `pickNext` arch is already well-tested and produces results that feel shaped, not random. The Euclidean tool's differentiator is *rhythm*, not a new pitch algorithm — reusing the existing contour algorithm is the right level of coupling.

---

### D3 — Euclidean parameter UI (k and n)

**Question:** How does the user pick k (pulses) and n (steps)?

**Options:**
- A. Two sliders (k: 1–16, n: 2–32) inside the melody tools popover.
- B. Preset pair selector — e.g. "3/8, 5/8, 4/12, 5/16, 7/16" — as a grid of labelled buttons. Covers the common musical patterns; no slider precision needed.
- C. Separate number inputs (spinner / text fields).

**Recommendation: B (presets), plus a "Custom k/n" expansion.** The most useful Euclidean rhythms are well-known (3/8 = clave, 5/8 = quintillo, 7/16 = standard 7-feel, etc.). Offering them as named presets lowers friction. A "Custom" toggle can reveal k/n sliders for experimentation. This is also the safest colorblind-safe UI: the preset grid uses text labels, not color coding.

Suggested presets: `2/4 · 3/8 · 4/8 · 5/8 · 3/16 · 5/16 · 7/16 · 11/16 · 4/12 · 5/12` — label each as `k/n`.

---

### D4 — Arp source pool

**Question:** What does the arp arpeggiate — the melody's pitches, or the current scale?

**Options:**
- A. Distinct pitches from the current `events` array. (User shapes the pool by editing the melody first.)
- B. Always the full `buildRowMidis` scale pool. (Arp is a scale arpeggiator, ignoring the melody.)
- C. A or B, toggled by a "From melody / From scale" control.

**Recommendation: A (melody pitches) as the default, with the graceful fallback to full scale when the melody is empty (see §2.3 algorithm step 5).** The spec already documents this. Option C is a future enhancement if users find the distinction useful. Option B is less interesting because it ignores user intent already expressed in the melody.

---

### D5 — Mutate: rhythm variation

**Question:** Should Mutate alter `durationSteps` as well as pitch/octave/rest?

**Options:**
- A. Pitch and rests only (no rhythm change) — simpler, less surprising, more "evolve the melody."
- B. Both pitch and duration — more radical variation, higher risk of breaking melodic continuity.
- C. Separate `pitchStrength` and `rhythmStrength` sliders.

**Recommendation: A (pitch and rests only) for the initial version.** Rhythm is what makes a melody recognizable from bar to bar; keeping it stable while pitches shift is the closest analogue to how a real composer would "mutate" a theme. Option C is a nice long-term UI enhancement but is too complex for the initial build.

---

### D6 — Swing amount UI

**Question:** Slider (continuous 0–70%), fixed presets (straight / light shuffle / heavy shuffle), or on/off toggle?

**Options:**
- A. Continuous slider (0.0–0.7).
- B. Three labelled buttons: "Straight · Light · Heavy" (values 0, 0.35, 0.6).
- C. Toggle (straight ↔ moderate swing at a fixed 0.5).

**Recommendation: B (three labelled buttons).** A continuous slider is harder to discover and harder to communicate without color. Three labelled text buttons are accessible, immediately self-describing, and cover the realistic use cases. The "Straight" button doubles as an explicit "turn off swing" control. All three can be communicated with text labels alone — no color needed.

---

### D7 — Build order and incremental shipping

**Question:** Should all four tools ship together, or in stages?

**Options:**
- A. All four in one branch.
- B. Mutate first, then Euclidean + Arp, then Swing separately (transport concern is orthogonal).
- C. Mutate + Swing first (lowest-risk / most-used), then Euclidean + Arp.

**Recommendation: B** — ship in this order:

1. **Mutate** — smallest footprint, pure transform of existing events, TDD-friendly, directly answers "I like this melody but want to evolve it." Uses `pickNext` and `buildRowMidis` already exported and tested.
2. **Euclidean** — adds a new generator; needs Bjorklund implementation (small, well-specified). Builds on the `buildRhythm`-style pattern.
3. **Arp** — moderate complexity (order logic + edge cases); can share the same UI popover slot as Euclidean.
4. **Swing** — orthogonal transport concern; touches `stores.ts`, `transport.ts`, serialization, and share-URL schema. Good to do last when the rest of the tool cluster is stable.

Each can ship as a separate commit on its own mini-branch or as sequential commits on a single `melody-tools` branch.

---

### D8 — UI home

**Question:** Where do these four tools live in the UI?

**Options:**
- A. One "Melody tools" popover button in the GridEditor toolbar, adjacent to the existing `⚄ Randomize` button. The popover lists Mutate, Euclidean, Arp, and Swing controls inline.
- B. Expand the existing `⚄ Randomize` button into a split button or dropdown that also reveals the new tools.
- C. Four separate small buttons in the GridEditor bottom toolbar row.

**Recommendation: A (dedicated "Melody tools" popover).** The `⚄ Randomize` button lives at `GridEditor.svelte:688` in the toolbar strip between "In Key / Chromatic" and the end. A `⊞ Tools` button (or `♩ Tools`) placed immediately next to it opens a popover using the established `RecentSoundsMenu.svelte` / `PresetMenu.svelte` popover idiom. Inside the popover:
- **Mutate** — "⟳ Mutate" button + optional strength indicator (text: "subtle / moderate / bold" or a 1–3 step selector).
- **Euclidean** — "# Euclidean" section with the k/n preset grid (per D3) + a "Generate" button.
- **Arp** — "↑ Arp" section with Order selector (Up / Down / ↑↓ / Rnd, text labels) + Rate (8th / 16th) + "Generate" button.
- **Swing** — "Swing" section with the three labelled buttons (Straight / Light / Heavy, per D6).

All controls use text labels and glyphs, never color alone — safe for colorblindness. The popover can be implemented as a new `MelodyToolsMenu.svelte` following the same pattern as `RecentSoundsMenu.svelte`.

On mobile (≤ 720px), the GridEditor toolbar is already tight; the `ToolsMenu.svelte` overflow popover (`⋯`) already wraps the top bar. The Melody Tools popover is *inside* the grid editor area, not the top bar — so it doesn't go through the `⋯` wrapper and remains accessible on phone.

---

## 4. Implementation outline

*(Full code-level plan follows after §3 decisions are locked. Task-level plan here.)*

All Euclidean / Arp / Mutate functions are pure → TDD (write tests first, implement to pass, same as musical-melody spec).

### S0 — Create `MelodyToolsMenu.svelte`

New file: `src/ui/MelodyToolsMenu.svelte` following `RecentSoundsMenu.svelte` popover pattern. Start empty with just the trigger button and popover shell. Wire it into `GridEditor.svelte` next to `⚄ Randomize`.

### S1 — Mutate (Phase 1)

1. Write `grid.test.ts` cases for `mutateMelody` (see §5).
2. Implement `mutateMelody` in `grid.ts`.
3. Add `handleMutate` to `GridEditor.svelte`; render "⟳ Mutate" inside `MelodyToolsMenu`.
4. Add strength UI (pending D5 decision — default simple).

### S2 — Euclidean (Phase 2)

1. Write tests for `euclideanRhythm` (see §5).
2. Implement `euclideanRhythm` + `euclideanMelody` in `grid.ts`.
3. Add preset grid to `MelodyToolsMenu` (pending D3 decision).
4. Wire `handleEuclidean` in `GridEditor.svelte`.

### S3 — Arp (Phase 3)

1. Write tests for `arpMelody` (see §5).
2. Implement `arpMelody` in `grid.ts`.
3. Add order/rate controls to `MelodyToolsMenu`.
4. Wire `handleArp` in `GridEditor.svelte`.

### S4 — Swing (Phase 4)

1. Add `swing: number` to `Melody` interface in `stores.ts` (default `0`).
2. Update `installSequencer` in `transport.ts` to subscribe to `swing` changes and sync `Tone.getTransport().swing`.
3. Add swing serialization: update `src/state/serialization.ts` encode/decode + share-URL schema.
4. Add Swing section to `MelodyToolsMenu` (three labelled buttons per D6).
5. Update preset save/load to include `swing`.

---

## 5. Testing approach

### Pure helpers — Node/vitest testable (no browser)

Add to `src/notation/grid.test.ts`:

**`mutateMelody`:**
- Output length ≤ input length (rest-toggle can remove events; can never add).
- All output MIDI values are in `buildRowMidis(key, scale, baseOctave, true, octaves)`.
- With `strength=0.0`: output events are identical to input events (no-op).
- With `strength=1.0`: every non-anchor event is altered (at least one of pitch/rest changed).
- First and last event (when present) always land on the tonic pitch class.
- Does not modify the original array (immutability check).

**`euclideanRhythm(k, n)`:**
- Output length === n always.
- Sum of `true` values === k always.
- `euclideanRhythm(0, n)` returns all-false array of length n.
- `euclideanRhythm(n, n)` returns all-true array of length n.
- Known patterns: `euclideanRhythm(3, 8)` matches `[T,F,F,T,F,F,T,F]`.
- `euclideanRhythm(5, 8)` matches `[T,F,T,F,T,F,T,T]` (or the canonical rotation — confirm algorithm output).

**`euclideanMelody`:**
- Returns events in ascending `startStep` order.
- Total `startStep` values are within `[0, 63]`.
- All MIDI values are in the `buildRowMidis` pool.
- First and last events are the tonic pitch class.
- Number of events equals the number of pulses tiled across 64 steps.

**`arpMelody` with `order="up"`:**
- Returns events in ascending `startStep` order.
- All events are monophonic (no two events share a `startStep`).
- MIDI values cycle through distinct source pitches in ascending order.
- Total events = 64 / rateDivision.

**`arpMelody` with `order="down"`:** MIDI values cycle in descending order.

**`arpMelody` with empty `events`:** falls back gracefully; returns > 0 events.

### Swing — transport integration (browser or Tone mock)

`Tone.getTransport().swing` is not Node-safe (requires an AudioContext). Options:
- Unit test: mock `Tone.getTransport` and verify the subscription sets `.swing` correctly. This is straightforward with vitest's mock module capability.
- Integration test: use the running dev server (if browser available) and confirm the `▶` play button produces audibly delayed off-beats with swing > 0.

### UI — browser only

`MelodyToolsMenu.svelte` open/close, disabled state, button labels: manual verification using `npm run dev` (or the existing Preview tab). The preview tab is backgrounded — flag in the commit body if visual verification wasn't performed.

---

## 6. File-change summary

| File | Change |
|---|---|
| `src/notation/grid.ts` | Add `mutateMelody`, `euclideanRhythm`, `euclideanMelody`, `arpMelody` (exported pure functions) |
| `src/notation/grid.test.ts` | Add test suites for all four new functions |
| `src/ui/MelodyToolsMenu.svelte` | **New file** — popover component; houses Mutate / Euclidean / Arp / Swing controls |
| `src/notation/GridEditor.svelte` | Import + render `MelodyToolsMenu`; add `handleMutate`, `handleEuclidean`, `handleArp` handlers |
| `src/state/stores.ts` | Add `swing: number` to `Melody` interface (default `0`) |
| `src/sequencer/transport.ts` | Subscribe to `melody.swing`; sync to `Tone.getTransport().swing` |
| `src/state/serialization.ts` | Add `swing` to encode/decode paths |
| `src/state/share-url.ts` | Include `swing` in share-URL schema (alongside `tempo`, `key`, `scale`) |

---

## 7. Non-goals

- **No polyphony.** All four tools produce monophonic output — one note at a time, never overlapping. Arp in particular: despite the name, the output is a single-voice line, not stacked voices.
- **No per-step p-locks.** Per-step parameter automation is the deferred "G5" milestone in the grid roadmap. None of these tools touch per-step synth parameters.
- **No new engine or DSP.** Purely melody/sequencer layer.
- **No swing-in-MIDI-export.** Swing (Model A) is playback-only; exported MIDI files remain straight-time. Baking swing into note data is explicitly deferred (see §3 D1).
- **No chord mode.** Arp takes a monophonic source; it does not add implied harmony or chord detection.
- **No UI animation or visual feedback beyond the grid updating.** The grid already repaints on every `melodyStore` write; no additional animation work is needed for these tools.
- **No AI/LLM-based melody generation.** All generators are deterministic algorithms (Bjorklund, `pickNext`-based contour) with seeded randomness where needed.
