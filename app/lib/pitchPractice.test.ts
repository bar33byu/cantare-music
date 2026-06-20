import { describe, expect, it } from "vitest";
import { centsBetween, detectPitchYin, findMidiNoteAtOffset, frequencyToMidi, getAdaptivePitchTiming, getWholeSongPitchTarget, mergeVoicePitchAttempt, scoreVoicePitchAttempts, updatePitchStability, type PitchStabilityState } from "./pitchPractice";
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

  it("can recover an expected fundamental with a target-frequency pass", () => {
    const sampleRate = 48000;
    const samples = Float32Array.from({ length: 4096 }, (_, index) => {
      const seconds = index / sampleRate;
      return 0.12 * Math.sin(2 * Math.PI * 220 * seconds) + 0.35 * Math.sin(2 * Math.PI * 440 * seconds);
    });
    const broad = detectPitchYin(samples, sampleRate, { minFrequencyHz: 85, maxFrequencyHz: 330, minRms: 0, minConfidence: 0 });
    const guided = detectPitchYin(samples, sampleRate, { minFrequencyHz: 196, maxFrequencyHz: 247, minRms: 0, minConfidence: 0 });
    expect(broad).not.toBeNull();
    expect(guided?.frequencyHz).toBeCloseTo(220, 0);
  });

  it("does not manufacture an expected pitch from a wrong out-of-band tone", () => {
    const sampleRate = 48000;
    const samples = Float32Array.from({ length: 4096 }, (_, index) => 0.4 * Math.sin(2 * Math.PI * 330 * index / sampleRate));
    const guided = detectPitchYin(samples, sampleRate, { minFrequencyHz: 196, maxFrequencyHz: 247 });
    expect(guided).toBeNull();
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

  it("accumulates accepted frames across brief gaps within a MIDI note", () => {
    let state: PitchStabilityState = { frames: [] };
    let result = updatePitchStability(state, { atMs: 0, midiPitch: 60, confidence: 0.9, rms: 0.1 }, { stabilityMs: 100, windowMs: 400 });
    state = result.state;
    result = updatePitchStability(state, { atMs: 200, midiPitch: 60.1, confidence: 0.9, rms: 0.1 }, { stabilityMs: 100, windowMs: 400 });
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

  it("holds the active target until the next MIDI onset", () => {
    expect(findMidiNoteAtOffset(key, 750, 100)?.midiPitch).toBe(60);
    expect(findMidiNoteAtOffset(key, 950, 100)).toBeNull();
    expect(findMidiNoteAtOffset(key, 1050, 100)).toBeNull();
    expect(findMidiNoteAtOffset(key, 1200, 100)?.midiPitch).toBe(62);
  });

  it.each([
    [100, 40, 15],
    [200, 50, 30],
    [400, 100, 60],
    [800, 100, 60],
  ])("adapts timing for a %d ms MIDI note", (durationMs, stabilityMs, transitionGraceMs) => {
    expect(getAdaptivePitchTiming(durationMs)).toEqual({ stabilityMs, transitionGraceMs });
  });

  it("identifies transition grace around MIDI ownership boundaries", () => {
    const notes = [
      { index: 0, sourceCleanedMidiNoteIndex: 0, midiPitch: 60, pitchName: "C4", movementFromPrevious: "start" as const, tappedStartTimeSeconds: 0, midiDurationSeconds: 0.4, effectiveDurationSeconds: 0.4 },
      { index: 1, sourceCleanedMidiNoteIndex: 1, midiPitch: 62, pitchName: "D4", movementFromPrevious: "up" as const, tappedStartTimeSeconds: 0.4, midiDurationSeconds: 0.4, effectiveDurationSeconds: 0.4 },
    ];
    expect(getWholeSongPitchTarget(notes, 350)?.note.midiPitch).toBe(60);
    expect(getWholeSongPitchTarget(notes, 350)?.inTransitionGrace).toBe(true);
    expect(getWholeSongPitchTarget(notes, 50)?.inTransitionGrace).toBe(false);
    expect(getWholeSongPitchTarget(notes, 450)?.note.midiPitch).toBe(62);
    expect(getWholeSongPitchTarget(notes, 450)?.inTransitionGrace).toBe(true);
  });
});
