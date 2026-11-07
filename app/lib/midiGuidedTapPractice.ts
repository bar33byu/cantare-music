import type {
  DirectionTap,
  TapAudioVersion,
  TapScoreResult,
  TapMissKind,
} from "./enhancedTapPractice";
import type { ContourNoteHeatStat } from "../types";

export type MidiMovement = "start" | "up" | "down" | "same";
export type MidiParseStatus = "parsed" | "error";
export type MidiAlignmentStatus = "partial" | "complete";

export interface RawMidiNote {
  index: number;
  trackIndex: number;
  midiPitch: number;
  pitchName: string;
  velocity: number;
  midiStartTick: number;
  midiDurationTicks: number;
  midiStartSeconds: number;
  midiDurationSeconds: number;
}

export interface CleanedMidiNote {
  index: number;
  sourceRawIndex: number;
  midiPitch: number;
  pitchName: string;
  midiStartSeconds: number;
  midiDurationSeconds: number;
  midiStartTick: number;
  midiDurationTicks: number;
  movementFromPrevious: MidiMovement;
}

export interface MidiCleanupSettings {
  shortNoteThresholdMs: number;
  simultaneousThresholdMs: number;
}

export interface MidiCleanupResult {
  rawNoteCount: number;
  cleanedNotes: CleanedMidiNote[];
  cleanedNoteCount: number;
  ignoredShortNoteCount: number;
}

export interface MidiAlignment {
  id: string;
  songId: string;
  midiSourceId: string;
  tappedStartTimesSeconds: number[];
  retainedMidiNoteCount: number;
  isComplete: boolean;
  status: MidiAlignmentStatus;
  createdAt: string;
  updatedAt: string;
  notes?: string;
}

export interface WholeSongMidiAnswerKeyNote {
  index: number;
  sourceCleanedMidiNoteIndex: number;
  midiPitch: number;
  pitchName: string;
  movementFromPrevious: MidiMovement;
  tappedStartTimeSeconds: number;
  midiDurationSeconds: number;
  effectiveDurationSeconds: number;
}

export interface WholeSongMidiAnswerKey {
  songId: string;
  midiSourceId: string;
  alignmentId: string;
  generatedAt: string;
  notes: WholeSongMidiAnswerKeyNote[];
}

export interface SegmentMidiAnswerKeyNote {
  sourceWholeSongNoteIndex: number;
  segmentId: string;
  segmentLocalStartTimeSeconds: number;
  midiPitch: number;
  pitchName: string;
  movementFromPrevious: MidiMovement;
  midiDurationSeconds: number;
  effectiveDurationSeconds: number;
}

export interface SegmentWindow {
  id: string;
  startMs: number;
  endMs: number;
}

export interface MidiSegmentAnswerKey {
  segmentId: string;
  midiSourceId: string;
  alignmentId: string;
  taps: DirectionTap[];
  notes: SegmentMidiAnswerKeyNote[];
}

export interface MidiParseResult {
  rawNotes: RawMidiNote[];
  trackIndex: number | null;
  ticksPerQuarterNote: number;
}

export interface MidiAttemptSummary {
  id: string;
  segmentId: string;
  audioVersion: TapAudioVersion;
  completedAt: string;
  autoScorePercent: number | null;
}

const DEFAULT_TEMPO_MICROSECONDS_PER_QUARTER = 500000;
const DEFAULT_SAFE_DURATION_SECONDS = 0.1;
const PITCH_NAMES = ["C", "C#", "D", "D#", "E", "F", "F#", "G", "G#", "A", "A#", "B"];

function roundSeconds(value: number): number {
  return Math.round(value * 1_000_000) / 1_000_000;
}

function readString(view: DataView, offset: number, length: number): string {
  let value = "";
  for (let i = 0; i < length; i += 1) {
    value += String.fromCharCode(view.getUint8(offset + i));
  }
  return value;
}

function readVariableLength(view: DataView, cursor: { offset: number }): number {
  let value = 0;
  for (let i = 0; i < 4; i += 1) {
    const byte = view.getUint8(cursor.offset);
    cursor.offset += 1;
    value = (value << 7) | (byte & 0x7f);
    if ((byte & 0x80) === 0) {
      return value;
    }
  }
  return value;
}

function pitchName(midiPitch: number): string {
  const name = PITCH_NAMES[((midiPitch % 12) + 12) % 12];
  const octave = Math.floor(midiPitch / 12) - 1;
  return `${name}${octave}`;
}

