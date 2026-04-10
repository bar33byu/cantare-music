import { PitchContourNote } from "../types/index";

const MAX_CONTOUR_NOTES = 2000;

export interface SegmentTimeWindow {
  id: string;
  startMs: number;
  endMs: number;
}

export interface AbsolutePitchContourNote {
  id: string;
  startMs: number;
  durationMs: number;
  lane: number;
}

export interface SegmentedPitchContourNote {
  segmentId: string;
  note: PitchContourNote;
}

export interface PitchContourValidationResult {
  ok: boolean;
  error?: string;
}

function isObject(value: unknown): value is Record<string, unknown> {
  return typeof value === "object" && value !== null;
}

function isValidNumber(value: unknown): value is number {
  return typeof value === "number" && Number.isFinite(value);
}

function isValidContourNote(note: unknown): note is PitchContourNote {
  if (!isObject(note)) {
    return false;
  }

  return (
    typeof note.id === "string" &&
    note.id.trim().length > 0 &&
    isValidNumber(note.timeOffsetMs) &&
    note.timeOffsetMs >= 0 &&
    isValidNumber(note.durationMs) &&
    note.durationMs >= 0 &&
    isValidNumber(note.lane) &&
    note.lane >= 0 &&
    note.lane <= 1
  );
}

export function validatePitchContourNotes(notes: unknown): PitchContourValidationResult {
  if (notes === undefined) {
    return { ok: true };
  }

  if (!Array.isArray(notes)) {
    return { ok: false, error: "Pitch contour notes must be an array" };
  }

  if (notes.length > MAX_CONTOUR_NOTES) {
    return { ok: false, error: `Pitch contour notes cannot exceed ${MAX_CONTOUR_NOTES} points` };
  }

  for (const note of notes) {
    if (!isValidContourNote(note)) {
      return {
        ok: false,
        error:
          "Each pitch contour note must include id, non-negative timeOffsetMs/durationMs, and lane between 0 and 1",
      };
    }
  }

  return { ok: true };
}

export function splitAbsoluteContourNoteBySegments(
  absoluteNote: AbsolutePitchContourNote,
  segmentWindows: SegmentTimeWindow[]
): SegmentedPitchContourNote[] {
  const absoluteStartMs = Math.max(0, absoluteNote.startMs);
  const absoluteEndMs = Math.max(absoluteStartMs, absoluteStartMs + absoluteNote.durationMs);
  if (absoluteEndMs <= absoluteStartMs) {
    return [];
  }

  const orderedWindows = [...segmentWindows].sort((a, b) => a.startMs - b.startMs);

  const segmentedNotes: SegmentedPitchContourNote[] = [];

  for (const window of orderedWindows) {
    const overlapStartMs = Math.max(absoluteStartMs, window.startMs);
    const overlapEndMs = Math.min(absoluteEndMs, window.endMs);
    if (overlapEndMs <= overlapStartMs) {
      continue;
    }

    segmentedNotes.push({
      segmentId: window.id,
      note: {
        id: `${absoluteNote.id}:${window.id}:${segmentedNotes.length}`,
        timeOffsetMs: overlapStartMs - window.startMs,
        durationMs: overlapEndMs - overlapStartMs,
        lane: Math.min(1, Math.max(0, absoluteNote.lane)),
      },
    });
  }

  return segmentedNotes;
}
