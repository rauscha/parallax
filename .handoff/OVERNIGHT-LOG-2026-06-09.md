# Overnight log — 2026-06-09 (desktop) — M5: the road to v1

Plain-language write-up of the overnight M5 run. User's ask: *"m5 — this is
overnight, just keep rolling."* Scoped M5 into committable increments and rolled
through them, committing + pushing + type-checking each, with Node tests for the
pure logic and a live browser smoke-pass at the end.

**Six commits, all pushed to `origin/main`.** Type-check clean throughout
(svelte-check, 0 errors). Production build clean. No console errors in the live
smoke test.

## What shipped

1. **Shareable patch URLs** (`f370a48`) — a link recreates the *entire*
   instrument: engine, model, every knob, and the whole melody, round-tripped
   through `location.hash`. Nothing leaves the browser (it's in the URL
   fragment). New `state/serialization.ts` is the pure, Node-tested core
   (compact wire form, versioned, defensive decode — a hand-edited/stale link
   coerces + clamps every field and drops bad events instead of throwing).
   `state/share-url.ts` is the lz-string + DOM half. TapToStart reads the link
   *before* starting the engine (boots straight into the shared engine) then
   overlays the shared patch + melody. A **Share** button (new `PatchToolbar`)
   copies the link, falling back to "In address bar" when the clipboard is
   blocked. **27/27 Node checks.**

2. **Local preset library** (`4ef167c`) — save named snapshots of the full state
   to IndexedDB (`idb-keyval`), load or delete them. Reuses the share wire
   format, so save/share/load share one format + one defensive decode. New
   `state/persistence.ts` + a `PresetMenu` popover. `engine-control.loadState()`
   applies a saved state at runtime, hot-swapping the engine first if the preset
   needs a different one.

3. **MIDI file import/export** (`8301708`) — export the 4-bar melody as a `.mid`,
   or import one and quantize it onto the grid. Pure `sequencer/midi/convert.ts`
   over `@tonejs/midi` (a step ↔ ticks at ppq/4, so the grid lands on exact tick
   boundaries — clean round-trips, no float drift). Import is deliberately lossy
   to fit the app's model: quantize to 16ths, reduce to monophonic (highest
   pitch wins a tie), trim overlaps, drop past bar 4 — reporting a dropped count.
   New `MidiMenu` popover. **11/11 Node checks.**

4. **PWA — installable + offline** (`3584ca4`) — wired `vite-plugin-pwa`.
   Workbox precaches the whole shipped app **including both WASM engines
   (braids + plaits), all three worklets, the JS glue, and the Bravura font**, so
   the synth makes sound with no network (19 entries / ~1.15 MiB). `base`
   (/parallax/) flows through to the manifest scope/start_url + SW path. Manual
   registration (no inline script) keeps the strict production CSP intact; the SW
   gets its CSP from HTTP headers, so its same-origin Workbox importScripts is
   fine. A one-shot "Ready to work offline" toast (`PwaToast`). New maskable
   `public/pwa-icon.svg`.

5. **Patch postcard** (`eb61942`) — a **✦ Postcard** button mints a 1200×630
   shareable card: wordmark + scope mark, engine·model, the macro-knob dials, a
   mini piano-roll of the melody, tempo/key footer — all in the live theme's
   colours. Preview in-app, then Download PNG or Copy image. Pure
   `ui/postcard.ts` renderer (deterministic) + `PostcardModal`.

(Plus this doc — the 6th commit is the hand-off update.)

## Verified live (dev server, Claude Preview eval)

The preview screenshot renderer is wedged as usual (hidden tab), but `eval` +
reading canvas pixels via `toDataURL` works — so I drove the app for real:

- App boots, all four toolbar buttons render, **zero console errors** across the
  whole session.
- **Share round-trip end-to-end:** loaded the 8-note demo → Share (hash grew to
  encode it) → reloaded the page with the link → tap-to-start → **the 8-note
  melody hydrated back exactly.**
- **Presets:** saved a preset → confirmed the record in IndexedDB (wire holds all
  8 events) → cleared the melody → loaded the preset → **8 notes restored.**
- **Postcard:** rendered to a real 1200×630 PNG and *eyeballed it* (decoded the
  canvas dataURL to a file and viewed it) in **two themes** — Lab (teal) and
  Phosphor (green). Looks polished: clean staircase piano-roll, proper dials,
  the wave mark, theme colours correctly picked up. 
- **Themes:** every CSS token the new M5 components use is defined in **all three**
  themes (audited the token file) — no gaps (this was a past bug class).

## Still open for M5 → before tagging v0.5.0-m5 (needs the user's eyeball)

- **Thorough mobile pass on a real device.** The new toolbar adds 4 buttons to
  the top bar; I gave `.topbar-right` `flex-wrap` so it degrades, and the popovers
  cap at `max-width:86vw`, but a phone-in-hand check of the wrapped top bar +
  the popovers/postcard modal at 375px is a human call.
- **Final aesthetic "finalize all 3 themes" pass.** Token coverage is verified
  and the postcard looks right in Lab + Phosphor; a deliberate look-over of the
  whole app in Sandbox (light) + Phosphor is worth a few minutes.
- **PWA icons.** Using SVG manifest icons (installable on modern Chrome/Edge/
  Android). No rasteriser is available in this toolchain to mint PNGs; a future
  `@vite-pwa/assets-generator` pass (needs `sharp`) could add crisp PNG +
  Apple-touch variants for the broadest install/iOS coverage.
- **MIDI import** is Node-verified for the conversion but the *file-picker* path
  wasn't driven in-browser (would need a real file drop). Low risk — it's the
  same tested `convert.ts` behind a standard `<input type=file>`.

Once the mobile + theme eyeball passes, tag **`v0.5.0-m5`**.
