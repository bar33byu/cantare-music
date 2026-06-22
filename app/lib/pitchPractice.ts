import type { TapScoreResult } from "./enhancedTapPractice";
import type { MidiSegmentAnswerKey, WholeSongMidiAnswerKeyNote } from "./midiGuidedTapPractice";

export const PITCH_TOLERANCE_CENTS = 50;
export const PITCH_STABILITY_MS = 120;
export const PITCH_TRANSITION_GRACE_MS = 100;
export const MIN_PITCH_RMS = 0.012;
export const MIN_PITCH_CONFIDENCE = 0.72;
export const MIN_ADAPTIVE_PITCH_RMS = 0.003;
export const MAX_ADAPTIVE_PITCH_RMS = 0.04;

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

export interface AdaptivePitchTiming {
  stabilityMs: number;
  transitionGraceMs: number;
}

export interface AdaptiveNoiseGateState {
  noiseSamples: number[];
  open: boolean;
}

export interface AdaptiveNoiseGateResult {
  state: AdaptiveNoiseGateState;
  accepted: boolean;
  noiseFloorRms: number;
  gateRms: number;
}

export function createAdaptiveNoiseGateState(): AdaptiveNoiseGateState {
  return { noiseSamples: [], open: false };
}

function percentile(values: number[], fraction: number): number {
  if (values.length === 0) return 0.001;
  const sorted = [...values].sort((a, b) => a - b);
  return sorted[Math.min(sorted.length - 1, Math.floor((sorted.length - 1) * fraction))];
}

export function updateAdaptiveNoiseGate(
  state: AdaptiveNoiseGateState,
  frame: { rms: number; confidence: number },
  options: { calibrating?: boolean; minConfidence?: number } = {}
): AdaptiveNoiseGateResult {
  const minConfidence = options.minConfidence ?? MIN_PITCH_CONFIDENCE;
  const noiseFloorBeforeFrame = percentile(state.noiseSamples, 0.8);
  const startGate = Math.max(MIN_ADAPTIVE_PITCH_RMS, Math.min(MAX_ADAPTIVE_PITCH_RMS, noiseFloorBeforeFrame * 3));
  const continueGate = Math.max(MIN_ADAPTIVE_PITCH_RMS * 0.75, Math.min(MAX_ADAPTIVE_PITCH_RMS, noiseFloorBeforeFrame * 2));
  const gateRms = state.open ? continueGate : startGate;
  const accepted = !options.calibrating && frame.confidence >= minConfidence && frame.rms >= gateRms;
  const shouldLearnNoise = Boolean(options.calibrating) || (
    !state.open &&
    frame.confidence < minConfidence &&
    frame.rms <= startGate
  );
  const noiseSamples = shouldLearnNoise
    ? [...state.noiseSamples, frame.rms].slice(-150)
    : state.noiseSamples;
  return {
    state: { noiseSamples, open: accepted },
    accepted,
    noiseFloorRms: percentile(noiseSamples, 0.8),
    gateRms,
  };
}

export interface WholeSongPitchTarget {
  note: WholeSongMidiAnswerKeyNote;
  noteIndex: number;
  timing: AdaptivePitchTiming;
  inTransitionGrace: boolean;
}

export function getAdaptivePitchTiming(noteDurationMs: number): AdaptivePitchTiming {
  const safeDurationMs = Math.max(1, noteDurationMs);
  return {
    stabilityMs: Math.round(Math.max(40, Math.min(100, safeDurationMs * 0.25))),
    transitionGraceMs: Math.round(Math.min(60, safeDurationMs * 0.15)),
  };
}

