# Parallax — Originality Review

**Date:** 2026-06-11 · **Branch:** `claude/codebase-shipping-review-q5whpr` · **Lens:** what is visionary, what is new, what is done-well, what is poorly copied, what is filler.

Method: full read of `CLAUDE.md`, `README.md`, the 2026-05-31 deep review, and deep code reads of `src/audio/` (suggest, sample-analysis, engines), `src/state/` (theme, surprise, show-me, share-url), `src/ui/` (ExplainPanel, Knob, MatchPanel, PostcardModal, postcard.ts, haptics, themes), `src/notation/` (render, grid, StaffEditor), `src/viz/Oscilloscope.svelte`, the data catalogues (Braids 47, Plaits 24, Laxsynth 9), and `dsp/shim/braids_shim.cc`. One web search was run to verify the prior-art status of MI-firmware-in-browser (network was available; sources cited inline). Everything else relies on field knowledge, stated as such.

---

## 1. Verdict

**Originality grade: B+ — with one A-tier idea inside it.**

The original thing here, in one breath: **an instrument that explains itself while you play it** — a revered, context-dependent oscillator whose knobs *mean something different on every model*, wrapped in documentation that rewrites itself per model, demonstrates itself on command ("Show me" sweeps the knob while the scope and the prose move together), wears a different physical identity per engine, and can even listen to a song and suggest where to start. The WASM-port conceit that the project's own docs treat as the defining bet is real, hard, and well executed — but it is *not* unprecedented, and the project should stop believing it is. The actual invention is the loop around it: **docs-as-the-product**, one curated data spine (the model catalogue) powering the explain panel, the picker search, the sound-match ranker, and the postcard. That synthesis has no real precedent I can name. The grade is B+ rather than A because the flagship technical claim is prior-arted, two or three features copy a known pattern while missing the thing that made the original work, and the most derivative theme is the one that ships under the project's most specific claim ("SNES-inspired").

---

## 2. The five-tier ladder

### VISIONARY

**1. The self-explaining instrument loop (ExplainPanel + "Show me" + knob↔card link + scope).**
`src/ui/ExplainPanel.svelte`, `src/state/show-me.ts`, `src/ui/Knob.svelte`, `src/data/braids-models.ts`.
Prior art exists for every *ingredient*: Ableton's Learning Synths teaches synthesis with live widgets; plugin tooltips describe knobs; the Braids manual is a static table. But Learning Synths teaches *generic* synthesis — one filter, one envelope, forever. Nothing I know of teaches the specific, maddening truth of a macro-oscillator: that TIMBRE means "notch width" on CSAW and "folding strength" on FOLD and "preset index" on a DX7 bank. Parallax makes that the *center of the product*: per-model prose with live % readouts mirroring the patch, a hover/drag channel that lights the matching card when you touch the knob (and vice versa), and a "Show me" button that performs a choreographed original→min→max→original sweep through the *store* (so the knob animates and the engine sounds for free), with genuinely careful interrupt semantics (user grab wins, engine swap bails, blur restores). The implementation in `show-me.ts` — eased three-leg path with the min→max "reveal" as the long leg, demo-note ownership detection, watcher that distinguishes its own writes from the user's — is the kind of detail that separates a demo from an instrument. This is the one idea in the codebase with no real precedent as a *product center*, and the seven-reviewer May deep review reached the same conclusion independently. It has since actually shipped, which matters: in May it was a thesis; today it's running code.

The same spine quietly produces a second original move nobody planned as a feature: **the documentation is the database.** The model picker searches the explain prose ("type a vibe, find a model"), and `suggest.ts` literally ranks models by keyword-matching detected audio features against `description + listenFor + goodFor`. The teaching corpus *is* the search index *is* the recommender. That's a genuinely elegant synthesis.

### NEW

