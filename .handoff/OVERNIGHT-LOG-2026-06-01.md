# Overnight log — 2026-06-01 (desktop)

Pre-flight settled four design calls (note-strip = 12 chips + octave shift; RAF-coalesce; add `--signal-ink` token; ambition = P1 + small safe wins). Auto-mode on. All three remaining v0.3.0-m2 polish-gate P1s landed plus the bundled hygiene items. Each unit committed individually so the morning verification can bisect cleanly. Type-check clean after every commit (8 commits, 0 errors / 0 warnings).

## Done overnight

**1. Theme contrast pass — `8e844b3`.** The deep review flagged `--text-dim` at ~3.3:1 in all three themes (WCAG floor is 4.5:1 for small text), and K.O.'s hot-orange signal at 2.48:1 against the warm body. Fixed both:
   - Lab `--text-dim`: `#5A6672` → `#8A95A0` (now 6.2:1)
   - K.O. `--text-dim`: `#7A7A7A` → `#5A5A5A` (now 5.7:1)
   - Phosphor `--text-dim`: `#4F5A45` → `#7D9A6F` (now 6.3:1)
   - New `--signal-ink` token: rust `#A8350F` in K.O. (5.3:1 against cream), aliased to `--signal` in Lab + Phosphor (their bright signals already exceed 10:1 against dark backgrounds, no separate ink needed). Flipped four body-text uses to `--signal-ink`: ModelPicker code pill, selected-row code, KeyboardHarness octave indicator, TapToStart h1. **Why this matters in plain terms:** the K.O. theme was breaking the colorblind-discipline claim you make explicitly — low luminance contrast hits colour-blind readers hardest. Now every text use meets AA on every theme.

**2. RAF-coalesce knob onchange — `f6c0bdf`.** Dragging the lo-fi sliders (BITS/RATE/SIGN/DRIFT) previously fired a cross-thread `postMessage` on every pixel of pointer movement — 30-60+ messages/second slamming the one thread that must never miss its real-time deadline. Now: the latest value is buffered, flushed at most once per animation frame (~60 Hz). Force-flush on `pointerup` so the engine always lands on the exact release value. Cleanup on component destroy. **Why:** missed audio deadlines are audible clicks; this was a known glitch risk on weak phones.

**3. ModelPicker — keyboard nav + touch + pulse — `a64663a`, `efb8a7c`.** Built the missing keyboard surface: Arrow Up/Down moves a cursor through the (filtered) flat list with auto-scroll-into-view, Enter picks the cursor or first match, Escape clears the search. Cursor remembers the current selection on first arrow press so it doesn't lose context. Touch targets bumped to ≥44 px via `@media(pointer:coarse)` so desktop stays compact. Selected row gains a redundant inset left-edge accent in `--signal` so it survives even if the fill wash ever falls through (defence in depth). The code pill now pulses (320 ms spring with `cubic-bezier(0.34, 1.56, 0.64, 1)` — finally exercising the previously-unused `--t-spring` motion token) on every model change. Re-review caught a focus edge case: keyboard handler now scopes itself to the search input + list items so it doesn't hijack the steppers' native Enter behaviour; empty-query Enter is a no-op (won't clobber the current selection on accident).

**4. NoteStrip — interim tappable phone surface — `00286f8`.** New component, mounted as a bottom strip in App.svelte, gated behind `@media(pointer:coarse)` so desktop never sees it. 12 chips for one octave + ◀/▶ octave shift, ≥44 px targets, multitouch-correct via a pointerId→midi map. Accidentals styled by surface tone + label, not hue (colour-blind rule). Release-all on `blur`/`visibilitychange` so a tap can't drone after a tab switch (same hardening as the QWERTY harness). Also bumped the SCOPE/SPECTRUM viz-toggle buttons to ≥44 px on coarse pointers — the deep review flagged them at ~20 px. **Why:** the north-star explicitly names phone support, but until now there was literally no way to play a note on a phone.

**5. Oscilloscope hero — `0d54a51`.** The biggest unit of the night, four changes in one pass:
   - **Real bloom.** Added `shadowBlur` to the core trace (`8px @ dpr`), gated on peak amplitude (`peak > 0.05`) so the expensive blur stays off when there's nothing to glow about. Resets to 0 after the stroke so it doesn't leak into next frame's grid.
   - **Breathing idle.** When no audio is playing, the baseline now pulses softly — alpha oscillating 0.32↔0.50 on a 4 s cycle. The line stays put (a *moving* line previously read as a glitch, which is why the earlier heartbeat got removed). A faint beam dot sweeps left→right every 6 s for character.
   - **Boot sweep.** When `audioReadyStore` flips false→true (i.e. the user taps to start audio), a bright vertical scan line sweeps L→R for 700 ms with a decaying glow flare — synced to the A440 confirmation strike that TapToStart already plays. The instrument *lights up* rather than just appearing.
   - **DC clamp.** `samplesToShow` is now `Math.max(1, ...)` so a degenerate trigger near the buffer end (very-low-frequency or near-DC signals) doesn't produce a zero-length window and a misleading flat frame.
   - Bonus efficiency: folded the silence-detect peak scan into the same loop that runs the trigger — was previously walking the buffer twice every frame. All motion features honour `prefers-reduced-motion` live via a media-query listener.

