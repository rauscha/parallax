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

#ifndef __FM_CORE_H
#define __FM_CORE_H

#include "aligned_buf.h"

struct FmOpParams {
  int32_t gain[2];
  int32_t freq;
  int32_t phase;
};

class FmCore {
 public:
  static void dump();

  // [Parallax modification, 2026-09-12] Optional per-operator tap output --
  // patch 4 of four, see README.md in this directory.
  //
  // `taps` is null by default and the engine then behaves exactly as upstream.
  // When non-null it points at 7 * N int32 samples, laid out as seven blocks:
  //
  //   block 0..5   operator 0..5's own output for this render block, in msfa
  //                index order (0 is panel operator 6), BEFORE the algorithm
  //                sums or overwrites it into a bus
  //   block 6      the feedback wire -- the value the feedback operator mixes
  //                into its own phase, zero when no feedback path is taken
  //
  // Taps exist because there is no seam outside this method: the operator
  // kernels write straight into the shared buses and the output buffer with
  // `add` flags, so each contribution is summed or overwritten away in place by
  // the next operator. The flowsheet view (FM spec section 2) draws the real
  // per-operator signal, so it has to be caught here or not at all. Reading it
  // from a TS re-implementation of the 32-algorithm table was the rejected
  // alternative -- that table is the one thing most likely to drift and make
  // the diagram lie about the signal it is drawing.
  void compute(int32_t *output, FmOpParams *params, int algorithm,
               int32_t *fb_buf, int32_t feedback_gain,
               int32_t *taps = 0);
 private:
  AlignedBuf<int32_t, N>buf_[2];
};

#endif  // __FM_CORE_H
