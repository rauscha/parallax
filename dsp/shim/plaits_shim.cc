// Parallax — extern "C" shim around plaits::Voice.
//
// Compiled by Emscripten into a WASM module that the AudioWorklet loads.
// The shim itself is original code (MIT). It wraps Émilie Gillet's MIT Plaits
// firmware unchanged. See ../../LICENSE-Braids.txt for the vendored attribution.
//
// --- How we drive Plaits ----------------------------------------------------
// Plaits is a self-contained voice: pick an `engine` (0..23), set the three
// macro knobs (HARMONICS / TIMBRE / MORPH), a per-note pitch, and a DECAY +
// LPG-COLOUR pair that shape its built-in low-pass gate. There's no explicit
// noteOn/noteOff — instead Voice::Render reads a `Modulations` struct each
// block with a TRIGGER (gate edge) and a LEVEL (VCA).
//
// We treat it like a MIDI voice by marking BOTH trigger and level "patched":
//   - rising TRIGGER edge  → strike (engines' attack + internal AD envelope)
//   - LEVEL held high       → the low-pass gate sustains the note
//   - LEVEL → 0 (note off)  → the gate closes with DECAY's release tail
// Self-enveloped engines (the drums) ignore the gate and ring out their own
// one-shot — Plaits handles that internally via `already_enveloped`, so there's
// no per-model "let ring" flag to maintain here.
//
// --- Block size is load-bearing --------------------------------------------
// Voice::Render advances its trigger delay-line + decay envelope ONCE per call,
// using the kBlockSize (12) constant for timing. So we MUST call it with
// exactly kBlockSize samples per block, or the envelopes run at the wrong rate.
// Native sample rate is 48 kHz; the worklet resamples to the context rate.

#include <cstdint>
#include <cstring>
#include <emscripten.h>

#include "stmlib/utils/random.h"
#include "stmlib/utils/buffer_allocator.h"
#include "plaits/dsp/voice.h"

using namespace plaits;

namespace {

Voice       g_voice;
Patch       g_patch;
Modulations g_mod;

// Shared RAM for every engine — matches the firmware's `char shared_buffer[16384]`
// (plaits.cc) and the unit tests. Voice::Init calls allocator->Free() before each
// engine's Init(), so all engines reuse this same block; 16 KB fits the largest.
char        g_ram[16384];

bool        g_inited = false;

}  // namespace

extern "C" {

EMSCRIPTEN_KEEPALIVE
void plaits_init(uint32_t seed) {
  stmlib::Random::Seed(seed ? seed : 0x12345678u);

  stmlib::BufferAllocator allocator(g_ram, sizeof(g_ram));
  g_voice.Init(&allocator);

  memset(&g_patch, 0, sizeof(g_patch));
  memset(&g_mod, 0, sizeof(g_mod));

  g_patch.engine = 0;
  g_patch.note = 48.0f;
  g_patch.harmonics = 0.5f;
  g_patch.timbre = 0.5f;
  g_patch.morph = 0.5f;
  g_patch.frequency_modulation_amount = 0.0f;
  g_patch.timbre_modulation_amount = 0.0f;
  g_patch.morph_modulation_amount = 0.0f;
  g_patch.decay = 0.5f;
  g_patch.lpg_colour = 0.5f;

  // MIDI-voice wiring: both gate and VCA are externally driven (see header).
  g_mod.trigger_patched = true;
  g_mod.level_patched = true;
  g_mod.trigger = 0.0f;
  g_mod.level = 0.0f;

  g_inited = true;
}

EMSCRIPTEN_KEEPALIVE
void plaits_set_engine(int e) {
  if (e < 0) e = 0;
  if (e > kMaxEngines - 1) e = kMaxEngines - 1;
  g_patch.engine = e;
}

EMSCRIPTEN_KEEPALIVE void plaits_set_note(float n)       { g_patch.note = n; }
EMSCRIPTEN_KEEPALIVE void plaits_set_harmonics(float v)  { g_patch.harmonics = v; }
EMSCRIPTEN_KEEPALIVE void plaits_set_timbre(float v)     { g_patch.timbre = v; }
EMSCRIPTEN_KEEPALIVE void plaits_set_morph(float v)      { g_patch.morph = v; }
EMSCRIPTEN_KEEPALIVE void plaits_set_decay(float v)      { g_patch.decay = v; }
EMSCRIPTEN_KEEPALIVE void plaits_set_lpg_colour(float v) { g_patch.lpg_colour = v; }

// TIMBRE modulation-amount attenuverter. We use it ONLY for the Chiptune engine
// (index 7): voice.cc repurposes this field there as the arpeggiator's note-decay
// shape (ChiptuneEngine::set_envelope_shape) instead of a TIMBRE sweep, because
// Chiptune bypasses the low-pass gate and has no key-release of its own. Keep it 0
// for every other engine (otherwise the internal envelope sweeps their TIMBRE).
// 0 -> the Chiptune note never decays (drones forever); larger -> shorter decay.
// Driven from plaits-worklet.js, scaled off the Decay knob.
EMSCRIPTEN_KEEPALIVE void plaits_set_timbre_mod_amount(float v) { g_patch.timbre_modulation_amount = v; }

// Gate inputs. trigger: rising edge strikes; level: VCA / sustain amplitude.
EMSCRIPTEN_KEEPALIVE void plaits_set_trigger(float v)    { g_mod.trigger = v; }
EMSCRIPTEN_KEEPALIVE void plaits_set_level(float v)      { g_mod.level = v; }

// Heap buffer JS reads directly via Module.HEAP16.
EMSCRIPTEN_KEEPALIVE
int16_t* plaits_alloc(int n_samples) {
  return static_cast<int16_t*>(malloc(sizeof(int16_t) * n_samples));
}

EMSCRIPTEN_KEEPALIVE
void plaits_free(int16_t* ptr) {
  free(ptr);
}

// Render n samples (n MUST be a multiple of kBlockSize = 12) of mono int16 PCM
// at 48 kHz into `out`. One Voice::Render call per kBlockSize block so the
// firmware's envelope/trigger timing stays correct. We take the `out` channel
// of each stereo Frame (Plaits' main output; `aux` is the secondary timbre).
EMSCRIPTEN_KEEPALIVE
void plaits_render(int16_t* out, int n_samples) {
  if (!g_inited || n_samples <= 0) return;
  Voice::Frame frames[kBlockSize];
  const int n_blocks = n_samples / static_cast<int>(kBlockSize);
  for (int b = 0; b < n_blocks; ++b) {
    g_voice.Render(g_patch, g_mod, frames, kBlockSize);
    int16_t* dst = out + b * static_cast<int>(kBlockSize);
    for (int i = 0; i < static_cast<int>(kBlockSize); ++i) {
      dst[i] = frames[i].out;
    }
  }
}

}  // extern "C"
