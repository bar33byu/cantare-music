import type { VocalExercise } from "./vocalExercise";

interface SeedEvent {
  region: "context" | "exercise";
  startBeat: number;
  durationBeats: number;
  notes: string[];
  lyric?: string;
  role?: string;
}

interface SeedExercise {
  slug: string;
  title: string;
  category?: string;
  syllable?: string;
  description?: string;
  difficulty?: string;
  tempoBpm?: number;
  coachingNotes?: string[];
  pattern?: string;
  events: SeedEvent[];
}

interface VocalExerciseSeed {
  format: "cantare_exercise_seed_v1" | "cantare_exercise_seed_v2";
  collection?: {
    slug: string;
    title: string;
    description?: string;
    intendedSinger?: string;
    primaryGoals?: string[];
  };
  defaults: {
    timeSignature: { numerator: number; denominator: number };
    baseTempoBpm: number;
    exerciseStartBeat: number;
    transposeMode?: string;
    restBetweenIterations?: { measures?: number };
  };
  recommendedRoutineOrder?: string[];
  exercises: SeedExercise[];
}

export interface VocalExerciseSeedCollection {
  slug: string;
  title: string;
  description?: string;
  intendedSinger?: string;
  primaryGoals: string[];
  restBetweenIterationsMeasures: number;
  transposeMode: string;
}

export interface VocalExerciseSeedBundle {
  exercises: VocalExercise[];
  collection?: VocalExerciseSeedCollection;
}

const PITCH_CLASS: Record<string, number> = {
  C: 0,
  "C#": 1,
  Db: 1,
  D: 2,
  "D#": 3,
  Eb: 3,
  E: 4,
  F: 5,
  "F#": 6,
  Gb: 6,
  G: 7,
  "G#": 8,
  Ab: 8,
  A: 9,
  "A#": 10,
  Bb: 10,
  B: 11,
};

function isObject(value: unknown): value is Record<string, unknown> {
  return typeof value === "object" && value !== null;
}

export function scientificPitchToMidi(note: string): number {
  const match = /^([A-Ga-g])([#b]?)(-?\d+)$/.exec(note.trim());
  if (!match) throw new Error(`Invalid scientific pitch name: ${note}`);
  const pitchName = `${match[1].toUpperCase()}${match[2]}`;
  const pitchClass = PITCH_CLASS[pitchName];
  const midi = (Number(match[3]) + 1) * 12 + pitchClass;
  if (!Number.isInteger(midi) || midi < 0 || midi > 127) throw new Error(`Pitch is outside the MIDI range: ${note}`);
  return midi;
}

function validateSeed(value: unknown): asserts value is VocalExerciseSeed {
  if (!isObject(value) || (value.format !== "cantare_exercise_seed_v1" && value.format !== "cantare_exercise_seed_v2")) {
    throw new Error("Unsupported exercise seed format");
  }
  if (!isObject(value.defaults) || !isObject(value.defaults.timeSignature)) throw new Error("Exercise seed defaults are missing");
  if (!Array.isArray(value.exercises)) throw new Error("Exercise seed exercises must be an array");
}

export function parseVocalExerciseSeedBundle(value: unknown, createdAt = new Date().toISOString()): VocalExerciseSeedBundle {
  validateSeed(value);
  const { defaults } = value;
  const slugs = new Set<string>();
  const recommendedPositions = new Map((value.recommendedRoutineOrder ?? []).map((slug, index) => [slug, index]));
  const orderedExercises = [...value.exercises].sort((a, b) => {
    const aPosition = recommendedPositions.get(a.slug) ?? Number.MAX_SAFE_INTEGER;
    const bPosition = recommendedPositions.get(b.slug) ?? Number.MAX_SAFE_INTEGER;
    return aPosition - bPosition;
  });

  const exercises = orderedExercises.map((exercise, exerciseIndex) => {
    if (!exercise.slug?.trim() || !exercise.title?.trim() || !Array.isArray(exercise.events)) {
      throw new Error(`Exercise ${exerciseIndex + 1} is missing slug, title, or events`);
    }
    const slug = exercise.slug.trim();
    if (slugs.has(slug)) throw new Error(`Duplicate exercise slug: ${slug}`);
    slugs.add(slug);

    const events = exercise.events.flatMap((event, eventIndex) => {
      if ((event.region !== "context" && event.region !== "exercise") || !Array.isArray(event.notes) || event.notes.length === 0) {
        throw new Error(`Invalid event ${eventIndex + 1} in ${slug}`);
      }
      if (!Number.isFinite(event.startBeat) || event.startBeat < 0 || !Number.isFinite(event.durationBeats) || event.durationBeats <= 0) {
        throw new Error(`Invalid event timing in ${slug}`);
      }
      return event.notes.map((note, noteIndex) => ({
        id: `${slug}:${eventIndex}:${noteIndex}`,
        region: event.region,
        startBeat: event.startBeat,
        durationBeats: event.durationBeats,
        midi: scientificPitchToMidi(note),
        velocity: event.region === "context" ? 80 : 90,
        ...(event.lyric ? { lyric: event.lyric } : {}),
        ...(event.role ? { role: event.role } : {}),
      }));
    });
    const durationBeats = Math.max(...events.map((event) => event.startBeat + event.durationBeats));

    return {
      id: `seed:${slug}`,
      slug,
      title: exercise.title.trim(),
      category: exercise.category?.trim() || undefined,
      syllable: exercise.syllable?.trim() || undefined,
      description: exercise.description?.trim() || undefined,
      difficulty: exercise.difficulty?.trim() || undefined,
      pattern: exercise.pattern?.trim() || undefined,
      coachingNotes: Array.isArray(exercise.coachingNotes) ? exercise.coachingNotes.map((note) => note.trim()).filter(Boolean) : [],
      collectionSlug: value.collection?.slug,
      collectionTitle: value.collection?.title,
      routinePosition: recommendedPositions.get(slug),
      sourceMidiFile: `${value.format}.json#${slug}`,
      exerciseStartBeat: defaults.exerciseStartBeat,
      tempoBpm: Number.isFinite(exercise.tempoBpm) ? exercise.tempoBpm as number : defaults.baseTempoBpm,
      timeSignature: defaults.timeSignature,
      durationBeats,
      events,
      createdAt,
    };
  });

  const collection = value.collection ? {
    slug: value.collection.slug,
    title: value.collection.title,
    description: value.collection.description,
    intendedSinger: value.collection.intendedSinger,
    primaryGoals: value.collection.primaryGoals ?? [],
    restBetweenIterationsMeasures: value.defaults.restBetweenIterations?.measures ?? 0,
    transposeMode: value.defaults.transposeMode ?? "semitone_all_notes",
  } : undefined;

  return { exercises, collection };
}

export function parseVocalExerciseSeed(value: unknown, createdAt = new Date().toISOString()): VocalExercise[] {
  return parseVocalExerciseSeedBundle(value, createdAt).exercises;
}
