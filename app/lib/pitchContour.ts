import { PitchContourNote } from "../types/index";

const MAX_CONTOUR_NOTES = 2000;

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
