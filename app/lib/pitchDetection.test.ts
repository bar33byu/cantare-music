import { describe, expect, it } from "vitest";
import {
  createAdaptiveNoiseGateState,
  detectPitchYin,
  frequencyToMidi,
  midiToFrequency,
  updateAdaptiveNoiseGate,
} from "./pitchDetection";

describe("pitch detection helpers", () => {
  it("converts between concert A and MIDI", () => {
    expect(frequencyToMidi(440)).toBeCloseTo(69, 6);
    expect(midiToFrequency(69)).toBeCloseTo(440, 6);
  });

  it("detects a generated sine wave", () => {
    const sampleRate = 48000;
    const samples = Float32Array.from(
      { length: 4096 },
      (_, index) => 0.4 * Math.sin((2 * Math.PI * 440 * index) / sampleRate)
    );
    expect(detectPitchYin(samples, sampleRate)?.frequencyHz).toBeCloseTo(440, 0);
  });

  it("returns no pitch for a tone outside the expected range", () => {
    const sampleRate = 48000;
    const samples = Float32Array.from(
      { length: 4096 },
      (_, index) => 0.4 * Math.sin((2 * Math.PI * 330 * index) / sampleRate)
    );
    expect(detectPitchYin(samples, sampleRate, { minFrequencyHz: 196, maxFrequencyHz: 247 })).toBeNull();
  });

  it("adapts the signal gate to quiet and noisy calibration samples", () => {
    let quiet = createAdaptiveNoiseGateState();
    let noisy = createAdaptiveNoiseGateState();
    for (let index = 0; index < 20; index += 1) {
      quiet = updateAdaptiveNoiseGate(quiet, { rms: 0.001, confidence: 0.1 }, { calibrating: true }).state;
      noisy = updateAdaptiveNoiseGate(noisy, { rms: 0.01, confidence: 0.1 }, { calibrating: true }).state;
    }
    expect(updateAdaptiveNoiseGate(quiet, { rms: 0.005, confidence: 0.9 }).accepted).toBe(true);
    expect(updateAdaptiveNoiseGate(noisy, { rms: 0.005, confidence: 0.9 }).accepted).toBe(false);
    expect(updateAdaptiveNoiseGate(noisy, { rms: 0.035, confidence: 0.9 }).accepted).toBe(true);
  });
});
