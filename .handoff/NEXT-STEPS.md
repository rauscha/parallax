# Parallax — running next steps

The single prioritized backlog. `SESSION-HANDOFF.md` is the per-session digest; **this
file persists across sessions**. The full architecture / roadmap spec lives in the plan
file: `~/.claude/plans/ok-we-re-in-planning-tingly-pike.md`.

Last reconciled: 2026-05-31 (desktop).

## Now — M2: synth control surface
- [ ] Auto-generate knobs from `ISynthEngine.getParameterSchema()` (TIMBRE / COLOR / etc.)
- [ ] Custom rotary knob component with vertical-drag interaction *(default — see below)*
- [ ] Replace the stub dropdown picker with: 4-char-code chip + prev/next steppers +
      searchable, family-grouped model list *(default — see below)*
- [ ] Spectrum view alongside the oscilloscope
- [ ] Tag `v0.3.0-m2`, push

## Soon
- [ ] Explicit eyeball of the post-M1 visual fixes (audio was confirmed this session; the
      UI was only seen in passing): Parallax branding, `audio ● READY`, theme chip
      `●`/`○` markers, flat idle scope line.

## Later milestones (per plan file — not yet broken down here)
- Sequencer + clickable 4-bar / 4/4 staff (Tone.js Transport/Part, custom SVG notation).
- MIDI file import/export · shareable URL links (lz-string → hash) · preset library (idb-keyval).
- Theme polish across all three.

## Open decisions (fold-in from PENDING-DECISIONS)
1. **M2 interaction defaults** — will build with these unless changed:
   vertical-drag rotary knobs (pro-audio standard); model picker = 4-char chip +
   prev/next + searchable family-grouped list.
2. **4-char model codes** for pictogram glyphs (`SQR-`, `SAW-`, `SYN-Q`, `SYN-W`,
   `SWx3`, `SQx3`, `TRx3`, `SWRM`) — purely cosmetic, rename freely in
   `src/data/braids-models.ts`.

## Deferred (do not quietly add)
Polyphony · Web MIDI input · audio recording/export · insert FX · Plaits / 2nd engine.

## Done recently
- **2026-05-31 (desktop):** audio sanity-listen confirmed (sounds great across families);
  dropdown focus bug fixed (`0d312e0`); Tailscale HTTPS remote-testing setup (`4d203ad`).
- **2026-05-31 (laptop, overnight):** M0 + M1 shipped (`v0.1.0-m0`, `v0.2.0-m1`);
  Macroscope → Parallax rename; colorblind-safe UI pass; scope idle flat-line fix.
