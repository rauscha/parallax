# Patch-lineage "Recent sounds" Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Add a persistent "Recent sounds" trail — a ring of the last 10 instruments you landed on via Surprise rolls + Match applies — that you can step back to at any time, even after a reload.

**Architecture:** A pure, unit-tested ring core (`lineage-core.ts`) holds the snapshot/dedup/merge logic. An impure shell (`lineage.ts`) owns the nanostore + idb-keyval persistence and the record/restore/clear/hydrate API, reusing the shipping `encodeState`/`decodeState`/`loadState` paths that presets and share-URLs already use. A `RecentSoundsMenu.svelte` popover mirrors `PresetMenu.svelte`. The only edits to existing files are two one-line capture calls + a toolbar insert + a boot hydrate. Strictly additive — the existing undo toast and all melody actions are untouched.

**Tech Stack:** Svelte 5 (runes), TypeScript, nanostores, idb-keyval, vitest (Node environment).

## Global Constraints

- **Wire format is shared, versioned, defensive.** Snapshots use `encodeState(patch, melody)` (the exact string presets + share-URLs use); restore goes through `decodeState` → `loadState`. `decodeState` returns `null` for anything it can't trust — never throw on a bad blob.
- **idb is namespaced + non-fatal.** Own database `createStore("parallax-lineage", "items")`, separate from presets. Wrap every idb call in `try/catch`; if IndexedDB is unavailable, degrade to in-memory and never throw into the UI.
- **Pure layer stays Node-safe.** vitest has no `environment` configured → it runs under **Node**, where `indexedDB` is undefined and `idb-keyval`'s `createStore` throws at import. Anything a `*.test.ts` imports must NOT import idb-keyval (directly or transitively). Hence the `lineage-core.ts` / `lineage.ts` split below.
- **Colorblind-safe (house rule).** Every per-row source cue is carried by **glyph + text**, never color alone. Source glyphs: `⚄` surprise, `◎` match, `↩` restore.
- **No engine/DSP/worklet/transport changes.** State + UI only.
- **Verify before done:** `npm run check` 0 errors and `npm run test` all green after every task; final browser pass per the spec's §7 manual checklist. Note: preview screenshots don't work on this setup (backgrounded tab pauses RAF) — verify the popover via DOM/console evals + a real-device check, not screenshots.

**Spec:** `docs/superpowers/specs/2026-06-19-patch-lineage-design.md` is the contract. This plan implements it with two deliberate, flagged refinements:
1. **File split** — spec §9 lists `state/lineage.ts` + `state/lineage.test.ts`; this plan splits the pure, tested logic into `state/lineage-core.ts` (+ `lineage-core.test.ts`) so the tests run under Node without pulling in idb. The impure `state/lineage.ts` shell remains as specced.
2. **Third source `"restore"`** — spec §4.1 types `LineageSource` as `"surprise" | "match"`, but §4.3/§3.6 require `restoreSound` to record the outgoing sound so stepping back is reversible, and a manual restore is neither a surprise nor a match. Adding `"restore"` (glyph `↩`) is the minimal honest label and keeps the union backward-compatible (surprise.ts/MatchPanel still pass only their own values).

---

### Task 1: Pure ring core + unit tests

**Files:**
- Create: `src/state/lineage-core.ts`
- Test: `src/state/lineage-core.test.ts`

**Interfaces:**
- Consumes: `Patch`, `Melody` (types) from `src/state/stores.ts`; `encodeState` from `src/state/serialization.ts` (pure, Node-safe).
- Produces (used by Task 2 + Task 3):
  - `const CAP = 10`
  - `type LineageSource = "surprise" | "match" | "restore"`
  - `interface LineageEntry { wire: string; savedAt: number; engineId: string; modelId: string | null; source: LineageSource }`
  - `buildEntry(patch: Patch, melody: Melody, source: LineageSource, now: number): LineageEntry`
  - `pushSnapshot(ring: LineageEntry[], entry: LineageEntry): LineageEntry[]` — returns the **same array reference** on a head-dedup no-op
  - `mergeRing(live: LineageEntry[], persisted: LineageEntry[]): LineageEntry[]`
  - `isValidEntry(x: unknown): x is LineageEntry`

- [ ] **Step 1: Write the failing tests**

Create `src/state/lineage-core.test.ts`:

