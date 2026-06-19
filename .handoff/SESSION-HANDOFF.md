# Session hand-off — 2026-06-18 (machine: desktop · c:\parallax)

## STATE (read this first)
- Branch: `main`, **clean + synced** (HEAD `3c92acb` == origin/main). One worktree
  only — nothing stranded.
- **🚀 Parallax `v1.0.0` is SHIPPED.** Annotated tag pushed; CI + Pages deploy both
  green; live at **andrewrausch.com/parallax**. The tag subsumes the never-cut
  `v0.5.0-m5`. All of `docs/roadmap-v1.0.md` (Phases A–D) is complete.
- Next work is the roadmap's **"After v1.0"** list — nothing is mid-flight.

## Done this session
Resumed via /pick-up; the overnight ship-gate (Phases A–C, 21 commits) had already
merged to `main`. Closed out **Phase D** end-to-end on this desktop:
- **A7 WASM rebuild** (`73bb7ef`): rebuilt `public/braids.wasm` with **emcc 5.0.7**
  (the remote box had no Emscripten); re-pinned the SHA + emcc version in
  `dsp/PROVENANCE.md`. `braids.js` glue byte-identical (clamp only touched compiled
  DSP). eurorack upstream commit still unrecoverable from the M1 vendoring — noted.
- **Postcard QR** (`15c654a`): the 100px / EC-M QR was sub-pixel for busy melodies
  (worst case 0.90 px/module) and unusable after a social downscale. Relaid the lower
  band — piano-roll left, **176px QR right, EC level L** → 1.93 px/module worst case.
  Verified offscreen in all 3 themes.
- **Mobile colour-seam** (`d38974d`): on a real Pixel (all themes) a `--hairline` band
  cut through the Sequencer header. Cause: mobile grid rows were `auto`, so the
  over-constrained grid shrank the staff region to its label's min-content and its
  `--bg` stopped short. Fix: **`auto` → `max-content` rows** so each region keeps full
  height and the grid scrolls.
- **Release** (`3c92acb`): ticked roadmap A–D, updated CLAUDE.md status line, tagged.
- **Objective visual pass** (programmatic — see Watch out): WCAG-AA contrast in all 3
  themes (tightest 4.67), self-hosted fonts loaded with **zero** Google refs, no
  horizontal overflow at 375px, 720px boundary flips, first-run nudge present,
  postcard renders in all themes. `check` 0 err · `test` 29 pass · `build` clean.
- **Human gate** (Andrew, on device): engine-swap pop gone, no degradation after
  repeated Surprise rolls, "want to show it off" grin, Korg NanoKey plug-and-play
  MIDI on the phone.

## Next up
v1.0 is done — work the roadmap's **"After v1.0"** section (`docs/roadmap-v1.0.md`),
agreed order:
1. patch-lineage breadcrumb (extends B5's single-slot undo into a ring)
2. swing + Euclidean / arp / mutate melody tools
3. Parallax Daily (date-seeded surprise — refactor `surprise.ts`/`randomizeMelody`
   to take an injected RNG)
4. **one-loop audio export** (MediaRecorder tap) ← **agreed first un-deferral**
5. port **Rings** as engine #4 (v1.2 marquee)
Start a fresh session for whichever you pick — this one is large.

## Watch out for
- **`npm ci` on a fresh machine first.** This desktop's `node_modules` predated the
  overnight deps (`qrcode-generator`, `vitest`) and check/test/build failed until a
  clean install. The laptop will need the same after pulling.
- **Preview screenshots don't work here.** The Claude preview tab runs backgrounded
  (`window.innerHeight === 0`), which pauses RAF (wedges screenshots) and collapses
  `vh`/`%`-height layouts in measurements. Verify mobile via computed-style/geometry
  evals + real-device checks, not screenshots. (The 0-height quirk made the seam look
  even worse than the real phone — but the seam WAS real on the Pixel.)
- **Tone.js code-split still deferred** (C6): the ~577 KB index chunk warning stands;
  accepted per code-quality §5.5, too risky to land without an audio verify.
- Three remote `claude/...` branches (ship-gate, mobile-responsive, shipping-review)
  are merged/stale — safe to delete on GitHub to tidy, not required.
