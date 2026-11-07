import { describe, expect, it } from "vitest";
import {
  alignMidiByFirstAudioStart,
  appendAlignmentTap,
  buildMidiContourTapHeatMap,
  cleanMidiNotes,
  createMidiAlignment,
  deriveSegmentAnswerKey,
  deriveSegmentAnswerKeys,
  deriveWholeSongAnswerKey,
  resumeAlignmentFromNote,
  scoreTapAttemptAgainstMidiKey,
  scoreTapAttemptProgressAgainstMidiKey,
  undoLastAlignmentTap,
  type CleanedMidiNote,
  type RawMidiNote,
} from "./midiGuidedTapPractice";
import { DEFAULT_TAP_TIMING_TOLERANCE_MS } from "./tapPracticeConstants";

function raw(index: number, pitch: number, startSeconds: number, durationSeconds: number): RawMidiNote {
  return {
    index,
    trackIndex: 1,
    midiPitch: pitch,
    pitchName: `P${pitch}`,
    velocity: 80,
    midiStartTick: Math.round(startSeconds * 480),
    midiDurationTicks: Math.round(durationSeconds * 480),
    midiStartSeconds: startSeconds,
    midiDurationSeconds: durationSeconds,
  };
}

function completeAlignment(noteCount: number, taps: number[]) {
  return taps.reduce(
    (alignment, time) => appendAlignmentTap(alignment, time),
    createMidiAlignment({
      id: "align-1",
      songId: "song-1",
      midiSourceId: "midi-1",
      retainedMidiNoteCount: noteCount,
      createdAt: "2026-05-18T00:00:00.000Z",
    })
  );
}

