# Waiting on you — 2026-05-31 overnight

None of these are blocking. M0 and M1 both shipped clean and tagged on `origin/main`.

## 1. Audio sanity-check by ear

I verified visually (oscilloscope locks on the canonical CSAW notched sawtooth, FM shows the right complex two-operator waveform, 4-bit crunch shows the expected staircase quantization), but I couldn't listen. Spend 60 seconds with headphones cycling through one model per family — analog (CSAW), FM, vowel (VOWL), plucked (PLUK), drum (KICK), wavetable (WTBL), noise (NOIS). Confirm each sounds the way Braids should. If anything is off, the most likely culprits are pitch units (I'm using 1/128-semitone q7 to match the firmware) or the 96k → ctx-rate resampler.

## 2. 4-char model codes — naming sanity check

A handful of Braids' firmware display codes are pictogram-glyphs that don't transliterate cleanly to ASCII. My choices in `src/data/braids-models.ts`:
- SQR- (Square + Sub), SAW- (Sawtooth + Sub)
- SYN-Q (Square Sync), SYN-W (Sawtooth Sync)
- SWx3 (Three Saws), SQx3 (Three Squares), TRx3 (Three Triangles)
- SWRM (Saw Swarm)

Rename freely once you've spent time with the models — purely cosmetic.

## 3. (Optional) Convert SECOND_PASS — M2 prerequisites

Before M2 (the control surface) you'll want to decide:
- Which knob style: rotary visual w/ vertical-drag interaction (per plan §6.1), or vertical fader?
- 4-char model codes shown as a chip with prev/next + searchable list (planned), or a tabbed family browser?

Both are fine; the plan suggests the chip + list. I'll go with that unless you say otherwise.
