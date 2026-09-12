// Parallax — extern "C" shim around msfa's Dx7Note (six-operator FM).
//
// Compiled by Emscripten into a WASM module that the AudioWorklet loads.
// The shim itself is original code (MIT). It wraps Raph Levien's Apache-2.0
// msfa DSP unchanged — see ../../LICENSE-msfa.txt, ../../NOTICE and
// ../vendor/msfa/README.md.
//
// --- Sample rate is 44100, deliberately ------------------------------------
// msfa configures Freqlut, Lfo and PitchEnv from a sample rate, but Env does
// NOT take one: its envelope increments are per-block-of-N constants calibrated
// against msfa's own 44.1 kHz reference. Running the engine at 48 kHz makes
// every operator envelope ~8.8% fast, and attack/decay times are most of what
// makes an FM voice recognisable. So the engine runs at 44100 and the worklet
// resamples to the context rate — the same arrangement Braids already uses at
// 96 kHz. See §1 of the FM spec (amended 2026-09-10).
//
// --- Block size is load-bearing --------------------------------------------
// Dx7Note::compute advances envelopes and the operator kernels once per call,
// assuming exactly N (= 64) samples. Always render in whole blocks of N.
//
// --- Taps (phase 7) ---------------------------------------------------------
// fm_set_tap_buffer() hands the shim a float buffer; while it is set, every
// rendered block also lands there as eight normalised traces (see
// fm_tap_count). Passing 0 turns them off and the engine is then exactly the
// engine it was before -- the vendored tap pointer is null, so not one extra
// instruction runs inside FmCore::compute. The default app path never sets it.
//
// --- Operator numbering -----------------------------------------------------
// msfa indexes operators 0..5 in DX7 sysex order, which is REVERSED from the
// panel numbering: index 0 is operator 6, index 5 is operator 1. Algorithm 1
// (index 0) is therefore ops[0]=feedback source -> ... -> ops[3] carrier, and
// ops[4] -> ops[5] carrier. This matters for the flowsheet's tap labelling
// later; get it wrong and every diagram is mirrored.
//
// --- Patch data -------------------------------------------------------------
// The boot patch below is ORIGINAL, authored here by hand. Parallax ships no
// factory ROM patch data: the engine's licence covers the engine, not anyone's
// voice library (locked decision 5 — "build it from sound, not from the ROM").
// Note that msfa's own synth_unit.cc carries a hardcoded factory voice; it is
// not vendored and must not be copied in.

#include <cstdint>
#include <cstring>
#include <emscripten.h>

#include "msfa/synth.h"
#include "msfa/freqlut.h"
#include "msfa/exp2.h"
#include "msfa/sin.h"
#include "msfa/lfo.h"
#include "msfa/pitchenv.h"
#include "msfa/patch.h"
#include "msfa/controllers.h"
#include "msfa/dx7note.h"

