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
//
// Per-block signal flow (mirrors braids/braids.cc:RenderBlock):
//   1. envelope.Update(attack, decay); ad_value = envelope.Render()  [one per block]
//   2. timbre += ad_value * ad_timbre >> 5;  color += ad_value * ad_color >> 5
//   3. pitch  += jitter.Render(drift);  pitch += ad_value * ad_fm >> 7
//   4. osc.set_pitch(pitch);  osc.set_parameters(timbre, color)
//   5. osc.Render(24 samples)
//   6. per-sample:  hold = buf[i] & bit_mask  at decimation instant
//                   sample = hold * gain_lp >> 16;  gain_lp tracks ad_vca
//                   warped = sig.Transform(sample)
//                   out[i] = Mix(sample, warped, sig_weight)   sig_weight = amt*amt

#include <cstdint>
#include <cstring>
#include <emscripten.h>

#include "braids/macro_oscillator.h"
#include "braids/signature_waveshaper.h"
#include "braids/envelope.h"
#include "braids/vco_jitter_source.h"
#include "braids/settings.h"
#include "stmlib/utils/random.h"

using namespace braids;

namespace {

MacroOscillator     g_osc;
SignatureWaveshaper g_sig;
Envelope            g_envelope;
VcoJitterSource     g_jitter;

// Cached base pitch / parameters — the firmware re-applies these each block
// after modulating by ad_value + jitter. We mirror that pattern so DRIFT and
// the AD envelope can actually do something between explicit JS updates.
int32_t  g_pitch_base    = 60 << 7;
int32_t  g_timbre_base   = 16384;
int32_t  g_color_base    = 16384;

// Lo-fi post-processing state
uint8_t  g_bits_resolution = 16;   // 2..16
uint16_t g_sample_rate     = 96;   // in units of kHz (4, 8, 16, 24, 32, 48, 96)
uint8_t  g_signature_amt   = 0;    // 0..255 (UI range — quadratic-tapered before mixing)
uint8_t  g_drift_amt       = 0;    // 0..255 — VCO jitter intensity

// AD envelope shape + modulation amounts. All default to 0 so the envelope
// plumbing is dormant unless the JS layer opts in per-model. Once turned on,
// behaviour matches the firmware (braids.cc RenderBlock).
uint8_t  g_env_attack      = 0;    // 0..127 → lut_env_portamento_increments index
uint8_t  g_env_decay       = 0;    // 0..127
uint8_t  g_ad_vca          = 0;    // 0..127
uint8_t  g_ad_timbre       = 0;    // 0..127
uint8_t  g_ad_color        = 0;    // 0..127
uint8_t  g_ad_fm           = 0;    // 0..127

// Decimator state (RATE reduction — zero-order hold).
int16_t  g_decim_held = 0;
uint32_t g_decim_phase = 0;

// 1-pole IIR smoothing for the VCA gain, matching the firmware's
// `gain_lp += (gain - gain_lp) >> 4` low-pass. Tracks ad_value when AD_VCA is
// non-zero, otherwise tracks full-scale (65535).
int32_t  g_gain_lp = 65535;

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
  // RNG — used by digital_oscillator (noise, granular) and by SignatureWaveshaper.
  stmlib::Random::Seed(signature_seed ? signature_seed : 0xDEADBEEF);
  g_osc.Init();
  g_sig.Init(signature_seed ? signature_seed : 0x12345678);
  g_envelope.Init();
  g_jitter.Init();
  g_decim_held = 0;
  g_decim_phase = 0;
  g_gain_lp = 65535;
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
  g_pitch_base = pitch_q7;
}

EMSCRIPTEN_KEEPALIVE
void braids_set_parameters(int timbre, int color) {
  if (timbre < 0) timbre = 0;
  if (timbre > 32767) timbre = 32767;
  if (color < 0) color = 0;
  if (color > 32767) color = 32767;
  g_timbre_base = timbre;
  g_color_base  = color;
}

