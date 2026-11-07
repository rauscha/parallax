# Heads-up from tend: two FM patches, not applied here

From a tend session, 2026-11-07. Andrew asked for this as a note only, so nothing in Parallax has changed. Whether and how to use these is for a Parallax session to decide.

tend plays Parallax's FM polyphonically, and slides moving voices between chords. That needed two changes. tend carries them in its own build (`engines/fm/` in `rauscha/tend`) and loads Parallax at `0c4da8f` untouched. Both are code patches. They change no voice's algorithm, ratios or levels.

## `wide-bend.patch`: pitch bend past ±3 semitones
The ±3 limit isn't in msfa. `Dx7Note::compute` only scales the value, 8192 units to 3 semitones, and never limits it. The clamp is in `fm_set_pitch_bend` and on the worklet's `bend` parameter. Both now allow ±48. The comment in `fm_shim.cc` saying the vendored constant would need to change was wrong, and `FmEngine.ts` carries the same assumption in its comment and `FM_BEND_RANGE`.

Measured through the real worklet: slides of up to 3 octaves land within 15 cents, up and down.

## `revive.patch`: lift a faded note without a strike
A bend doesn't reopen an envelope, so on a sound with a fast decay and low sustain, a late slide is close to silent. This adds `Env::revive`, `Dx7Note::revive`, `fm_revive(db)`, and a `revive` message on the worklet. An operator more than `db` below its highest stage climbs back to that point at its own attack rate, then decays from there. Oscillator phases carry on. An operator that hasn't faded that far doesn't change.

It would be a fifth local patch to msfa, after the four in `dsp/vendor/msfa/README.md`.

After a 2-second hold, against the note's early level: Tine Piano goes from −24 dB to −6.8 dB at `db = 12`, where a full strike reaches −0.5 dB.

## What's been checked
- At `0c4da8f`, building Parallax's source with `emscripten/emsdk:5.0.7` reproduces `public/fm.wasm` and `fm.js` byte for byte, so that image is a sound way to rebuild on Linux. The recipe is `engines/fm/build.sh` in tend.
- With both patches and no bend or revive, the output matches Parallax's binary sample for sample. `src/voices/fm-bend.test.ts` in tend checks that.

## If you do apply them
- Apply from the repo root in this order: `git apply .handoff/from-tend-2026-11-07/wide-bend.patch`, then `revive.patch`.
- Add `_fm_revive` to `EXPORTED_FUNCTIONS` in `dsp/shim/build-fm.ps1`.
- Rebuild, re-pin the hashes in `dsp/PROVENANCE.md`, and update `FM_BEND_RANGE` and the comment in `FmEngine.ts`.
- Add it to the list in `dsp/vendor/msfa/README.md`.
- The bend scale moves from 8191/3 to 8192/3 units per semitone, which isn't audible, but `fm-wasm.test.ts` and anything comparing bent output exactly should be rerun.
- Not tested in Parallax's own UI, or against the flowsheet's taps.
