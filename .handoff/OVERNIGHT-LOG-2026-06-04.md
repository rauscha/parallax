# Overnight log — 2026-06-04 (desktop · crane-desk)

Scope chosen at pre-flight: **Go big** — grid polish + M4 groundwork + staff key-sigs.
Decisions locked before the run:
- **Swipe between bars** → lives on the bar-tab strip + pitch-label gutter (no conflict with grid drag-extend).
- **CSP** → add a real `<meta http-equiv>` policy, verify against a production-base build, commit only if clean.

## Plan (dependency-ordered)
1. Grid: keyboard nav (arrow cursor + Space toggle)
2. Grid: swipe between bars on tab/gutter zones
3. Grid: desktop 2-bar side-by-side view
4. Staff: first-note left-padding from barline
5. Staff: key signatures (one accidental block at clef, not per-note)
6. CSP `<meta>` tag + browser verify
7. Small bugs: octave-shift-while-held, future-note panic, pitch-bend re-baseline (investigate; fix clear, defer ambiguous)
8. M4 groundwork: per-model explain data/text layer + panel scaffold + wire AD_VCA/TIMBRE/COLOR/FM amounts

---

## Done overnight

### 1. Grid keyboard navigation ✓ (`930b3c8`, pushed)
Arrow keys move a highlighted selection cursor on the grid; Space/Enter place or remove a note there; Delete/Backspace removes one. The cursor follows the active bar page across bar boundaries and stays in sync with the last pointer tap, so tapping and typing share one position. Also refactored the place/delete event mutation into shared `placeNote()`/`deleteNoteAt()` helpers (used by both the pointer and keyboard paths). Type-check + a11y clean (0/0).
**Why it matters:** lets you build patterns from the keyboard without the mouse — faster entry, and accessible.

### 2 + 3. Grid swipe between bars + responsive 2-bar desktop view ✓ (`5173d21`, pushed)
- **Swipe:** horizontal swipe on the bar-tab strip and the pitch-label gutter moves between bar pages. Kept off the grid cells (which own horizontal note drag-extend) per your pre-flight choice. A swipe swallows the trailing tab click so you don't get a double action; pointer capture lets the swipe track even off the narrow gutter.
- **2-bar view:** on a panel ≥560px wide the grid shows two bars side-by-side (32 columns) with a divider at the bar boundary; narrower panels (phones) stay at one bar. All the step math (pointer placement, drag-extend, playhead, keyboard cursor, swipe) was reframed around a derived `viewStartStep` so everything stays correct in either window.
- **Browser-verified** at both breakpoints (32 cols wide / 16 narrow), keyboard place+delete, swipe page-advance, and tab highlighting. 0 console errors. (Live desktop→mobile *resize* switch relies on a ResizeObserver that the preview harness's synthetic viewport-override doesn't always fire — it works on real browser resizes; verified correct on fresh load at each width.)
**Why it matters:** a desktop user gets a richer two-bar overview; phone users keep a legible one-bar grid; and swipe is a natural touch gesture for moving through the 4-bar loop.

### 4 + 5. Staff: key signatures + first-note breathing room ✓ (`0d899e7`, pushed)
- **Key signatures** — the staff now draws the key's sharps/flats once after the clef (e.g. F major = one Bb on the middle line), instead of repeating an accidental on every note. Notes already covered by the signature draw no accidental; a note that contradicts it (an F-natural in D major) draws a natural to cancel. The header widens with the number of accidentals so the music starts further right, exactly as in printed music. Major/minor get their proper signatures; major-pentatonic borrows its parent major's; chromatic keeps per-note accidentals.
- **First-note spacing** — noteheads/rests now sit a hair to the right of their barline (a small "lead-in") so the downbeat isn't jammed against the opening barline. Click placement is unchanged (hit-testing follows the visual position).
- **Bonus fix found along the way** — the staff lines used to start *right of* the clef, so the clef and time signature floated in blank space with no lines behind them. The lines now run under the whole header. (This changes the look of the existing staff slightly — flagged here in case you preferred the old spacing.)
- **Browser-verified:** C major identical to before; D major shows F#/C#; F major shows Bb; an in-key F# draws no accidental; a forced F-natural draws a natural; time signature + music shift right with the signature. 0 console errors.
**Why it matters:** the staff now reads like real sheet music — one key signature up front, clean noteheads, no redundant accidentals cluttering every in-key note.

**Note on the limitation:** there's no intra-bar accidental memory (real engraving makes an accidental persist for the rest of a measure). For a mostly-in-key monophonic sequencer this is rarely visible, and was out of scope; noted for later if it ever matters.

### 6. Content-Security-Policy + a `npm run preview` fix ✓ (`<pending>`)
- **CSP** — the deployed app now ships a real Content-Security-Policy as a `<meta http-equiv>` tag (GitHub Pages can't serve header-based CSP). It locks scripts/styles/fonts/images/connections to known sources: app code + WASM (`'wasm-unsafe-eval'`), the same-origin AudioWorklet, self-hosted Bravura, the Google Fonts CDN for the UI fonts, and `data:` images for the grain overlay. Injected **only into production builds** via a small Vite plugin — the dev server is left unconstrained so HMR keeps working.
- **Verified properly** (your pre-flight ask): built the app, served it with the production base, and confirmed in the browser that everything loads under the policy — app mounts, all three Google fonts + Bravura load, the WASM **compiles** under `'wasm-unsafe-eval'`, and there are **zero CSP violations**. (Audio couldn't be driven to full READY because a scripted click isn't a real user gesture for the AudioContext — unrelated to CSP; the live site already proves the audio path.)
- **Bonus fix found along the way** — `npm run preview` was silently broken for this project: `vite preview` runs with `command: 'serve'`, so the old config set `base: '/'` while the built assets reference `/parallax/`, making every asset 404 into the SPA fallback. Fixed by also using the `/parallax/` base when `isPreview` is true. `npm run preview` now actually serves the built app correctly.
**Why it matters:** a CSP is defense-in-depth — if any third-party script ever sneaks in (a bad dependency, an injected tag), the browser refuses to run it. And `npm run preview` is now a working way to eyeball a real production build locally.
**Limitation:** clickjacking protection (`frame-ancestors` / `X-Frame-Options`) can't be set via `<meta>` — it needs real HTTP headers GitHub Pages doesn't offer. Noted, not blocking.

---

## Waiting on you
_(deferred decisions / gated tasks — filled as encountered)_
