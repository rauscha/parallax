# Overnight log — 2026-06-20 (desktop · c:\parallax)

Autonomous run. Plan of the night, agreed before start:
1. **Execute** the musical melody + transport UX plan (3 tasks, TDD via subagent-driven-development).
2. **Partial-verify** "Recent sounds" lineage via preview tools (DOM/console/click — screenshots are wedged on a backgrounded tab, so the visual/real-device pass stays a human task).
3. **Draft** spec + implementation-plan docs for the next three "After v1.0" items — one-loop audio export (#5), swing/Euclidean/arp/mutate (#3), Parallax Daily (#4). Design questions surfaced as morning decision cards, **no code**.

Method note: this is a single autonomous session — I cannot self-`/clear` or `/compact`. The durable memory is this log + `.superpowers/sdd/progress.md` + the committed plan/spec docs, so a fresh session can resume cleanly from disk if context gets heavy.

Baseline at start: `npm run check` 0 errors / 0 warnings (947 files); `npm run test` 38 passed (5 files). HEAD `72a2b8c`, tree clean except one untracked leftover plan doc (`docs/superpowers/plans/2026-06-20-patch-lineage.md`, from the already-shipped lineage feature — will commit as housekeeping).

---

## Done overnight

### 1. Musical melody + transport UX — SHIPPED (pushed to main, auto-deploying)

Executed the full plan via subagent-driven-development (fresh implementer per task on a cheap model since the plan had verbatim code; an independent reviewer after each; a final whole-branch review on the strongest model). Four commits, all type-clean, 56/56 tests green:

- `2b45002` **feat(melody): pure rhythm + stepwise helpers** — three pure, tested helper functions in `grid.ts`: `buildRhythm` (varied note lengths — eighths, quarters, dotted-quarters, halves — plus rest gaps), `pickNext` (picks the next pitch with a bias toward stepping by one or two scale notes rather than leaping randomly), and `findTonicIdx` (locates the key's "home" note correctly even when the key isn't C). 11 new unit tests.
- `eefbc4f` **feat(melody): musical randomizeMelody** — rewired the "Surprise"/randomize melody generator to use those helpers. Generated melodies now **start and end on the home note**, **rise to a peak around the middle and fall back** (a classic arch shape), and **mix note lengths** instead of being all-quarter-notes-at-random. The function's interface is unchanged, so the Surprise button and the grid's randomize both pick it up for free. 7 integration tests.
- `2e5a7d1` **feat(ux): bigger play/stop button + Space bar toggle** — the Play/Stop button is now a comfortably larger click target (and a proper 44px finger target on touch screens), and the **spacebar starts/stops playback** from anywhere that isn't a text field.
- `57acee2` **fix(grid): Space no longer double-fires** — the final whole-branch review caught a real collision the per-task reviews couldn't see: the step-grid already uses Space to place a note, so the new spacebar-toggle would have *both* placed a note *and* started/stopped playback when the grid was focused. One-line fix: the grid now consumes Space when it has focus, so Space-in-grid = place a note, Space-elsewhere = play/stop. (A quick in-browser confirm of this is on tonight's verification list.)

**Why this matters (plain language):** before tonight, hitting "Surprise" gave you four bars of evenly-spaced random notes — rhythmically flat and tonally aimless. Now it produces something that reads like an actual little phrase: a home note, a shape that goes somewhere and comes back, and a mix of long and short notes. And playback is easier to drive (big button + spacebar).

### 2. "Recent sounds" (patch lineage) — browser-verified (partial pass)

Drove the dev server (localhost:5173) through the feature with the preview tools. Note: the preview tab runs backgrounded so `innerWidth` is 0 and screenshots/`innerText` are unreliable — but clicks, `textContent`, console, and IndexedDB reads all work, which covered everything below. Verified against the 7-item checklist from the hand-off:

