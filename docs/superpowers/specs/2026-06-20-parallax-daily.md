# Parallax Daily — design spec

- **Date:** 2026-06-20
- **Status:** DRAFT — pending Andrew's decisions (see §3)
- **Author:** drafted autonomously overnight 2026-06-20

---

## 1. Goal

Add a date-seeded "sound of the day": every user who opens Parallax on the same
calendar day rolls the same surprise instrument+melody. The seed is the date
string; no backend, no accounts, no network call. Anyone landing on the same
day gets a deterministic, identical result.

**Why it matters for the product:** reinforces the self-explaining instrument
loop — "here's today's patch, now learn what these knobs do." A shared context
makes it social without requiring accounts. The permalink (`?daily=YYYY-MM-DD`)
makes it shareable and archivable. It re-uses the existing Surprise + melody
generation machinery, so the quality of the roll is identical to a manual
Surprise tap.

**Roadmap origin:** "After v1.0 → date-seeded surprise; refactor `surprise.ts`
/ `randomizeMelody` to take an injected RNG when the time comes."

---

## 2. Design

### 2.1 Seeded PRNG utility — `src/state/rng.ts`

A single new file, pure TS, zero dependencies, Node-testable with no mocking.

#### String hash → 32-bit seed: `xmur3`

```ts
export function xmur3(str: string): number {
  let h = 1779033703 ^ str.length;
  for (let i = 0; i < str.length; i++) {
    h = Math.imul(h ^ str.charCodeAt(i), 3432918353);
    h = (h << 13) | (h >>> 19);
  }
  h = Math.imul(h ^ (h >>> 16), 2246822507);
  h = Math.imul(h ^ (h >>> 13), 3266489909);
  return (h ^ (h >>> 16)) >>> 0;   // unsigned 32-bit
}
```

#### 32-bit PRNG: `mulberry32`

```ts
export function mulberry32(seed: number): () => number {
  let s = seed >>> 0;
  return function rng(): number {
    s += 0x6d2b79f5;
    let t = Math.imul(s ^ (s >>> 15), s | 1);
    t ^= t + Math.imul(t ^ (t >>> 7), t | 61);
    return ((t ^ (t >>> 14)) >>> 0) / 0x100000000;  // [0, 1)
  };
}
```

#### Date → RNG factory: `dailyRng`

```ts
/** Returns a seeded RNG for the given UTC date string (YYYY-MM-DD).
 *  Deterministic: same string → same sequence across browsers and builds
 *  (barring a deliberate seed-version bump — see §3 D5). */
export function dailyRng(dateStr: string): () => number {
  return mulberry32(xmur3(dateStr));
}
```

**Why mulberry32 + xmur3:**
- Both are well-known, tiny, and produce good distribution for this use-case.
- mulberry32 is pass-by-value state (no class needed), testable with a fixed seed.
- xmur3 avalanches the date string into a uint32 with good bit-mixing.
- Together they are ~20 lines, zero deps, and the output is stable (the
  algorithm never changes unless we explicitly bump the seed version).

---

### 2.2 RNG-injection refactor

The goal is zero change to the **normal Surprise path** — it keeps calling
`Math.random()` implicitly. Only the Daily path injects a seeded RNG.

#### Injection seam: `() => number` default parameter

Both functions gain an optional final param:

```ts
type Rng = () => number;
```

#### Every `Math.random()` call-site that must become injectable

**`src/state/surprise.ts`** — 4 call-sites:

| Location | Current | After refactor |
|----------|---------|----------------|
| `pick<T>()` local helper | `Math.random()` | `rng()` (helper receives rng) |
| `rand()` local helper | `Math.random()` | `rng()` (helper receives rng) |
| `randomParamValue()` — stepped branch | `Math.floor(Math.random() * ...)` | `Math.floor(rng() * ...)` |
| `surpriseMe()` body (engine pick, key pick, scale pick) | via `pick()` / `rand()` | via injected helpers |

The refactor threads `rng` through the local helpers rather than exporting them:

```ts
// Revised local helpers:
function pick<T>(a: readonly T[], rng: Rng): T {
  return a[Math.floor(rng() * a.length)];
}
function rand(min: number, max: number, rng: Rng): number {
  return min + rng() * (max - min);
}
function randomParamValue(d: ParameterDescriptor, rng: Rng): number { ... }

// Revised public signature:
export async function surpriseMe(
  opts: { swapEngine?: boolean; rng?: Rng } = {},
): Promise<void> {
  const rng = opts.rng ?? Math.random;   // ← default: no change to callers
  ...
}
```

