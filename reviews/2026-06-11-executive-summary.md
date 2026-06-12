# Parallax — Executive Shipping Review

**Date:** 2026-06-11 · **Branch:** `claude/codebase-shipping-review-q5whpr` @ `945a6ac`
**Process:** seven independent specialist reviews run in parallel against the full codebase — security, code quality & bug hunt, UX/UI, utility, fun, originality, and next-level ideas. Each report stands alone in this directory; this document is the synthesis. `npm run check`: 0 errors. `npm run build`: clean.

---

## 1. The verdict

**Parallax is genuinely close to a true v1.0 — ship it after a short, specific punch list (roughly two focused days of fixes).** No reviewer found a ship-stopping architectural problem, a security hole worth losing sleep over, or a feature that needs to be built before launch. What they found instead is a small set of concrete bugs and polish items, plus one strategic insight that should shape how v1.0 is framed and what v1.1 does.

### Scoreboard

| Lens | Grade | One-line verdict |
|---|---|---|
| Security | **Low risk** | No injection sinks, clean supply chain; two one-line share-URL DoS clamps, then ship. |
| Code quality | **B** | Strong audio core and layering; one systemic Svelte leak pattern, zero tests. |
| UX/UI | **A−** | "Tactile, literate, luminous." Real design system; one contrast blocker (Sandbox). |
| Utility | **B+** | A− in its niche: the best way alive to learn the Mutable macro-oscillators. |
| Fun | **B+** | "A Stradivarius in a room where the lights come on one switch at a time." |
| Originality | **B+** | One A-tier idea inside it — and it isn't the one the README leads with. |

---

## 2. The strategic insight (highest-consensus finding)

Three reviewers independently converged on the same thesis: **the original, defensible product is not "real Braids firmware in the browser" — it's the self-explaining instrument loop.** The WASM port is excellent engineering, but prior art exists (`@vectorsize/woscillators` ships Plaits-in-a-worklet on npm; Böhm's Max ports; VCV/Cardinal) and it will be fully commoditized within a couple of years. What has *no* precedent is the loop around it: per-model prose that rewrites itself, live % readouts, knob↔card cross-highlighting, the "Show me" sweep that performs the manual, and the quiet elegance that the same 870-line hand-verified teaching corpus powers the explain panel, the model search, *and* the sound-match ranker. The utility reviewer verified the corpus against the firmware enum line-by-line (one factual slip found: RING says "two sines"; the firmware shape is triple ring-mod). Originality's bottom line: *"an instrument that tells you the truth about its own knobs — nobody else is even trying."*

**Implication for v1.0:** frame the launch around the explain loop, not the port. **Implication for v1.1:** every proposed feature that deepens that loop (Model Safari, model-change sweeps, the browsable Model Index) compounds the moat; everything else is optional.

---

## 3. Ship gate — fix before v1.0

Merged from the security, code, and UX reports. Effort estimates are theirs.

**Bugs (code review, all confirmed with code traces):**
1. **Leaked store subscriptions in conditionally-mounted components** — the Staff↔Grid toggle leaks a live GridEditor subscriber that double-transposes melodies on key change, plus dead RAF playhead loops per toggle. One mechanical sweep of ~30 `.subscribe()` sites fixes the family. *(~2 h — the single most user-visible bug found.)*
2. **Engine swaps leak running DSPs forever** — no worklet termination path; every Surprise tap strands a live WASM processor on the audio thread. Add a `dispose` message; `process()` returns false. *(~1 h)*
3. **Audible pop on engine swap** — `useEngine` disconnects the old engine microseconds after scheduling its 40 ms fade. Defer disposal ~60 ms. *(15 min)*
4. **`startEngine` has no concurrency lock** — Surprise / picker / preset / Match are independent entry points that can race. *(30 min)*
5. **Latent OOB read in `braids_shim.cc`** — envelope index 0–127 accepted, ×8, into a 128-entry LUT; currently masked by a JS clamp one layer up. Clamp in the shim, rebuild WASM. *(30 min + rebuild)*
6. **`remapByDegree` octave-dive at the B/C boundary** — key changes can drop a note 11 semitones; fires on every key change with default fold-to-scale. Nearest-octave fix. *(30 min)*

**Security (both verified empirically):**
7. **Clamp share-URL `position`** — a ~125-char hostile link freezes the tab via a ~10⁹-iteration ledger-line loop. One line. 
8. **Cap decoded event count** (`.slice(0, 256)`) — 35 KB link → 8 MB of events → main-thread freeze; persists if saved. One line. *(Clamp `durationSteps` while in the file.)*

**UX:**
9. **Sandbox contrast blocker** — text-on-`--signal` computes 2.48:1 (1.87:1 on sunken cards) across ~12 components, violating the project's own AA rule. Add `--on-signal` per theme; use the existing `--signal-ink` for text. *(Small, mechanical.)*
10. **Modal focus management** — `aria-modal` is claimed but no dialog traps or moves focus; one shared ~15-line `trapFocus` action covers all five surfaces.
11. **iOS input zoom** — fixed for tempo, missed on model-search and preset-name inputs (16px in the coarse-pointer block).
12. **Three user-facing "Braids" brand strings** (ParamPanel group label, TapToStart subtitle, PWA manifest description) brush the project's own trademark rule. Rephrase as attribution. *(15 min)*

