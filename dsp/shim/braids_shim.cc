// Parallax — extern "C" shim around braids::MacroOscillator.
// Compiled by Emscripten into a WASM module that the AudioWorklet loads.
//
// The shim itself is original code (MIT). It wraps Émilie Gillet's MIT Braids
// firmware unchanged. See ../../LICENSE-Braids.txt for the vendored attribution.
//
// Memory model: single global MacroOscillator instance. Braids is monophonic,
// so we don't need multiple voices or a handle table.
//
// Pitch units (matching the firmware): int16, "1/128 of a semitone". MIDI
// note 69 (A4) = 69 << 7 = 8832. Fractional pitch (pitch-bend, glide) is
// expressed in the same 1/128-semitone units.
//
// Parameter units: int16 0..32767 for TIMBRE/COLOR.

#include <cstdint>
#include <cstring>
#include <emscripten.h>

#include "braids/macro_oscillator.h"
#include "braids/signature_waveshaper.h"
#include "braids/settings.h"
#include "stmlib/utils/random.h"

using namespace braids;

namespace {

MacroOscillator g_osc;
SignatureWaveshaper g_sig;

// Lo-fi post-processing state
uint8_t  g_bits_resolution = 16;   // 2..16
uint16_t g_sample_rate     = 96;   // in units of kHz (4, 8, 16, 24, 32, 48, 96)
uint8_t  g_signature_amt   = 0;    // 0..255
uint8_t  g_drift_amt       = 0;    // 0..255 — VCO drift modulation depth (not yet routed)

// Decimator state (for SAMPLE_RATE reduction)
int16_t  g_decim_held = 0;
uint32_t g_decim_phase = 0;

// Empty sync buffer for the renderer — 24 zeros for the 24-sample block size.
uint8_t  g_sync_buffer[24] = { 0 };

// 24-sample temp buffer (Braids renders in 24-sample blocks at 96 kHz).
int16_t  g_tmp_buffer[24];

}  // namespace

// In firmware, `braids::settings` is the global Settings object referenced
// by `macro_oscillator.h`'s include. We never use it (no menu UI, no quantizer)
// but the symbol must exist if any other compiled file references it.
namespace braids { Settings settings; }

extern "C" {

EMSCRIPTEN_KEEPALIVE
void braids_init(uint32_t signature_seed) {
  // RNG — used by digital_oscillator (noise, granular) and by SignatureWaveshaper
  stmlib::Random::Seed(signature_seed ? signature_seed : 0xDEADBEEF);
  g_osc.Init();
  g_sig.Init(signature_seed ? signature_seed : 0x12345678);
  g_decim_held = 0;
  g_decim_phase = 0;
}

EMSCRIPTEN_KEEPALIVE
void braids_set_shape(int shape) {
  if (shape < 0) shape = 0;
  if (shape >= MACRO_OSC_SHAPE_LAST_ACCESSIBLE_FROM_META + 1) {
    shape = MACRO_OSC_SHAPE_LAST_ACCESSIBLE_FROM_META;
  }
  g_osc.set_shape(static_cast<MacroOscillatorShape>(shape));
}

EMSCRIPTEN_KEEPALIVE
void braids_set_pitch(int pitch_q7) {
  // pitch_q7 is in 1/128-semitone units from MIDI 0. Clamp to firmware's
  // useful range (roughly 0..127 MIDI = 0..16256 q7).
  if (pitch_q7 < 0) pitch_q7 = 0;
  if (pitch_q7 > 16383) pitch_q7 = 16383;
  g_osc.set_pitch(static_cast<int16_t>(pitch_q7));
}

EMSCRIPTEN_KEEPALIVE
void braids_set_parameters(int timbre, int color) {
  if (timbre < 0) timbre = 0;
  if (timbre > 32767) timbre = 32767;
  if (color < 0) color = 0;
  if (color > 32767) color = 32767;
  g_osc.set_parameters(static_cast<int16_t>(timbre), static_cast<int16_t>(color));
}

EMSCRIPTEN_KEEPALIVE
void braids_strike() {
  g_osc.Strike();
}

EMSCRIPTEN_KEEPALIVE
void braids_set_bits(int bits) {                  // 2..16
  if (bits < 2)  bits = 2;
  if (bits > 16) bits = 16;
  g_bits_resolution = static_cast<uint8_t>(bits);
}

EMSCRIPTEN_KEEPALIVE
void braids_set_sample_rate_khz(int khz) {        // 4, 8, 16, 24, 32, 48, 96
  if (khz < 4)  khz = 4;
  if (khz > 96) khz = 96;
  g_sample_rate = static_cast<uint16_t>(khz);
}

EMSCRIPTEN_KEEPALIVE
void braids_set_signature(int amt) {              // 0..255
  if (amt < 0)   amt = 0;
  if (amt > 255) amt = 255;
  g_signature_amt = static_cast<uint8_t>(amt);
}

EMSCRIPTEN_KEEPALIVE
void braids_set_drift(int amt) {                  // 0..255 (not yet routed)
  if (amt < 0)   amt = 0;
  if (amt > 255) amt = 255;
  g_drift_amt = static_cast<uint8_t>(amt);
}

// Allocate a buffer in the WASM heap that JS can read directly via Module.HEAP16.
EMSCRIPTEN_KEEPALIVE
int16_t* braids_alloc(int n_samples) {
  return static_cast<int16_t*>(malloc(sizeof(int16_t) * n_samples));
}

EMSCRIPTEN_KEEPALIVE
void braids_free(int16_t* ptr) {
  free(ptr);
}

// Render N samples (N must be a multiple of 24, the Braids block size).
// Output is int16 PCM at 96 kHz.
EMSCRIPTEN_KEEPALIVE
void braids_render(int16_t* out, int n_samples) {
  if (n_samples <= 0) return;
  const int n_blocks = n_samples / 24;

  // Bit-mask for the requested resolution (e.g. 8-bit → keep top 8 bits).
  const int16_t bit_mask =
      static_cast<int16_t>(-(1 << (16 - g_bits_resolution)));

  // Decimation increment: 96 kHz native, hold each sample for (96/sr) samples.
  // Phase accumulator in fixed-point Q16.
  const uint32_t sr_inc = (static_cast<uint32_t>(g_sample_rate) << 16) / 96;

  for (int b = 0; b < n_blocks; ++b) {
    g_osc.Render(g_sync_buffer, g_tmp_buffer, 24);

    int16_t* dst = out + b * 24;
    for (int i = 0; i < 24; ++i) {
      int16_t s = g_tmp_buffer[i];

      // SIGN: signature waveshaper
      if (g_signature_amt) {
        int32_t shaped = g_sig.Transform(s);
        // Mix dry/wet by g_signature_amt / 255.
        int32_t dry = s;
        s = static_cast<int16_t>(
            dry + (((shaped - dry) * g_signature_amt) >> 8));
      }

      // RATE: sample-rate reduction (zero-order hold).
      g_decim_phase += sr_inc;
      if (g_decim_phase >= (1u << 16)) {
        g_decim_phase -= (1u << 16);
        g_decim_held = s;
      }
      s = g_decim_held;

      // BITS: resolution reduction.
      if (g_bits_resolution < 16) {
        s = static_cast<int16_t>(s & bit_mask);
      }

      dst[i] = s;
    }
  }
}

}  // extern "C"
