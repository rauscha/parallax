# Waiting on you

Updated 2026-06-01 (desktop, morning hand-off after overnight P1 batch). The open backlog lives in `NEXT-STEPS.md`; this file records what's been cleared and the few things that genuinely need your call or action.

## Needs your call / action

- **Browser eyeball pass on the v0.3.0-m2 polish gate.** All three P1s + bundled hygiene shipped overnight; visual verification is the gate before tagging. Punch-list (5 min):
  - Every theme: small labels are now comfortably readable (region/family/group/model-index).
  - K.O.: model code pill + octave indicator + TapToStart title use the new rust orange (5.3:1).
  - Knob drag is smooth, no audible click on release.
  - Picker: Tab → search → ArrowDown shows highlight → Enter picks. ◀/▶ pulses the code pill.
  - Phone/touch-sim: bottom NoteStrip plays; SCOPE/SPECTRUM buttons fingertip-sized.
  - Scope: baseline breathes at idle; scan line sweeps L→R on first audio unlock; real bloom on the trace under signal.
  - Grain just barely visible on Lab + K.O.; absent on Phosphor.
- **Then tag + push:** `git tag v0.3.0-m2; git push origin v0.3.0-m2` (auto-deploys live).
- **Central stores wiring (Soon-tier refactor).** Defined in `src/state/stores.ts` but unwired — ModelPicker + ParamPanel keep local copies. Deferred overnight because it's the first move of M3 and touches multiple files at once; better as a focused daylight chunk. **Recommendation:** do this before M3 sequencer work begins so undo/presets/share-URLs "fall out for free" as the deep review promised.
- **Security hygiene (Soon-tier).** CSP `<meta http-equiv>` policy + self-host the three fonts. Both have small judgement calls (CSP directives to allow, which font weights to bundle, licence terms). Deferred overnight to keep them out of an unattended run. **Not urgent** — `npm audit` clean, no secrets in history.
- **AD envelope per-model wiring (M4).** Shim setters + worklet message types plumbed; per-model defaults need to live in `data/braids-models.ts` read at `noteOn` in `BraidsEngine`. Lives with M4 because the metadata is needed for the explain panel anyway. Don't auto-enable for all models — sustained tones would auto-decay to silence.

## Resolved this session (overnight 2026-06-01)

- ✓ **`--text-dim` contrast in all three themes** — bumped to 4.5:1+ (commit `8e844b3`).
- ✓ **K.O. orange contrast** — added `--signal-ink` rust token + applied to body text uses (commit `8e844b3`).
- ✓ **Knob postMessage flood** — RAF-coalesced; force-flush on pointerup (commit `f6c0bdf`).
- ✓ **ModelPicker keyboard nav** — arrows/Enter/Escape, auto-scroll, focus-scoped to search + items (commits `a64663a`, `efb8a7c`).
- ✓ **Touch targets ≥44px** — picker steppers/items + SCOPE/SPECTRUM viz-toggle via `@media(pointer:coarse)` (commits `a64663a`, `00286f8`).
- ✓ **Spring on model change** — code pill pulses 320 ms with the previously-unused `--t-spring` token (commit `a64663a`).
- ✓ **Interim mobile note strip** — 12 chips + octave shift, multitouch-correct, blur/visibility-safe (commit `00286f8`).
- ✓ **Scope hero glow** — real gated `shadowBlur` bloom + breathing idle + boot sweep + DC clamp + single-pass peak/trigger walk (commit `0d54a51`).
- ✓ **Subtle grain overlay** — SVG fractal noise on Lab + K.O., scanlines remain Phosphor's texture (commit `710501e`).
- ✓ **Dead `public/icons.svg`** — deleted (commit `557ee4e`).
- ✓ **Init-failure leak** — `useEngine` wraps `init()` in try/catch and disposes the partial engine (commit `557ee4e`).
