/*
 * Copyright 2012 Google Inc.
 * 
 * Licensed under the Apache License, Version 2.0 (the "License");
 * you may not use this file except in compliance with the License.
 * You may obtain a copy of the License at
 * 
 *      http://www.apache.org/licenses/LICENSE-2.0
 * 
 * Unless required by applicable law or agreed to in writing, software
 * distributed under the License is distributed on an "AS IS" BASIS,
 * WITHOUT WARRANTIES OR CONDITIONS OF ANY KIND, either express or implied.
 * See the License for the specific language governing permissions and
 * limitations under the License.
 */

#ifndef SYNTH_DX7NOTE_H_
#define SYNTH_DX7NOTE_H_

// This is the logic to put together a note from the MIDI description
// and run the low-level modules.

// It will continue to evolve a bit, as note-stealing logic, scaling,
// and real-time control of parameters live here.

#include "env.h"
#include "pitchenv.h"
#include "fm_core.h"

class Dx7Note {
 public:
  void init(const char patch[128], int midinote, int velocity);

  // Note: this _adds_ to the buffer. Interesting question whether it's
  // worth it...
  //
  // [Parallax modification, 2026-09-12] `taps` threads straight through to
  // FmCore::compute and is null by default -- see fm_core.h for the layout and
  // README.md for why it exists. Patch 4 of four.
  void compute(int32_t *buf, int32_t lfo_val, int32_t lfo_delay,
    const Controllers *ctrls, int32_t *taps = 0);

  void keyup();

  // [Parallax modification, 2026-09-11] The "TODO: parameter changes" below,
  // implemented. Recomputes every operator's envelope parameters and base
  // pitch, plus the algorithm and feedback shift, from a new patch WITHOUT
  // restarting the note: init() rebuilds the voice from silence, this one
  // re-aims the voice that is already sounding. Deliberately does not touch
  // the pitch envelope — PitchEnv::set restarts it, and nothing that drives
  // this changes pitch-envelope bytes.
  //
  // Note the parameter type: like init(), this reads the UNPACKED 156-byte
  // patch. (init's header declaration says [128] and its definition says
  // [156]; the definition is the truthful one.)
  //
  // See README.md in this directory — one of three local patches.
  void update(const char patch[156], int midinote, int velocity);

  // TODO: parameter changes

  // TODO: some way of indicating end-of-note. Maybe should be a return
  // value from the compute method? (Having a count return from keyup
  // is also tempting, but if there's a dynamic parameter change after
  // keyup, that won't work.

 private:
  FmCore core_;
  Env env_[6];
  FmOpParams params_[6];
  PitchEnv pitchenv_;
  int32_t basepitch_[6];
  int32_t fb_buf_[2];
  int32_t fb_shift_;

  int algorithm_;
  int pitchmoddepth_;
  int pitchmodsens_;
};

#endif  // SYNTH_DX7NOTE_H_