function tickToSeconds(tick: number, ticksPerQuarterNote: number, tempoEvents: Array<{ tick: number; tempo: number }>): number {
  const sorted = [...tempoEvents].sort((a, b) => a.tick - b.tick);
  let previousTick = 0;
  let seconds = 0;
  let tempo = DEFAULT_TEMPO_MICROSECONDS_PER_QUARTER;

  for (const event of sorted) {
    if (event.tick > tick) {
      break;
    }
    seconds += ((event.tick - previousTick) * tempo) / ticksPerQuarterNote / 1_000_000;
    previousTick = event.tick;
    tempo = event.tempo;
  }

  seconds += ((tick - previousTick) * tempo) / ticksPerQuarterNote / 1_000_000;
  return seconds;
}

export function parseMidiFile(bytes: ArrayBuffer | Uint8Array): MidiParseResult {
  const buffer = bytes instanceof Uint8Array ? bytes.buffer.slice(bytes.byteOffset, bytes.byteOffset + bytes.byteLength) : bytes;
  const view = new DataView(buffer);
  let offset = 0;

  if (readString(view, offset, 4) !== "MThd") {
    throw new Error("Invalid MIDI header");
  }
  offset += 4;
  const headerLength = view.getUint32(offset);
  offset += 4;
  offset += 2; // format
  const trackCount = view.getUint16(offset);
  offset += 2;
  const division = view.getInt16(offset);
  offset += 2;
  offset = 8 + headerLength;

  if (division <= 0) {
    throw new Error("SMPTE-time MIDI files are not supported yet");
  }

  const ticksPerQuarterNote = division;
  const notesByTrack: RawMidiNote[][] = [];
  const tempoEvents: Array<{ tick: number; tempo: number }> = [{ tick: 0, tempo: DEFAULT_TEMPO_MICROSECONDS_PER_QUARTER }];

  for (let trackIndex = 0; trackIndex < trackCount && offset < view.byteLength; trackIndex += 1) {
    if (readString(view, offset, 4) !== "MTrk") {
      throw new Error("Invalid MIDI track header");
    }
    offset += 4;
    const trackLength = view.getUint32(offset);
    offset += 4;
    const trackEnd = offset + trackLength;
    const cursor = { offset };
    let absoluteTick = 0;
    let runningStatus = 0;
    const activeByPitch = new Map<number, Array<{ tick: number; velocity: number }>>();
    const trackNotes: RawMidiNote[] = [];

    while (cursor.offset < trackEnd) {
      absoluteTick += readVariableLength(view, cursor);
      let status = view.getUint8(cursor.offset);
      if (status & 0x80) {
        cursor.offset += 1;
        runningStatus = status;
      } else {
        status = runningStatus;
      }

      if (status === 0xff) {
        const type = view.getUint8(cursor.offset);
        cursor.offset += 1;
        const length = readVariableLength(view, cursor);
        if (type === 0x51 && length === 3) {
          const tempo =
            (view.getUint8(cursor.offset) << 16) |
            (view.getUint8(cursor.offset + 1) << 8) |
            view.getUint8(cursor.offset + 2);
          tempoEvents.push({ tick: absoluteTick, tempo });
        }
        cursor.offset += length;
        continue;
      }

      if (status === 0xf0 || status === 0xf7) {
        const length = readVariableLength(view, cursor);
        cursor.offset += length;
        continue;
      }

      const eventType = status & 0xf0;
      const dataLength = eventType === 0xc0 || eventType === 0xd0 ? 1 : 2;
      const data1 = view.getUint8(cursor.offset);
      const data2 = dataLength === 2 ? view.getUint8(cursor.offset + 1) : 0;
      cursor.offset += dataLength;

      if (eventType === 0x90 && data2 > 0) {
        const active = activeByPitch.get(data1) ?? [];
        active.push({ tick: absoluteTick, velocity: data2 });
        activeByPitch.set(data1, active);
        continue;
      }

      if (eventType === 0x80 || (eventType === 0x90 && data2 === 0)) {
        const active = activeByPitch.get(data1) ?? [];
        const started = active.shift();
        if (active.length === 0) {
          activeByPitch.delete(data1);
        }
        if (!started || absoluteTick <= started.tick) {
          continue;
        }
        trackNotes.push({
          index: trackNotes.length,
          trackIndex,
          midiPitch: data1,
          pitchName: pitchName(data1),
          velocity: started.velocity,
          midiStartTick: started.tick,
          midiDurationTicks: absoluteTick - started.tick,
          midiStartSeconds: 0,
          midiDurationSeconds: 0,
        });
      }
    }

    notesByTrack[trackIndex] = trackNotes;
    offset = trackEnd;
  }

  const trackIndex = notesByTrack.findIndex((notes) => notes.length > 0);
  const rawNotes = trackIndex >= 0 ? notesByTrack[trackIndex] : [];
  const converted = rawNotes
    .map((note, index) => {
      const startSeconds = tickToSeconds(note.midiStartTick, ticksPerQuarterNote, tempoEvents);
      const endSeconds = tickToSeconds(note.midiStartTick + note.midiDurationTicks, ticksPerQuarterNote, tempoEvents);
      return {
        ...note,
        index,
        midiStartSeconds: startSeconds,
        midiDurationSeconds: Math.max(0, endSeconds - startSeconds),
      };
    })
    .sort((a, b) => a.midiStartSeconds - b.midiStartSeconds || a.index - b.index)
    .map((note, index) => ({ ...note, index }));

  return {
    rawNotes: converted,
    trackIndex: trackIndex >= 0 ? trackIndex : null,
    ticksPerQuarterNote,
  };
}