export function getWholeSongPitchTarget(
  notes: WholeSongMidiAnswerKeyNote[],
  playbackMs: number
): WholeSongPitchTarget | null {
  if (notes.length === 0) return null;
  const startsMs = notes.map((note) => note.tappedStartTimeSeconds * 1000);
  if (playbackMs < startsMs[0]) return null;
  let noteIndex = 0;
  for (let index = 1; index < startsMs.length; index += 1) {
    if (startsMs[index] <= playbackMs) noteIndex = index;
    else break;
  }
  const note = notes[noteIndex];
  const timing = getAdaptivePitchTiming(note.effectiveDurationSeconds * 1000);
  const previousBoundaryMs = noteIndex === 0 ? Number.NEGATIVE_INFINITY : startsMs[noteIndex];
  const nextBoundaryMs = noteIndex === notes.length - 1 ? Number.POSITIVE_INFINITY : startsMs[noteIndex + 1];
  const inTransitionGrace = (
    (Number.isFinite(previousBoundaryMs) && playbackMs - previousBoundaryMs < timing.transitionGraceMs) ||
    (Number.isFinite(nextBoundaryMs) && nextBoundaryMs - playbackMs < timing.transitionGraceMs)
  );
  return { note, noteIndex, timing, inTransitionGrace };
}

export function frequencyToMidi(frequencyHz: number): number {
  return 69 + 12 * Math.log2(frequencyHz / 440);
}

export function midiToFrequency(midiPitch: number): number {
  return 440 * 2 ** ((midiPitch - 69) / 12);
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

export function foldPitchToReferenceOctave(detectedMidiPitch: number, referenceMidiPitch: number): number {
  if (!Number.isFinite(detectedMidiPitch) || !Number.isFinite(referenceMidiPitch)) return detectedMidiPitch;
  const octaveShift = Math.round((referenceMidiPitch - detectedMidiPitch) / 12) * 12;
  const folded = detectedMidiPitch + octaveShift;
  return Math.abs(detectedMidiPitch - referenceMidiPitch) >= 10.5 ? folded : detectedMidiPitch;
}

export function detectPitchYin(
  samples: Float32Array,
  sampleRate: number,
  options: { minFrequencyHz?: number; maxFrequencyHz?: number; threshold?: number; minRms?: number; minConfidence?: number } = {}
): PitchDetection | null {
  const minFrequencyHz = options.minFrequencyHz ?? 65;
  const maxFrequencyHz = options.maxFrequencyHz ?? 1050;
  const threshold = options.threshold ?? 0.15;
  const minRms = options.minRms ?? MIN_PITCH_RMS;
  const minConfidence = options.minConfidence ?? MIN_PITCH_CONFIDENCE;
  if (samples.length < 32 || sampleRate <= 0) return null;

  let squareSum = 0;
  for (const sample of samples) squareSum += sample * sample;
  const rms = Math.sqrt(squareSum / samples.length);
  if (rms < minRms) return null;

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
  if (selectedTau < 0 || confidence < minConfidence) return null;

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
  options: { stabilityMs?: number; maxSpreadCents?: number; windowMs?: number } = {}
): { state: PitchStabilityState; stableMidiPitch: number | null } {
  if (!frame) return { state: { frames: [] }, stableMidiPitch: null };
  const stabilityMs = options.stabilityMs ?? PITCH_STABILITY_MS;
  const maxSpreadCents = options.maxSpreadCents ?? 35;
  const windowMs = Math.max(stabilityMs, options.windowMs ?? stabilityMs + 50);
  const frames = [...state.frames, frame].filter((item) => item.atMs >= frame.atMs - windowMs);
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
  if (offsetMs < starts[0]) return null;
  let activeIndex = 0;
  for (let index = 1; index < starts.length; index += 1) {
    if (starts[index] <= offsetMs) activeIndex = index;
    else break;
  }
  const previousBoundary = activeIndex === 0 ? Number.NEGATIVE_INFINITY : starts[activeIndex];
  const nextBoundary = activeIndex === starts.length - 1 ? Number.POSITIVE_INFINITY : starts[activeIndex + 1];
  const ownershipDuration = nextBoundary - previousBoundary;
  const effectiveGrace = Math.min(graceMs, Number.isFinite(ownershipDuration) ? Math.max(0, ownershipDuration / 4) : graceMs);
  const nearPreviousOnset = Number.isFinite(previousBoundary) && offsetMs - previousBoundary < effectiveGrace;
  const nearNextOnset = Number.isFinite(nextBoundary) && nextBoundary - offsetMs < effectiveGrace;
  if (nearPreviousOnset || nearNextOnset) return null;
  return key.notes[activeIndex];
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
