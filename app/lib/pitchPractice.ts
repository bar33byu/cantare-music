import type { TapScoreResult } from "./enhancedTapPractice";
import type { MidiSegmentAnswerKey } from "./midiGuidedTapPractice";

export const PITCH_TOLERANCE_CENTS = 50;
export const PITCH_STABILITY_MS = 120;
export const PITCH_TRANSITION_GRACE_MS = 100;
export const MIN_PITCH_RMS = 0.012;
export const MIN_PITCH_CONFIDENCE = 0.72;

export interface PitchDetection {
  frequencyHz: number;
  confidence: number;
  rms: number;
}

export interface StablePitchFrame {
  atMs: number;
  midiPitch: number;
  confidence: number;
  rms: number;
}

export interface VoicePitchAttempt {
  sourceWholeSongNoteIndex: number;
  detectedMidiPitch: number;
  centsError: number;
}

export interface PitchStabilityState {
  frames: StablePitchFrame[];
}

export function frequencyToMidi(frequencyHz: number): number {
  return 69 + 12 * Math.log2(frequencyHz / 440);
}

export function midiToPitchName(midiPitch: number): string {
  const names = ["C", "C#", "D", "D#", "E", "F", "F#", "G", "G#", "A", "A#", "B"];
  const rounded = Math.round(midiPitch);
  const pitchClass = ((rounded % 12) + 12) % 12;
  return `${names[pitchClass]}${Math.floor(rounded / 12) - 1}`;
}

export function centsBetween(detectedMidiPitch: number, expectedMidiPitch: number): number {
  return Math.round((detectedMidiPitch - expectedMidiPitch) * 100);
}

export function detectPitchYin(
  samples: Float32Array,
  sampleRate: number,
  options: { minFrequencyHz?: number; maxFrequencyHz?: number; threshold?: number } = {}
): PitchDetection | null {
  const minFrequencyHz = options.minFrequencyHz ?? 65;
  const maxFrequencyHz = options.maxFrequencyHz ?? 1050;
  const threshold = options.threshold ?? 0.15;
  if (samples.length < 32 || sampleRate <= 0) return null;

  let squareSum = 0;
  for (const sample of samples) squareSum += sample * sample;
  const rms = Math.sqrt(squareSum / samples.length);
  if (rms < MIN_PITCH_RMS) return null;

  const minTau = Math.max(2, Math.floor(sampleRate / maxFrequencyHz));
  const maxTau = Math.min(Math.floor(sampleRate / minFrequencyHz), Math.floor(samples.length / 2));
  const difference = new Float32Array(maxTau + 1);
  const normalized = new Float32Array(maxTau + 1);
  for (let tau = 1; tau <= maxTau; tau += 1) {
    let sum = 0;
    const comparisonLength = Math.min(Math.floor(samples.length / 2), samples.length - maxTau);
    for (let index = 0; index < comparisonLength; index += 1) {
      const delta = samples[index] - samples[index + tau];
      sum += delta * delta;
    }
    difference[tau] = sum;
  }

  normalized[0] = 1;
  let runningSum = 0;
  for (let tau = 1; tau <= maxTau; tau += 1) {
    runningSum += difference[tau];
    normalized[tau] = runningSum === 0 ? 1 : (difference[tau] * tau) / runningSum;
  }
  let selectedTau = -1;
  for (let tau = minTau; tau <= maxTau; tau += 1) {
    if (tau >= minTau && normalized[tau] < threshold) {
      while (tau + 1 <= maxTau && normalized[tau + 1] < normalized[tau]) tau += 1;
      selectedTau = tau;
      break;
    }
  }
  if (selectedTau < 0) {
    let best = Number.POSITIVE_INFINITY;
    for (let tau = minTau; tau <= maxTau; tau += 1) {
      if (normalized[tau] < best) {
        best = normalized[tau];
        selectedTau = tau;
      }
    }
  }
  const confidence = selectedTau > 0 ? 1 - normalized[selectedTau] : 0;
  if (selectedTau < 0 || confidence < MIN_PITCH_CONFIDENCE) return null;

  const before = normalized[selectedTau - 1] ?? normalized[selectedTau];
  const center = normalized[selectedTau];
  const after = normalized[selectedTau + 1] ?? center;
  const denominator = 2 * (2 * center - after - before);
  const interpolation = denominator === 0 ? 0 : (after - before) / denominator;
  const refinedTau = selectedTau + Math.max(-1, Math.min(1, interpolation));
  return { frequencyHz: sampleRate / refinedTau, confidence, rms };
}

