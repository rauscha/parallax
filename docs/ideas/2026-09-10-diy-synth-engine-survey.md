# DIY-synth database — engine-candidate survey

**Created:** 2026-09-10 · **Status:** research note, nothing approved · **Source:** the DIY Synths Database
(<https://diy-synths.snnkv.com>, 94 entries as of 2026-06-27), read from its own repo
[`Atarity/diy-synths`](https://github.com/Atarity/diy-synths) because the site is blocked by this session's egress proxy.

Andrew's ask: Rings feels like a *module in a rack* rather than an instrument (fair — it is literally a resonator
with no exciter of its own). Leave it shipped, but find the next engine somewhere more fun. This is the triage.

---

## The two gates every candidate has to pass

**Gate 1 — licence.** Parallax is MIT and the DSP is vendored into this repo. A GPL core makes the whole app GPL;
an NC (NonCommercial) core makes it undistributable on the terms we ship under; a CC BY-SA core is share-alike and
was never meant for software. This kills most of the database, and it is the *first* thing to check, not the last.

**Gate 2 — shape.** The Parallax engine contract (locked): monophonic, MIDI-note-in → audio-out, no external audio
input, no insert FX. And the actual product is the **explain loop** — a discrete *model axis* with per-model macro-knob
prose. Braids has 47 models, Plaits ~16, Rings 12. A synth with one voice architecture and forty knobs gives the
Explain panel nothing to say. Most DIY projects are **whole instruments** (their own sequencer, arp, screen, FX) —
porting one means hosting a second app inside Parallax, not adding an engine.

Everything below was licence-checked by reading the actual repo, not by guessing.

---

## Verified licence findings

| Project | Licence (read from repo) | Verdict |
|---|---|---|
| **Plinky** | Software **MIT** (hardware CERN-OHL-P, art CC BY-SA) | ✅ clean |
| **MiniDexed** | **GPL-3.0** | ❌ — but see §Tier 2 |
| **PreenFM 2** | **GPL-3.0** (per-file headers) | ❌ |
| **NESizer2** | **GPL-3.0** | ❌ |
| **YM2149 Synth** | **GPL-3.0** | ❌ |
| **Overcycler** | **GPL-3.0** | ❌ |
| **Zeptocore** (`schollz/_core`) | **GPL-3.0** | ❌ |
| **Polykit X1** | GPL-3.0 (stated in README) | ❌ |
| **Wirehead Freaq FM** | **CC BY-NC-SA 4.0** | ❌ NonCommercial |
| **Wirehead Mutant** | **CC BY-NC-SA 4.0** | ❌ NonCommercial |
| **Multi** (pangrus) | **CC BY-NC-SA 3.0** | ❌ NonCommercial |
| **ArduTouch** | **CC BY-SA 3.0** | ❌ share-alike |
| **NTH synth** | CC BY / BY-SA 3.0 (licence text and URL disagree) | ❌ ambiguous + share-alike |
| *(off-list)* **msfa** — `google/music-synthesizer-for-android` | **Apache-2.0** | ✅ clean, MIT-compatible with notice |

---

## Tier 1 — the one that actually passes both gates, with a caveat

### Plinky — *solid*
8-voice touch synth by mmalex. Software is **MIT**. The decisive fact: **the author already ships an Emscripten
build.** `sw/Core/Src/` contains `wasmbuild.sh`, a committed `plinky.wasm`, `plinky.js` and a `wasm.html` demo page
driven by pressure/position sliders. There is also a full desktop emulator (`sw/emu`, imgui + portaudio), so the DSP
is already proven to build off-target. Compared with Braids/Plaits/Rings — where we wrote the shim, the build script
and the worklet from scratch — this is the cheapest port on the board by a wide margin.

The build line, verbatim:
```
emcc -DEMU -DWASM gfx.c plinky.c -O0 -g -s WASM=1 -s INITIAL_MEMORY=67108864 -o plinky.js \
     -s ENVIRONMENT=web -s EXPORT_NAME="Module" -s MODULARIZE=0
```

**The caveat, and it is not small.** Plinky is a *whole instrument*: `params_new.h` shows the parameter space is
oscillator + two envelopes + delay + reverb + **arp + sequencer + sampler + latch + swing**. It has no model axis at
all — one voice architecture, ~48 params in 8 groups. And it's 8-voice polyphonic *by design*: its whole character is
stacked, detuned, pressure-swelled chords. Pinning it to mono to satisfy our locked contract throws away the reason
anyone likes Plinky, and its arp/seq would fight our staff editor.

**Plausible salvage:** port only the voice core (the oscillator + resonant filter + the string/pluck path), skip
`gfx.c`/UI/arp/seq/FX, and author the Explain corpus ourselves around its params rather than a model list. That is a
real port, not a free one — but it starts from code that is already known to compile under emcc.

---

## Tier 2 — right shape, wrong licence, with one clean route around

### PreenFM 2 — *solid analysis, blocked*
6-operator FM, **28 algorithms** — that is a genuine model axis, exactly the Braids-shaped thing the Explain panel
wants. Pure digital, so nothing analog to fake. Mono-able. Architecturally it is the best fit in the entire database.
**GPL-3.0 per-file headers → hard stop** unless Parallax relicenses, which contradicts a locked decision.

### MiniDexed → port **msfa** instead — *solid, and my recommendation*
MiniDexed itself is GPL-3.0. But it is a Raspberry-Pi *wrapper* around the Dexed/`Synth_Dexed` lineage, and the actual
DX7 engine at the bottom of that lineage is Raph Levien's **msfa** (`google/music-synthesizer-for-android`), which is
**Apache-2.0** — MIT-compatible with attribution. Its DSP files are self-contained and Android-free:
`fm_core.cc`, `fm_op_kernel.cc`, `dx7note.cc`, `patch.cc`, `env.cc`, `pitchenv.cc`, `lfo.cc`, `freqlut.cc`, `sin.cc`,
`exp2.cc`, `log2.cc`. That is a complete 6-op DX7 voice, ~10 small translation units — comparable in size to the
Braids shim we already did.

Why it's the best candidate:
- **Model axis for free:** DX7 algorithms 1–32, and beyond that the factory cartridge voices (E.PIANO 1, TUB BELLS,
  BRASS 1 …) — a corpus larger than Braids', with decades of documentation to write honest prose from.
- **Mono is native.** A DX7 voice is a voice; `dx7note.cc` is literally one note.
- **Adds a category nothing else covers.** Braids/Plaits = macro-oscillator, Rings = resonator. FM is the gap.
- **It doubles as the substrate for the FM flowsheet teacher** (see `2026-09-10-fm-flowsheet-teacher.md`) — the
  operator graph, ratios, feedback and per-operator output are all addressable inside `fm_core.cc`.

Honest counterpoint: it is *not strictly an entry on the DIY list* — it's the engine the DIY entry is built out of.
If the goal is "build something from that page", this is a technicality; if the goal is a great engine #5, it wins.

---

## Tier 3 — fun, small, teachable, licence-blocked

Listed because they'd be genuinely good if the licences were different, not because they're actionable.

- **Wirehead Freaq FM** — 2-operator 8-bit FM in Volca form. Tiny codebase, and 2-op is the *ideal* FM teaching
  object. CC BY-NC-SA 4.0 → no.
- **NESizer2 / YM2149 Synth / Mega MIDI** — real chip voices (2A03, AY-3-8910, YM2612). Superb explain-loop material
  ("here is what a 4-bit volume envelope actually sounds like"). All GPL-family. *Plausible workaround, unverified:*
  clean-room chip emulators exist under permissive terms, but I have not checked their licences — that would be a
  separate investigation, and it would be emulating a chip, not porting a DIY project.

---

## Explicit no — and why (so this doesn't get re-litigated)

- **Drum machines** (Nava, Yocto, DrumKid, Lunchbeat, Polaron, Nano minipops, MIDIvampire II, Fasma) — no pitched
  note-in contract. They'd break the staff editor, which is the front half of the app.
- **Analog designs** (MFOS Sound Lab / Noise Toaster / Echo Rockit, x0xb0x, Hog, Moduleur, Lil' mono, Keep, POLY555,
  NoiseLab, Totoro, Paper Bits) — there is no firmware to port. You'd be *circuit-modelling*, which is a different and
  much larger project than any port we've done. This is the single biggest category on the list and it is all out.
- **Sampler / manglers** (Zeptocore, Pikocore, Nyblcore, WTPA2, SC1000, Wee Noise Maker) — need audio input or a
  sample corpus; violates the locked no-audio-in rule.
- **Controllers & sequencers** (Faderbank 16n, N32B, OpenDeck, Ottopot, Matrix sequencer, Arpie, Grandbot, Le Strum,
  PicoStepSeq, Spires) — no voice to port.
- **Whole computers / DAWs** (Norns shield, Zynthian, OTTO, LMN-3, PicoTracker, Portable synth) — out of scope by
  definition.
- **NSynth Super** — a neural wavetable; needs a model far too large to ship on Pages, and the interesting part is
  the dataset, not the code.
- **Chaos / noise** (Hypjolin, Yowler, Noisferatu, Protean, Quantum DJ, Beam Catcher, Hidden Sound Explorer) — no
  stable pitch mapping; a note number means nothing to them.
- **Ambika / Shruthi / Anushri** — Mutable again, and the *point* of all three is the swappable analog filter board,
  which is the part we can't port. Three Mutable engines already shipped; diminishing returns on identity.

---

## Recommendation

1. **Engine #5 = 6-op FM via msfa (Apache-2.0).** Best shape fit, largest ready-made model corpus, fills the one
   sonic category Parallax lacks, and shares a substrate with the FM-teacher idea. Not literally a DIY-list entry.
2. **If it must come from the list: Plinky voice-core (MIT).** Cheapest technically — emcc build already exists —
   but needs a hand-authored Explain corpus and loses its polyphonic soul under our mono rule.
3. **Everything else on that page is blocked on licence, blocked on shape, or is an analog circuit.** That is the
   honest state of it: the database is a *hardware-builder's* list, and hardware-builder projects are mostly whole
   instruments and mostly copyleft.

Nothing here is approved. No engine work should start without a design spec and Andrew's sign-off, per the
Braids/Plaits/Rings precedent.
