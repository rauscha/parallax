# Waiting on you

Updated 2026-05-31 (desktop). The open backlog lives in `NEXT-STEPS.md`; this file records what's been cleared and the few things that genuinely need your call or action.

## Needs your call / action
- **Move the repo out of Google Drive** (or exclude it from Drive sync). Drive is syncing `.git`, which is how the M2 work nearly got stranded and which can corrupt git history over time. Your action — I can give exact steps. *(NEXT-STEPS "Now" P0; deep review §2.1.)*
- **Knob vs slider.** M2 shipped native sliders; the vertical-drag Knob component is built but **parked** (commented out — "ate too much vertical space"). Decide: ship it in a compact form, or formally defer it (and stop calling M2 "auto-knob"). *(deep review §2.7.)*

## Resolved this session
- ✓ **M2 interaction defaults** — built and shipped: searchable family-grouped ModelPicker (4-char chip + prev/next steppers + type-to-search, matches on description text too), schema-driven auto param panel, Spectrum view + SCOPE/SPECTRUM toggle. (Knob built but parked — see above.)
- ✓ **Uncommitted M2 work** — was sitting unsaved in the working tree (synced via GDrive); type-checked clean, committed (`d6389c8`), pushed.

## Carried forward (now folded into NEXT-STEPS.md)
- The post-M1 visual fixes were absorbed into the deep-review findings (scope glow, subtle grain, contrast, dead idle scope) — see NEXT-STEPS "Now" P1.