namespace {

// --- Unpacked-patch layout (156 bytes) -------------------------------------
// Per operator, 21 bytes at op * 21:
//   0..3  EG rates 1-4        4..7  EG levels 1-4
//   8     level scaling break point
//   9,10  left / right depth  11,12 left / right curve
//   13    rate scaling        14    amp mod sens   15  key velocity sens
//   16    output level        17    osc mode (0 = ratio)
//   18    freq coarse         19    freq fine      20  detune (7 = none)
// Globals:
//   126..129 pitch EG rates   130..133 pitch EG levels (50 = flat)
//   134 algorithm (0-based)   135 feedback    136 osc key sync
//   137..140 LFO speed / delay / pitch mod depth / amp mod depth
//   141 LFO key sync          142 LFO wave    143 LFO pitch mod sens
//   144 transpose             145..154 name   155 operator on/off mask
const int kPatchSize = 156;
const int kOpStride  = 21;

char g_patch[kPatchSize];

Dx7Note     g_note;
Lfo         g_lfo;
Controllers g_controllers;

bool g_inited     = false;
bool g_note_alive = false;   // a note has been initialised at least once

// The note currently sounding. Dx7Note bakes velocity and key scaling into its
// operator state at note-on, so re-aiming that state later needs both back.
int  g_note_midi = 60;
int  g_note_vel  = 100;
// Whether the key is still DOWN, as distinct from g_note_alive (a note has
// been built at least once). Live patch updates apply only while it is.
bool g_note_down = false;

// Writes one operator's 21 bytes. `op` is the msfa index (0 = operator 6).
void SetOp(char* p, int op,
           int r1, int r2, int r3, int r4,
           int l1, int l2, int l3, int l4,
           int outlevel, int coarse, int fine, int detune,
           int rate_scaling, int key_vel_sens) {
  char* o = p + op * kOpStride;
  o[0] = r1; o[1] = r2; o[2] = r3; o[3] = r4;
  o[4] = l1; o[5] = l2; o[6] = l3; o[7] = l4;
  o[8]  = 0;             // break point
  o[9]  = 0; o[10] = 0;  // left / right depth
  o[11] = 0; o[12] = 0;  // left / right curve
  o[13] = rate_scaling;
  o[14] = 0;             // amp mod sensitivity
  o[15] = key_vel_sens;
  o[16] = outlevel;
  o[17] = 0;             // ratio mode
  o[18] = coarse;
  o[19] = fine;
  o[20] = detune;
}

// Our own boot voice: a two-operator plucked bell. Operator 2 (index 4)
// modulates carrier operator 1 (index 5) at a 2:1 ratio with a faster-decaying
// modulator envelope, so the tone starts bright and settles to near-sine — the
// most legible thing an FM diagram can show, and a sound designed here rather
// than transcribed from anywhere. Operators 3-6 are silenced.
void LoadBootPatch(char* p) {
  memset(p, 0, kPatchSize);

  for (int op = 0; op < 4; ++op) {          // indices 0..3 = operators 6..3
    SetOp(p, op, 99, 99, 99, 99, 0, 0, 0, 0, /*outlevel*/ 0,
          /*coarse*/ 1, /*fine*/ 0, /*detune*/ 7, /*rs*/ 0, /*kvs*/ 0);
  }

  // index 4 = operator 2 — the modulator
  SetOp(p, 4, 99, 55, 40, 62, 99, 72, 50, 0, /*outlevel*/ 78,
        /*coarse*/ 2, /*fine*/ 0, /*detune*/ 7, /*rs*/ 2, /*kvs*/ 2);

  // index 5 = operator 1 — the carrier
  SetOp(p, 5, 99, 62, 45, 60, 99, 88, 72, 0, /*outlevel*/ 99,
        /*coarse*/ 1, /*fine*/ 0, /*detune*/ 7, /*rs*/ 1, /*kvs*/ 2);

  for (int i = 0; i < 4; ++i) {
    p[126 + i] = 99;   // pitch EG rates — instant
    p[130 + i] = 50;   // pitch EG levels — 50 is centre, i.e. no pitch envelope
  }
  // Algorithm 2, not 1. Both wire operator 2 into operator 1 identically, so
  // this patch renders bit-for-bit the same either way at feedback 0 — msfa
  // only takes the feedback path when (flags & 0xc0) == 0xc0 AND the shift is
  // under 16, and feedback 0 gives a shift of exactly 16. What changes is
  // which operator carries the feedback flag: algorithm 1 puts it on operator
  // 6, which is silent here, so the Feedback macro would have been a dead knob
  // on the engine's default voice. Algorithm 2 puts it on operator 2, which is
  // the modulator this voice actually uses.
  p[134] = 1;          // algorithm 2
  p[135] = 0;          // feedback off at the detent; the macro opens it up
  p[136] = 1;          // oscillator key sync
  p[137] = 35;         // LFO speed
  p[138] = 0;          // LFO delay
  p[139] = 0;          // LFO pitch mod depth
  p[140] = 0;          // LFO amp mod depth
  p[141] = 1;          // LFO key sync
  p[142] = 0;          // LFO waveform — triangle
  p[143] = 0;          // LFO pitch mod sensitivity
  p[144] = 24;         // transpose centre (unused by Dx7Note, kept valid)
  memcpy(p + 145, "PARALLAX 1", 10);
  p[155] = 0x3f;       // all six operators enabled
}

// --- Tap capture ------------------------------------------------------------
// Eight traces, in PANEL numbering so the flowsheet does not have to reverse
// anything at draw time:
//
//   0..5  operators 1..6          (msfa index 6 - k; index 0 is operator 6)
//   6     the feedback wire       (zero unless the patch takes a feedback path)
//   7     the voice output        (the summed carriers, pre-int16)
//
// The engine's own tap buffer is int32 in msfa index order plus the wire; this
// is the reordered, normalised copy JS reads.
const int kTapCount = 8;
const int kTapOps   = 6;
const int kTapWire  = 6;
const int kTapOut   = 7;

// Full scale. ToInt16 below is >>4, a clip at +/-(1<<24), then >>9 -- so an
// int32 sample of 1<<28 is exactly the top of the int16 range, and dividing by
// it puts every trace on the same +/-1.0 scale as the audio the worklet plays.
const float kTapScale = 1.0f / 268435456.0f;   // 1 / (1 << 28)

int32_t g_tap_blocks[7 * N];     // what FmCore::compute writes: 6 ops + the wire
float*  g_tap_out = 0;           // where JS reads; null means taps are off

// msfa's own int32 -> int16 conversion (synth_unit.cc): >>4, clip at +/-(1<<24),
// then >>9. Saturating, and the reference the HEAP16 contract is built on.
inline int16_t ToInt16(int32_t v) {
  const int32_t x = v >> 4;
  if (x < -(1 << 24)) return -32768;
  if (x >= (1 << 24)) return 32767;
  return static_cast<int16_t>(x >> 9);
}

}  // namespace

