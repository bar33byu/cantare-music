import { describe, expect, it } from "vitest";
import { splitAbsoluteContourNoteBySegments, validatePitchContourNotes } from "./pitchContour";

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

  it("splits an absolute contour note across segment boundaries", () => {
    const segmented = splitAbsoluteContourNoteBySegments(
      {
        id: "abs-1",
        startMs: 900,
        durationMs: 400,
        lane: 0.65,
      },
      [
        { id: "seg-1", startMs: 0, endMs: 1000 },
        { id: "seg-2", startMs: 1000, endMs: 2000 },
      ]
    );

    expect(segmented).toHaveLength(2);
    expect(segmented[0]).toMatchObject({
      segmentId: "seg-1",
      note: {
        timeOffsetMs: 900,
        durationMs: 100,
        lane: 0.65,
      },
    });
    expect(segmented[1]).toMatchObject({
      segmentId: "seg-2",
      note: {
        timeOffsetMs: 0,
        durationMs: 300,
        lane: 0.65,
      },
    });
  });
});
