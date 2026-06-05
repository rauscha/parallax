/**
 * Per-model AD (attack/decay) envelope defaults for the Braids models.
 *
 * Braids has a built-in one-shot AD envelope that the firmware can route to the
 * VCA (amplitude), TIMBRE, COLOR, and pitch (FM). On real hardware these are
 * global menu settings; here we give the UNPITCHED drum models (KICK, SNAR,
 * CYMB, DRUM) a built-in VCA decay + `letRing` so they hit-and-decay like a
 * drum machine. Every other model — including the pitched struck/plucked ones
 * (PLUK, BELL), which self-decay in the DSP on their own — is left as a normal
 * gated voice, ringing for as long as the note is held, exactly as before this
 * table existed. See PERCUSSIVE_ENVELOPES below for why PLUK/BELL are excluded.
 *
 * ── Faithful firmware ranges (do not exceed) ──────────────────────────────────
 *   attack / decay   0..15   → shim multiplies by 8 → lut_env_portamento_increments
 *                              index 0..120 (the LUT has 128 entries; staying
 *                              ≤15 keeps the read in bounds). Mirrors the
 *                              firmware's `Update(GetValue(AD_ATTACK) * 8, …)`.
 *   vca              0..1    → boolean. 0 = amplitude untouched (model sustains);
 *                              1 = output amplitude follows the AD envelope.
 *   timbre/color/fm  0..15   → modulation depth of the AD envelope onto TIMBRE /
 *                              COLOR / pitch. 0 = no sweep.
 * The engine clamps to these ranges before handing values to the WASM, so a bad
 * entry here can't push the LUT index out of bounds — but keep the table honest.
 *
 * ── decay step → approximate time ────────────────────────────────────────────
 * (one envelope tick = one 24-sample block @ 96 kHz = 0.25 ms; time ≈ 2³² / lut)
 *   step  ≈time        step  ≈time
 *    0    0.75 ms       8    346 ms
 *    1    2.6 ms        9    543 ms
 *    2    7.1 ms       10    825 ms
 *    3     17 ms       11    1.22 s
 *    4     35 ms       12    1.76 s
 *    5     68 ms       13    2.48 s
 *    6    124 ms       14    3.42 s
 *    7    212 ms       15    5.39 s
 *
 * These are CONSERVATIVE first-pass values — a pure amplitude (VCA) decay with
 * no spectral or pitch sweep — meant to be ear-tuned. TIMBRE/COLOR/FM sweeps and
 * promoting borderline models (RING, HARM, FM, FBFM, PRTC) are left for tuning.
 */

export interface BraidsEnvelope {
  /** Attack LUT step 0..15. 0 ≈ instant (~0.75 ms) — right for struck/plucked. */
  attack: number;
  /** Decay LUT step 0..15. See the time table above. */
  decay: number;
  /** AD→VCA. 0 = amplitude unaffected (sustains); 1 = amplitude follows the AD. */
  vca: 0 | 1;
  /** AD→TIMBRE depth 0..15. 0 = no envelope sweep on the TIMBRE parameter. */
  timbre: number;
  /** AD→COLOR depth 0..15. */
  color: number;
  /** AD→FM depth 0..15 (pitch envelope). */
  fm: number;
  /**
   * Let the voice ring its full decay regardless of note-off — i.e. behave like
   * a drum-machine one-shot, where releasing the key doesn't cut the hit.
   *
   * ONLY safe for UNPITCHED models (KICK/SNAR/CYMB/DRUM): a held step or a quick
   * QWERTY tap then plays the whole tail. PITCHED struck/plucked models must NOT
   * set this — they self-decay in the DSP already, and leaving the gate open lets
   * successive notes at different pitches pile up into discordant overlaps
   * (PLUK is paraphonic in the firmware — every strike adds a new ringing voice).
   * When false, note-off gates normally so the Release knob works and successive
   * notes cut cleanly.
   */
  letRing: boolean;
}

/**
 * The default for every model not in the percussive table below: AD dormant, so
 * the model sustains at full level for as long as the note is gated — identical
 * to the behaviour before this table was wired in. (No behavioural change for
 * the 41 sustained models.)
 */
export const SUSTAINED_ENVELOPE: BraidsEnvelope = {
  attack: 0, decay: 0, vca: 0, timbre: 0, color: 0, fm: 0, letRing: false,
};

/**
 * AD envelopes for the UNPITCHED drum / percussion models, keyed by firmware
 * model index (see braids-models.ts). These are one-shots: a VCA decay shapes
 * the tail and `letRing` plays it out in full regardless of note-off, so a quick
 * tap or a short step still gives the whole hit. Overlap between hits is harmless
 * because they carry no pitch to clash.
 *
 * Deliberately NOT here: PLUK (28) and BELL (32). Both self-decay in the DSP and
 * carry pitch, so they're left as a normal gated voice — the model's own physics
 * provides the pluck/decay, the Release knob still works, and successive notes
 * cut cleanly instead of piling up into discordant overlaps. (PLUK is paraphonic
 * in the firmware; forcing it to ring out stacks every note into a cluster.)
 *
 * Pure VCA decay for now — no TIMBRE/COLOR/FM sweep. Ear-tune the decay lengths.
 */
const PERCUSSIVE_ENVELOPES: Record<number, BraidsEnvelope> = {
  // 33 DRUM — struck metallic drum / gong. ~543 ms.
  33: { attack: 0, decay: 9, vca: 1, timbre: 0, color: 0, fm: 0, letRing: true },
  // 34 KICK — TR-808 bass drum. Tight boom; the 808 model carries its own pitch
  // envelope, so we shape amplitude only. ~346 ms.
  34: { attack: 0, decay: 8, vca: 1, timbre: 0, color: 0, fm: 0, letRing: true },
  // 35 CYMB — cymbal, metallic wash. ~1.22 s.
  35: { attack: 0, decay: 11, vca: 1, timbre: 0, color: 0, fm: 0, letRing: true },
  // 36 SNAR — TR-808 snare, snappy noise burst. ~212 ms.
  36: { attack: 0, decay: 7, vca: 1, timbre: 0, color: 0, fm: 0, letRing: true },
};

/** AD envelope for a model index. Falls back to SUSTAINED_ENVELOPE. */
export function getBraidsEnvelope(index: number): BraidsEnvelope {
  return PERCUSSIVE_ENVELOPES[index] ?? SUSTAINED_ENVELOPE;
}

/** True when a model has a non-dormant AD envelope (handy for the explain panel). */
export function hasEnvelope(index: number): boolean {
  return index in PERCUSSIVE_ENVELOPES;
}