All three existing callers (`App.svelte` line 78, the hint-button on line 177,
and any future caller) pass no `rng` and are untouched.

**`src/notation/grid.ts`** — 6 call-sites across 3 functions:

| Function | Call-site | Current | After refactor |
|----------|-----------|---------|----------------|
| `buildRhythm` | dur pick from `valid` | `Math.floor(Math.random() * valid.length)` | `Math.floor(rng() * valid.length)` |
| `buildRhythm` | rest decision | `Math.random() < restProb` | `rng() < restProb` |
| `buildRhythm` | rest gap pick | `Math.floor(Math.random() * rests.length)` | `Math.floor(rng() * rests.length)` |
| `pickNext` | r value | `Math.random()` (primary branch) | `rng()` |
| `pickNext` | tiebreak (drift=0, r<0.55 branch) | `Math.random() < 0.5` | `rng() < 0.5` |
| `pickNext` | tiebreak (drift=0, r<0.80 branch) | `Math.random() < 0.5` | `rng() < 0.5` |
| `randomizeMelody` | `peakIdx` line | `Math.random() * len * 0.20` | `rng() * len * 0.20` |

Revised signatures (existing callers pass no `rng` → default → unchanged):

```ts
export function buildRhythm(
  totalSteps: number,
  restProb: number,
  rng: Rng = Math.random,
): Array<{ start: number; dur: number }>

export function pickNext(
  midis: number[],
  idx: number,
  targetIdx: number,
  rng: Rng = Math.random,
): number

export function randomizeMelody(
  key: string,
  scale: ScaleId,
  baseOctave: number,
  octaves: number = 2,
  rng: Rng = Math.random,
): Array<{ startStep: number; durationSteps: number; midi: number }>
```

`randomizeMelody` passes `rng` down into `buildRhythm` and `pickNext`.

`surpriseMe` passes `opts.rng` into `randomizeMelody` (already called at line 91).

#### Summary of the seam

```
dailyRng("2026-06-20")
  → rng: () => number
    → surpriseMe({ rng })
        → pick(ENGINES, rng)        // engine choice
        → pick(KEYS, rng)           // key choice
        → pick(SCALES, rng)         // scale choice
        → randomParamValue(d, rng)  // every knob
        → randomizeMelody(key, scale, octave, 2, rng)
             → buildRhythm(64, 0.20, rng)
             → peakIdx via rng()
             → pickNext(midis, idx, target, rng)  [per slot]
```

One RNG instance, threaded through: same date → same draw order every time.

---

### 2.3 Date → seed scheme

**Recommended:** UTC `YYYY-MM-DD` string (e.g. `"2026-06-20"`).

```ts
function todayUtc(): string {
  return new Date().toISOString().slice(0, 10);  // always UTC, always 10 chars
}
```

The alternative (local date) is Decision D1 below. UTC is safer for
reproducibility — see §3.

---

## 3. Decisions for Andrew

### D1 — Timezone of "today"

**Question:** UTC date or the user's local date?

**Options:**
- **A) UTC date** — `new Date().toISOString().slice(0, 10)`. A user in UTC-5 at
  11pm gets "tomorrow's" daily vs someone in UTC. Two users in different zones
  may see different seeds on the same wall-clock day near midnight.
- **B) Local date** — `new Date().toLocaleDateString('sv')` (ISO format, locale
  "sv" is a reliable YYYY-MM-DD in all browsers). Two users in different zones
  on the same calendar day always get the same daily — but UTC-5 at 11pm and
  UTC+9 at 1am are on "the same day" locally despite being 8 hours apart in
  absolute time.

**Recommendation: A (UTC).** Parallax is a solo instrument, not a leaderboard
— exact timezone alignment is not critical. UTC is simpler, entirely serverless,
and means `?daily=2026-06-20` unambiguously refers to the UTC calendar day,
making the permalink semantically clean. Note in the UI that the daily resets at
midnight UTC.

---

### D2 — UI presentation

**Question:** How does the user discover and trigger the daily?