export function cleanMidiNotes(
  rawNotes: RawMidiNote[],
  settings: Partial<MidiCleanupSettings> = {}
): MidiCleanupResult {
  const shortNoteThresholdMs = Math.max(0, Math.min(300, settings.shortNoteThresholdMs ?? 0));
  const simultaneousThresholdSeconds = Math.max(0, (settings.simultaneousThresholdMs ?? 30) / 1000);
  const sorted = [...rawNotes].sort((a, b) => a.midiStartSeconds - b.midiStartSeconds || a.index - b.index);
  const longEnough = sorted.filter((note) => note.midiDurationSeconds * 1000 >= shortNoteThresholdMs);
  const ignoredShortNoteCount = sorted.length - longEnough.length;
  const selected: RawMidiNote[] = [];

  for (let index = 0; index < longEnough.length;) {
    const groupStart = longEnough[index].midiStartSeconds;
    const group: RawMidiNote[] = [];
    while (index < longEnough.length && Math.abs(longEnough[index].midiStartSeconds - groupStart) <= simultaneousThresholdSeconds) {
      group.push(longEnough[index]);
      index += 1;
    }

    // MVP polyphony handling: near-simultaneous notes are treated like a chord,
    // and the highest pitch stands in for the sung line. Notes with meaningfully
    // different starts stay sequential even when their durations overlap.
    selected.push([...group].sort((a, b) => b.midiPitch - a.midiPitch || a.index - b.index)[0]);
  }

  const cleanedNotes = selected.map<CleanedMidiNote>((note, index) => {
    const previous = selected[index - 1];
    const movementFromPrevious: MidiMovement =
      !previous ? "start" : note.midiPitch > previous.midiPitch ? "up" : note.midiPitch < previous.midiPitch ? "down" : "same";
    return {
      index,
      sourceRawIndex: note.index,
      midiPitch: note.midiPitch,
      pitchName: note.pitchName,
      midiStartSeconds: note.midiStartSeconds,
      midiDurationSeconds: note.midiDurationSeconds,
      midiStartTick: note.midiStartTick,
      midiDurationTicks: note.midiDurationTicks,
      movementFromPrevious,
    };
  });

  return {
    rawNoteCount: rawNotes.length,
    cleanedNotes,
    cleanedNoteCount: cleanedNotes.length,
    ignoredShortNoteCount,
  };
}

export function createMidiAlignment(input: {
  id: string;
  songId: string;
  midiSourceId: string;
  retainedMidiNoteCount: number;
  createdAt?: string;
}): MidiAlignment {
  const now = input.createdAt ?? new Date().toISOString();
  return {
    id: input.id,
    songId: input.songId,
    midiSourceId: input.midiSourceId,
    tappedStartTimesSeconds: [],
    retainedMidiNoteCount: input.retainedMidiNoteCount,
    isComplete: input.retainedMidiNoteCount === 0,
    status: input.retainedMidiNoteCount === 0 ? "complete" : "partial",
    createdAt: now,
    updatedAt: now,
  };
}

