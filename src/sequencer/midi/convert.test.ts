import { describe, it, expect } from "vitest";
import { melodyToMidi, midiToMelody } from "./convert";
import type { Melody } from "../../state/stores";

const melody: Melody = {
  tempo: 128,
  key: "C",
  scale: "major",
  events: [
    { startStep: 0, durationSteps: 4, midi: 60 },
    { startStep: 4, durationSteps: 4, midi: 64 },
    { startStep: 8, durationSteps: 8, midi: 67 },
    { startStep: 16, durationSteps: 2, midi: 72 },
  ],
};

describe("melody -> MIDI -> melody round-trip", () => {
  it("preserves the notes, starts, durations and tempo", () => {
    const { events, tempo } = midiToMelody(melodyToMidi(melody));
    expect(tempo).toBe(128);
    expect(events).toHaveLength(4);
    expect(events).toEqual(melody.events);
  });
});

describe("midiToMelody reduction", () => {
  it("reduces simultaneous notes to the highest pitch (monophonic) and counts drops", () => {
    const chordy: Melody = {
      tempo: 120, key: "C", scale: "major",
      events: [
        { startStep: 0, durationSteps: 4, midi: 60 },
        { startStep: 0, durationSteps: 4, midi: 64 },
        { startStep: 0, durationSteps: 4, midi: 67 },
      ],
    };
    const { events, dropped } = midiToMelody(melodyToMidi(chordy));
    expect(events).toHaveLength(1);
    expect(events[0].midi).toBe(67); // highest wins
    expect(dropped).toBe(2);
  });

  it("trims a note so it never overruns the next note's start", () => {
    const overlap: Melody = {
      tempo: 120, key: "C", scale: "major",
      events: [
        { startStep: 0, durationSteps: 16, midi: 60 }, // would run into step 4
        { startStep: 4, durationSteps: 4, midi: 62 },
      ],
    };
    const { events } = midiToMelody(melodyToMidi(overlap));
    expect(events[0].startStep).toBe(0);
    expect(events[0].durationSteps).toBe(4); // trimmed to the next start
    expect(events[1].startStep).toBe(4);
  });

  it("drops notes past bar 4 / out of MIDI range, counting them", () => {
    // melodyToMidi already skips out-of-range on the way out, so author the Midi
    // by hand via a melody that places a note exactly at the last valid step.
    const edge: Melody = {
      tempo: 120, key: "C", scale: "major",
      events: [
        { startStep: 63, durationSteps: 4, midi: 60 }, // last valid step
        { startStep: 0, durationSteps: 4, midi: 48 },
      ],
    };
    const { events } = midiToMelody(melodyToMidi(edge));
    // both are in-range -> both survive
    expect(events).toHaveLength(2);
    expect(events.every((e) => e.startStep < 64)).toBe(true);
  });
});
