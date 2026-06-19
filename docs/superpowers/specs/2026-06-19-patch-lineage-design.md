# Patch-lineage breadcrumb — "Recent sounds" — design

- **Date:** 2026-06-19
- **Status:** approved (design + designer sign-off); pending implementation plan
- **Roadmap item:** "After v1.0" #1 (`docs/roadmap-v1.0.md`); origin: `reviews/2026-06-11-next-level-ideas.md` §1.2
- **Author:** brainstormed with Andrew, 2026-06-19

## 1. Goal

Turn the one-tap "Surprise" roll from a *gamble* into a *walk*. Today a roll (or a
Match-panel Apply) replaces the whole instrument with no persistent way back — the
existing single-slot undo toast lasts ~6 s and then the previous sound is gone for
good. This feature keeps a short, persistent **"Recent sounds"** history of the
instruments you've landed on via the generative actions, so you can step back to one
you liked at any time, even after a reload.

It also quietly builds the snapshot-ring that later features (Parallax Daily, A/B
compare) will reuse.

## 2. Non-goals (explicitly out of scope)

- **No change to the existing undo toast.** `src/state/undo.ts` and `UndoToast.svelte`
  stay exactly as they are and keep handling the four melody/destructive actions
  (Surprise, Randomize, Clear, MIDI import) with their instant one-tap undo.
- **Not a redo stack / not branching.** This is a recent-list (recall), not an
  undo/redo tree. No forward arrow, no truncation semantics.