function normalizeAlignment(alignment: MidiAlignment, tappedStartTimesSeconds: number[]): MidiAlignment {
  const tapped = tappedStartTimesSeconds.slice(0, alignment.retainedMidiNoteCount);
  const isComplete = tapped.length >= alignment.retainedMidiNoteCount;
  return {
    ...alignment,
    tappedStartTimesSeconds: tapped,
    isComplete,
    status: isComplete ? "complete" : "partial",
    updatedAt: new Date().toISOString(),
  };
}

export function appendAlignmentTap(alignment: MidiAlignment, tappedStartTimeSeconds: number): MidiAlignment {
  if (alignment.tappedStartTimesSeconds.length >= alignment.retainedMidiNoteCount) {
    return alignment;
  }
  return normalizeAlignment(alignment, [
    ...alignment.tappedStartTimesSeconds,
    Math.max(0, tappedStartTimeSeconds),
  ]);
}

export function alignMidiByFirstAudioStart(
  alignment: MidiAlignment,
  cleanedNotes: CleanedMidiNote[],
  firstAudioStartSeconds: number
): MidiAlignment {
  const firstNote = cleanedNotes[0];
  if (!firstNote) {
    return normalizeAlignment(alignment, []);
  }

  const offsetSeconds = Math.max(0, firstAudioStartSeconds) - firstNote.midiStartSeconds;
  const tappedStartTimesSeconds = cleanedNotes
    .slice(0, alignment.retainedMidiNoteCount)
    .map((note) => roundSeconds(Math.max(0, note.midiStartSeconds + offsetSeconds)));

  return normalizeAlignment(alignment, tappedStartTimesSeconds);
}

export function undoLastAlignmentTap(alignment: MidiAlignment): MidiAlignment {
  return normalizeAlignment(alignment, alignment.tappedStartTimesSeconds.slice(0, -1));
}

export function resumeAlignmentFromNote(alignment: MidiAlignment, noteIndex: number): MidiAlignment {
  const safeIndex = Math.max(0, Math.min(alignment.retainedMidiNoteCount, Math.floor(noteIndex)));
  return normalizeAlignment(alignment, alignment.tappedStartTimesSeconds.slice(0, safeIndex));
}

export function deriveWholeSongAnswerKey(
  songId: string,
  midiSourceId: string,
  cleanedNotes: CleanedMidiNote[],
  alignment: MidiAlignment
): WholeSongMidiAnswerKey | null {
  if (!alignment.isComplete || alignment.tappedStartTimesSeconds.length < cleanedNotes.length) {
    return null;
  }

  return {
    songId,
    midiSourceId,
    alignmentId: alignment.id,
    generatedAt: new Date().toISOString(),
    notes: cleanedNotes.map((note, index) => {
      const tappedStartTimeSeconds = alignment.tappedStartTimesSeconds[index];
      const nextTappedStartTimeSeconds = alignment.tappedStartTimesSeconds[index + 1];
      const gapToNext =
        typeof nextTappedStartTimeSeconds === "number"
          ? nextTappedStartTimeSeconds - tappedStartTimeSeconds
          : note.midiDurationSeconds;
      const effectiveDurationSeconds =
        gapToNext > 0
          ? Math.max(DEFAULT_SAFE_DURATION_SECONDS, Math.min(note.midiDurationSeconds, gapToNext))
          : DEFAULT_SAFE_DURATION_SECONDS;
      return {
        index,
        sourceCleanedMidiNoteIndex: note.index,
        midiPitch: note.midiPitch,
        pitchName: note.pitchName,
        movementFromPrevious: note.movementFromPrevious,
        tappedStartTimeSeconds,
        midiDurationSeconds: note.midiDurationSeconds,
        effectiveDurationSeconds,
      };
    }),
  };
}

