export type TapAudioVersion = "blend" | "straight";
export type TapDirection = "up" | "same" | "down";
export type TapPracticeMode = "practice" | "answer_key";
export type PracticeInputMethod = "tap" | "voice";
export type SelfRating = 1 | 2 | 3 | 4 | 5;

export interface DirectionTap {
  id?: string;
  timeOffsetMs: number;
  direction: TapDirection;
}

export type TapMissKind = "matched" | "missing" | "extra" | "timing" | "direction" | "pitch";

export interface TapScoreDetail {
  index: number;
  expected?: DirectionTap;
  actual?: DirectionTap;
  status: TapMissKind;
  timingDeltaMs?: number;
  expectedMidiPitch?: number;
  detectedMidiPitch?: number;
  centsError?: number;
}

export interface TapScoreResult {
  matchedTaps: number;
  totalTaps: number;
  extraTaps: number;
  scorePercent: number;
  /** Percent of observed melodic movements whose direction matched. */
  contourAccuracyPercent?: number;
  /** Percent of reference melodic movements covered by detected input. */
  coveragePercent?: number;
  /** True when too little of the passage was observed to report accuracy. */
  insufficientData?: boolean;
  details: TapScoreDetail[];
}