- **No manual-edit capture.** Knob tweaks and manual model/engine picks do *not*
  create entries — only the two generative actions do (keeps the list short and
  high-value; auditioning models won't flush it).
- **No engine/DSP/worklet/transport changes.** Purely a state + UI feature.

## 3. Locked decisions (from brainstorming)

1. **Interaction shape:** a "Recent sounds" list (popover), not just a beefed-up toast.
2. **What's captured:** instrument/sound changes only — **Surprise rolls** and
   **Match-panel Apply**. Melody-only actions keep the existing transient toast.
3. **Persistence:** yes — survives reload / PWA relaunch, via `idb-keyval` in its own
   IndexedDB namespace (separate from presets).
4. **Surprise keeps its instant undo toast** *and* also records to the ring. The toast
   is "oops, undo that"; the ring is the deeper, persistent trail. They're independent.
5. **Ring size:** 10, newest-first, dedup against the current head.
6. **Restore** reuses the proven `loadState(decodeState(wire))` path (the same one
   presets and share-URLs use), and is itself reversible (records the outgoing sound
   before applying).
7. **UI home:** one more `io-btn` inside the existing `.io-bar` cluster in
   `PatchToolbar.svelte`, labeled **`↺ Recent`**, placed right after Presets. Not a new
   top-level top-bar button.

## 4. Architecture

### 4.1 Data model

The ring stores the **outgoing** sound — the one you're leaving — so the list reads as
"sounds I can step back to." This directly generalizes today's single-slot
`captureUndo`.

```ts
type LineageSource = "surprise" | "match";

interface LineageEntry {
  wire: string;          // encodeState(patch, melody) — same format as presets/URLs
  savedAt: number;       // epoch ms (for the "2m ago" label)
  engineId: string;      // summary field — render the row without decoding the blob
  modelId: string | null;
  source: LineageSource; // drives the row's leading glyph (⚄ / ◎)
}
```

The live (currently-playing) sound is *not* in the ring — you're already on it.

### 4.2 Pure ring logic (testable, no idb / no Svelte)

A small pure helper so the core behavior is unit-testable in the existing vitest
pure layer:

```ts
const CAP = 10;
// Prepend newest-first; skip if identical wire to the current head; cap to CAP.
function pushSnapshot(ring: LineageEntry[], entry: LineageEntry): LineageEntry[] {
  if (ring[0]?.wire === entry.wire) return ring;     // dedup against head
  return [entry, ...ring].slice(0, CAP);
}
```

### 4.3 New module: `src/state/lineage.ts`

Owns the in-memory source of truth and the persistence + capture/restore API. Mirrors
the shape and conventions of `src/state/persistence.ts`.

- `lineageStore = atom<LineageEntry[]>([])` — the UI renders off this.
- Private `createStore("parallax-lineage", "items")` idb namespace; the ring is stored
  under a single key (e.g. `"ring"`), **not** name-keyed like presets.
- `recordSound(source: LineageSource): void` — snapshots the *current* patch+melody
  (`encodeState(patchStore.get(), melodyStore.get())`), builds a `LineageEntry`,
  `pushSnapshot`es it into `lineageStore`, and fire-and-forget persists. Call this
  **before** the generative action replaces state.
- `restoreSound(entry: LineageEntry): Promise<void>` — `recordSound`s the current
  outgoing sound first (so stepping back is reversible), then
  `loadState(decodeState(entry.wire))`. If `decodeState` returns null, no-op + let the
  caller surface a small inline error.
- `clearLineage(): Promise<void>` — empties `lineageStore` and the idb key.
- `hydrateLineage(): Promise<void>` — load the persisted ring into `lineageStore` on
  boot. **Merge rule:** if a capture already happened before hydration resolves, append
  persisted entries after the live ones and re-dedup/cap (don't clobber a fresh roll).

All idb access is wrapped in try/catch: if IndexedDB is unavailable (private mode,
disabled), the feature degrades to in-memory-only and never throws into the UI.

### 4.4 Capture points (the only edits to existing files)

- **`src/state/surprise.ts`** — keep `captureUndo("New instrument rolled")` (the toast);
  add `recordSound("surprise")` right beside it (before the engine/model/param/melody
  replace).
- **Match Apply** (`src/ui/MatchPanel.svelte`, the Apply handler) — add
  `recordSound("match")` before it applies the suggested patch. (Match has no undo
  today, so this is a net gain.)

### 4.5 Restore path (reused, proven)

`restoreSound` → `loadState(decodeState(wire))` (`engine-control.ts:62`), which:
- resolves the engine id through the registry (a snapshot naming an engine this build
  lacks falls back to the default cleanly),
- hot-swaps the engine (and theme) first if it differs,
- overlays patch + melody via `applySharedState`.

This is exactly what presets and shared links already do in production.

## 5. UI / UX

### 5.1 Placement & form

A new component `src/ui/RecentSoundsMenu.svelte`, rendered inside `PatchToolbar.svelte`'s
`.io-bar`, **immediately after `<PresetMenu />`**:

```
.io-bar:  ♪ MIDI   ▤ Presets   ↺ Recent   ✦ Postcard   ⤴ Share
```

It is another `io-btn` + right-aligned, focus-trapped popover — byte-for-byte the same
visual language as `PresetMenu` / `MidiMenu`. Desktop: flows into the row. Mobile: rides
inside the `⋯` `ToolsMenu` panel like its siblings (no new top-bar real estate, Surprise
visibility untouched).

- **Button:** `↺ Recent` — `↺` reads as rewind/history and is distinct from every glyph
  already in the toolbar (▤ ♪ ✦ ⤴ ◎ ⚄). Single word matches the toolbar cadence.
- **Gating:** `disabled={!ready}`, consistent with the rest of the `.io-bar`.

### 5.2 The one distinguishing signature

So the panel doesn't read as a Presets clone, **each row leads with a source glyph that
is true to the content** — `⚄` if the sound came from a Surprise roll, `◎` if from a
Match apply — followed by `engine · model`, with the relative time as the dim meta line:

```
┌──────────────────────────────┐
│ ↺ Recent sounds              │
│ ⚄  Braids · CSAW             │
│     just now                  │
│ ◎  Plaits · VOWL             │
│     3m ago                    │
│ ⚄  Laxsynth · PAD            │
│     12m ago                   │
│ ── Clear history ──           │
└──────────────────────────────┘
```

Reuse the existing `ago(ts)` helper pattern from `PresetMenu`. Clicking a row →
`restoreSound(entry)` then closes the popover.

### 5.3 Subtract, don't add

- **No Save input row** (nothing to name — the trail is automatic).
- **No per-row `×` delete** (the list is ephemeral/auto, not a curated library; per-row
  deletes would imply curation that isn't the point). A single quiet **"Clear history"**
  at the bottom is enough.
- No count badge, no button animation.

### 5.4 Copy (interface voice, active)

- Empty state: **"No recent sounds yet — roll Surprise or Match a sound to start a trail."**
- Clear action: **"Clear history"**.
- Read failure (a corrupt/foreign snapshot): inline, e.g. **"That sound couldn't be restored."**

### 5.5 Accessibility / quality floor (inherited by mirroring PresetMenu)

`aria-haspopup`/`aria-expanded` on the button; `role="dialog"` + `use:trapFocus` on the
panel; Escape + outside-click to close; `:focus-visible` outline; ≥36px coarse-pointer
targets. Each row button gets an `aria-label` like *"Restore Braids · CSAW from a
Surprise roll, 3 minutes ago."* The source meaning is carried by **glyph + text**, never
color alone (colorblind-safe, per house rule).

## 6. Edge cases

- **Corrupt / foreign / old-version snapshot:** `decodeState` returns null → skip,
  surface the inline read-failure copy, never crash. (Already version-defensive.)
- **Engine missing in this build:** `loadState` falls back to the default engine via the
  registry — no special handling needed.
- **idb unavailable:** degrade to in-memory; wrap all idb calls in try/catch.
- **Hydration vs. an early roll:** `hydrateLineage` merges (live entries first, then
  persisted, dedup + cap) so a roll fired before hydration isn't clobbered.
- **No-op re-roll producing an identical wire:** dedup-against-head skips it.
- **Persistence is fire-and-forget:** the UI always reads the in-memory atom, so a slow
  idb write never blocks the list updating.

## 7. Testing

**Pure unit tests (vitest, no idb/Svelte)** over `pushSnapshot` and the entry builder:
- prepends newest-first;
- dedup: pushing a wire identical to the head is a no-op;
- cap: the 11th distinct push drops the oldest (length stays 10);
- a non-adjacent duplicate is allowed (documents the chosen semantic).

**Manual / browser pass:**
- roll Surprise a few times → open Recent → entries appear with `⚄` + engine·model;
- click an older entry → that sound (and its theme, if the engine differs) returns;
- a Match apply adds a `◎` entry;
- reload the page → the list persists;
- "Clear history" empties it (and stays empty after reload);
- the instant undo toast still works on a fresh roll (unchanged).

`npm run check` 0 errors and the existing vitest suites stay green.

## 8. Why this can't break v1 (safety summary)

- **Additive surface:** 2 new files (`state/lineage.ts`, `ui/RecentSoundsMenu.svelte`),
  1 toolbar insertion, 2 one-line `recordSound()` calls. Nothing existing changes
  behavior.
- **Reuses shipping code paths:** restore is `loadState`/`applySharedState`;
  `decodeState` is already defensive.
- **Namespaced storage:** own idb store, so presets are safe.
- **Coherent visuals:** the new control speaks the exact `io-btn`/popover idiom already
  on screen — restraint, not a new look.

## 9. File-change summary

| File | Change |
|------|--------|
| `src/state/lineage.ts` | **new** — ring logic, `lineageStore`, record/restore/clear/hydrate, idb persistence |
| `src/ui/RecentSoundsMenu.svelte` | **new** — `↺ Recent` button + popover (mirrors `PresetMenu`) |
| `src/ui/PatchToolbar.svelte` | insert `<RecentSoundsMenu />` after `<PresetMenu />` |
| `src/state/surprise.ts` | add `recordSound("surprise")` beside the existing `captureUndo` |
| `src/ui/MatchPanel.svelte` | add `recordSound("match")` in the Apply handler |
| `src/state/lineage.test.ts` (or sibling) | **new** — pure-layer ring tests |
| `src/main.ts` / boot path | call `hydrateLineage()` once on startup |

## 10. Future (not now)

- Surface the ring in postcards / "remix chains" (ideas §3.2).
- A/B compare between two ring entries.
- Feed Parallax Daily's "safe roll" loop.