export function updatePitchStability(
  state: PitchStabilityState,
  frame: StablePitchFrame | null,
  options: { stabilityMs?: number; maxSpreadCents?: number } = {}
): { state: PitchStabilityState; stableMidiPitch: number | null } {
  if (!frame) return { state: { frames: [] }, stableMidiPitch: null };
  const stabilityMs = options.stabilityMs ?? PITCH_STABILITY_MS;
  const maxSpreadCents = options.maxSpreadCents ?? 35;
  const frames = [...state.frames, frame].filter((item) => item.atMs >= frame.atMs - stabilityMs - 50);
  if (frames.length < 2 || frame.atMs - frames[0].atMs < stabilityMs) {
    return { state: { frames }, stableMidiPitch: null };
  }
  const pitches = frames.map((item) => item.midiPitch).sort((a, b) => a - b);
  const median = pitches[Math.floor(pitches.length / 2)];
  const spread = Math.max(...pitches.map((pitch) => Math.abs(pitch - median) * 100));
  return { state: { frames }, stableMidiPitch: spread <= maxSpreadCents ? median : null };
}

export function findMidiNoteAtOffset(
  key: MidiSegmentAnswerKey,
  offsetMs: number,
  graceMs: number = PITCH_TRANSITION_GRACE_MS
) {
  if (key.notes.length === 0) return null;
  const starts = key.notes.map((note) => note.segmentLocalStartTimeSeconds * 1000);
  let closestIndex = 0;
  for (let index = 1; index < starts.length; index += 1) {
    if (Math.abs(starts[index] - offsetMs) < Math.abs(starts[closestIndex] - offsetMs)) closestIndex = index;
  }
  const previousBoundary = closestIndex === 0 ? Number.NEGATIVE_INFINITY : (starts[closestIndex - 1] + starts[closestIndex]) / 2;
  const nextBoundary = closestIndex === starts.length - 1 ? Number.POSITIVE_INFINITY : (starts[closestIndex] + starts[closestIndex + 1]) / 2;
  const availableHalfWindow = Math.min(offsetMs - previousBoundary, nextBoundary - offsetMs);
  const effectiveGrace = Math.min(graceMs, Math.max(0, (nextBoundary - previousBoundary) / 4));
  if (Number.isFinite(availableHalfWindow) && availableHalfWindow < effectiveGrace) return null;
  return key.notes[closestIndex];
}

export function mergeVoicePitchAttempt(
  attempts: VoicePitchAttempt[],
  next: VoicePitchAttempt,
  toleranceCents: number = PITCH_TOLERANCE_CENTS
): VoicePitchAttempt[] {
  const existing = attempts.find((attempt) => attempt.sourceWholeSongNoteIndex === next.sourceWholeSongNoteIndex);
  if (!existing) return [...attempts, next];
  const existingMatched = Math.abs(existing.centsError) <= toleranceCents;
  const nextMatched = Math.abs(next.centsError) <= toleranceCents;
  if (existingMatched || (!nextMatched && Math.abs(existing.centsError) <= Math.abs(next.centsError))) return attempts;
  return attempts.map((attempt) => attempt.sourceWholeSongNoteIndex === next.sourceWholeSongNoteIndex ? next : attempt);
}

export function scoreVoicePitchAttempts(
  key: MidiSegmentAnswerKey,
  attempts: VoicePitchAttempt[],
  toleranceCents: number = PITCH_TOLERANCE_CENTS
): TapScoreResult {
  const byNote = new Map(attempts.map((attempt) => [attempt.sourceWholeSongNoteIndex, attempt]));
  const details: TapScoreResult["details"] = [];
  let matchedTaps = 0;
  for (let index = 0; index < key.notes.length; index += 1) {
    const note = key.notes[index];
    const attempt = byNote.get(note.sourceWholeSongNoteIndex);
    if (!attempt) continue;
    const matched = Math.abs(attempt.centsError) <= toleranceCents;
    if (matched) matchedTaps += 1;
    details.push({
      index,
      expected: key.taps[index],
      status: matched ? "matched" : "pitch",
      expectedMidiPitch: note.midiPitch,
      detectedMidiPitch: attempt.detectedMidiPitch,
      centsError: attempt.centsError,
    });
  }
  return {
    matchedTaps,
    totalTaps: details.length,
    extraTaps: 0,
    scorePercent: details.length === 0 ? 0 : Math.round((matchedTaps / details.length) * 100),
    details,
  };
}