**Options:**
- **A) Dedicated button in the top bar** alongside the Surprise button — e.g.
  `📅 Daily` or `▦ Daily #N` (where N is the day-of-year or a serial count
  from a fixed epoch). Permanent, always-visible, colorblind-safe (text label
  beside any icon).
- **B) Auto-roll on first visit each day** — silently loads the daily on boot
  if the user hasn't seen it yet (stored in `localStorage`). Discoverable only
  if the user notices the patch changed.
- **C) Entry inside the Surprise button's context menu** (if one is added) or
  inside the ToolsMenu — lower prominence, appropriate if Daily is secondary
  to the Surprise tap.
- **D) Both A + B** — auto-rolls on first visit AND offers a manual re-trigger
  button (useful if the user immediately did something else on boot).

**Recommendation: A (dedicated button, no auto-roll).** Auto-roll (B) is
surprising in the wrong way — the user returns to their patch from yesterday and
it's been replaced. A visible button respects intent. The label should be text
+/or a shape glyph so colorblind users have a non-color cue. Suggested: `▦ Daily`
(block glyph, unambiguous shape) with an `aria-label` that includes the date.
Position: immediately to the right of the Surprise button in `App.svelte`, so
the two generative actions are adjacent.

---

### D3 — Shareability / permalink

**Question:** Does rolling the Daily produce a shareable link? What form?

**Options:**
- **A) Seed-as-permalink** — `?daily=2026-06-20` in the URL (query param, not
  hash, so it coexists with the `#p=…` share hash). The app re-derives the
  daily from the date param on load without needing to bake the full state into
  the URL. Simple, human-readable, tiny.
- **B) Full share-URL** — clicking Daily rolls the patch and calls the existing
  `writeShareUrl()` machinery to write the full `#p=…` hash. The date seed is
  not preserved; the URL encodes the resulting patch state.
- **C) Both** — Daily button sets `?daily=YYYY-MM-DD` (for human-readable
  sharing); also offers a Copy Link button that produces the `#p=…` form (for
  exact-state sharing).
- **D) No permalink at first** — Daily rolls the patch but doesn't touch the
  URL. Shareability deferred.

**Recommendation: A (seed-as-permalink).** `?daily=2026-06-20` is tiny, elegant,
and self-describing. Anyone with the link lands on the same deterministic patch.
It also creates a permanent archive: every prior day's sound is accessible by
typing the date. Implementation: on boot, check `new URLSearchParams(location.search).get("daily")`
before checking `location.hash`; if present and valid (YYYY-MM-DD regex), roll
the daily for that date and load it. The Daily button sets this param via
`history.replaceState`. This is complementary to the `#p=…` share link, which
can still be used to share a modified version.

---

### D4 — Relationship to Surprise (engine swap)

**Question:** Should the Daily roll swap the engine (and therefore the theme)?

**Options:**
- **A) Yes — full Surprise** — engine swap, model, params, melody, exactly as
  `surpriseMe({ swapEngine: true })`. The daily could be any engine.
- **B) No — current engine only** — `surpriseMe({ swapEngine: false, rng })`.
  The daily rolls model+params+melody within whatever engine is loaded. Simpler,
  but less varied.

**Recommendation: A (full Surprise, engine swap included).** The point of the
Daily is that it IS a complete instrument — engine included. This matches the
roadmap framing ("same surprise instrument+melody, deterministically"). The
theme flip is part of the experience. If a user has personalised their engine
choice, rolling the Daily is a deliberate "show me today's pick" action, not
a background operation, so overriding the engine is appropriate.

---

### D5 — Determinism scope (seed versioning)

**Question:** Must the same date always produce the same daily, even after a
future code change that alters the roll logic?

**Context:** If `randomizeMelody` or `surpriseMe` internals change (new params,
different melody algorithm), the same seed will produce a different patch for
the same date. This is not a bug if we accept that the daily is "today's
result under the current algorithm." But if we want `2026-06-20` to mean the
same patch forever (archival intent), we need to version the seed.

**Options:**
- **A) Accept algorithm drift** — the seed is just the date string. Future
  logic changes silently change what a date produces. Simple; no overhead.
- **B) Version the seed** — e.g. `"v1:2026-06-20"` as the hash input. When
  roll logic changes materially, bump to `"v2:…"`. Old permalinks remain
  reproducible if we keep a v1 code path (or document the change). Complex.
