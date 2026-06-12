import { describe, it, expect } from "vitest";
import { remapByDegree, buildRowMidis } from "./grid";

describe("remapByDegree (A5 nearest-octave)", () => {
  it("moves B4 to the NEAREST Db-major degree, not the same letter-octave", () => {
    // The B/C boundary regression: C->Db sent B4 (71) down to C4 (60), 11
    // semitones, instead of up to C5 (72), 1 semitone.
    const out = remapByDegree(
      [{ startStep: 0, durationSteps: 4, midi: 71 }],
      "C", "major", "Db", "major",
    );
    expect(out[0].midi).toBe(72);
  });

  it("maps C4 -> Db4 (61), the nearest tonic", () => {
    const out = remapByDegree(
      [{ startStep: 0, durationSteps: 4, midi: 60 }],
      "C", "major", "Db", "major",
    );
    expect(out[0].midi).toBe(61);
  });

  it("is a no-op when key and scale are unchanged", () => {
    const events = [{ startStep: 0, durationSteps: 4, midi: 64 }];
    expect(remapByDegree(events, "C", "major", "C", "major")).toEqual(events);
  });

  it("never moves a remapped note more than 6 semitones", () => {
    // Every degree should land within a tritone of where it started.
    for (let midi = 60; midi <= 72; midi++) {
      const out = remapByDegree(
        [{ startStep: 0, durationSteps: 4, midi }],
        "C", "major", "G", "major",
      );
      expect(Math.abs(out[0].midi - midi)).toBeLessThanOrEqual(6);
    }
  });

  it("keeps out-of-scale notes unchanged", () => {
    // C# (61) isn't in C major -> kept at its midi value.
    const out = remapByDegree(
      [{ startStep: 0, durationSteps: 4, midi: 61 }],
      "C", "major", "D", "major",
    );
    expect(out[0].midi).toBe(61);
  });
});

describe("buildRowMidis", () => {
  it("returns 7 scale rows per octave + the top tonic for a diatonic scale", () => {
    // baseOctave 4, 1 octave, C major: C4..C5 in-scale = C D E F G A B C = 8.
    const rows = buildRowMidis("C", "major", 4, true, 1);
    expect(rows).toHaveLength(8);
    expect(rows[0]).toBe(60); // C4
    expect(rows[rows.length - 1]).toBe(72); // C5
  });

  it("returns all 13 chromatic rows per octave when not folding", () => {
    const rows = buildRowMidis("C", "major", 4, false, 1);
    expect(rows).toHaveLength(13); // C4..C5 inclusive
  });

  it("returns 6 rows per octave for a pentatonic scale (+ top tonic)", () => {
    // major pentatonic = 5 notes; one octave inclusive = 6 rows.
    const rows = buildRowMidis("C", "major", 4, true, 1);
    const penta = buildRowMidis("C", "pentatonic", 4, true, 1);
    expect(penta).toHaveLength(6);
    expect(penta.length).toBeLessThan(rows.length);
  });

  it("spans two octaves when asked", () => {
    const one = buildRowMidis("C", "major", 4, true, 1);
    const two = buildRowMidis("C", "major", 4, true, 2);
    expect(two.length).toBeGreaterThan(one.length);
    expect(two[0]).toBe(60);
    expect(two[two.length - 1]).toBe(84); // C6
  });
});