**2. Engine-driven theming — the engine is a persona, and the whole app reskins.**
`src/state/theme.ts`, `src/ui/themes/tokens.css`.
Picking Braids doesn't just swap DSP; it turns the entire application into a phosphor CRT instrument — typography, label casing, scope persistence/bloom physics (`--scope-persist: 0.92`, `--scope-bloom: 1.7`), scanlines, vignette, the mobile status-bar color. Plaits turns it into a warm TE-style object; Laxsynth into a console. Prior art is adjacent but not equal: Arturia's V Collection gives each emulation its own skin, but those are separate plugin GUIs, not one host whose *chrome* shapeshifts; DAWs swap device panels inside an unchanging shell. The closest mental model is "the cartridge recolors the console," and I can't name anyone who's done it. It's also a *discipline*: there is deliberately no manual theme switcher, which keeps the identity claim honest (voice = body). Not quite visionary — it's an aesthetic binding, not a new capability — but it's the most distinctive *decision* in the app and the hardest to clone tastefully.

**3. "Match a sound" — load a song, loop a region, get pointed at a model.**
`src/audio/sample-analysis.ts`, `src/audio/suggest.ts`, `src/ui/MatchPanel.svelte`.
Named prior art towers over this: **Sonic Charge Synplant 2's Genopatch** grows actual patches from audio via ML and will out-result this heuristic every single time. But Genopatch is a $150 plugin doing resynthesis; this is a different animal in a different medium: deterministic, explainable DSP (normalized autocorrelation with parabolic refinement, Hann-windowed spectral centroid, RMS envelope → plucky/evolving/sustained) feeding a transparent scorer over 80 models across three engines, with a *dual-spectrum A/B compare* and macro knobs right there so your ear closes the loop the algorithm only opens. The code is admirably honest about this ("a heuristic starting point, NOT an optimizer"), and the pure/browser split (`rankModels` runs under plain node) is craft. In the web-toy medium — Chrome Music Lab, Learning Synths, pink.trombone — nothing does "hold your song up to the instrument." Placed NEW for the medium and the compare-refine loop; it would be DONE-AND-OUTCLASSED if it pretended to be Genopatch, which it explicitly doesn't.

**4. A real engraved staff as a synth toy's input surface.**
`src/notation/render.ts`, `StaffEditor.svelte`.
Notation editors exist (MuseScore, Noteflight, Flat); toy sequencers exist (Mario Paint, Song Maker). The *pairing* — Bravura SMuFL glyphs, staff-space coordinate math, key signatures that widen the header "exactly as in real engraving," engraving weights pulled from `bravura_metadata.json`, 8vb clef swap, rest-filling of silent gaps — as the melody input for a Eurorack macro-oscillator is a combination I've not seen. Chrome Music Lab's Song Maker deliberately *avoided* notation to lower the floor; Parallax bets the opposite way (snap-to-scale keeps the floor low anyway) and backs it with real engraving craft rather than clip-art noteheads. New in combination; the execution would stand in a notation tool, which is the bar.

**5. Laxsynth — and the radical honesty of its docs.**
`src/data/laxsynth-models.ts`.
A clean-room single-cycle wavetable voice in the Dirtywave M8 WavSynth *class* (not a port — correctly, since M8 is closed-source). The engine itself is modest. What's quietly original is the catalogue's voice: *"Mirror — does almost nothing here… Use it on PULSE for real PWM"* and *"Warp — little effect; noise bypasses the wavetable. Reach for SIZE and the filter."* Instrument documentation that tells you a knob is useless on this model is nearly unheard of — manuals oversell, plugins stay silent. It's the explain-panel thesis taken to its logical, slightly subversive end, and it builds exactly the trust the whole app trades on.

### DONE-BUT-DONE-WELL