- **C) Freeze by baking** — when the daily rolls, immediately call
  `writeShareUrl()` / `buildShareUrl()` and store the full patch state. The
  `?daily=…` param navigates to the baked `#p=…` state, not a re-derivation.
  Permalink is always the exact patch; seed versioning is moot.

**Recommendation: A (accept drift) for now, with a comment in `rng.ts` noting
the implication.** The Daily is a playful daily feature, not an archival system.
Exact reproduction of a date from a year ago is a "nice to have" that adds
complexity without clear user benefit at this stage. If Andrew wants archival
fidelity, C (baking) is the cleanest path — it reuses existing machinery and
doesn't need a versioned seed.

---

### D6 — Undo / lineage interaction

**Question:** Should rolling the Daily capture an undo snapshot and add an
entry to the Recent sounds lineage (same as Surprise does)?

**Options:**
- **A) Yes — same path as Surprise** — `captureUndo("Daily sound loaded")` +
  `recordSound("daily")` (new source type in `LineageSource`). Appears in ↺ Recent.
- **B) Yes for undo, no for lineage** — undo captures it (reversible) but it
  doesn't pollute Recent sounds (which is oriented toward generative exploration).
- **C) No undo, no lineage** — the Daily is treated as an ambient load (like
  restoring from a share URL), not an exploration action.

**Recommendation: A.** Consistency with Surprise is the right call. The user
tapped a button to load the daily — that's an intentional action worth undoing
and worth recording in the trail. Add `"daily"` to `LineageSource` so the Recent
menu can show a distinct label ("Daily sound") and glyph (e.g. `▦`). Colorblind-
safe: the glyph distinguishes it from Surprise (`⚄`) and Match (`◎`) by shape,
not color.

---

## 4. Implementation outline

Tasks are sequenced so each is independently testable. Full code-level plan
follows Andrew's decisions on D1–D6.

**Task 1 — PRNG utility (no UI, no state)**
- Create `src/state/rng.ts` with `xmur3`, `mulberry32`, `dailyRng`, `todayUtc`.
- Write `src/state/rng.test.ts` (vitest, Node-safe) — see §5.

**Task 2 — RNG injection into `grid.ts`**
- Add optional `rng: Rng = Math.random` param to `buildRhythm`, `pickNext`,
  `randomizeMelody`. Thread `rng` through all 6 internal call-sites (listed in §2.2).
- Existing callers unchanged (default kicks in). Existing tests continue to pass.
- Add determinism tests to `grid.test.ts` (see §5).

**Task 3 — RNG injection into `surprise.ts`**
- Add `rng?: Rng` to `surpriseMe` opts. Refactor local helpers to accept `rng`.
  Thread through all 4 call-sites (listed in §2.2). Default = `Math.random`.
- Existing callers (`App.svelte` lines 78, 177) unchanged.

**Task 4 — Daily roll function** (`src/state/daily.ts`)
- `export function rollDaily(dateStr?: string): Promise<void>` — calls
  `dailyRng(dateStr ?? todayUtc())` then `surpriseMe({ rng })`.
- Implement URL integration: read `?daily=` param on boot; `history.replaceState`
  with `?daily=YYYY-MM-DD` when the button is tapped (Decision D3).

**Task 5 — UI: Daily button in `App.svelte`**
- Add a `▦ Daily` button adjacent to the Surprise button.
- Colorblind-safe: text label always visible (not color-only). Use the `--signal`
  accent only for the hover/active state, not to convey meaning at rest.
- Wire `onclick` to `rollDaily()`. Disable when `!ready || rolling`.
- On mobile: show glyph only (matching the Surprise pattern — label hidden via
  `.surprise-label { display: none }` at narrow breakpoints).

**Task 6 — Lineage (conditional on D6)**
- If D6=A: add `"daily"` to `LineageSource` union in `src/state/lineage.ts`
  (or wherever the type lives). Update `RecentSoundsMenu.svelte` GLYPH and label
  maps to include `daily`.

**Task 7 — Boot permalink handling (conditional on D3=A)**
- In `App.svelte` or the existing boot sequence, check `?daily=` before checking
  `#p=`. If valid date, call `rollDaily(dateStr)` instead of applying shared state.

---

## 5. Testing approach

The seeded PRNG makes this feature highly testable without any mocking.

