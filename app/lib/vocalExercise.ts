export type ExerciseRegion = "context" | "exercise";

export interface ExerciseNoteEvent {
  id: string;
  startBeat: number;
  durationBeats: number;
  midi: number;
  velocity: number;
  region: ExerciseRegion;
  lyric?: string;
  role?: string;
}

export interface VocalExercise {
  id: string;
  slug?: string;
  title: string;
  category?: string;
  syllable?: string;
  description?: string;
  difficulty?: string;
  pattern?: string;
  coachingNotes?: string[];
  audioKey?: string;
  audioUrl?: string;
  alternateAudioKey?: string;
  alternateAudioUrl?: string;
  lyricHint?: string;
  collectionSlug?: string;
  collectionTitle?: string;
  routinePosition?: number;
  sourceMidiFile: string;
  exerciseStartBeat: number;
  tempoBpm: number;
  timeSignature: { numerator: number; denominator: number };
  durationBeats: number;
  events: ExerciseNoteEvent[];
  createdAt: string;
}

export interface VocalRange {
  low: number;
  high: number;
}

interface ParsedNote {
  startTick: number;
  durationTicks: number;
  midi: number;
  velocity: number;
  track: number;
}

const DEFAULT_TEMPO_BPM = 120;
const NOTE_NAMES = ["C", "C#", "D", "D#", "E", "F", "F#", "G", "G#", "A", "A#", "B"];

function readText(view: DataView, offset: number, length: number): string {
  let result = "";
  for (let index = 0; index < length; index += 1) result += String.fromCharCode(view.getUint8(offset + index));
  return result;
}

function readVariableLength(view: DataView, cursor: { offset: number }, limit: number): number {
  let value = 0;
  for (let index = 0; index < 4; index += 1) {
    if (cursor.offset >= limit) throw new Error("Unexpected end of MIDI event");
    const byte = view.getUint8(cursor.offset++);
    value = (value << 7) | (byte & 0x7f);
    if ((byte & 0x80) === 0) return value;
  }
  throw new Error("Invalid MIDI variable-length value");
}

export function midiNoteName(midi: number): string {
  const rounded = Math.round(midi);
  return `${NOTE_NAMES[((rounded % 12) + 12) % 12]}${Math.floor(rounded / 12) - 1}`;
}

