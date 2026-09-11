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

#include "synth.h"
#include "env.h"

using namespace std;

void Env::init(const int r[4], const int l[4], int32_t ol, int rate_scaling) {
  for (int i = 0; i < 4; i++) {
    rates_[i] = r[i];
    levels_[i] = l[i];
  }
  outlevel_ = ol;
  rate_scaling_ = rate_scaling;
  level_ = 0;
  down_ = true;
  advance(0);
}

int32_t Env::getsample() {
  if (ix_ < 3 || (ix_ < 4) && !down_) {
    if (rising_) {
      const int jumptarget = 1716;
      if (level_ < (jumptarget << 16)) {
        level_ = jumptarget << 16;
      }
      level_ += (((17 << 24) - level_) >> 24) * inc_;
      // TODO: should probably be more accurate when inc is large
      if (level_ >= targetlevel_) {
        level_ = targetlevel_;
        advance(ix_ + 1);
      }
    } else {  // !rising
      level_ -= inc_;
      if (level_ <= targetlevel_) {
        level_ = targetlevel_;
        advance(ix_ + 1);
      }
    }
  }
  // TODO: this would be a good place to set level to 0 when under threshold
  return level_;
}

void Env::keydown(bool d) {
  if (down_ != d) {
    down_ = d;
    advance(d ? 0 : 3);
  }
}

// [Parallax modification, 2026-09-11] See env.h. advance() recomputes
// targetlevel_, rising_ and inc_ from the member fields and never touches
// level_, so calling it in place is exactly "keep going from here, but aim
// somewhere else". rising_ flips on its own if the new target is below the
// level already reached.
void Env::update(const int r[4], const int l[4], int32_t ol, int rate_scaling) {
  // Output level has to be applied to the level the envelope has ALREADY
  // reached, not just to where it is heading. advance() folds outlevel_ into
  // the target linearly — `targetlevel_ = (scaled_level + outlevel_ - 4256) <<
  // 16` — so shifting level_ by the same delta puts the envelope at the new
  // output level while leaving it at exactly the same point in its own shape.
  //
  // Re-aiming alone is not enough, and the failure is quiet rather than
  // obvious: the level only moves at the current stage's rate, so lowering a
  // target changes nothing at all until the envelope happens to arrive there,
  // and on a held note parked at its sustain level it never does — getsample()
  // does not integrate at stage 3 while the key is down. Measured before this
  // was added: raising a modulator's level mid-note barely moved the spectrum
  // and lowering it was bit-identical to doing nothing.
  //
  // The shift is a jump, but not a step: FmOpKernel ramps an operator's gain
  // linearly across the render block, so it lands as a ~1.5 ms fade.
  const int32_t delta = ol - outlevel_;
  for (int i = 0; i < 4; i++) {
    rates_[i] = r[i];
    levels_[i] = l[i];
  }
  outlevel_ = ol;
  rate_scaling_ = rate_scaling;
  if (delta != 0) {
    int64_t shifted = (int64_t)level_ + ((int64_t)delta << 16);
    if (shifted < 0) shifted = 0;
    const int64_t kMaxLevel = 0x7fffffff;
    if (shifted > kMaxLevel) shifted = kMaxLevel;
    level_ = (int32_t)shifted;
  }
  if (ix_ < 4) {
    advance(ix_);
  }
}

void Env::setparam(int param, int value) {
  if (param < 4) {
    rates_[param] = value;
  } else if (param < 8) {
    levels_[param - 4] = value;
  }
  // Unknown parameter, ignore for now
}

const int levellut[] = {
  0, 5, 9, 13, 17, 20, 23, 25, 27, 29, 31, 33, 35, 37, 39, 41, 42, 43, 45, 46
};

int Env::scaleoutlevel(int outlevel) {
  return outlevel >= 20 ? 28 + outlevel : levellut[outlevel];
}

void Env::advance(int newix) {
  ix_ = newix;
  if (ix_ < 4) {
    int newlevel = levels_[ix_];
    int actuallevel = scaleoutlevel(newlevel) >> 1;
    actuallevel = (actuallevel << 6) + outlevel_ - 4256;
    actuallevel = actuallevel < 16 ? 16 : actuallevel;
    // level here is same as Java impl
    targetlevel_ = actuallevel << 16;
    rising_ = (targetlevel_ > level_);

    // rate
    int qrate = (rates_[ix_] * 41) >> 6;
    qrate += rate_scaling_;
    qrate = min(qrate, 63);
    inc_ = (4 + (qrate & 3)) << (2 + LG_N + (qrate >> 2));
  }
}