1. **Surprise → entry appears** ✅ — rolling Surprise adds a `⚄` row (engine·model + relative time) and persists to the `parallax-lineage` IndexedDB store. **Important clarification:** the captured entry is the *outgoing* sound (the one you're leaving), not the sound the roll just produced. I initially read this as a bug, then checked `lineage.ts` — it's **intended by design** (the file says verbatim "The currently-live sound is NOT in it … Call this BEFORE the generative action replaces state"). It's a step-back trail, like browser back-history. Working as specified.
2. **Restore a recent sound** ✅ — clicking an older `braids · csaw` row hot-swapped the live engine back to Braids and added a `↩` restore entry that captured the outgoing sound first (ring sources became `[restore, surprise, surprise]`). The restore uses the same proven decode→loadState path as presets/share-links.
3. **Match Apply → ◎ entry** — **not driven end-to-end** (it needs a dropped audio file, impractical to automate reliably here). Mechanism is the *same* `recordSound("match")` call as the fully-verified Surprise path, and the `◎` glyph is wired in the menu. High confidence; a 10-second human confirm would close it fully.
4. **Reload persists** ✅ — after a full page reload + re-start, all three entries rehydrated from IndexedDB with the right glyphs (`↩`/`⚄`) and relative times.
5. **Clear history** ✅ — empties the list, deletes the idb key, and shows the empty-state message ("No recent sounds yet — roll Surprise or Match a sound to start a trail.").
6. **Undo toast still works** ✅ — a Surprise roll still raises the single-slot "New instrument rolled · Undo" toast; lineage is strictly additive and didn't disturb it.
7. **Zero console errors/warnings** ✅ — clean across boot, three rolls with engine hot-swaps (braids↔plaits↔laxsynth), restore, reload, clear, note entry, and transport toggling.

### 3. Space-bar double-action fix — browser-verified ✅

The final-review fix (`57acee2`) was confirmed live: in the **Grid** view, pressing Space **places a note and does NOT start playback** (the grid consumes the key). With Space pressed **outside** the grid, the transport toggles on/off as intended. Also confirmed the Staff editor has no keyboard handling at all, so there was never a collision there — the fix was needed only in the Grid, which is where it landed.

### 4. Next-feature specs drafted (no code — design + decisions for you)

Per your "draft specs, surface decisions" steer, three design docs are written and committed, each grounded in the real code with a "Decisions for Andrew" section (options + my recommendation). They are **drafts pending your sign-off** — once you pick the options, the code-level plan gets written and built (same flow as tonight's melody feature: spec → plan → TDD).

- **One-loop audio export** — [`docs/superpowers/specs/2026-06-20-one-loop-audio-export.md`](../docs/superpowers/specs/2026-06-20-one-loop-audio-export.md). Key finding: the clean offline-render/WAV route is a hard blocker (the WASM worklet is welded to the live audio context), so it's a realtime MediaRecorder tap on the master output. 7 decisions, mostly "confirm the recommendation."
- **Melody tools** (swing / Euclidean / arp / mutate) — [`docs/superpowers/specs/2026-06-20-melody-tools.md`](../docs/superpowers/specs/2026-06-20-melody-tools.md). Recommends shipping in order Mutate → Euclidean → Arp → Swing. 8 decisions; the load-bearing ones are build-order and the swing model (bake into note data vs Tone playback-only).
- **Parallax Daily** — [`docs/superpowers/specs/2026-06-20-parallax-daily.md`](../docs/superpowers/specs/2026-06-20-parallax-daily.md). A seeded PRNG injected into the Surprise + melody functions (defaulting to `Math.random` so normal Surprise is untouched). 6 decisions. Note: this refactors `Math.random()` calls inside the melody code shipped *today*.

### Housekeeping
- Committed the leftover `docs/superpowers/plans/2026-06-20-patch-lineage.md` (the plan for the already-shipped lineage feature — it was sitting untracked).

---

## Waiting on you

Four items, ordered most-actionable first. **Full cards (with options + my recommendation) are in [`.handoff/PENDING-DECISIONS.md`](PENDING-DECISIONS.md)** — `pick-up` will surface them next session. In brief:

1. **Melody contour — quick yes/no ⭐ (do first):** should the descending phrase resolve toward the *tonic* in every key (recommended; ~4-line change + 1 test), or stay as-shipped (aims at the lowest note — fine for C, slightly off for non-C keys)? Deferred because it's an aesthetic call that changes every generated melody.
2. **Audio export spec** — confirm the realtime-MediaRecorder approach + 7 detail recommendations, then I write the plan.
3. **Melody tools spec** — confirm build order (Mutate→Euclidean→Arp→Swing) + the swing data-vs-playback model + 6 smaller calls.
4. **Parallax Daily spec** — confirm 6 recommendations (UTC date, dedicated button, `?daily=` permalink, full engine swap, accept drift, undo+lineage parity).

None of these block each other. Items 2–4 are "skim the spec's §3, nod or adjust" — then each becomes a code-level plan ready to execute. Item 1 is a tiny code change I can do the moment you say yes.

**Nothing was forced or guessed.** Every consequential/aesthetic choice was left for you rather than decided autonomously, per the overnight rule.
