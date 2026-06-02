/**
 * SMuFL codepoints used by the staff renderer.
 * Reference: https://www.smufl.org/version/latest/
 *
 * We only pull what M3 needs — extend as later milestones add rests,
 * dynamics, slurs, etc.
 */
export const GLYPH = {
  gClef:               "",
  noteheadWhole:       "",
  noteheadHalf:        "",
  noteheadBlack:       "",
  flag8thUp:           "",
  flag8thDown:         "",
  flag16thUp:          "",
  flag16thDown:        "",
  accidentalSharp:     "",
  accidentalFlat:      "",
  accidentalNatural:   "",
  timeSig0:            "",
  timeSig1:            "",
  timeSig2:            "",
  timeSig3:            "",
  timeSig4:            "",
  timeSig5:            "",
  timeSig6:            "",
  timeSig7:            "",
  timeSig8:            "",
  timeSig9:            "",
  restWhole:           "",
  restHalf:            "",
  restQuarter:         "",
  rest8th:             "",
  rest16th:            "",
} as const;