**6. The real-firmware-in-browser conceit.** *(The harsh re-grade.)*
Project docs frame this as the visionary bet. It is the project's hardest and best engineering — and it has prior art. [`@vectorsize/woscillators` on npm](https://www.npmjs.com/package/@vectorsize/woscillators) is precisely "Mutable Plaits compiled from C++ to WASM, consumed via an AudioWorklet"; [Volker Böhm has shipped MI ports to Max/MSP since 2020](https://vboehm.net/2020/02/mutable-instruments-max-port/); Audible Instruments (the official open-source MI ports) has been in VCV Rack for years, and Cardinal's Emscripten build has put that whole ecosystem in a browser tab. So: not new. What earns DONE-WELL — comfortably — is the *execution standard*: rendering at the firmware's native 96 kHz and resampling (not lying about the rate), porting the internal AD envelope and the lo-fi chain in firmware order after the May review caught the deviations (the shim header now mirrors `braids.cc:RenderBlock` stage-for-stage), an allocation-free `process()`, three engines behind one pure `ISynthEngine` with zero Braids strings leaking past `data/` and `engines/`, and scrupulous MIT attribution with explicit trademark hygiene. Most WASM ports are tech demos that prove the sound exists; this is a port that was *audited against the firmware* and then productized. That's the right way to do a done-before thing. But the README's framing should internalize this: the port is table stakes for the real idea, not the idea.

**7. The oscilloscope with personality.** `src/viz/Oscilloscope.svelte`.
Scopes are everywhere — Korg minilogue's per-patch scope, every Webamp/Winamp visualizer, the entire CRT-shader cottage industry. This one earns its tier: hysteresis-armed zero-cross triggering with sub-sample interpolation (most toy scopes just draw the buffer and shimmer), per-theme *physics* via tokens (persistence, bloom multiplier, trace weight — the SNES theme gets a crisp vector trace, Phosphor gets heavy blur and a vignette), a breathing idle line that's alpha-only so it can't read as signal, a beam dot on a 6-second sweep, a boot sweep timed to outlast the A440 unlock chime, and `prefers-reduced-motion` gating throughout. The May review called the resting scope a dead flat line and the glow fake; both were fixed properly, not minimally. The scope isn't a novel idea; it's a *characterful* one, which is what the tier is for.

**8. The knob detent + haptic language.** `src/ui/Knob.svelte`, `src/ui/haptics.ts`.
Prior art: hardware center detents, double-click-to-default in every DAW, Elektron's click encoders. The web translation here is genuinely better than the norm: a *magnetic* detent at factory default with catch/release hysteresis (±2.5% to catch, ±5% to escape — so it can't chatter), an 8 ms vibration tick *only on catch*, pre-held detection so grabbing a knob at default doesn't spuriously buzz, and RAF-coalesced commits so dragging can't flood the audio thread. That's a complete tactile sentence — feel, sound, restraint — in ~30 lines of detent logic. Small, derivative in concept, excellent in execution.