extern "C" {

// sample_rate is accepted for symmetry with the other engines, but the engine
// is calibrated at 44100 and the worklet is expected to pass exactly that.
EMSCRIPTEN_KEEPALIVE
void fm_init(double sample_rate) {
  if (sample_rate <= 0.0) sample_rate = 44100.0;

  Freqlut::init(sample_rate);
  Exp2::init();
  Tanh::init();
  Sin::init();
  Lfo::init(sample_rate);
  PitchEnv::init(sample_rate);

  memset(&g_controllers, 0, sizeof(g_controllers));
  g_controllers.values_[kControllerPitch] = 0x2000;   // pitch bend centre

  LoadBootPatch(g_patch);
  g_lfo.reset(g_patch + 137);

  g_note_alive = false;
  g_note_down = false;
  g_inited = true;
}

// Accepts either a 156-byte unpacked patch or a 128-byte packed sysex block
// (unpacked here). Takes effect on the next note-on — msfa builds a voice's
// operator state at init time, so a mid-note swap is not meaningful.
// Load a patch AND apply it to the note already sounding, without retriggering
// it — this is what a macro knob calls.
//
// Everything in the four macros (operator output levels, ratios, EG rates, the
// feedback amount) is per-voice state that msfa builds inside Dx7Note::init, so
// there is no way to reach it through Controllers, which carries pitch bend and
// nothing else. Dx7Note::update is our own addition to the vendored engine for
// exactly this: it recomputes the same fields init() does, but re-aims the
// running envelopes rather than restarting them, and leaves the oscillator
// phases alone. See ../vendor/msfa/README.md.
//
// Falls back to plain loading when no note is sounding.
EMSCRIPTEN_KEEPALIVE
void fm_update_patch(const char* data, int len) {
  if (!g_inited || !data) return;
  if (len == kPatchSize) {
    memcpy(g_patch, data, kPatchSize);
  } else if (len == 128) {
    UnpackPatch(data, g_patch);
  } else {
    return;
  }
  g_lfo.reset(g_patch + 137);
  // Only while the key is actually DOWN. A released note is in its release
  // stage and must be left to finish: Env::update applies the change in output
  // level to the level already reached, so re-aiming a dying note at a louder
  // patch makes it swell back up instead of fading. Measured before this guard:
  // switching voice while a note rang out left the RELEASE 4.4x louder than the
  // note itself had been. Musically it is the same answer — a note you have let
  // go of should not morph into the voice you just selected.
  if (g_note_alive && g_note_down) {
    g_note.update(g_patch, g_note_midi, g_note_vel);
  }
}

EMSCRIPTEN_KEEPALIVE
void fm_set_patch(const char* data, int len) {
  if (!data) return;
  if (len == kPatchSize) {
    memcpy(g_patch, data, kPatchSize);
  } else if (len == 128) {
    UnpackPatch(data, g_patch);
  } else {
    return;                       // unknown format — keep the current patch
  }
  g_lfo.reset(g_patch + 137);
}

EMSCRIPTEN_KEEPALIVE
void fm_note_on(int midi_note, int velocity) {
  if (!g_inited) return;
  if (midi_note < 0) midi_note = 0;
  if (midi_note > 127) midi_note = 127;
  if (velocity < 1) velocity = 1;
  if (velocity > 127) velocity = 127;
  g_note_midi = midi_note;
  g_note_vel = velocity;
  g_note.init(g_patch, midi_note, velocity);
  g_lfo.keydown();
  g_note_alive = true;
  g_note_down = true;
}

EMSCRIPTEN_KEEPALIVE
void fm_note_off(void) {
  if (g_note_alive) g_note.keyup();
  g_note_down = false;
}

// Semitones, +/-. msfa hardcodes a 3-semitone bend range in Dx7Note::compute,
// so this maps semitones onto that range; anything wider would need the
// vendored constant changed. Recorded rather than silently clamped away.
EMSCRIPTEN_KEEPALIVE
void fm_set_pitch_bend(float semitones) {
  const float kRange = 3.0f;
  float norm = semitones / kRange;
  if (norm > 1.0f) norm = 1.0f;
  if (norm < -1.0f) norm = -1.0f;
  g_controllers.values_[kControllerPitch] =
      0x2000 + static_cast<int>(norm * 8191.0f);
}

// Heap buffer JS reads directly via Module.HEAP16.
EMSCRIPTEN_KEEPALIVE
int16_t* fm_alloc(int n_samples) {
  return static_cast<int16_t*>(malloc(sizeof(int16_t) * n_samples));
}

EMSCRIPTEN_KEEPALIVE
void fm_free(int16_t* ptr) { free(ptr); }

// The engine's block size, so the worklet does not have to hardcode it.
EMSCRIPTEN_KEEPALIVE
int fm_block_size(void) { return N; }

// --- Taps -------------------------------------------------------------------

// How many traces a tap buffer holds. The buffer is fm_tap_count() * N floats.
EMSCRIPTEN_KEEPALIVE
int fm_tap_count(void) { return kTapCount; }

// Allocate / release a tap buffer. Separate from fm_alloc because that one
// hands back int16 for audio; this is float.
EMSCRIPTEN_KEEPALIVE
float* fm_tap_alloc(void) {
  return static_cast<float*>(malloc(sizeof(float) * kTapCount * N));
}

EMSCRIPTEN_KEEPALIVE
void fm_tap_free(float* ptr) { free(ptr); }

// Point the shim at a tap buffer, or pass 0 to turn taps off. Each subsequent
// fm_render block overwrites the whole buffer, so the caller must drain it
// between calls -- which is exactly what the worklet does, one block at a time.
EMSCRIPTEN_KEEPALIVE
void fm_set_tap_buffer(float* ptr) { g_tap_out = ptr; }

// Render n_samples (MUST be a multiple of N = 64) of mono int16 PCM at 44.1 kHz.
// Dx7Note::compute ADDS into its buffer, so each block is zeroed first.
//
// When a tap buffer is set, each block also writes eight normalised traces into
// it. Note the consequence for callers: with taps on, only the LAST block of a
// multi-block call survives in the buffer. The worklet renders one block per
// call, so it sees every one; the offline tests do the same.
EMSCRIPTEN_KEEPALIVE
void fm_render(int16_t* out, int n_samples) {
  if (!g_inited || !out || n_samples <= 0) return;
  const int n_blocks = n_samples / N;

  int32_t block[N];
  for (int b = 0; b < n_blocks; ++b) {
    int16_t* dst = out + b * N;
    if (!g_note_alive) {
      memset(dst, 0, sizeof(int16_t) * N);
      // Silence is a real reading, not a missing one: leaving the last live
      // block in place would draw a note that is no longer playing.
      if (g_tap_out) memset(g_tap_out, 0, sizeof(float) * kTapCount * N);
      continue;
    }
    memset(block, 0, sizeof(block));
    const int32_t lfo_value = g_lfo.getsample();
    const int32_t lfo_delay = g_lfo.getdelay();
    g_note.compute(block, lfo_value, lfo_delay, &g_controllers,
                   g_tap_out ? g_tap_blocks : 0);
    for (int i = 0; i < N; ++i) dst[i] = ToInt16(block[i]);

    if (g_tap_out) {
      // Reverse msfa's index order into panel order: panel operator k (1..6)
      // is msfa index 6 - k. Get this wrong and every diagram is mirrored.
      for (int k = 0; k < kTapOps; ++k) {
        const int32_t* src = g_tap_blocks + (5 - k) * N;
        float* dstf = g_tap_out + k * N;
        for (int i = 0; i < N; ++i) dstf[i] = src[i] * kTapScale;
      }
      const int32_t* wire = g_tap_blocks + 6 * N;
      float* wiref = g_tap_out + kTapWire * N;
      for (int i = 0; i < N; ++i) wiref[i] = wire[i] * kTapScale;
      float* outf = g_tap_out + kTapOut * N;
      for (int i = 0; i < N; ++i) outf[i] = block[i] * kTapScale;
    }
  }
}

}  // extern "C"