```ts
import { describe, it, expect } from "vitest";
import {
  CAP,
  buildEntry,
  pushSnapshot,
  mergeRing,
  isValidEntry,
  type LineageEntry,
} from "./lineage-core";
import { encodeState } from "./serialization";
import type { Patch, Melody } from "./stores";

const patch: Patch = {
  version: 1,
  engineId: "braids",
  modelId: "csaw",
  params: { timbre: 0.3, color: 0.4 },
};
const melody: Melody = { tempo: 120, key: "C", scale: "major", events: [] };

function entry(wire: string, savedAt = 0): LineageEntry {
  return { wire, savedAt, engineId: "braids", modelId: "csaw", source: "surprise" };
}

describe("buildEntry", () => {
  it("captures the wire (== encodeState), summary fields, source and time", () => {
    const e = buildEntry(patch, melody, "match", 1234);
    expect(e.wire).toBe(encodeState(patch, melody));
    expect(e.engineId).toBe("braids");
    expect(e.modelId).toBe("csaw");
    expect(e.source).toBe("match");
    expect(e.savedAt).toBe(1234);
  });
});

describe("pushSnapshot", () => {
  it("prepends newest-first", () => {
    const ring = pushSnapshot([entry("a")], entry("b"));
    expect(ring.map((e) => e.wire)).toEqual(["b", "a"]);
  });

  it("is a no-op (same reference) when the wire matches the head", () => {
    const start = [entry("a")];
    const ring = pushSnapshot(start, entry("a"));
    expect(ring).toBe(start);
  });

  it("caps at CAP, dropping the oldest", () => {
    let ring: LineageEntry[] = [];
    for (let i = 0; i < CAP + 1; i++) ring = pushSnapshot(ring, entry(`w${i}`));
    expect(ring).toHaveLength(CAP);
    expect(ring[0].wire).toBe(`w${CAP}`);          // newest kept
    expect(ring.at(-1)!.wire).toBe("w1");          // w0 dropped
  });

  it("allows a non-adjacent duplicate wire", () => {
    let ring = pushSnapshot([], entry("a"));
    ring = pushSnapshot(ring, entry("b"));
    ring = pushSnapshot(ring, entry("a"));
    expect(ring.map((e) => e.wire)).toEqual(["a", "b", "a"]);
  });
});

describe("mergeRing", () => {
  it("keeps live first, appends persisted, dedups by wire, caps", () => {
    const live = [entry("x"), entry("y")];
    const persisted = [entry("y"), entry("z")];    // y duplicates a live entry
    expect(mergeRing(live, persisted).map((e) => e.wire)).toEqual(["x", "y", "z"]);
  });

  it("caps the merged result to CAP", () => {
    const live = Array.from({ length: 6 }, (_, i) => entry(`l${i}`));
    const persisted = Array.from({ length: 8 }, (_, i) => entry(`p${i}`));
    expect(mergeRing(live, persisted)).toHaveLength(CAP);
  });
});

describe("isValidEntry", () => {
  it("accepts a well-formed entry", () => {
    expect(isValidEntry(entry("a"))).toBe(true);
  });
  it("rejects junk and bad sources", () => {
    expect(isValidEntry(null)).toBe(false);
    expect(isValidEntry({ wire: 1 })).toBe(false);
    expect(isValidEntry({ ...entry("a"), source: "bogus" })).toBe(false);
  });
});
```

- [ ] **Step 2: Run tests to verify they fail**

