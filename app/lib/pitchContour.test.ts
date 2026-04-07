import { describe, expect, it } from "vitest";
import { validatePitchContourNotes } from "./pitchContour";

describe("validatePitchContourNotes", () => {
  it("accepts undefined", () => {
    expect(validatePitchContourNotes(undefined)).toEqual({ ok: true });
  });

  it("accepts valid notes", () => {
    const result = validatePitchContourNotes([
      {
        id: "n-1",
        timeOffsetMs: 1250,
        durationMs: 400,
        lane: 0.8,
      },
      {
        id: "n-2",
        timeOffsetMs: 1800,
        durationMs: 250,
        lane: 0.35,
      },
    ]);

    expect(result).toEqual({ ok: true });
  });

  it("rejects invalid lane", () => {
    const result = validatePitchContourNotes([
      {
        id: "n-1",
        timeOffsetMs: 10,
        durationMs: 40,
        lane: 2,
      },
    ]);

    expect(result.ok).toBe(false);
  });

  it("rejects non-array payload", () => {
    const result = validatePitchContourNotes({});
    expect(result).toEqual({ ok: false, error: "Pitch contour notes must be an array" });
  });
});