export function deriveSegmentAnswerKey(
  wholeSongKey: WholeSongMidiAnswerKey,
  segment: SegmentWindow
): MidiSegmentAnswerKey {
  const startSeconds = segment.startMs / 1000;
  const endSeconds = segment.endMs / 1000;
  const notes = wholeSongKey.notes
    .filter((note) => {
      const noteStartSeconds = note.tappedStartTimeSeconds;
      const noteEndSeconds = noteStartSeconds + note.effectiveDurationSeconds;
      return noteEndSeconds > startSeconds && noteStartSeconds < endSeconds;
    })
    .map<SegmentMidiAnswerKeyNote>((note, index, segmentNotes) => {
      const previous = segmentNotes[index - 1];
      const movementFromPrevious: MidiMovement =
        !previous ? "start" : note.midiPitch > previous.midiPitch ? "up" : note.midiPitch < previous.midiPitch ? "down" : "same";
      const clippedStartSeconds = Math.max(note.tappedStartTimeSeconds, startSeconds);
      const clippedEndSeconds = Math.min(note.tappedStartTimeSeconds + note.effectiveDurationSeconds, endSeconds);
      return {
        sourceWholeSongNoteIndex: note.index,
        segmentId: segment.id,
        segmentLocalStartTimeSeconds: roundSeconds(clippedStartSeconds - startSeconds),
        midiPitch: note.midiPitch,
        pitchName: note.pitchName,
        movementFromPrevious,
        midiDurationSeconds: note.midiDurationSeconds,
        effectiveDurationSeconds: roundSeconds(Math.max(0, clippedEndSeconds - clippedStartSeconds)),
      };
    });

  return {
    segmentId: segment.id,
    midiSourceId: wholeSongKey.midiSourceId,
    alignmentId: wholeSongKey.alignmentId,
    notes,
    taps: notes.map((note, index) => ({
      id: `midi-${segment.id}-${note.sourceWholeSongNoteIndex}`,
      timeOffsetMs: Math.round(note.segmentLocalStartTimeSeconds * 1000),
      direction: index === 0 ? "same" : note.movementFromPrevious === "start" ? "same" : note.movementFromPrevious,
    })),
  };
}

export function deriveSegmentAnswerKeys(
  wholeSongKey: WholeSongMidiAnswerKey,
  segments: SegmentWindow[]
): Record<string, MidiSegmentAnswerKey> {
  return Object.fromEntries(segments.map((segment) => [segment.id, deriveSegmentAnswerKey(wholeSongKey, segment)]));
}