### `src/state/rng.test.ts`

```ts
// Determinism: same seed → same sequence
const r1 = mulberry32(42); const r2 = mulberry32(42);
expect(r1()).toBe(r2());  expect(r1()).toBe(r2());  expect(r1()).toBe(r2());

// Range: all values in [0, 1)
const rng = mulberry32(xmur3("2026-06-20"));
for (let i = 0; i < 1000; i++) { const v = rng(); expect(v).toBeGreaterThanOrEqual(0); expect(v).toBeLessThan(1); }

// Cross-date: different date → different seed
expect(xmur3("2026-06-20")).not.toBe(xmur3("2026-06-21"));

// todayUtc: always returns YYYY-MM-DD (10 chars, valid ISO)
expect(todayUtc()).toMatch(/^\d{4}-\d{2}-\d{2}$/);
```

### `src/notation/grid.test.ts` additions

```ts
// Deterministic melody: same seed → identical events
const rng1 = mulberry32(42); const rng2 = mulberry32(42);
const m1 = randomizeMelody("C", "major", 3, 2, rng1);
const m2 = randomizeMelody("C", "major", 3, 2, rng2);
expect(m1).toEqual(m2);

// Different seed → different melody (with overwhelming probability)
const rng3 = mulberry32(99);
const m3 = randomizeMelody("C", "major", 3, 2, rng3);
expect(m1).not.toEqual(m3);

// buildRhythm determinism
const b1 = buildRhythm(64, 0.20, mulberry32(7));
const b2 = buildRhythm(64, 0.20, mulberry32(7));
expect(b1).toEqual(b2);

// pickNext determinism
const pn1 = pickNext([60,62,64,65,67], 2, 4, mulberry32(5));
const pn2 = pickNext([60,62,64,65,67], 2, 4, mulberry32(5));
expect(pn1).toBe(pn2);
```

### Browser / integration note

`surpriseMe` touches the AudioEngine and Tone.js Transport, so end-to-end daily
roll tests require a browser or a heavily mocked environment. The testable
guarantee is: given the same seeded RNG, `randomizeMelody` and the param-pick
helpers produce byte-identical output. The engine swap (`startEngine`) is
async and DOM-coupled — leave it to manual verification in the running app.

---

## 6. File-change summary

| File | Change | New / Modified |
|------|--------|---------------|
| `src/state/rng.ts` | New: `xmur3`, `mulberry32`, `dailyRng`, `todayUtc` | New |
| `src/state/rng.test.ts` | New: PRNG determinism + range tests | New |
| `src/state/daily.ts` | New: `rollDaily(dateStr?)` + URL integration | New |
| `src/notation/grid.ts` | Add optional `rng` param to `buildRhythm`, `pickNext`, `randomizeMelody`; thread through 6 call-sites | Modified |
| `src/state/surprise.ts` | Add optional `rng` to `surpriseMe` opts; thread through local helpers + 4 call-sites | Modified |
| `src/state/lineage.ts` | Add `"daily"` to `LineageSource` (if D6=A) | Modified |
| `src/ui/RecentSoundsMenu.svelte` | Add glyph + label for `"daily"` source (if D6=A) | Modified |
| `src/App.svelte` | Add `▦ Daily` button; wire to `rollDaily()`; boot permalink check | Modified |
| `src/notation/grid.test.ts` | Add determinism tests for `buildRhythm`, `pickNext`, `randomizeMelody` with seeded RNG | Modified |

---

## 7. Non-goals

- **No backend.** The date seed is pure client-side math. No server, no API call,
  no database.
- **No streak tracking.** Could be added later from `localStorage` trivially, but
  not in scope — it adds retention-game psychology that doesn't serve the core
  self-explaining instrument loop.
- **No leaderboard / social layer.** The Daily is a shared reference point, not
  a competition.
- **No push notifications.** Reminding users of the daily is out of scope.
- **No per-engine daily.** One daily per day across all engines — the engine is
  part of the roll.
- **No historical gallery / archive UI.** The `?daily=YYYY-MM-DD` permalink IS
  the archive — no browseable index at this stage.
- **No audio recording of the daily.** Audio export is already deferred post-v1.0.
- **No persistence of the "have I seen today's daily" state** beyond a
  `localStorage` key (needed only if D2=B or D, which is not the recommendation).
