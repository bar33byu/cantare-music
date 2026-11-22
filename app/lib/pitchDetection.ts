export const MIN_PITCH_RMS = 0.012;
export const MIN_PITCH_CONFIDENCE = 0.72;
export const MIN_ADAPTIVE_PITCH_RMS = 0.003;
export const MAX_ADAPTIVE_PITCH_RMS = 0.04;

export interface PitchDetection {
  frequencyHz: number;
  confidence: number;
  rms: number;
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

export function frequencyToMidi(frequencyHz: number): number {
  return 69 + 12 * Math.log2(frequencyHz / 440);
}

export function midiToFrequency(midiPitch: number): number {
  return 440 * 2 ** ((midiPitch - 69) / 12);
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