**6. Subtle grain overlay — `710501e`.** Inline SVG fractal-noise tile (180×180, `stitchTiles="stitch"` so no seams) overlaid on `body::after` at 0.045 opacity with `mix-blend-mode: overlay`. A single neutral-grey grain works for both Lab (lifts to a soft glow on dark) and K.O. (deepens to fine texture on cream) by virtue of how `overlay` blends. Phosphor opts out — its scanlines are the texture. **Why:** "subtle grain" was named explicitly in the Lab Instrument design brief and was the difference between "matte equipment" and "flat developer dashboard."

**7. Hygiene + small bugs — `557ee4e`.**
   - Deleted `public/icons.svg` — a leftover starter-template sprite (off-brand purple social icons), referenced nowhere.
   - `AudioEngine.useEngine`: wrap `next.init()` in try/catch and call `next.dispose()` on failure. Without this, a thrown init (WASM-fetch timeout, worklet silent failure, the existing P0-load paths) left the half-built engine holding an `AudioWorkletNode` + message-port listener that outlived the doomed reference. Re-throws so `TapToStart` still surfaces the error.

## Waiting on you

**1. Browser eyeball pass + tag `v0.3.0-m2` + push.** I can't open a browser autonomously — verifying visual changes is on you. Quick punch-list:
   - All three themes: every small label (region labels, family tags, model index, group labels) is now comfortably readable.
   - K.O. specifically: model code pill + KeyboardHarness octave indicator + TapToStart h1 are now visibly readable (rust orange, not the old eye-strain bright orange).
   - Pick any knob, drag fast — no audible click; smooth response on release.
   - Press TAB to focus the picker search → ArrowDown → highlight bar appears in the list and scrolls into view → Enter picks. Escape clears.
   - Change models with ◀/▶ — the code pill should briefly pop (spring scale).
   - Phone or DevTools touch sim: bottom note strip appears, 12 chips play, octave shift works. SCOPE/SPECTRUM buttons are fingertip-sized.
   - Scope at idle: baseline breathes softly. First audio unlock: scan line sweeps L→R. While playing: trace has a real soft halo.
   - Grain just barely visible on Lab + K.O.; nothing extra on Phosphor.
   - Once happy: `git tag v0.3.0-m2; git push origin v0.3.0-m2` — that auto-deploys the new build to andrewrausch.com/parallax/ via the existing Pages workflow.

**2. Decisions I deliberately deferred for a daylight session.** All four are real choices, not blockers:

   - **Central stores wiring.** The `patchStore` / `engineIdStore` are defined but ModelPicker + ParamPanel still keep local copies and talk to the engine directly. The deep review's promise that "undo/presets/share-URLs fall out for free" depends on this. It's a real refactor touching three files at once, and it's the first move of M3 — better as a focused chunk with you around.

   - **Security hygiene — CSP + self-hosted fonts.** Both involve small judgement calls (which CSP directives? which font weights to bundle? what licence terms?) and are easier with you available to answer in real time. The current state is fine for now — `npm audit` is clean, no committed secrets in history, no dangerous DOM sinks.

   - **AD envelope per-model wiring (M4 territory).** The shim setters `braids_set_envelope_shape` + `braids_set_ad_amounts` and the worklet message types are already plumbed; what's left is reading per-model defaults from `data/braids-models.ts` at `noteOn` in BraidsEngine. Lives with M4 because the per-model metadata is needed for the explain panel anyway. Don't auto-enable for all models — sustained tones would auto-decay to silence, which is wrong.

   - **Remaining P2/P3 bugs.** Pitch-bend re-baselining after a new note, future-note "panic" (matters once the M3 sequencer exists), hot-swap tearing down the release ramp, ring-buffer misleading-comment cleanup, the silent `catch {}` disconnects. None are blocking — they're future-work surface area to clear when the relevant feature lands.

---

## Notes for the morning

- 8 commits since the previous session's `c38ed3a`. Branch is `main`, all pushed-up-to-the-pre-tag state already lives in `origin/main` (you'll need to `git push` once more if any commits aren't there yet — your call whether to push code first and tag later, or just push the tag).
- Type-check clean throughout. No new dependencies added.
- The "interim" in NoteStrip is deliberate — it's a stop-gap until the M3 staff editor lands as the real touch surface. Don't polish it further.
- Octave state in NoteStrip is *local*, not shared with KeyboardHarness — fine for an interim, but if you later want them to track together it's a small lift via a shared store.
- Dev server from yesterday may still be alive on `:5174`. `npm run dev` to spin up a fresh one if not.