export function scoreTapAttemptAgainstMidiKey(
  segmentKey: MidiSegmentAnswerKey,
  attemptTaps: DirectionTap[],
  timeToleranceMs: number
): TapScoreResult {
  void timeToleranceMs;
  const sortedAttemptTaps = [...attemptTaps].sort((a, b) => a.timeOffsetMs - b.timeOffsetMs);
  // The first tap establishes a starting point; only movement between later taps
  // carries contour information. Align those movement sequences monotonically.
  const expectedMovements = segmentKey.taps.slice(1);
  const actualMovements = sortedAttemptTaps.slice(1);
  // Prefer the largest ordered alignment, then correct directions. Timestamps
  // only break otherwise equal alignments; they never change correctness.
  type Operation = "match" | "skip-expected" | "skip-actual";
  interface Cell { matchedPairs: number; value: number; timingDistance: number; previousExpected: number; previousActual: number; operation: Operation | null }
  const rows = expectedMovements.length + 1;
  const columns = actualMovements.length + 1;
  const cells: Array<Array<Cell | null>> = Array.from({ length: rows }, () => Array(columns).fill(null));
  cells[0][0] = { matchedPairs: 0, value: 0, timingDistance: 0, previousExpected: -1, previousActual: -1, operation: null };
  const skipExpectedPenalty = -0.45;
  const skipActualPenalty = -0.8;
  const update = (row: number, column: number, candidate: Cell) => {
    const existing = cells[row][column];
    if (!existing || candidate.matchedPairs > existing.matchedPairs || (
      candidate.matchedPairs === existing.matchedPairs && (
        candidate.value > existing.value || (candidate.value === existing.value && candidate.timingDistance < existing.timingDistance)
      )
    )) {
      cells[row][column] = candidate;
    }
  };
  for (let row = 0; row < rows; row += 1) {
    for (let column = 0; column < columns; column += 1) {
      const cell = cells[row][column];
      if (!cell) continue;
      if (row < expectedMovements.length) update(row + 1, column, {
        matchedPairs: cell.matchedPairs, value: cell.value + skipExpectedPenalty, timingDistance: cell.timingDistance, previousExpected: row, previousActual: column, operation: "skip-expected",
      });
      if (column < actualMovements.length) update(row, column + 1, {
        matchedPairs: cell.matchedPairs, value: cell.value + skipActualPenalty, timingDistance: cell.timingDistance, previousExpected: row, previousActual: column, operation: "skip-actual",
      });
      if (row < expectedMovements.length && column < actualMovements.length) {
        const isCorrect = expectedMovements[row].direction === actualMovements[column].direction;
        update(row + 1, column + 1, {
          matchedPairs: cell.matchedPairs + 1, value: cell.value + (isCorrect ? 2 : -1),
          timingDistance: cell.timingDistance + Math.abs(expectedMovements[row].timeOffsetMs - actualMovements[column].timeOffsetMs),
          previousExpected: row, previousActual: column, operation: "match",
        });
      }
    }
  }

  const assignments = new Map<number, number>();
  const assignedActual = new Set<number>();
  let row = expectedMovements.length;
  let column = actualMovements.length;
  while (row > 0 || column > 0) {
    const cell = cells[row][column];
    if (!cell?.operation) break;
    if (cell.operation === "match") {
      assignments.set(row, column);
      assignedActual.add(column);
    }
    row = cell.previousExpected;
    column = cell.previousActual;
  }

  const details: TapScoreResult["details"] = [];
  const assignedMovementCount = assignments.size;
  let matchedTaps = 0;
  for (let index = 0; index < segmentKey.taps.length; index += 1) {
    const expected = segmentKey.taps[index];
    if (index === 0) {
      details.push({ index, expected, ...(sortedAttemptTaps[0] ? { actual: sortedAttemptTaps[0] } : {}), status: sortedAttemptTaps[0] ? "matched" : "missing" });
      continue;
    }
    const actualIndex = assignments.get(index);
    if (actualIndex === undefined) {
      details.push({ index, expected, status: "missing" });
      continue;
    }
    const actual = sortedAttemptTaps[actualIndex];
    const status: TapMissKind = expected.direction === actual.direction ? "matched" : "direction";
    if (status === "matched") matchedTaps += 1;
    details.push({ index, expected, actual, status });
  }
  for (let index = 1; index < sortedAttemptTaps.length; index += 1) {
    if (!assignedActual.has(index)) details.push({ index: segmentKey.taps.length + index, actual: sortedAttemptTaps[index], status: "extra" });
  }

  const totalTaps = expectedMovements.length;
  const extraTaps = Math.max(0, actualMovements.length - assignedActual.size);
  const scoredMovementCount = assignedMovementCount + extraTaps;
  const contourAccuracyPercent = scoredMovementCount === 0 ? 0 : Math.round((matchedTaps / scoredMovementCount) * 100);
  const coveragePercent = totalTaps === 0 ? 0 : Math.round((assignedMovementCount / totalTaps) * 100);
  const insufficientData = assignedMovementCount < 2 || coveragePercent < 25;
  return {
    matchedTaps,
    totalTaps,
    extraTaps,
    scorePercent: contourAccuracyPercent,
    contourAccuracyPercent,
    coveragePercent,
    insufficientData,
    details,
  };
}

export function scoreTapAttemptProgressAgainstMidiKey(
  segmentKey: MidiSegmentAnswerKey,
  attemptTaps: DirectionTap[],
  timeToleranceMs: number
): TapScoreResult {
  return scoreTapAttemptAgainstMidiKey(segmentKey, attemptTaps, timeToleranceMs);
}

export function buildMidiContourTapHeatMap(
  segmentKey: MidiSegmentAnswerKey | null,
  scoredAttempts: TapScoreResult[],
  attemptLimit: number = 5
): Record<string, ContourNoteHeatStat> {
  if (!segmentKey) {
    return {};
  }

  const recentAttempts = scoredAttempts.slice(0, Math.max(1, attemptLimit));
  return Object.fromEntries(
    segmentKey.notes.map((note, index) => {
      if (index === 0) {
        return [
          `midi-contour-${segmentKey.segmentId}-${note.sourceWholeSongNoteIndex}`,
          { sessionCount: 0, missCount: 0, missRate: 0 },
        ];
      }
      let sessionCount = 0;
      let missCount = 0;
      for (const attempt of recentAttempts) {
        const detail = attempt.details.find((item) => item.index === index);
        if (!detail?.expected || !detail.actual || detail.status === "extra" || detail.status === "missing") {
          continue;
        }
        sessionCount += 1;
        if (detail.status !== "matched") {
          missCount += 1;
        }
      }

      const missRate = sessionCount === 0 ? 0 : missCount / sessionCount;
      return [
        `midi-contour-${segmentKey.segmentId}-${note.sourceWholeSongNoteIndex}`,
        {
          sessionCount,
          missCount,
          missRate,
        },
      ];
    })
  );
}