**9. Phosphor theme.** Green-CRT is among the most-done aesthetics alive (cool-retro-term, Fallout's Pip-Boy, every hacker-movie UI). Executed with restraint and *system depth*: it's not a skin painted on top, it reaches into scope persistence, type stack (all-mono), label casing, scanline overlay gated to this theme only, and the vignette that "sells the curved glass." Stands beside its prior art.

**10. Sandbox theme.** Teenage Engineering homage, and knows it (warm putty body, hot orange, lowercase labels). The craft detail that lifts it: a split between `--signal` (display orange, graphics-only) and `--signal-ink` (an AA-safe rust for body text) — accessibility-driven color engineering most homages never do. It remains the most *borrowed* identity in the app; it's homage done with discipline, which is the ceiling for homage.

**11. The grid sequencer.** `src/notation/grid.ts`, `GridEditor.svelte`.
Song Maker / Learning Music territory, competently done (fold-to-scale with chromatic escape hatch, root-row tinting, per-note entry haptics + audition). One function elevates it above the genre: `remapByDegree` — changing key/scale re-maps the melody *preserving scale degree*, with chromatic outliers left untouched. Most toy sequencers either transpose dumbly or clear the grid; this is a music-theory-literate touch.

**12. "Surprise me" — the parameter half.** `src/state/surprise.ts`.
Randomizers are a genre (SFXR's "randomize," Synplant's whole thesis, VCV's module randomize). Two fresh inflections: it rolls the *entire identity* — engine, therefore theme, therefore the whole visual instrument — in one tap, which no randomizer I know does; and the clamps are musical, not uniform (gain never silent or blasting, attack capped at 30% of range, drift/signature halved "so a roll stays fun"). That's somebody who has been burned by naive randomizers. (The melody half is another story — see §3.)

**13. Share URLs.** `src/state/share-url.ts`. The tixy.land / Shadertoy / mermaid.live convention: state → lz-string → `location.hash`. Executed to spec with validation against hand-edited input, `replaceState` instead of history spam, and a clean pure/DOM split. Zero novelty, zero shame.

**14. The model catalogue prose itself.** 750+ lines across 80 models, cross-referenced against firmware enums and the official manuals, in a consistent "listen for / good for" teaching voice with real ear-level references ("that Vangelis CS-80 character," "automate COLOR for the signature rising-formant scream"). As *writing*, it's derivative of the manuals by design; as *curation into a machine-usable teaching corpus*, it is the single most defensible asset in the repository.

### DONE-AND-POORLY-COPIED

**15. The patch postcard.** `src/ui/postcard.ts`, `PostcardModal.svelte`.
The pattern being copied is the Wordle share card / Spotify Wrapped artifact, and the copy misses the *mechanism* that made the original work — twice.
- **The loop is severed.** Wordle's card works because the artifact *is* the invitation: see it, click through, play. Parallax's postcard is a dead-end PNG — it contains no share URL, no QR code, and is not wired to `buildShareUrl()` at all (the share link is a separate toolbar feature; grep confirms the two never touch). The recipient of a Parallax postcard **cannot hear the sound**. For a synthesizer, that's the entire point lost. Download and clipboard-copy are the only exits; there isn't even a `navigator.share` path on mobile, where postcards would actually circulate.
- **It dropped its own best idea.** The May review and the original M5 plan describe the postcard as "a shareable image *of its own waveform*" — the scope trace as the artifact. The shipped card draws knob dials and a piano roll: information, not evocation. The one image this app generates that nobody else can — *this sound's* phosphor trace in *this engine's* theme — is missing from its own postcard.
- Small but telling: the footer mark is the generic Unicode `◐` that the May review flagged and the favicon work replaced — re-introduced here, eight lines below code that correctly draws the bespoke scope-wave mark in the header.
The rendering itself is clean, deterministic, theme-correct. But as a *share loop* it's a brochure where the original was a doorbell. Fuse it with the share URL (QR in the corner, `navigator.share` with both image and link) and draw the trace, and it jumps two tiers.

**16. The Lab / "SNES-inspired" theme.**
Judged separately from its two siblings, it doesn't cash the check its name writes. The tokens describe "neutral grey console body (just a whisper of lavender)" — accurate, and that's the problem: grey-with-a-whisper plus teal signal plus warm gold is a tasteful *generic dark dashboard*, indistinguishable from a hundred dev-tool themes. Nothing in it says Super Nintendo: no purple-pair button language, no pastel ABXY accent logic, no playful weight anywhere. Phosphor commits to its reference and Sandbox commits to its reference; Lab gestures at one. Compare The Pudding's or Polyphonic-era SNES homages, or even VCV panel art that nails console identity. As the *default face of the only original engine* (Laxsynth — the one thing here that isn't a port), the blandest theme is attached to the boldest engineering claim. Either commit to the SNES (it pairs naturally with Laxsynth's chiptune-leaning shapes and LFSR noise) or rename the intent.

**17. "Surprise me" — the melody half.** `randomizeMelody` in `src/notation/grid.ts`.
The prior art being copied (SFXR/BFXR rolls, Mario Paint's chaos, Song Maker doodles) is loved because the output is *instantly usable* — that's the whole magic. This generator picks a uniformly random pitch across two full octaves every quarter note, with 30% rests, quarter notes only. Uniform-random pitch with no contour, no step/leap bias, no phrase repetition, and no cadence produces melodic word salad; the fifty-year-old folklore of toy generative music (random walks, weighted scale degrees, end-on-root) exists precisely because of this. The parameter half of Surprise Me shows the author *knows* naive randomness isn't fun — gain is clamped, attack is tamed — but the melody got the naive version. A 20-line random-walk with a root-biased final note would close the gap.

### TRASH

Almost nothing — and that's earned, not graded on a curve. Specific acquittals: the Spectrum view is utilitarian analyser bars, but it's load-bearing for Match's dual-spectrum compare, so it's infrastructure, not filler. PWA install, preset library, MIDI file I/O, Web MIDI input are table-stakes plumbing that never pretend to be invention. The May review's actual trash (the off-brand `icons.svg` social sprite) is gone. The one item I'll leave on the curb: the **`◐` glyph in the postcard footer** — a generic Unicode placeholder standing where the bespoke mark belongs, in the single artifact designed to represent the app to strangers. It's one character of brand entropy, already flagged once in a prior review, and the app would be better with it deleted today.

---

## 3. What only Parallax does — lean into it

1. **The explain loop is the product. Finish the loop.** "Show me" should fire automatically (or be one keystroke away) on *model change* — cycling 47 models is the joy of Braids, and every switch is a teachable moment the app currently leaves silent. The deep review's "self-teaching sweep" instinct was right; it's shipped for knobs — extend it to the moment of model arrival.
2. **One data spine, four organs.** The catalogue already powers explain, vibe-search, and the suggest ranker. Make that an explicit, advertised identity: "the instrument's manual is its brain." Every future feature (better suggestions, a guided tour, postcard captions) should draw from the same table. No clone gets this without rewriting 80 models' worth of faithful, ear-checked prose.
3. **Engine-as-persona, harder.** The theming bind is the most distinctive decision here. Push it past color: per-engine idle-scope behavior, per-engine boot chime, per-engine knob feel (Phosphor could detent coarser, like old test gear). The deeper the persona, the less copyable the whole.
4. **Repair the postcard into the share loop's keystone.** Trace + theme + QR/URL + `navigator.share`. The day a Parallax postcard can be *heard* by tapping it, this app has a Wordle-grade loop that none of the web-audio toys (Chrome Music Lab included) ever built.

## 4. Originality risks

**Clonable in a weekend:** all three themes (CSS tokens), the scope's character (one canvas file), the randomizer, share URLs, the postcard renderer. None of these should be mistaken for moat.

**Clonable in a month by a motivated dev:** the WASM ports themselves — `@vectorsize/woscillators` already ships Plaits-in-a-worklet on npm, and Emscripten recipes for MI code are public folklore via VCV/Cardinal. Expect "MI in the browser" to be fully commoditized within two years; do not let marketing rest on it.

**Defensible:** (a) the curated, firmware-faithful, ear-checked 80-model teaching corpus — LLMs can imitate the voice but not the *verification*, and a wrong knob description in this genre is instantly fatal to trust; (b) the explain/show-me interaction grammar with its store-mediated sweep and interrupt semantics — copyable in form, but the taste is in fifty small decisions (the 18/70/12 sweep legs, detent hysteresis ratios, alpha-only idle breathing) that a clone gets wrong by default; (c) the engine-persona bind as a *brand*, provided it deepens.

**What will look derivative in two years:** the CRT and TE skins, as retro-terminal fatigue compounds; heuristic sound-matching, as Genopatch-style ML lands in free tools. What won't: an instrument that tells you the truth about its own knobs. Nobody else is even trying.

---

*Prior-art sources verified this session:* [@vectorsize/woscillators (npm)](https://www.npmjs.com/package/@vectorsize/woscillators) · [Volker Böhm — Mutable Instruments Max port](https://vboehm.net/2020/02/mutable-instruments-max-port/) · [CDM on MI's free VCV ports](https://cdm.link/mutable-instruments-braids-plaits-videos/) · [Official Braids](https://pichenettes.github.io/mutable-instruments-documentation/modules/braids/) / [Plaits manuals](https://pichenettes.github.io/mutable-instruments-documentation/modules/plaits/manual/). Other named prior art (Learning Synths, Synplant 2 Genopatch, Song Maker, SFXR, Cardinal web build, minilogue scope, Wordle share cards) is from field knowledge and flagged as such where load-bearing.

*Review only — no source files modified; the only write is this document.*