export function parseVocalExerciseMidi(
  bytes: ArrayBuffer | Uint8Array,
  input: { id: string; title: string; sourceMidiFile: string; exerciseStartBeat?: number }
): VocalExercise {
  const buffer = bytes instanceof Uint8Array
    ? bytes.buffer.slice(bytes.byteOffset, bytes.byteOffset + bytes.byteLength)
    : bytes;
  const view = new DataView(buffer);
  if (view.byteLength < 14 || readText(view, 0, 4) !== "MThd") throw new Error("Invalid MIDI header");

  const headerLength = view.getUint32(4);
  const trackCount = view.getUint16(10);
  const division = view.getInt16(12);
  if (division <= 0) throw new Error("SMPTE-time MIDI files are not supported");

  let offset = 8 + headerLength;
  let tempoBpm = DEFAULT_TEMPO_BPM;
  let firstTempoTick = Number.POSITIVE_INFINITY;
  let timeSignature = { numerator: 4, denominator: 4 };
  let firstSignatureTick = Number.POSITIVE_INFINITY;
  const parsedNotes: ParsedNote[] = [];

  for (let track = 0; track < trackCount; track += 1) {
    if (offset + 8 > view.byteLength || readText(view, offset, 4) !== "MTrk") {
      throw new Error("Invalid MIDI track header");
    }
    const trackLength = view.getUint32(offset + 4);
    const trackEnd = offset + 8 + trackLength;
    if (trackEnd > view.byteLength) throw new Error("Truncated MIDI track");
    const cursor = { offset: offset + 8 };
    const activeNotes = new Map<string, Array<{ tick: number; velocity: number }>>();
    let tick = 0;
    let runningStatus = 0;

    while (cursor.offset < trackEnd) {
      tick += readVariableLength(view, cursor, trackEnd);
      let status = view.getUint8(cursor.offset);
      if ((status & 0x80) !== 0) {
        cursor.offset += 1;
        runningStatus = status < 0xf0 ? status : runningStatus;
      } else {
        status = runningStatus;
        if (!status) throw new Error("Invalid MIDI running status");
      }

      if (status === 0xff) {
        const type = view.getUint8(cursor.offset++);
        const length = readVariableLength(view, cursor, trackEnd);
        if (cursor.offset + length > trackEnd) throw new Error("Truncated MIDI metadata");
        if (type === 0x51 && length === 3 && tick <= firstTempoTick) {
          const micros = (view.getUint8(cursor.offset) << 16)
            | (view.getUint8(cursor.offset + 1) << 8)
            | view.getUint8(cursor.offset + 2);
          if (micros > 0) {
            tempoBpm = Math.round((60_000_000 / micros) * 100) / 100;
            firstTempoTick = tick;
          }
        }
        if (type === 0x58 && length >= 2 && tick <= firstSignatureTick) {
          timeSignature = {
            numerator: view.getUint8(cursor.offset) || 4,
            denominator: 2 ** view.getUint8(cursor.offset + 1),
          };
          firstSignatureTick = tick;
        }
        cursor.offset += length;
        continue;
      }

      if (status === 0xf0 || status === 0xf7) {
        const length = readVariableLength(view, cursor, trackEnd);
        cursor.offset += length;
        continue;
      }

      const eventType = status & 0xf0;
      const channel = status & 0x0f;
      const dataLength = eventType === 0xc0 || eventType === 0xd0 ? 1 : 2;
      if (cursor.offset + dataLength > trackEnd) throw new Error("Truncated MIDI channel event");
      const pitch = view.getUint8(cursor.offset);
      const velocity = dataLength === 2 ? view.getUint8(cursor.offset + 1) : 0;
      cursor.offset += dataLength;
      const key = `${channel}:${pitch}`;

      if (eventType === 0x90 && velocity > 0) {
        const starts = activeNotes.get(key) ?? [];
        starts.push({ tick, velocity });
        activeNotes.set(key, starts);
      } else if (eventType === 0x80 || (eventType === 0x90 && velocity === 0)) {
        const starts = activeNotes.get(key);
        const start = starts?.shift();
        if (starts?.length === 0) activeNotes.delete(key);
        if (start && tick > start.tick) {
          parsedNotes.push({ startTick: start.tick, durationTicks: tick - start.tick, midi: pitch, velocity: start.velocity, track });
        }
      }
    }
    offset = trackEnd;
  }

  if (parsedNotes.length === 0) throw new Error("This MIDI file does not contain any complete notes");
  const exerciseStartBeat = Math.max(0, input.exerciseStartBeat ?? 0);
  const ordered = parsedNotes.sort((a, b) => a.startTick - b.startTick || a.track - b.track || a.midi - b.midi);
  const events = ordered.map<ExerciseNoteEvent>((note, index) => {
    const startBeat = note.startTick / division;
    return {
      id: `note-${index}`,
      startBeat,
      durationBeats: Math.max(1 / 64, note.durationTicks / division),
      midi: note.midi,
      velocity: note.velocity,
      region: startBeat < exerciseStartBeat ? "context" : "exercise",
    };
  });
  const durationBeats = Math.max(...events.map((event) => event.startBeat + event.durationBeats));

  return {
    id: input.id,
    title: input.title.trim() || input.sourceMidiFile.replace(/\.(mid|midi)$/i, ""),
    sourceMidiFile: input.sourceMidiFile,
    exerciseStartBeat,
    tempoBpm,
    timeSignature,
    durationBeats,
    events,
    createdAt: new Date().toISOString(),
  };
}

export function setExerciseStartBeat(exercise: VocalExercise, exerciseStartBeat: number): VocalExercise {
  const safeStart = Math.max(0, Math.min(exercise.durationBeats, exerciseStartBeat));
  return {
    ...exercise,
    exerciseStartBeat: safeStart,
    events: exercise.events.map((event) => ({
      ...event,
      region: event.startBeat < safeStart ? "context" : "exercise",
    })),
  };
}

export function getExercisePitchRange(exercise: VocalExercise, offset = 0): VocalRange | null {
  const notes = exercise.events.filter((event) => event.region === "exercise");
  if (notes.length === 0) return null;
  return {
    low: Math.min(...notes.map((note) => note.midi)) + offset,
    high: Math.max(...notes.map((note) => note.midi)) + offset,
  };
}