---

## 4. Strongly recommended for v1.0 (not gating, high consensus)

- **One-slot undo + toast** covering the four one-tap destructive actions (Surprise, Randomize, Clear, MIDI import). Flagged independently by UX (M1), fun (#4), and ideas (1.2 — "people roll 10× more when rolling is reversible"). State is already fully serializable; this is cheap.
- **Fix the first 60 seconds.** Fun's trace: tap → one A440 ping → empty sequencer, disabled PLAY, and the best button in the app hidden behind `⋯` on phones. Three moves: keep ⚄ Surprise visible in the phone top bar; replace the demo melody (an ascending C-major scale whose own docstring says TEMPORARY) with something charming and in-key; add a first-run nudge toward Surprise. *"The gap is not capability — it's choreography."*
- **Stitch the share loop.** The postcard PNG carries no share URL — flagged by utility, fun, *and* originality ("a brochure where the original was a doorbell; the recipient cannot hear the sound"). QR in the footer + `navigator.share` with image+link. Hours of work; it converts the app's most shareable artifact from a screenshot into a working invitation.
- **CI + first tests.** Add `npm run check` to CI (it currently only builds) and the four pure-layer vitest files the code review specced — the `remapByDegree` test fails today, proving the point.
- **`PROVENANCE.md`** for the committed WASM binaries (eurorack commit, emcc version, SHA-256s) — the one place "trust" isn't backed by "verify."
- **Offline fonts** — Google Fonts aren't in the Workbox precache, so the installed PWA's "Ready to work offline" promise ships with system-font fallbacks. Self-host (Bravura already is).
- The UX report's **10-item "verify visually" checklist** (scanline moiré, theme-flip feel, postcard render per theme, etc.) — none of the reviewers had a browser; these need human eyes before ship.

---

## 5. After v1.0 — the direction

The ideas review's v1.1 set is deliberately compounding, and the other reviewers' findings independently justify each piece:

1. **Patch lineage breadcrumb** (makes Surprise fearless — answers UX M1/fun #4),
2. **Swing + Euclidean/arp/mutate melody tools** (fixes the one weak link every reviewer hit: rolled *music* quality — "melodic word salad" per originality),
3. **Postcard QR + Web Share** (completes the loop in §4),
4. **Parallax Daily** — date-seeded surprise; everyone gets the same instrument today, remix and share. A Wordle loop with zero backend — *the date is the server.*
5. **Loop export** (un-defer the smallest slice of audio recording: one 4-bar MediaRecorder pass → file). Utility's verdict: audio-out is THE wall, capping every persona except the pure reference user.

**v1.2 marquee:** port **Rings** as engine #4. The shims are small and patterned (Plaits' is 141 lines), the registry makes catalogues data-driven, and theme-follows-engine means every port ships a whole new outfit. Parallax stops being "the Braids site" and becomes *"where Mutable modules live in your browser."*

Also endorsed: the do-NOT-build list (polyphony, FX rack, song mode, sampler, accounts, AI patch gen) — every entry defends the app's actual identity.

**One theme debt:** the Lab/"SNES-inspired" theme was the weakest item on three scorecards (UX: "competent, slightly under-charactered"; fun: B−, "the console is grey, where's the cartridge?"; originality: poorly-copied tier). It's attached to the one engine that's original work. Either commit to the bit (the `--t-spring` token is defined and used nowhere; Laxsynth's chiptune-leaning models are the natural hook) or rename the intent.

---

## 6. What's genuinely excellent (so it doesn't get lost in the punch list)

- **The Knob** — magnetic detent with catch/release hysteresis, haptic on catch only, RAF-coalesced writes, full keyboard model. Called "a small masterpiece" (UX) and "the kind of detail Teenage Engineering charges $1,400 for" (fun).
- **The oscilloscope** — per-theme physics as CSS tokens, breathing idle, boot sweep synced to the A440 strike, reduced-motion honored *inside canvas code*. The May review's harshest visual criticism, answered properly.
- **The layering** — pure-TS `audio/sequencer/state/data` verified Svelte-free; `ISynthEngine` is real (three engines with different note models behind one surface, zero engine strings leaking); the worklet message-passing (time-stamped gates, strike-carries-pitch) is above-average for hand-rolled.
- **The writing** — both the model lore ("park it right at the edge before it breaks up," an explain card that admits a knob "does almost nothing here") and the code comments that explain *why*, citing the bug they prevent.
- **Defensive decode everywhere** — share URLs, presets, MIDI files all degrade gracefully; security found the codebase clean of every classic sink it checked.

---

## 7. Reading order

1. This document.
2. `2026-06-11-code-quality.md` §6 + `2026-06-11-security.md` §4 — the punch lists.
3. `2026-06-11-ux-ui.md` §3/§6 — the contrast fix and the visual-verify checklist.
4. `2026-06-11-fun.md` §3/§7 — the first-60-seconds problem.
5. `2026-06-11-originality.md` — the positioning argument.
6. `2026-06-11-utility.md` — personas and the wall ranking.
7. `2026-06-11-next-level-ideas.md` — the roadmap.
