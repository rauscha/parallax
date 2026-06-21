import { describe, it, expect } from "vitest";
import { remapByDegree, buildRowMidis, buildRhythm, pickNext, findTonicIdx, randomizeMelody } from "./grid";

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

describe("buildRhythm", () => {
  it("produces at least 1 slot for totalSteps > 0", () => {
    expect(buildRhythm(64, 0).length).toBeGreaterThan(0);
  });

  it("returns [] for totalSteps = 0", () => {
    expect(buildRhythm(0, 0)).toEqual([]);
  });

  it("slots never overlap — each start >= previous start + previous dur", () => {
    for (let run = 0; run < 20; run++) {
      const slots = buildRhythm(64, 0.2);
      for (let j = 1; j < slots.length; j++) {
        expect(slots[j].start).toBeGreaterThanOrEqual(
          slots[j - 1].start + slots[j - 1].dur,
        );
      }
    }
  });

  it("last slot ends at or before totalSteps", () => {
    for (let run = 0; run < 20; run++) {
      const slots = buildRhythm(64, 0.2);
      const last = slots.at(-1)!;
      expect(last.start + last.dur).toBeLessThanOrEqual(64);
    }
  });

  it("every duration is >= 1", () => {
    for (let run = 0; run < 20; run++) {
      expect(buildRhythm(64, 0.2).every(s => s.dur >= 1)).toBe(true);
    }
  });
});

describe("pickNext", () => {
  const midis = [60, 62, 64, 65, 67, 69, 71, 72]; // C major 1-octave

  it("always returns a valid index in [0, midis.length − 1]", () => {
    for (let i = 0; i < 100; i++) {
      const result = pickNext(midis, 3, 7);
      expect(result).toBeGreaterThanOrEqual(0);
      expect(result).toBeLessThanOrEqual(midis.length - 1);
    }
  });

  it("returns 0 for a single-element array", () => {
    expect(pickNext([60], 0, 0)).toBe(0);
  });

  it("biases upward when targetIdx > idx (>60% of 100 runs move up or stay)", () => {
    let up = 0;
    for (let i = 0; i < 100; i++) {
      if (pickNext(midis, 1, 7) >= 1) up++;
    }
    expect(up).toBeGreaterThan(60);
  });

  it("biases downward when targetIdx < idx (>60% of 100 runs move down or stay)", () => {
    let down = 0;
    for (let i = 0; i < 100; i++) {
      if (pickNext(midis, 6, 0) <= 6) down++;
    }
    expect(down).toBeGreaterThan(60);
  });
});

describe("findTonicIdx", () => {
  it("returns 0 for C major starting at C (chroma 0 is the first note)", () => {
    const midis = buildRowMidis("C", "major", 3, true, 2);
    expect(findTonicIdx(midis, "C")).toBe(0);
    expect(midis[0] % 12).toBe(0); // C
  });

  it("returns an index > 0 for G major (tonic G is not the first note in the range)", () => {
    // buildRowMidis starts at C3=48; in G major the first note is C3 (chroma 0),
    // so the first G (chroma 7) is at some later index.
    const midis = buildRowMidis("G", "major", 3, true, 2);
    const idx = findTonicIdx(midis, "G");
    expect(idx).toBeGreaterThan(0);
    expect(midis[idx] % 12).toBe(7); // G chroma
  });
});

describe("randomizeMelody (musical)", () => {
  it("returns at least one event", () => {
    expect(randomizeMelody("C", "major", 3, 2).length).toBeGreaterThan(0);
  });

  it("first and last event are the tonic — key C (chroma 0)", () => {
    for (let run = 0; run < 10; run++) {
      const ev = randomizeMelody("C", "major", 3, 2);
      expect(ev[0].midi % 12).toBe(0);
      expect(ev.at(-1)!.midi % 12).toBe(0);
    }
  });

  it("first and last event are the tonic — key G (chroma 7)", () => {
    for (let run = 0; run < 10; run++) {
      const ev = randomizeMelody("G", "major", 3, 2);
      expect(ev[0].midi % 12).toBe(7);
      expect(ev.at(-1)!.midi % 12).toBe(7);
    }
  });

  it("all startSteps are in [0, 63]", () => {
    const ev = randomizeMelody("C", "major", 3, 2);
    expect(ev.every(e => e.startStep >= 0 && e.startStep <= 63)).toBe(true);
  });

  it("all durations are >= 1", () => {
    const ev = randomizeMelody("C", "major", 3, 2);
    expect(ev.every(e => e.durationSteps >= 1)).toBe(true);
  });

  it("produces rhythmic variety across 5 runs (more than 1 distinct duration)", () => {
    const durs = new Set<number>();
    for (let run = 0; run < 5; run++) {
      for (const e of randomizeMelody("C", "major", 3, 2)) durs.add(e.durationSteps);
    }
    expect(durs.size).toBeGreaterThan(1);
  });

  it("works for pentatonic scale", () => {
    const ev = randomizeMelody("C", "pentatonic", 3, 2);
    expect(ev.length).toBeGreaterThan(0);
    expect(ev.every(e => e.durationSteps >= 1)).toBe(true);
  });
});