export function generateTranspositionPath(exercise: VocalExercise, range: VocalRange): number[] {
  const exerciseRange = getExercisePitchRange(exercise);
  if (!exerciseRange || range.low > range.high) return [];
  const minimumOffset = range.low - exerciseRange.low;
  const maximumOffset = range.high - exerciseRange.high;
  if (minimumOffset > maximumOffset) return [];

  const rangeCenter = (range.low + range.high) / 2;
  const exerciseCenter = (exerciseRange.low + exerciseRange.high) / 2;
  const start = Math.max(minimumOffset, Math.min(maximumOffset, Math.round(rangeCenter - exerciseCenter)));
  const path = [start];
  for (let offset = start + 1; offset <= maximumOffset; offset += 1) path.push(offset);
  for (let offset = maximumOffset - 1; offset >= minimumOffset; offset -= 1) path.push(offset);
  for (let offset = minimumOffset + 1; offset <= start; offset += 1) path.push(offset);
  return path;
}

export function getContextMetronomeBeats(exercise: VocalExercise): number[] {
  const beatLength = 4 / exercise.timeSignature.denominator;
  if (!Number.isFinite(beatLength) || beatLength <= 0 || exercise.exerciseStartBeat <= 0) return [];
  const beats: number[] = [];
  for (let beat = 0; beat < exercise.exerciseStartBeat - 1e-9; beat += beatLength) {
    beats.push(Math.round(beat * 1_000_000) / 1_000_000);
  }
  return beats;
}

export function alignContextToMetronome(exercise: VocalExercise): VocalExercise {
  const demonstrationEvents = exercise.events.filter((event) => event.role === "context_demonstration");
  const originalExerciseStart = demonstrationEvents.length > 0
    ? Math.min(...demonstrationEvents.map((event) => event.startBeat))
    : exercise.exerciseStartBeat;
  const previousShift = exercise.exerciseStartBeat - originalExerciseStart;
  const restoredEvents = exercise.events
    .filter((event) => event.role !== "context_demonstration")
    .map((event) => event.region === "exercise" && previousShift > 0
      ? { ...event, startBeat: event.startBeat - previousShift }
      : event);
  const restoredDuration = exercise.durationBeats - Math.max(0, previousShift);
  const hasArpeggio = restoredEvents.some((event) => event.region === "context" && event.role === "context_arpeggio");
  if (!hasArpeggio) {
    return demonstrationEvents.length === 0 ? exercise : {
      ...exercise,
      exerciseStartBeat: originalExerciseStart,
      durationBeats: restoredDuration,
      events: restoredEvents,
    };
  }

  const beatLength = 4 / exercise.timeSignature.denominator;
  const measureLength = exercise.timeSignature.numerator * (4 / exercise.timeSignature.denominator);
  if (!Number.isFinite(beatLength) || beatLength <= 0 || !Number.isFinite(measureLength) || measureLength <= 0) return exercise;
  const contextStarts = [...new Set(restoredEvents
    .filter((event) => event.region === "context")
    .map((event) => event.startBeat))].sort((a, b) => a - b);
  const firstStart = contextStarts[0] ?? 0;
  const alignedStarts = new Map(contextStarts.map((start, index) => [start, firstStart + index * beatLength]));
  const contextEnd = firstStart + contextStarts.length * beatLength;
  const nextExerciseStart = contextEnd > originalExerciseStart + 1e-9
    ? Math.ceil((contextEnd - 1e-9) / measureLength) * measureLength
    : originalExerciseStart;
  const nextShift = nextExerciseStart - originalExerciseStart;
  const alignedEvents = restoredEvents.map((event) => {
    if (event.region === "exercise") return nextShift > 0 ? { ...event, startBeat: event.startBeat + nextShift } : event;
    const startBeat = alignedStarts.get(event.startBeat) ?? event.startBeat;
    const groupIndex = contextStarts.indexOf(event.startBeat);
    const nextStart = groupIndex >= 0 && groupIndex < contextStarts.length - 1
      ? alignedStarts.get(contextStarts[groupIndex + 1]) ?? nextExerciseStart
      : nextExerciseStart;
    return { ...event, startBeat, durationBeats: Math.min(event.durationBeats, Math.max(1 / 64, nextStart - startBeat)) };
  });

  return {
    ...exercise,
    exerciseStartBeat: nextExerciseStart,
    durationBeats: restoredDuration + nextShift,
    events: alignedEvents.sort((a, b) => a.startBeat - b.startBeat || a.midi - b.midi),
  };
}
