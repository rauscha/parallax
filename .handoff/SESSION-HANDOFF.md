# Session hand-off — 2026-06-12 (remote: v1.0 ship gate, Phases A–C)

## STATE (read this first)
- Branch: `claude/parallax-v1-ship-gate-s0trga` (the harness-designated ship-gate
  branch; the roadmap's working name was `v1-ship-gate`). Pushed; PR
  "v1.0 ship gate (Phases A–C)" opened as a draft.
- **Phases A–C of `docs/roadmap-v1.0.md` are complete** — 21 task commits, one per
  task with the `[v1-…]` id in the body. `npm run check` (0 errors), `npm run test`
  (29 passing), and `npm run build` (clean, 25 precache entries) are all green.
- **Phase D is the human gate — untouched, as instructed. Nothing is tagged.**

## Done this session (every commit has its task id in the body)
**Phase A — correctness**
- A1 `8cdc12c` unsubscribe-on-destroy sweep across all `*.svelte` (fixes the
  double-transpose-on-key-change leak + dead RAF playheads + dangling timers).
- A2 `2073b9b` worklet `dispose` message → `process()` returns false + frees the
  WASM heap (braids/plaits); no more leaked DSP per engine swap.
- A3 `e2b22c2` defer the old engine's disconnect/dispose ~60 ms so the swap fade
  is heard (no pop).
- A4 `551820b` serialize `startEngine` with a module-level in-flight promise.
- A5 `0d74ae0` `remapByDegree` nearest-octave fix (B/C boundary no longer dives 11
  semitones). Node-verified; pinned by a test.
- A6 `a7388ba` clamp hostile share-URL decode: `position` ±40, events `slice(0,256)`,
  `durationSteps` ≤64. Pinned by tests.
- A7 `a4a08e8` clamp Braids envelope shape 0..15 in the shim (OOB heap read) + the
  worklet live guard + comment fix. **WASM REBUILD PENDING** — emcc unavailable here;
  the JS clamps make it safe to ship, the prebuilt `braids.wasm` is unchanged.
- A8 `ed11a29` de-brand 3 user-facing "Braids" strings + fix RING's "two sines" →
  triple ring-mod.

**Phase B — UX**
- B1 `292755c` Sandbox contrast: `--on-signal` per theme, retire text-role
  `--signal` for `--signal-ink`, add `--danger`. All changed text pairs computed
  ≥4.5:1 (sandbox signal-ink darkened to `#8A2A0A`, danger `#911B11` to clear the
  sunken/raised cards).
- B2 `14c3e53` `trapFocus` action (focus-in / Tab-wrap / restore) on the four real
  dialogs. ToolsMenu intentionally excluded (it *contains* the Preset/MIDI popovers).
- B3 `e588bf1` 16px model-search + preset-name inputs on coarse pointers.
- B4 `e9acfc3` ⚄ Surprise out of the overflow → stays in the phone top bar (icon-only).
- B5 `df948ec` single-slot undo + toast for Surprise/Randomize/Clear/MIDI-import
  (`state/undo.ts` + `UndoToast.svelte`); restores via the share-link path.
- B6 `bb2028f` characterful demo riff (replaces the "TEMPORARY" scale) + first-run
  empty-state nudge pointing at "load a demo" / "⚄ surprise me".

**Phase C — loop / infra**
- C1 `70705e6` postcard QR of the share URL + Web Share (`navigator.share`) + the
  bespoke `drawMark` waveform replacing the `◐`. New dep `qrcode-generator`.
- C2 `e909569` vitest + 4 pure-layer suites (29 tests) + `.github/workflows/ci.yml`
  and check+test inserted into `deploy.yml`. Extracted `part-expand.ts` so the Part
  test doesn't pull Tone.
- C3 `315661a` `dsp/PROVENANCE.md` — SHA-256 of every committed engine artifact +
  source/rebuild notes.
- C4 `fa31ca9` self-host Inter / JetBrains Mono / Space Grotesk (variable woff2 via
  the FontFace API); drop the Google Fonts `<link>` + the gstatic/googleapis CSP
  entries. Precache 19→25; no google refs in `dist`.
- C5 `6237143` delete `TestToneEngine.ts` + `colToStep`; dedupe the `"braids"`
  literal → `DEFAULT_ENGINE_ID`.
- C6 (stretch) `b5edac6` union `activeNotesStore` writers; `2e2bc7b` preserve the jam
  across a PWA auto-update reload (+ defer reload while playing).

## Phase D — what's left for the human gate (in `docs/roadmap-v1.0.md`)
Everything in D needs a browser / real device — I had neither, so these are
**flagged, not done** (the commits note each):
1. **Visual pass** — the ux-ui §6 10-item checklist. Most relevant to this session:
   Sandbox legibility after B1, the postcard render per theme (QR + mark + layout —
   the piano roll was shortened to make room; eyeball the spacing), the first-run
   nudge, the ⚄-on-phone top bar, the undo toast.
2. **Ear / device pass** — engine-swap pop gone (A3), no audio-thread degradation
   after 10 Surprise rolls (A2), modal keyboard-walk (B2), iOS no-zoom on the two
   inputs (B3), demo-riff feel (B6).
3. **QR scan test** — decode the postcard QR from a rendered card; it must equal
   `buildShareUrl()`. Auto-sizes to ~73 modules for a ~357-char URL at 100px — verify
   it scans at the size social platforms downscale to; enlarge if needed.
4. **A7 WASM rebuild** — run `npm run wasm` on a desktop with Emscripten, recommit
   `public/braids.wasm`, and record the new SHA + emcc version + eurorack commit in
   `dsp/PROVENANCE.md` (all flagged "to be pinned at next rebuild").
5. Then **tag `v1.0.0`** (subsumes the never-tagged `v0.5.0-m5`) and confirm Pages
   deploy is green.

## Deferred this session (not started — out of scope or too risky to land blind)
- **C6 Tone.js code-split** — would require pulling Tone out of GridEditor/StaffEditor
  (playhead timing) + the transport/part graph. Real risk to the audio path, and I
  can't verify audio here, so I left the 550 KB chunk warning (explicitly the
  acceptable option per code-quality §5.5). Good first follow-up on a machine with a
  browser.
- The whole "After v1.0" roadmap section (lineage breadcrumb, swing/Euclidean,
  Parallax Daily, loop export, Rings) — **do NOT start** until v1.0 is tagged.

## Watch out for
- **No browser/emcc in this environment** — every "needs eyes/ears/device/rebuild"
  item is genuinely unverified, not skipped silently; each is in Phase D above and
  in the relevant commit body.
- CI: the new `ci.yml` runs check+test+build on push/PR; `deploy.yml` now gates the
  Pages deploy on check+test too. First PR push will exercise it.
- `vite base` is `/parallax/` on build, `/` on dev. Self-hosted fonts load via
  `import.meta.env.BASE_URL` (FontFace API) for that reason — don't switch them to a
  CSS `url()` to a public asset (wouldn't get the base prefix on the project page).