Run: `npm run test -- lineage-core`
Expected: FAIL — `Failed to resolve import "./lineage-core"` (module doesn't exist yet).

- [ ] **Step 3: Write the implementation**

Create `src/state/lineage-core.ts`:

```ts
/**
 * Patch-lineage ("Recent sounds") — PURE ring logic. No idb, no Svelte, no DOM,
 * so it is unit-testable under Node (mirrors the project's pure-layer convention:
 * serialization.ts / part.ts / grid.ts). The idb persistence + store wiring live
 * in the impure shell `lineage.ts`, which imports these helpers.
 *
 * The ring stores the OUTGOING sound — the one you're leaving — newest-first, so
 * the list reads as "sounds I can step back to." The currently-live sound is not
 * in the ring (you're already on it).
 */
import type { Patch, Melody } from "./stores";
import { encodeState } from "./serialization";

/** Max entries kept. Short by design — a high-value trail, not a library. */
export const CAP = 10;

/**
 * Which generative action put this sound into history:
 * - surprise: displaced by a "Surprise me" roll
 * - match:    displaced by a Match-panel Apply
 * - restore:  displaced by stepping back to an earlier recent sound
 *
 * Note: the label = the action DISPLACING this sound, not necessarily the one that
 * created it. True-to-content in the common case (repeated rolls); a close-enough
 * breadcrumb otherwise.
 */
export type LineageSource = "surprise" | "match" | "restore";

export interface LineageEntry {
  wire: string;            // encodeState(patch, melody) — same format as presets/URLs
  savedAt: number;         // epoch ms, for the "2m ago" label
  engineId: string;        // summary field — render the row without decoding the blob
  modelId: string | null;
  source: LineageSource;   // drives the row's leading glyph
}

/**
 * Build a ring entry from the live patch + melody. `now` is injected (rather than
 * read from Date.now() here) so the builder stays pure/testable; the shell passes
 * Date.now().
 */
export function buildEntry(
  patch: Patch,
  melody: Melody,
  source: LineageSource,
  now: number,
): LineageEntry {
  return {
    wire: encodeState(patch, melody),
    savedAt: now,
    engineId: patch.engineId,
    modelId: patch.modelId,
    source,
  };
}

/**
 * Prepend newest-first, skip if the wire is identical to the current head (so a
 * no-op re-roll doesn't churn the list), and cap to CAP. Returns the SAME array
 * reference when it dedups, so callers can detect the no-op by identity.
 */
export function pushSnapshot(ring: LineageEntry[], entry: LineageEntry): LineageEntry[] {
  if (ring[0]?.wire === entry.wire) return ring;   // dedup against head only
  return [entry, ...ring].slice(0, CAP);
}

/**
 * Merge live (in-memory) entries with persisted ones on hydration: keep live
 * newest-first, append persisted after, drop duplicate wires (first occurrence
 * wins, so a fresh roll captured before hydration isn't clobbered), cap to CAP.
 */
export function mergeRing(live: LineageEntry[], persisted: LineageEntry[]): LineageEntry[] {
  const out: LineageEntry[] = [];
  const seen = new Set<string>();
  for (const e of [...live, ...persisted]) {
    if (seen.has(e.wire)) continue;
    seen.add(e.wire);
    out.push(e);
  }
  return out.slice(0, CAP);
}

const SOURCES: readonly LineageSource[] = ["surprise", "match", "restore"];

/**
 * Shape guard for entries loaded from idb (a corrupt/foreign row must not crash
 * hydration). Validates the fields the UI reads.
 */
export function isValidEntry(x: unknown): x is LineageEntry {
  if (!x || typeof x !== "object") return false;
  const e = x as Record<string, unknown>;
  return (
    typeof e.wire === "string" &&
    typeof e.savedAt === "number" &&
    typeof e.engineId === "string" &&
    (e.modelId === null || typeof e.modelId === "string") &&
    typeof e.source === "string" &&
    (SOURCES as readonly string[]).includes(e.source)
  );
}
```

- [ ] **Step 4: Run tests to verify they pass**

Run: `npm run test -- lineage-core`
Expected: PASS — all assertions in `lineage-core.test.ts` green.

- [ ] **Step 5: Run the full suite + type-check (no regressions)**

Run: `npm run test`
Expected: all suites pass (the 4 existing files + the new one).
Run: `npm run check`
Expected: 0 errors, 0 warnings.

- [ ] **Step 6: Commit**

```bash
git add src/state/lineage-core.ts src/state/lineage-core.test.ts
git commit -m "feat(lineage): pure ring core for Recent sounds (+ tests)"
```

---

### Task 2: idb-backed lineage store + capture/restore/hydrate shell

**Files:**
- Create: `src/state/lineage.ts`

**Interfaces:**
- Consumes: `CAP`/`buildEntry`/`pushSnapshot`/`mergeRing`/`isValidEntry`/`LineageEntry`/`LineageSource` from `./lineage-core`; `patchStore`,`melodyStore` from `./stores`; `decodeState` from `./serialization`; `loadState` from `./engine-control`; `idb-keyval`; `atom` from `nanostores`.
- Produces (used by Task 3 + Task 4):
  - `lineageStore` — `atom<LineageEntry[]>`
  - `recordSound(source: LineageSource): void`
  - `restoreSound(entry: LineageEntry): Promise<boolean>` (false = un-decodable)
  - `clearLineage(): Promise<void>`
  - `hydrateLineage(): Promise<void>`

> **No unit test for this task.** It is the impure shell — idb (Node-unsafe at import), the live stores, and `loadState` (audio graph). The project runs vitest under Node with no fake-indexeddb, and `persistence.ts` (its sibling) is likewise untested for the same reason; the testable logic was extracted to `lineage-core.ts` in Task 1. This task is verified by `npm run check` and the browser pass in Task 4.

- [ ] **Step 1: Write the implementation**

Create `src/state/lineage.ts`:

```ts
/**
 * Patch-lineage ("Recent sounds") — the in-memory source of truth + persistence
 * and the capture/restore API. Impure shell over the pure ring logic in
 * `lineage-core.ts`; mirrors `persistence.ts` (own idb-keyval namespace, every idb
 * access wrapped so a private-mode / disabled IndexedDB degrades to in-memory and
 * never throws into the UI).
 *
 * Captures the OUTGOING sound on the two generative actions (Surprise roll, Match
 * Apply) and on a restore, so the list is a short trail you can step back through —
 * persistently, across reloads. Strictly additive: the existing single-slot undo
 * toast (`undo.ts`) and all melody actions are untouched.
 */
import { atom } from "nanostores";
import { get, set, del, createStore } from "idb-keyval";
import { patchStore, melodyStore } from "./stores";
import { decodeState } from "./serialization";
import { loadState } from "./engine-control";
import {
  buildEntry,
  pushSnapshot,
  mergeRing,
  isValidEntry,
  type LineageEntry,
  type LineageSource,
} from "./lineage-core";

/** The UI renders off this. The currently-live sound is NOT in it. */
export const lineageStore = atom<LineageEntry[]>([]);

// Own IndexedDB database + object store, namespaced away from presets.
const lineageDb = createStore("parallax-lineage", "items");
const RING_KEY = "ring";
const STORED_VERSION = 1;

interface StoredRing {
  v: number;
  entries: LineageEntry[];
}

/**
 * Fire-and-forget persist — the UI always reads the in-memory atom, so a slow or
 * failed idb write never blocks the list updating.
 */
async function persist(entries: LineageEntry[]): Promise<void> {
  try {
    await set(RING_KEY, { v: STORED_VERSION, entries } satisfies StoredRing, lineageDb);
  } catch {
    /* IndexedDB unavailable (private mode / disabled) → in-memory only. */
  }
}

/**
 * Snapshot the CURRENT patch + melody as the outgoing sound and push it onto the
 * ring. Call this BEFORE the generative action replaces state. `source` drives the
 * row glyph. Dedups against the head (a no-op re-roll won't churn the list).
 */
export function recordSound(source: LineageSource): void {
  const entry = buildEntry(patchStore.get(), melodyStore.get(), source, Date.now());
  const next = pushSnapshot(lineageStore.get(), entry);
  if (next === lineageStore.get()) return;   // dedup no-op (same reference)
  lineageStore.set(next);
  void persist(next);
}

/**
 * Step back to a recent sound. Records the current outgoing sound first (so the
 * step is itself reversible), then restores via the proven decode → loadState path
 * presets/share-links use (hot-swaps the engine + theme if it differs). Returns
 * false if the snapshot can't be decoded (corrupt/foreign) so the caller can
 * surface an inline message; never throws on a bad blob.
 */
export async function restoreSound(entry: LineageEntry): Promise<boolean> {
  const state = decodeState(entry.wire);
  if (!state) return false;
  recordSound("restore");          // capture the outgoing sound before we leave it
  await loadState(state);
  return true;
}

/** Empty the trail (memory + persisted key). */
export async function clearLineage(): Promise<void> {
  lineageStore.set([]);
  try {
    await del(RING_KEY, lineageDb);
  } catch {
    /* idb unavailable — the in-memory clear above is what the UI shows anyway. */
  }
}

/**
 * Load the persisted ring into `lineageStore` once on boot. Merge rule: any entry
 * captured before this resolves stays newest; persisted entries append after, then
 * dedup + cap — so an early roll isn't clobbered. Degrades silently if idb is
 * unavailable.
 */
export async function hydrateLineage(): Promise<void> {
  let persisted: LineageEntry[] = [];
  try {
    const stored = await get<StoredRing>(RING_KEY, lineageDb);
    if (stored && stored.v === STORED_VERSION && Array.isArray(stored.entries)) {
      persisted = stored.entries.filter(isValidEntry);
    }
  } catch {
    /* idb unavailable → keep whatever's in memory. */
  }
  lineageStore.set(mergeRing(lineageStore.get(), persisted));
}
```

- [ ] **Step 2: Type-check**

Run: `npm run check`
Expected: 0 errors, 0 warnings. (Nothing imports `lineage.ts` yet — this just proves the module type-checks against the real `stores`/`serialization`/`engine-control`/`lineage-core` signatures.)

- [ ] **Step 3: Commit**

```bash
git add src/state/lineage.ts
git commit -m "feat(lineage): idb-backed lineage store + record/restore/hydrate"
```

---

### Task 3: `RecentSoundsMenu.svelte` popover

**Files:**
- Create: `src/ui/RecentSoundsMenu.svelte`

**Interfaces:**
- Consumes: `lineageStore`,`restoreSound`,`clearLineage` from `../state/lineage`; `LineageEntry`,`LineageSource` (types) from `../state/lineage-core`; `audioReadyStore` from `../state/stores`; `trapFocus` from `./trapFocus`.
- Produces: a default-exported Svelte component, no props. Rendered by Task 4 inside `PatchToolbar`.

- [ ] **Step 1: Write the component**

Create `src/ui/RecentSoundsMenu.svelte`:

```svelte
<script lang="ts">
  /**
   * "Recent sounds" popover. A short, persistent trail of the instruments you've
   * landed on via the generative actions (Surprise rolls + Match applies). Click a
   * row to step back to that sound (engine, model, knobs, melody — and its theme if
   * the engine differs). Restoring is itself reversible: the sound you leave is
   * recorded first.
   *
   * Mirrors the PresetMenu popover idiom (same io-btn + focus-trapped panel). The
   * one distinguishing touch is the per-row source glyph (⚄ roll / ◎ match / ↩
   * restored) — meaning carried by glyph + text, never colour alone (house rule).
   * Subtracts vs PresetMenu: no Save row, no per-row delete — just a Clear history
   * link, because the trail is automatic, not a curated library.
   */
  import { onDestroy } from "svelte";
  import { trapFocus } from "./trapFocus";
  import { audioReadyStore } from "../state/stores";
  import { lineageStore, restoreSound, clearLineage } from "../state/lineage";
  import type { LineageEntry, LineageSource } from "../state/lineage-core";

  let ready = $state(audioReadyStore.get());
  const unsubReady = audioReadyStore.subscribe((v) => { ready = v; });

  let entries = $state<LineageEntry[]>(lineageStore.get());
  const unsubEntries = lineageStore.subscribe((v) => { entries = v; });

  onDestroy(() => { unsubReady(); unsubEntries(); });

  let open = $state(false);
  let busy = $state(false);
  let error = $state<string | null>(null);
  let rootEl: HTMLElement;

  // Outside-click + Escape to close — same behaviour as the Preset/MIDI menus.
  $effect(() => {
    if (!open) return;
    const onPointer = (e: PointerEvent) => {
      if (rootEl && !rootEl.contains(e.target as Node)) open = false;
    };
    const onKey = (e: KeyboardEvent) => { if (e.key === "Escape") open = false; };
    document.addEventListener("pointerdown", onPointer);
    document.addEventListener("keydown", onKey);
    return () => {
      document.removeEventListener("pointerdown", onPointer);
      document.removeEventListener("keydown", onKey);
    };
  });

  const GLYPH: Record<LineageSource, string> = { surprise: "⚄", match: "◎", restore: "↩" };
  const SOURCE_WORD: Record<LineageSource, string> = {
    surprise: "a Surprise roll",
    match: "a Match",
    restore: "a restored sound",
  };

  async function onRestore(entry: LineageEntry) {
    busy = true;
    error = null;
    try {
      const ok = await restoreSound(entry);
      if (!ok) { error = "That sound couldn't be restored."; return; }
      open = false;
    } catch (e) {
      error = e instanceof Error ? e.message : String(e);
    } finally {
      busy = false;
    }
  }

  async function onClear() {
    busy = true;
    try {
      await clearLineage();
    } finally {
      busy = false;
    }
  }

  function ago(ts: number): string {
    if (!ts) return "";
    const s = Math.max(0, Math.floor((Date.now() - ts) / 1000));
    if (s < 60) return "just now";
    const m = Math.floor(s / 60);
    if (m < 60) return `${m}m ago`;
    const h = Math.floor(m / 60);
    if (h < 24) return `${h}h ago`;
    return `${Math.floor(h / 24)}d ago`;
  }

  function label(e: LineageEntry): string {
    return `${e.engineId}${e.modelId ? ` · ${e.modelId}` : ""}`;
  }
</script>

<div class="recent-menu" bind:this={rootEl}>
  <button
    class="io-btn"
    class:active={open}
    onclick={() => (open = !open)}
    disabled={!ready}
    aria-haspopup="true"
    aria-expanded={open}
    title="Step back to a recent sound (Surprise rolls + Match applies)"
  >↺ Recent</button>

  {#if open}
    <div class="panel" role="dialog" aria-label="Recent sounds" tabindex="-1" use:trapFocus>
      <p class="title">Recent sounds</p>

      {#if error}<p class="err" role="alert">{error}</p>{/if}

      {#if entries.length === 0}
        <p class="empty">No recent sounds yet — roll Surprise or Match a sound to start a trail.</p>
      {:else}
        <ul class="list">
          {#each entries as e (`${e.savedAt}:${e.wire}`)}
            <li class="item">
              <button
                class="restore"
                onclick={() => onRestore(e)}
                disabled={busy}
                aria-label={`Restore ${label(e)} from ${SOURCE_WORD[e.source]}, ${ago(e.savedAt)}`}
              >
                <span class="r-head">
                  <span class="glyph" aria-hidden="true">{GLYPH[e.source]}</span>
                  <span class="r-name">{label(e)}</span>
                </span>
                <span class="r-meta">{ago(e.savedAt)}</span>
              </button>
            </li>
          {/each}
        </ul>
        <button class="clear" onclick={onClear} disabled={busy}>Clear history</button>
      {/if}
    </div>
  {/if}
</div>

<style>
  .recent-menu { position: relative; display: inline-flex; }
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
    transition: filter var(--t-fast), border-color var(--t-fast);
  }
  .io-btn:hover:not(:disabled) { filter: brightness(1.1); border-color: var(--signal); }
  .io-btn:focus-visible { outline: 2px solid var(--signal); outline-offset: 1px; }
  .io-btn:disabled { opacity: 0.4; cursor: not-allowed; }
  .io-btn.active { border-color: var(--signal); color: var(--signal-ink); }

  .panel {
    position: absolute;
    top: calc(100% + 6px);
    right: 0;
    z-index: 20;
    width: 280px;
    max-width: 86vw;
    padding: 10px;
    background: var(--surface);
    border: var(--hairline-w) solid var(--hairline);
    border-radius: var(--radius-md);
    box-shadow: 0 14px 40px rgba(0, 0, 0, 0.36);
    display: flex;
    flex-direction: column;
    gap: 8px;
  }
  .title {
    margin: 0;
    font-family: var(--font-mono);
    font-size: 0.7rem;
    letter-spacing: 0.04em;
    color: var(--text-dim);
  }
  .err { margin: 0; font-family: var(--font-mono); font-size: 0.68rem; color: var(--danger); }
  .empty { margin: 2px 0; font-family: var(--font-mono); font-size: 0.7rem; color: var(--text-dim); line-height: 1.4; }

  .list {
    list-style: none;
    margin: 0;
    padding: 0;
    display: flex;
    flex-direction: column;
    gap: 3px;
    max-height: 260px;
    overflow-y: auto;
  }
  .item { display: flex; }
  .restore {
    flex: 1 1 auto;
    min-width: 0;
    display: flex;
    flex-direction: column;
    gap: 2px;
    text-align: left;
    padding: 6px 8px;
    background: var(--surface-sunken);
    border: var(--hairline-w) solid var(--hairline);
    border-radius: var(--radius-sm);
    cursor: pointer;
    transition: border-color var(--t-fast), background var(--t-fast);
  }
  .restore:hover:not(:disabled) { border-color: var(--signal); background: var(--signal-deep); }
  .restore:disabled { opacity: 0.5; cursor: progress; }
  .r-head { display: flex; align-items: baseline; gap: 7px; min-width: 0; }
  .glyph { flex: 0 0 auto; font-size: 0.82rem; color: var(--text); }
  .r-name {
    font-family: var(--font-mono);
    font-size: 0.74rem;
    color: var(--text);
    white-space: nowrap;
    overflow: hidden;
    text-overflow: ellipsis;
  }
  .r-meta {
    font-family: var(--font-mono);
    font-size: 0.62rem;
    color: var(--text-dim);
    padding-left: 23px;   /* align under the name, past the glyph + gap */
  }
  .clear {
    align-self: center;
    margin-top: 2px;
    font-family: var(--font-mono);
    font-size: 0.66rem;
    letter-spacing: 0.03em;
    color: var(--text-dim);
    background: transparent;
    border: none;
    border-radius: var(--radius-sm);
    cursor: pointer;
    padding: 4px 8px;
    transition: color var(--t-fast);
  }
  .clear:hover:not(:disabled) { color: var(--accent); }
  .clear:disabled { opacity: 0.4; cursor: not-allowed; }

  @media (pointer: coarse) {
    .io-btn { padding: 8px 12px; min-height: 36px; }
    .restore { min-height: 40px; }
    .clear { min-height: 34px; }
  }
</style>
```

- [ ] **Step 2: Type-check**

Run: `npm run check`
Expected: 0 errors, 0 warnings. (The component compiles even though nothing renders it yet.)

- [ ] **Step 3: Commit**

```bash
git add src/ui/RecentSoundsMenu.svelte
git commit -m "feat(lineage): RecentSoundsMenu popover (↺ Recent)"
```

---

### Task 4: Wire it in — capture on Surprise/Match, render in the toolbar, hydrate on boot

**Files:**
- Modify: `src/ui/PatchToolbar.svelte` (import + insert after `<PresetMenu />`)
- Modify: `src/state/surprise.ts` (capture on roll)
- Modify: `src/ui/MatchPanel.svelte` (capture on Apply)
- Modify: `src/main.ts` (hydrate on boot)

**Interfaces:**
- Consumes: `RecentSoundsMenu` (component) + `recordSound`/`hydrateLineage` from Tasks 2–3.
- Produces: the feature, live.

- [ ] **Step 1: Render the button in the toolbar**

In `src/ui/PatchToolbar.svelte`, add the import alongside the others (after the `MidiMenu` import):

```svelte
  import PresetMenu from "./PresetMenu.svelte";
  import RecentSoundsMenu from "./RecentSoundsMenu.svelte";
  import MidiMenu from "./MidiMenu.svelte";
```

Then insert `<RecentSoundsMenu />` immediately after `<PresetMenu />` in the `.io-bar`:

```svelte
<div class="io-bar">
  <MidiMenu />
  <PresetMenu />
  <RecentSoundsMenu />
  <button
    class="io-btn"
    onclick={() => (postcardOpen = true)}
    disabled={!ready}
    title="Make a shareable postcard image of this patch"
  >✦ Postcard</button>
```

- [ ] **Step 2: Capture the outgoing sound on a Surprise roll**

In `src/state/surprise.ts`, add the import next to the existing `captureUndo` import:

```ts
import { captureUndo } from "./undo";
import { recordSound } from "./lineage";
```

Then record right beside the existing `captureUndo` call (both run before the roll replaces state):

```ts
  // Snapshot the current instrument first so one tap is reversible.
  captureUndo("New instrument rolled");
  recordSound("surprise");   // ...and add it to the persistent Recent-sounds trail
```

- [ ] **Step 3: Capture the outgoing sound on a Match Apply**

In `src/ui/MatchPanel.svelte`, add the import alongside the other state imports (after the `startEngine` import):

```ts
  import { startEngine } from "../state/engine-control";
  import { recordSound } from "../state/lineage";
```

Then record as the first line inside the `applySuggestion` try block, before any state mutation:

```ts
  async function applySuggestion(s: PatchSuggestion) {
    applying = true;
    error = "";
    try {
      recordSound("match");   // snapshot the outgoing sound for the Recent trail
      if (s.engineId !== engineIdStore.get()) await startEngine(s.engineId);
```

- [ ] **Step 4: Hydrate the ring on boot**

In `src/main.ts`, add the import near the top (after the `App` import):

```ts
import App from "./App.svelte";
import { hydrateLineage } from "./state/lineage";
```

Then fire-and-forget hydration right after the app mounts:

```ts
const app = mount(App, { target });

// Load the persisted "Recent sounds" ring (idb) into its store on boot. Fire-and-
// forget: it degrades to in-memory if idb is unavailable, and merges rather than
// clobbers if a roll somehow lands before it resolves.
void hydrateLineage();
```

- [ ] **Step 5: Type-check + full test suite**

Run: `npm run check`
Expected: 0 errors, 0 warnings.
Run: `npm run test`
Expected: all suites green (no behavior change to existing suites; `lineage-core` still passes).

- [ ] **Step 6: Commit**

```bash
git add src/ui/PatchToolbar.svelte src/state/surprise.ts src/ui/MatchPanel.svelte src/main.ts
git commit -m "feat(lineage): wire Recent sounds — capture on Surprise/Match, hydrate on boot"
```

---

### Task 5: Browser verification (no commit)

**Files:** none — manual QA against the running dev server (`npm run dev`).

> Reminder (from the handoff): preview screenshots don't work on this setup. Verify via the live page in a real browser / on a device, and via DOM + console reads, not screenshots.

- [ ] **Step 1: Roll → trail appears.** Tap-to-start, then roll ⚄ Surprise a few times. Open `↺ Recent`. Expected: rows appear newest-first, each leading with `⚄`, showing `engine · model` + a relative time. The list caps at 10.
- [ ] **Step 2: Restore steps back.** Click an older row. Expected: that sound returns (engine + theme swap if it differs, knobs + melody applied). Re-open `↺ Recent`: the sound you just left is now the head (tagged `↩`), so the step is reversible.
- [ ] **Step 3: Match adds a `◎` entry.** Open Match, load a clip, detect, Apply. Open `↺ Recent`. Expected: a `◎` row for the sound Apply displaced.
- [ ] **Step 4: Persistence.** Reload the page. Expected: the list survives (hydrated from idb).
- [ ] **Step 5: Clear.** Click "Clear history". Expected: empties to the empty-state copy; stays empty after a reload.
- [ ] **Step 6: Undo toast intact.** On a fresh roll, the existing one-tap undo toast still appears and still works (unchanged).
- [ ] **Step 7: Console clean.** Zero console errors across the above. Confirm `npm run check` (0 errors) + `npm run test` (green) one final time.

---

## Self-Review

**Spec coverage (§ → task):**
- §3.1 popover (not a toast) → Task 3. §3.2 capture Surprise + Match only → Task 4 steps 2–3 (melody actions untouched — no edits to `undo.ts`/grid). §3.3 persistence in own idb namespace → Task 2 (`createStore("parallax-lineage", …)`). §3.4 Surprise keeps its toast → Task 4 step 2 keeps `captureUndo`. §3.5 ring of 10, newest-first, dedup head → Task 1 (`CAP`, `pushSnapshot`). §3.6 restore reuses `loadState(decodeState)` + reversible → Task 2 (`restoreSound`). §3.7 `↺ Recent` io-btn after Presets → Task 4 step 1.
- §4.1 data model → Task 1 `LineageEntry` (+ flagged `restore` source). §4.2 pure `pushSnapshot` → Task 1. §4.3 module API (`recordSound`/`restoreSound`/`clearLineage`/`hydrateLineage`, merge rule) → Task 2. §4.4 capture points → Task 4. §4.5 restore path → Task 2 via `loadState`.
- §5.1 placement/form + mobile `⋯` → Task 4 step 1 (lands inside the existing `.io-bar`, which `ToolsMenu` already collapses on phones — no extra work). §5.2 source glyph signature → Task 3 (`GLYPH`). §5.3 subtract (no save row, no per-row delete, one Clear) → Task 3. §5.4 copy → Task 3 (empty/clear/read-failure strings verbatim). §5.5 a11y (`aria-haspopup`/`aria-expanded`, `role="dialog"` + `trapFocus`, Escape/outside-click, `:focus-visible`, coarse-pointer ≥36px, per-row `aria-label`, glyph+text) → Task 3.
- §6 edge cases → corrupt/foreign (`decodeState` null → `restoreSound` false → inline copy, Task 2/3); missing engine (`loadState` registry fallback); idb unavailable (try/catch everywhere); hydration-vs-early-roll (`mergeRing`); no-op re-roll (head dedup); fire-and-forget persist (Task 2 `persist`).
- §7 testing → Task 1 (pure tests: prepend, head-dedup, cap, non-adjacent dup) + Task 5 (manual checklist). §8 safety → additive surface honored (2 new core/shell modules + 1 component + 4 small edits). §9 file list → matches, with the documented core/test split.

**Placeholder scan:** none — every step has complete code or an exact command + expected output.

**Type consistency:** `LineageEntry`/`LineageSource`/`CAP`/`buildEntry`/`pushSnapshot`/`mergeRing`/`isValidEntry` are defined once in Task 1 and consumed with identical names/signatures in Tasks 2–3. `recordSound`/`restoreSound`/`clearLineage`/`hydrateLineage`/`lineageStore` are defined in Task 2 and consumed with identical names in Tasks 3–4. `encodeState`/`decodeState`/`loadState`/`patchStore`/`melodyStore`/`audioReadyStore`/`trapFocus` match the signatures read from the live source files.
