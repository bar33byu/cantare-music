import { describe, expect, it } from "vitest";
import { getExercisePitchRange } from "./vocalExercise";
import { parseVocalExerciseSeed, parseVocalExerciseSeedBundle, scientificPitchToMidi } from "./vocalExerciseSeed";

describe("vocal exercise seed mapping", () => {
  it("uses scientific pitch notation with C4 at MIDI 60", () => {
    expect(scientificPitchToMidi("C4")).toBe(60);
    expect(scientificPitchToMidi("A2")).toBe(45);
    expect(scientificPitchToMidi("Db4")).toBe(61);
  });

  it("flattens chords while preserving metadata and sung range semantics", () => {
    const [exercise] = parseVocalExerciseSeed({
      format: "cantare_exercise_seed_v1",
      defaults: {
        timeSignature: { numerator: 4, denominator: 4 },
        baseTempoBpm: 88,
        exerciseStartBeat: 4,
      },
      exercises: [{
        slug: "triad",
        title: "Triad",
        category: "Tone",
        syllable: "mum",
        description: "A triad",
        events: [
          { region: "context", startBeat: 0, durationBeats: 3.5, notes: ["C2", "E2", "G2"], role: "context_chord" },
          { region: "exercise", startBeat: 4, durationBeats: 1, notes: ["C3"], lyric: "mum" },
          { region: "exercise", startBeat: 5, durationBeats: 1, notes: ["G3"], lyric: "mum" },
        ],
      }],
    }, "2026-06-21T00:00:00.000Z");

    expect(exercise.id).toBe("seed:triad");
    expect(exercise.events).toHaveLength(5);
    expect(exercise.events[0]).toMatchObject({ role: "context_chord", midi: 36 });
    expect(exercise.events[3]).toMatchObject({ lyric: "mum", midi: 48 });
    expect(getExercisePitchRange(exercise)).toEqual({ low: 48, high: 55 });
  });

  it("maps v2 collections, routine order, and per-exercise tempos", () => {
    const bundle = parseVocalExerciseSeedBundle({
      format: "cantare_exercise_seed_v2",
      collection: {
        slug: "warmups",
        title: "Warmups",
        intendedSinger: "baritone",
        primaryGoals: ["Smooth passaggio"],
      },
      defaults: {
        timeSignature: { numerator: 4, denominator: 4 },
        baseTempoBpm: 84,
        exerciseStartBeat: 4,
        transposeMode: "semitone_all_notes",
        restBetweenIterations: { measures: 1 },
      },
      recommendedRoutineOrder: ["second", "first"],
      exercises: [
        { slug: "first", title: "First", events: [{ region: "exercise", startBeat: 4, durationBeats: 1, notes: ["C3"] }] },
        {
          slug: "second",
          title: "Second",
          tempoBpm: 72,
          difficulty: "easy",
          pattern: "1 sustained",
          coachingNotes: ["Stay light."],
          events: [{ region: "exercise", startBeat: 4, durationBeats: 1, notes: ["D3"] }],
        },
      ],
    }, "2026-06-21T00:00:00.000Z");

    expect(bundle.collection).toMatchObject({
      slug: "warmups",
      restBetweenIterationsMeasures: 1,
      transposeMode: "semitone_all_notes",
    });
    expect(bundle.exercises.map((exercise) => exercise.slug)).toEqual(["second", "first"]);
    expect(bundle.exercises[0]).toMatchObject({
      tempoBpm: 72,
      collectionTitle: "Warmups",
      routinePosition: 0,
      coachingNotes: ["Stay light."],
    });
    expect(bundle.exercises[1].tempoBpm).toBe(84);
  });
});