describe("midiGuidedTapPractice", () => {
  it("filters out short MIDI notes", () => {
    const result = cleanMidiNotes([raw(0, 60, 0, 0.05), raw(1, 62, 0.5, 0.2)], {
      shortNoteThresholdMs: 100,
    });

    expect(result.ignoredShortNoteCount).toBe(1);
    expect(result.cleanedNotes).toHaveLength(1);
    expect(result.cleanedNotes[0].midiPitch).toBe(62);
  });

  it("collapses near-simultaneous chord notes to the highest pitch", () => {
    const result = cleanMidiNotes([raw(0, 60, 0, 0.3), raw(1, 67, 0.02, 0.4), raw(2, 64, 1, 0.3)], {
      simultaneousThresholdMs: 30,
      shortNoteThresholdMs: 0,
    });

    expect(result.cleanedNotes.map((note) => note.midiPitch)).toEqual([67, 64]);
  });

  it("keeps overlapping notes with meaningfully different starts sequential", () => {
    const result = cleanMidiNotes([raw(0, 60, 0, 1.2), raw(1, 62, 0.25, 0.4)], {
      simultaneousThresholdMs: 30,
      shortNoteThresholdMs: 0,
    });

    expect(result.cleanedNotes.map((note) => note.midiPitch)).toEqual([60, 62]);
  });

  it("preserves repeated notes as separate events", () => {
    const result = cleanMidiNotes([raw(0, 60, 0, 0.3), raw(1, 60, 0.5, 0.3)], {
      shortNoteThresholdMs: 0,
    });

    expect(result.cleanedNotes).toHaveLength(2);
    expect(result.cleanedNotes[1].movementFromPrevious).toBe("same");
  });

  it("derives pitch movement correctly", () => {
    const result = cleanMidiNotes([raw(0, 60, 0, 0.3), raw(1, 62, 0.5, 0.3), raw(2, 61, 1, 0.3)], {
      shortNoteThresholdMs: 0,
    });

    expect(result.cleanedNotes.map((note) => note.movementFromPrevious)).toEqual(["start", "up", "down"]);
  });

  it("maps alignment taps to the next MIDI note index", () => {
    const alignment = appendAlignmentTap(
      createMidiAlignment({ id: "a", songId: "s", midiSourceId: "m", retainedMidiNoteCount: 2 }),
      1.25
    );

    expect(alignment.tappedStartTimesSeconds).toEqual([1.25]);
    expect(alignment.isComplete).toBe(false);
  });

  it("undoes the last alignment tap", () => {
    const alignment = completeAlignment(3, [1, 2]);
    expect(undoLastAlignmentTap(alignment).tappedStartTimesSeconds).toEqual([1]);
  });

  it("resumes from a selected note by preserving earlier taps", () => {
    const alignment = completeAlignment(5, [1, 2, 3, 4]);
    expect(resumeAlignmentFromNote(alignment, 2).tappedStartTimesSeconds).toEqual([1, 2]);
  });

  it("generates a whole-song answer key from MIDI notes and tap times", () => {
    const notes = cleanMidiNotes([raw(0, 60, 0, 1), raw(1, 62, 1, 1)], { shortNoteThresholdMs: 0 }).cleanedNotes;
    const key = deriveWholeSongAnswerKey("song-1", "midi-1", notes, completeAlignment(2, [10, 11]));

    expect(key?.notes.map((note) => note.tappedStartTimeSeconds)).toEqual([10, 11]);
    expect(key?.notes[1].movementFromPrevious).toBe("up");
  });

  it("caps effective durations at the time until the next tapped note", () => {
    const notes = cleanMidiNotes([raw(0, 60, 0, 3), raw(1, 62, 1, 2)], { shortNoteThresholdMs: 0 }).cleanedNotes;
    const key = deriveWholeSongAnswerKey("song-1", "midi-1", notes, completeAlignment(2, [10, 10.5]));

    expect(key?.notes[0].effectiveDurationSeconds).toBe(0.5);
  });

  it("generates segment answer keys from whole-song aligned notes", () => {
    const notes = cleanMidiNotes([raw(0, 60, 0, 1), raw(1, 62, 1, 1), raw(2, 64, 2, 1)], { shortNoteThresholdMs: 0 }).cleanedNotes;
    const whole = deriveWholeSongAnswerKey("song-1", "midi-1", notes, completeAlignment(3, [5, 6, 9]));
    const segmentKey = deriveSegmentAnswerKey(whole!, { id: "seg-1", startMs: 5000, endMs: 7000 });

    expect(segmentKey.taps.map((tap) => tap.timeOffsetMs)).toEqual([0, 1000]);
    expect(segmentKey.notes[0].movementFromPrevious).toBe("start");
  });

  it("allows overlapping segments to include the same source note", () => {
    const notes = cleanMidiNotes([raw(0, 60, 0, 1)] as RawMidiNote[], { shortNoteThresholdMs: 0 }).cleanedNotes;
    const whole = deriveWholeSongAnswerKey("song-1", "midi-1", notes, completeAlignment(1, [5.5]));
    const keys = deriveSegmentAnswerKeys(whole!, [
      { id: "seg-a", startMs: 5000, endMs: 6000 },
      { id: "seg-b", startMs: 5500, endMs: 6500 },
    ]);

    expect(keys["seg-a"].notes[0].sourceWholeSongNoteIndex).toBe(0);
    expect(keys["seg-b"].notes[0].sourceWholeSongNoteIndex).toBe(0);
  });

  it("aligns MIDI notes from a single first-audio-start offset", () => {
    const notes = cleanMidiNotes([raw(0, 60, 0.5, 1), raw(1, 62, 2, 1)], { shortNoteThresholdMs: 0 }).cleanedNotes;
    const alignment = alignMidiByFirstAudioStart(
      createMidiAlignment({ id: "a", songId: "s", midiSourceId: "m", retainedMidiNoteCount: 2 }),
      notes,
      3
    );

    expect(alignment.tappedStartTimesSeconds).toEqual([3, 4.5]);
    expect(alignment.isComplete).toBe(true);
  });

  it("projects sustained notes into segments they overlap after boundaries move", () => {
    const notes = cleanMidiNotes([
      raw(0, 60, 0, 2),
      raw(1, 62, 2, 1),
    ], { shortNoteThresholdMs: 0 }).cleanedNotes;
    const whole = deriveWholeSongAnswerKey("song-1", "midi-1", notes, completeAlignment(2, [5, 7]));
    const segmentKey = deriveSegmentAnswerKey(whole!, { id: "seg-1", startMs: 5500, endMs: 7200 });

    expect(segmentKey.notes.map((note) => note.sourceWholeSongNoteIndex)).toEqual([0, 1]);
    expect(segmentKey.notes[0]).toEqual(expect.objectContaining({
      segmentLocalStartTimeSeconds: 0,
      effectiveDurationSeconds: 1.5,
      movementFromPrevious: "start",
    }));
    expect(segmentKey.notes[1]).toEqual(expect.objectContaining({
      segmentLocalStartTimeSeconds: 1.5,
      effectiveDurationSeconds: 0.2,
      movementFromPrevious: "up",
    }));
    expect(segmentKey.taps.map((tap) => tap.timeOffsetMs)).toEqual([0, 1500]);
  });

  it("scores regular tap practice against a MIDI-derived segment key", () => {
    const notes: CleanedMidiNote[] = cleanMidiNotes([raw(0, 60, 0, 1), raw(1, 62, 1, 1)], { shortNoteThresholdMs: 0 }).cleanedNotes;
    const whole = deriveWholeSongAnswerKey("song-1", "midi-1", notes, completeAlignment(2, [5, 6]));
    const segmentKey = deriveSegmentAnswerKey(whole!, { id: "seg-1", startMs: 5000, endMs: 7000 });
    const score = scoreTapAttemptAgainstMidiKey(segmentKey, [
      { timeOffsetMs: 0, direction: "same" },
      { timeOffsetMs: 1000, direction: "up" },
    ], 400);

    expect(score.scorePercent).toBe(100);
  });

  it("scores contour direction across different interval sizes and repeated notes", () => {
    const pitches = [60, 62, 67, 65, 65, 72];
    const notes = cleanMidiNotes(pitches.map((pitch, index) => raw(index, pitch, index, 0.8)), { shortNoteThresholdMs: 0 }).cleanedNotes;
    const whole = deriveWholeSongAnswerKey("song-1", "midi-1", notes, completeAlignment(pitches.length, pitches.map((_, i) => 5 + i)));
    const key = deriveSegmentAnswerKey(whole!, { id: "seg-1", startMs: 5000, endMs: 11000 });
    const score = scoreTapAttemptAgainstMidiKey(key, [
      { timeOffsetMs: 0, direction: "same" },
      { timeOffsetMs: 400, direction: "up" },
      { timeOffsetMs: 1100, direction: "up" },
      { timeOffsetMs: 1700, direction: "down" },
      { timeOffsetMs: 2400, direction: "same" },
      { timeOffsetMs: 5100, direction: "up" },
    ], 0);

    expect(score.contourAccuracyPercent).toBe(100);
    expect(score.coveragePercent).toBe(100);
    expect(score.insufficientData).toBe(false);
  });

  it("reports a complete but directionally incorrect contour as incorrect", () => {
    const pitches = [60, 62, 64, 60, 60];
    const notes = cleanMidiNotes(pitches.map((pitch, index) => raw(index, pitch, index, 0.8)), { shortNoteThresholdMs: 0 }).cleanedNotes;
    const whole = deriveWholeSongAnswerKey("song-1", "midi-1", notes, completeAlignment(pitches.length, pitches.map((_, i) => 5 + i)));
    const key = deriveSegmentAnswerKey(whole!, { id: "seg-1", startMs: 5000, endMs: 10000 });
    const score = scoreTapAttemptAgainstMidiKey(key, [
      { timeOffsetMs: 0, direction: "same" },
      { timeOffsetMs: 400, direction: "down" },
      { timeOffsetMs: 800, direction: "down" },
      { timeOffsetMs: 1200, direction: "up" },
      { timeOffsetMs: 1600, direction: "up" },
    ], 0);

    expect(score.contourAccuracyPercent).toBeLessThan(100);
    expect(score.coveragePercent).toBe(100);
    expect(score.insufficientData).toBe(false);
  });

  it("ignores timing when directionally correct taps are closest to the expected MIDI notes", () => {
    const notes: CleanedMidiNote[] = cleanMidiNotes([raw(0, 60, 0, 1), raw(1, 62, 1, 1)], { shortNoteThresholdMs: 0 }).cleanedNotes;
    const whole = deriveWholeSongAnswerKey("song-1", "midi-1", notes, completeAlignment(2, [5, 6]));
    const segmentKey = deriveSegmentAnswerKey(whole!, { id: "seg-1", startMs: 5000, endMs: 7000 });
    const score = scoreTapAttemptAgainstMidiKey(segmentKey, [
      { timeOffsetMs: 0, direction: "same" },
      { timeOffsetMs: 1800, direction: "up" },
    ], DEFAULT_TAP_TIMING_TOLERANCE_MS);

    expect(score.scorePercent).toBe(100);
    expect(score.details.map((detail) => detail.status)).toEqual(["matched", "matched"]);
  });

  it("aligns around an extra tap and reports its coverage separately", () => {
    const notes: CleanedMidiNote[] = cleanMidiNotes([
      raw(0, 60, 0, 1),
      raw(1, 62, 1, 1),
      raw(2, 60, 2, 1),
    ], { shortNoteThresholdMs: 0 }).cleanedNotes;
    const whole = deriveWholeSongAnswerKey("song-1", "midi-1", notes, completeAlignment(3, [5, 6, 7]));
    const segmentKey = deriveSegmentAnswerKey(whole!, { id: "seg-1", startMs: 5000, endMs: 8000 });
    const score = scoreTapAttemptAgainstMidiKey(segmentKey, [
      { timeOffsetMs: 0, direction: "same" },
      { timeOffsetMs: 300, direction: "down" },
      { timeOffsetMs: 1000, direction: "up" },
      { timeOffsetMs: 2000, direction: "down" },
    ], 0);

    expect(score.scorePercent).toBe(100);
    expect(score.coveragePercent).toBe(100);
    expect(score.extraTaps).toBe(1);
    expect(score.details.map((detail) => detail.status)).toEqual(["matched", "matched", "matched", "extra"]);
  });

  it("reports insufficient evidence when only the starting tap was detected", () => {
    const notes: CleanedMidiNote[] = cleanMidiNotes([raw(0, 60, 0, 1), raw(1, 62, 1, 1)], { shortNoteThresholdMs: 0 }).cleanedNotes;
    const whole = deriveWholeSongAnswerKey("song-1", "midi-1", notes, completeAlignment(2, [5, 6]));
    const segmentKey = deriveSegmentAnswerKey(whole!, { id: "seg-1", startMs: 5000, endMs: 7000 });
    const score = scoreTapAttemptAgainstMidiKey(segmentKey, [{ timeOffsetMs: 0, direction: "same" }], 400);

    expect(score.insufficientData).toBe(true);
    expect(score.coveragePercent).toBe(0);
    expect(score.details.map((detail) => detail.status)).toEqual(["matched", "missing"]);
  });

  it("builds capped contour heat stats from MIDI score details", () => {
    const notes = cleanMidiNotes([raw(0, 60, 0, 1), raw(1, 62, 1, 1)], { shortNoteThresholdMs: 0 }).cleanedNotes;
    const whole = deriveWholeSongAnswerKey("song-1", "midi-1", notes, completeAlignment(2, [5, 6]));
    const segmentKey = deriveSegmentAnswerKey(whole!, { id: "seg-1", startMs: 5000, endMs: 7000 });
    const missed = scoreTapAttemptAgainstMidiKey(segmentKey, [
      { timeOffsetMs: 0, direction: "same" },
      { timeOffsetMs: 1000, direction: "down" },
    ], 400);
    const matched = scoreTapAttemptAgainstMidiKey(segmentKey, [
      { timeOffsetMs: 0, direction: "same" },
      { timeOffsetMs: 1000, direction: "up" },
    ], 400);

    const heatMap = buildMidiContourTapHeatMap(segmentKey, [missed, matched, matched], 2);

    expect(heatMap["midi-contour-seg-1-1"]).toEqual({
      sessionCount: 2,
      missCount: 1,
      missRate: 0.5,
    });
  });

  it("matches movements without using tap timing to decide correctness", () => {
    const notes = cleanMidiNotes([
      raw(0, 60, 0, 1),
      raw(1, 62, 1, 1),
      raw(2, 60, 2, 1),
    ], { shortNoteThresholdMs: 0 }).cleanedNotes;
    const whole = deriveWholeSongAnswerKey("song-1", "midi-1", notes, completeAlignment(3, [5, 6, 7]));
    const segmentKey = deriveSegmentAnswerKey(whole!, { id: "seg-1", startMs: 5000, endMs: 8000 });
    const score = scoreTapAttemptAgainstMidiKey(segmentKey, [
      { timeOffsetMs: 900, direction: "same" },
      { timeOffsetMs: 1900, direction: "up" },
      { timeOffsetMs: 2900, direction: "down" },
    ], 0);

    expect(score.scorePercent).toBe(100);
    expect(score.details.map((detail) => detail.status)).toEqual(["matched", "matched", "matched"]);
    expect(score.coveragePercent).toBe(100);
  });

  it("does not report accuracy for a one-tap partial attempt", () => {
    const notes = cleanMidiNotes([raw(0, 60, 0, 1), raw(1, 62, 1, 1)], { shortNoteThresholdMs: 0 }).cleanedNotes;
    const whole = deriveWholeSongAnswerKey("song-1", "midi-1", notes, completeAlignment(2, [5, 6]));
    const segmentKey = deriveSegmentAnswerKey(whole!, { id: "seg-1", startMs: 5000, endMs: 7000 });
    const score = scoreTapAttemptProgressAgainstMidiKey(segmentKey, [
      { id: "late-first-tap", timeOffsetMs: 900, direction: "same" },
    ], 0);

    expect(score.insufficientData).toBe(true);
    expect(score.scorePercent).toBe(0);
    expect(score.details).toEqual([
      expect.objectContaining({ index: 0, status: "matched", actual: expect.objectContaining({ id: "late-first-tap" }) }),
      expect.objectContaining({ index: 1, status: "missing" }),
    ]);
  });

  it("matches a partial contour without treating half coverage as a rhythm error", () => {
    const notes = cleanMidiNotes([
      raw(0, 60, 0, 1), raw(1, 62, 1, 1), raw(2, 64, 2, 1), raw(3, 60, 3, 1), raw(4, 59, 4, 1),
    ], { shortNoteThresholdMs: 0 }).cleanedNotes;
    const whole = deriveWholeSongAnswerKey("song-1", "midi-1", notes, completeAlignment(5, [5, 6, 7, 8, 9]));
    const key = deriveSegmentAnswerKey(whole!, { id: "seg-1", startMs: 5000, endMs: 10000 });
    const score = scoreTapAttemptAgainstMidiKey(key, [
      { timeOffsetMs: 2000, direction: "same" },
      { timeOffsetMs: 2500, direction: "down" },
      { timeOffsetMs: 3000, direction: "down" },
    ], 0);

    expect(score.contourAccuracyPercent).toBe(100);
    expect(score.coveragePercent).toBeLessThan(100);
    expect(score.insufficientData).toBe(false);
  });

  it("does not turn a favorable sparse substring into evidence of mastery", () => {
    const pitches = [60, 62, 64, 66, 68, 70, 72, 74, 76, 78, 80, 82];
    const notes = cleanMidiNotes(pitches.map((pitch, index) => raw(index, pitch, index, 0.8)), { shortNoteThresholdMs: 0 }).cleanedNotes;
    const whole = deriveWholeSongAnswerKey("song-1", "midi-1", notes, completeAlignment(pitches.length, pitches.map((_, i) => 5 + i)));
    const key = deriveSegmentAnswerKey(whole!, { id: "seg-1", startMs: 5000, endMs: 17000 });
    const score = scoreTapAttemptAgainstMidiKey(key, [
      { timeOffsetMs: 8000, direction: "same" },
      { timeOffsetMs: 8500, direction: "up" },
      { timeOffsetMs: 9000, direction: "up" },
    ], 0);

    expect(score.contourAccuracyPercent).toBe(100);
    expect(score.coveragePercent).toBeLessThan(25);
    expect(score.insufficientData).toBe(true);
  });

  it("aligns around a missing middle movement without shifting later correctness", () => {
    const notes = cleanMidiNotes([
      raw(0, 60, 0, 1), raw(1, 62, 1, 1), raw(2, 64, 2, 1), raw(3, 60, 3, 1), raw(4, 59, 4, 1),
    ], { shortNoteThresholdMs: 0 }).cleanedNotes;
    const whole = deriveWholeSongAnswerKey("song-1", "midi-1", notes, completeAlignment(5, [5, 6, 7, 8, 9]));
    const key = deriveSegmentAnswerKey(whole!, { id: "seg-1", startMs: 5000, endMs: 10000 });
    const score = scoreTapAttemptAgainstMidiKey(key, [
      { timeOffsetMs: 0, direction: "same" },
      { timeOffsetMs: 500, direction: "up" },
      { timeOffsetMs: 1500, direction: "down" },
      { timeOffsetMs: 2000, direction: "down" },
    ], 0);

    expect(score.contourAccuracyPercent).toBe(100);
    expect(score.details.filter((detail) => detail.status === "matched")).toHaveLength(4);
    expect(score.coveragePercent).toBeLessThan(100);
  });

  it("does not treat an unassigned answer note as correct heat-map evidence", () => {
    const notes = cleanMidiNotes([
      raw(0, 60, 0, 1),
      raw(1, 62, 1, 1),
      raw(2, 64, 2, 1),
    ], { shortNoteThresholdMs: 0 }).cleanedNotes;
    const whole = deriveWholeSongAnswerKey("song-1", "midi-1", notes, completeAlignment(3, [5, 6, 7]));
    const segmentKey = deriveSegmentAnswerKey(whole!, { id: "seg-1", startMs: 5000, endMs: 8000 });
    const incomplete = scoreTapAttemptAgainstMidiKey(segmentKey, [
      { timeOffsetMs: 0, direction: "same" },
      { timeOffsetMs: 1000, direction: "up" },
    ], 0);
    const heatMap = buildMidiContourTapHeatMap(segmentKey, [incomplete], 5);

    expect(heatMap["midi-contour-seg-1-0"].sessionCount).toBe(0);
    expect(heatMap["midi-contour-seg-1-1"].sessionCount).toBe(1);
    expect(heatMap["midi-contour-seg-1-2"]).toEqual({ sessionCount: 0, missCount: 0, missRate: 0 });
  });
});
