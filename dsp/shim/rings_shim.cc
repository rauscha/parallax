// Parallax — extern "C" shim around rings::Part / rings::StringSynthPart.
//
// Compiled by Emscripten into a WASM module that the AudioWorklet loads.
// The shim itself is original code (MIT). It wraps Émilie Gillet's MIT Rings
// firmware unchanged. See ../../LICENSE-Braids.txt for the vendored attribution.
//
// --- How we drive Rings -----------------------------------------------------
// Rings is a RESONATOR, not an oscillator: you strike it and it rings. On the
// hardware, patching nothing into IN makes the module synthesize its own
// excitation (performance_state.internal_exciter + strum). We use exactly that
// mode as our note model:
//   - noteOn  → set the resonator note, then STRUM once (consumed by the next
//               rendered block)
//   - noteOff → nothing: the voice rings out its natural physical decay.
//               DAMPING is the release. This is the instrument's identity.
// Models 0..5 render through rings::Part (the 3 normal + 3 "hidden" resonator
// models); models 6..11 render through rings::StringSynthPart — the
// "Disastrous Peace" easter-egg string synth — with (model - 6) selecting its
// FX type. Both parts stay initialised; the active model picks which one
// renders. A part left inactive freezes its tail and resumes stale on
// re-select — same as the hardware's mode toggle, acceptable.
// Internal polyphony is pinned to 1 (Parallax is monophonic by locked decision).
//
// --- Block size is load-bearing ---------------------------------------------
// The firmware advances envelopes/LFOs once per Process() call assuming
// kMaxBlockSize (24) samples — always render exactly 24 per call. Native rate
// is 48 kHz; the worklet resamples to the context rate.

#include <cstdint>
#include <cstring>
#include <emscripten.h>

#include "stmlib/utils/random.h"
#include "stmlib/dsp/dsp.h"
#include "rings/dsp/part.h"
#include "rings/dsp/string_synth_part.h"
#include "rings/dsp/patch.h"
#include "rings/dsp/performance_state.h"

using namespace rings;

namespace {

Part             g_part;
StringSynthPart  g_string_synth;
Patch            g_patch;
PerformanceState g_performance;

// 64 KB reverb/echo RAM shared by both parts — matches the firmware's
// `uint16_t reverb_buffer[32768]` (rings.cc).
uint16_t g_reverb_buffer[32768];

float g_in[kMaxBlockSize];    // excitation input — stays silent (internal exciter)
float g_out[kMaxBlockSize];   // ODD output (odd partials / main)
float g_aux[kMaxBlockSize];   // EVEN output (even partials / fx aux)

int  g_model = 0;             // 0..5 = Part models, 6..11 = StringSynth FX 0..5
bool g_strum_pending = false;
bool g_inited = false;

const int kNumPartModels  = 6;    // == RESONATOR_MODEL_LAST
const int kNumTotalModels = 12;   // + 6 StringSynth FX variants

inline int16_t ToInt16(float x) {
  x = stmlib::SoftLimit(x);
  if (x > 1.0f) x = 1.0f;
  if (x < -1.0f) x = -1.0f;
  return static_cast<int16_t>(x * 32767.0f);
}

}  // namespace

extern "C" {

EMSCRIPTEN_KEEPALIVE
void rings_init(uint32_t seed) {
  stmlib::Random::Seed(seed ? seed : 0x12345678u);

  memset(g_reverb_buffer, 0, sizeof(g_reverb_buffer));
  memset(g_in, 0, sizeof(g_in));

  g_part.Init(g_reverb_buffer);
  g_string_synth.Init(g_reverb_buffer);
  g_part.set_polyphony(1);
  g_string_synth.set_polyphony(1);
  g_part.set_model(RESONATOR_MODEL_MODAL);
  g_string_synth.set_fx(FX_FORMANT);

  memset(&g_patch, 0, sizeof(g_patch));
  g_patch.structure  = 0.4f;
  g_patch.brightness = 0.6f;
  g_patch.damping    = 0.55f;
  g_patch.position   = 0.3f;

  memset(&g_performance, 0, sizeof(g_performance));
  g_performance.note  = 48.0f;            // semitones, MIDI-aligned (69 = A440)
  g_performance.tonic = 0.0f;
  g_performance.fm    = 0.0f;
  g_performance.internal_exciter = true;  // nothing patched into IN → self-excite
  g_performance.internal_strum   = false; // WE decide when to strum (noteOn)
  g_performance.internal_note    = false; // WE supply the note
  g_performance.chord = 0;
  g_performance.strum = false;

  g_model = 0;
  g_strum_pending = false;
  g_inited = true;
}

EMSCRIPTEN_KEEPALIVE
void rings_set_model(int m) {
  if (m < 0) m = 0;
  if (m > kNumTotalModels - 1) m = kNumTotalModels - 1;
  g_model = m;
  if (m < kNumPartModels) {
    g_part.set_model(static_cast<ResonatorModel>(m));
  } else {
    g_string_synth.set_fx(static_cast<FxType>(m - kNumPartModels));
  }
}

EMSCRIPTEN_KEEPALIVE void rings_set_note(float n)       { g_performance.note = n; }

EMSCRIPTEN_KEEPALIVE void rings_set_structure(float v)  {
  g_patch.structure = v;
  // The quantized-chords model + the string synth read a discrete chord index
  // instead of raw structure; mirror the firmware cv_scaler's mapping.
  g_performance.chord = static_cast<int32_t>(v * (kNumChords - 1) + 0.5f);
}

EMSCRIPTEN_KEEPALIVE void rings_set_brightness(float v) { g_patch.brightness = v; }
EMSCRIPTEN_KEEPALIVE void rings_set_damping(float v)    { g_patch.damping = v; }
EMSCRIPTEN_KEEPALIVE void rings_set_position(float v)   { g_patch.position = v; }

// One-shot strike: consumed by (and cleared after) the next rendered block.
EMSCRIPTEN_KEEPALIVE void rings_strum(void)             { g_strum_pending = true; }

// Heap buffer JS reads directly via Module.HEAP16.
EMSCRIPTEN_KEEPALIVE
int16_t* rings_alloc(int n_samples) {
  return static_cast<int16_t*>(malloc(sizeof(int16_t) * n_samples));
}

EMSCRIPTEN_KEEPALIVE
void rings_free(int16_t* ptr) { free(ptr); }

// Render n samples (n MUST be a multiple of kMaxBlockSize = 24) of mono int16
// PCM at 48 kHz. One Process() call per block keeps firmware timing correct.
// ODD + EVEN are summed to mono: on hardware, patching only ODD mixes both
// partial groups onto it — the sum IS the module's mono voice.
EMSCRIPTEN_KEEPALIVE
void rings_render(int16_t* out, int n_samples) {
  if (!g_inited || n_samples <= 0) return;
  const int block = static_cast<int>(kMaxBlockSize);
  const int n_blocks = n_samples / block;
  for (int b = 0; b < n_blocks; ++b) {
    g_performance.strum = g_strum_pending;
    g_strum_pending = false;
    if (g_model < kNumPartModels) {
      g_part.Process(g_performance, g_patch, g_in, g_out, g_aux, block);
    } else {
      g_string_synth.Process(g_performance, g_patch, g_in, g_out, g_aux, block);
    }
    int16_t* dst = out + b * block;
    for (int i = 0; i < block; ++i) {
      dst[i] = ToInt16((g_out[i] + g_aux[i]) * 0.5f);
    }
  }
}

}  // extern "C"