EMSCRIPTEN_KEEPALIVE
void braids_strike() {
  g_osc.Strike();
  // Firmware retriggers the AD envelope alongside the oscillator strike. We
  // do the same so percussion / pluck / bell models see an envelope ramp even
  // when AD_VCA is 0 (its rendering still drives AD_TIMBRE/COLOR/FM).
  g_envelope.Trigger(ENV_SEGMENT_ATTACK);
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
void braids_set_drift(int amt) {                  // 0..255 — VCO jitter intensity
  if (amt < 0)   amt = 0;
  if (amt > 255) amt = 255;
  g_drift_amt = static_cast<uint8_t>(amt);
}

// AD envelope shape — `a` and `d` select a portamento-increment rate. Valid
// range is 0..15: braids_render multiplies each by 8 (firmware order) and
// Envelope::Update indexes lut_env_portamento_increments[a*8], a 128-entry LUT.
// Accepting >15 (the old "0..127 so a knob can sweep" contract) made a*8 reach
// 1016 → an out-of-bounds heap read producing garbage envelope rates. The shim
// is the contract owner, so it clamps to 0..15 here; the worklet + engine keep
// matching guards in depth.
EMSCRIPTEN_KEEPALIVE
void braids_set_envelope_shape(int a, int d) {
  if (a < 0)   a = 0;   if (a > 15) a = 15;
  if (d < 0)   d = 0;   if (d > 15) d = 15;
  g_env_attack = static_cast<uint8_t>(a);
  g_env_decay  = static_cast<uint8_t>(d);
}

// AD envelope modulation amounts — match firmware setting ranges (0..127).
// 0 = disabled (default — preserves the pre-envelope shim behaviour).
EMSCRIPTEN_KEEPALIVE
void braids_set_ad_amounts(int vca, int timbre, int color, int fm) {
  if (vca    < 0) vca    = 0;   if (vca    > 127) vca    = 127;
  if (timbre < 0) timbre = 0;   if (timbre > 127) timbre = 127;
  if (color  < 0) color  = 0;   if (color  > 127) color  = 127;
  if (fm     < 0) fm     = 0;   if (fm     > 127) fm     = 127;
  g_ad_vca    = static_cast<uint8_t>(vca);
  g_ad_timbre = static_cast<uint8_t>(timbre);
  g_ad_color  = static_cast<uint8_t>(color);
  g_ad_fm     = static_cast<uint8_t>(fm);
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

  // Decimation increment: 96 kHz native, advance phase by sr/96 each sample;
  // hold output until the phase rolls over. Q16 fixed-point.
  const uint32_t sr_inc = (static_cast<uint32_t>(g_sample_rate) << 16) / 96;

  // SIGN mix curve: firmware computes `signature² × 4095` so the dry/wet
  // weight grows quadratically with the menu setting. We mirror that shape on
  // our continuous 0..255 input: weight = amt² → 0..65025 (≈ full-wet at max),
  // applied via Mix(dry, wet, weight) with the standard 0..65535 weight scale.
  const uint32_t sig_weight =
      static_cast<uint32_t>(g_signature_amt) * static_cast<uint32_t>(g_signature_amt);

  for (int b = 0; b < n_blocks; ++b) {
    // --- Per-block AD envelope + parameter modulation (firmware order) -------
    g_envelope.Update(
        static_cast<int32_t>(g_env_attack) * 8,
        static_cast<int32_t>(g_env_decay)  * 8);
    const uint32_t ad_value = g_envelope.Render();

    int32_t timbre = g_timbre_base + ((static_cast<int32_t>(ad_value) * g_ad_timbre) >> 5);
    int32_t color  = g_color_base  + ((static_cast<int32_t>(ad_value) * g_ad_color)  >> 5);
    if (timbre < 0) timbre = 0;
    if (timbre > 32767) timbre = 32767;
    if (color  < 0) color  = 0;
    if (color  > 32767) color  = 32767;

    int32_t pitch = g_pitch_base;
    pitch += g_jitter.Render(static_cast<int32_t>(g_drift_amt));
    pitch += (static_cast<int32_t>(ad_value) * g_ad_fm) >> 7;
    if (pitch < 0) pitch = 0;
    if (pitch > 16383) pitch = 16383;

    g_osc.set_pitch(static_cast<int16_t>(pitch));
    g_osc.set_parameters(static_cast<int16_t>(timbre), static_cast<int16_t>(color));
    g_osc.Render(g_sync_buffer, g_tmp_buffer, 24);

    // Per-sample VCA gain target — full-scale when AD_VCA is disabled.
    const int32_t gain_target =
        g_ad_vca ? static_cast<int32_t>(ad_value) : 65535;

    // --- Per-sample lo-fi chain, in firmware order ---------------------------
    int16_t* dst = out + b * 24;
    for (int i = 0; i < 24; ++i) {
      // (1) BITS + RATE: bit-mask is applied AT THE DECIMATION INSTANT (the
      // sample we capture is the one that gets crunched). Reading the held
      // sample without re-masking between decimation events keeps the steps
      // bit-quantised.
      g_decim_phase += sr_inc;
      if (g_decim_phase >= (1u << 16)) {
        g_decim_phase -= (1u << 16);
        g_decim_held = static_cast<int16_t>(g_tmp_buffer[i] & bit_mask);
      }
      int32_t sample = g_decim_held;

      // (2) VCA gain (smoothed) — matches firmware's
      //     `sample = held * gain_lp >> 16;  gain_lp += (gain - gain_lp) >> 4`.
      sample = (sample * g_gain_lp) >> 16;
      g_gain_lp += (gain_target - g_gain_lp) >> 4;

      // (3) SIGN waveshaper — applied LAST, on the already-crushed signal.
      // Mix dry/wet by the quadratic-tapered weight.
      const int16_t warped = g_sig.Transform(static_cast<int16_t>(sample));
      const int32_t mixed =
          (sample * (65535 - static_cast<int32_t>(sig_weight)) +
           static_cast<int32_t>(warped) * static_cast<int32_t>(sig_weight)) >> 16;

      dst[i] = static_cast<int16_t>(mixed);
    }
  }
}

}  // extern "C"
