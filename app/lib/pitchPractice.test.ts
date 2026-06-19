import { describe, expect, it } from "vitest";
import { centsBetween, detectPitchYin, frequencyToMidi, mergeVoicePitchAttempt, scoreVoicePitchAttempts, updatePitchStability, type PitchStabilityState } from "./pitchPractice";
import type { MidiSegmentAnswerKey } from "./midiGuidedTapPractice";

const key: MidiSegmentAnswerKey = {
  segmentId: "segment",
  midiSourceId: "source",
  alignmentId: "alignment",
  notes: [
    { sourceWholeSongNoteIndex: 1, segmentId: "segment", segmentLocalStartTimeSeconds: 0, midiPitch: 60, pitchName: "C4", movementFromPrevious: "start", midiDurationSeconds: 1, effectiveDurationSeconds: 1 },
    { sourceWholeSongNoteIndex: 2, segmentId: "segment", segmentLocalStartTimeSeconds: 1, midiPitch: 62, pitchName: "D4", movementFromPrevious: "up", midiDurationSeconds: 1, effectiveDurationSeconds: 1 },
  ],
  taps: [
    { id: "one", timeOffsetMs: 0, direction: "same" },
    { id: "two", timeOffsetMs: 1000, direction: "up" },
  ],
};

describe("pitch practice", () => {
  it("converts concert A and cents to MIDI", () => {
    expect(frequencyToMidi(440)).toBeCloseTo(69, 6);
    expect(centsBetween(69.49, 69)).toBe(49);
  });

  it("detects a generated sine wave", () => {
    const sampleRate = 48000;
    const samples = Float32Array.from({ length: 4096 }, (_, index) => 0.4 * Math.sin(2 * Math.PI * 440 * index / sampleRate));
    expect(detectPitchYin(samples, sampleRate)?.frequencyHz).toBeCloseTo(440, 0);
  });

  it("can expose a raw low-level candidate when debug gates are disabled", () => {
    const samples = new Float32Array(2048);
    const detection = detectPitchYin(samples, 48000, { minRms: 0, minConfidence: 0 });
    expect(detection).not.toBeNull();
    expect(detection?.rms).toBe(0);
    expect(detection?.confidence).toBe(0);
  });

  it("requires a stable pitch window", () => {
    let state: PitchStabilityState = { frames: [] };
    let result = updatePitchStability(state, { atMs: 0, midiPitch: 60, confidence: 0.9, rms: 0.1 });
    state = result.state;
    result = updatePitchStability(state, { atMs: 130, midiPitch: 60.1, confidence: 0.9, rms: 0.1 });
    expect(result.stableMidiPitch).toBeCloseTo(60.1);
  });

  it("keeps a later correct correction and scores attempted notes only", () => {
    const attempts = mergeVoicePitchAttempt(
      [{ sourceWholeSongNoteIndex: 1, detectedMidiPitch: 61, centsError: 100 }],
      { sourceWholeSongNoteIndex: 1, detectedMidiPitch: 60.2, centsError: 20 }
    );
    const score = scoreVoicePitchAttempts(key, attempts);
    expect(score.scorePercent).toBe(100);
    expect(score.totalTaps).toBe(1);
    expect(score.details[0].status).toBe("matched");
  });

  it("requires the correct octave", () => {
    const score = scoreVoicePitchAttempts(key, [{ sourceWholeSongNoteIndex: 1, detectedMidiPitch: 72, centsError: 1200 }]);
    expect(score.scorePercent).toBe(0);
    expect(score.details[0].status).toBe("pitch");
  });
});
