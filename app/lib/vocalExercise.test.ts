import { describe, expect, it } from "vitest";
import {
  alignContextToMetronome,
  generateTranspositionPath,
  getContextMetronomeBeats,
  getExercisePitchRange,
  midiNoteName,
  parseVocalExerciseMidi,
  setExerciseStartBeat,
  type VocalExercise,
} from "./vocalExercise";

const exercise: VocalExercise = {
  id: "exercise-1",
  title: "Triad",
  sourceMidiFile: "triad.mid",
  exerciseStartBeat: 4,
  tempoBpm: 90,
  timeSignature: { numerator: 4, denominator: 4 },
  durationBeats: 8,
  createdAt: "2026-01-01T00:00:00.000Z",
  events: [
    { id: "context", startBeat: 0, durationBeats: 2, midi: 36, velocity: 80, region: "context" },
    { id: "low", startBeat: 4, durationBeats: 1, midi: 60, velocity: 90, region: "exercise" },
    { id: "high", startBeat: 5, durationBeats: 1, midi: 67, velocity: 90, region: "exercise" },
  ],
};

describe("vocal exercise utilities", () => {
  it("parses timing metadata and notes across MIDI tracks", () => {
    const header = [0x4d, 0x54, 0x68, 0x64, 0, 0, 0, 6, 0, 1, 0, 2, 0x01, 0xe0];
    const metaEvents = [
      0, 0xff, 0x51, 3, 0x0a, 0x2c, 0x2b, // 90 BPM
      0, 0xff, 0x58, 4, 3, 2, 24, 8, // 3/4
      0, 0xff, 0x2f, 0,
    ];
    const noteEvents = [
      0, 0x90, 60, 100,
      0x83, 0x60, 0x80, 60, 0, // note off at 480 ticks / beat 1
      0, 0x90, 64, 90,
      0x83, 0x60, 0x80, 64, 0,
      0, 0xff, 0x2f, 0,
    ];
    const track = (events: number[]) => [
      0x4d, 0x54, 0x72, 0x6b,
      (events.length >>> 24) & 0xff,
      (events.length >>> 16) & 0xff,
      (events.length >>> 8) & 0xff,
      events.length & 0xff,
      ...events,
    ];
    const parsed = parseVocalExerciseMidi(new Uint8Array([...header, ...track(metaEvents), ...track(noteEvents)]), {
      id: "parsed",
      title: "Parsed",
      sourceMidiFile: "parsed.mid",
      exerciseStartBeat: 1,
    });

    expect(parsed.tempoBpm).toBeCloseTo(90, 1);
    expect(parsed.timeSignature).toEqual({ numerator: 3, denominator: 4 });
    expect(parsed.events).toHaveLength(2);
    expect(parsed.events.map((event) => event.region)).toEqual(["context", "exercise"]);
    expect(parsed.durationBeats).toBe(2);
  });

  it("names MIDI pitches", () => {
    expect(midiNoteName(45)).toBe("A2");
    expect(midiNoteName(64)).toBe("E4");
  });

  it("uses only sung notes for pitch limits", () => {
    expect(getExercisePitchRange(exercise)).toEqual({ low: 60, high: 67 });
  });

  it("starts centrally, reaches both limits, and returns to its start", () => {
    expect(generateTranspositionPath(exercise, { low: 57, high: 70 }))
      .toEqual([0, 1, 2, 3, 2, 1, 0, -1, -2, -3, -2, -1, 0]);
  });

  it("returns no path when the exercise cannot fit", () => {
    expect(generateTranspositionPath(exercise, { low: 61, high: 65 })).toEqual([]);
  });

  it("reclassifies notes when the sing marker moves", () => {
    const updated = setExerciseStartBeat(exercise, 5);
    expect(updated.events.map((event) => event.region)).toEqual(["context", "context", "exercise"]);
  });

  it("generates metronome beats only before the exercise region", () => {
    expect(getContextMetronomeBeats(exercise)).toEqual([0, 1, 2, 3]);
    expect(getContextMetronomeBeats({
      ...exercise,
      exerciseStartBeat: 1.5,
      timeSignature: { numerator: 6, denominator: 8 },
    })).toEqual([0, 0.5, 1]);
  });

  it("aligns context arpeggios without repeating the singing pattern", () => {
    const arpeggio = {
      ...exercise,
      events: [
        { id: "root", startBeat: 0, durationBeats: 0.75, midi: 48, velocity: 80, region: "context" as const, role: "context_arpeggio" },
        { id: "third", startBeat: 0.75, durationBeats: 0.75, midi: 52, velocity: 80, region: "context" as const, role: "context_arpeggio" },
        { id: "fifth", startBeat: 1.5, durationBeats: 0.75, midi: 55, velocity: 80, region: "context" as const, role: "context_arpeggio" },
        { id: "chord", startBeat: 2.25, durationBeats: 1.25, midi: 48, velocity: 80, region: "context" as const, role: "context_chord" },
        ...exercise.events.filter((event) => event.region === "exercise"),
      ],
    };
    const updated = alignContextToMetronome(arpeggio);
    expect(updated.exerciseStartBeat).toBe(4);
    expect(updated.events.filter((event) => event.region === "context").map((event) => event.startBeat)).toEqual([0, 1, 2, 3]);
    expect(updated.events.filter((event) => event.region === "exercise").map((event) => event.startBeat)).toEqual([4, 5]);
    expect(updated.events.some((event) => event.role === "context_demonstration")).toBe(false);
  });

});
