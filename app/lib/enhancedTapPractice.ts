export type TapAudioVersion = "blend" | "straight";
export type TapDirection = "up" | "same" | "down";
export type TapPracticeMode = "practice" | "answer_key";
export type AnswerKeyStatusCode = "none" | "one" | "two" | "ready" | "unaligned";
export type SelfRating = 1 | 2 | 3 | 4 | 5;

export interface DirectionTap {
  id?: string;
  timeOffsetMs: number;
  direction: TapDirection;
}

export interface AnswerKeyTake {
  id: string;
  segmentId: string;
  audioVersion: TapAudioVersion;
  recordedAt: string;
  taps: DirectionTap[];
}

export interface DerivedAnswerKey {
  segmentId: string;
  audioVersion: TapAudioVersion;
  sourceTakeIds: string[];
  taps: DirectionTap[];
}

export interface AnswerKeyStatus {
  code: AnswerKeyStatusCode;
  label: string;
  takeCount: number;
  derivedKey: DerivedAnswerKey | null;
}

export type TapMissKind = "matched" | "missing" | "extra" | "timing" | "direction";

export interface TapScoreDetail {
  index: number;
  expected?: DirectionTap;
  actual?: DirectionTap;
  status: TapMissKind;
  timingDeltaMs?: number;
}

export interface TapScoreResult {
  matchedTaps: number;
  totalTaps: number;
  extraTaps: number;
  scorePercent: number;
  details: TapScoreDetail[];
}

export interface TapAttemptSummary {
  id: string;
  segmentId: string;
  audioVersion: TapAudioVersion;
  completedAt: string;
  autoScorePercent: number | null;
}

export interface AudioVersionAccuracySummary {
  averageScore: number | null;
  latestScore: number | null;
  attemptCount: number;
}

export type AccuracyByAudioVersion = Record<TapAudioVersion, AudioVersionAccuracySummary>;

export interface BlendTapHeatMapMarker {
  index: number;
  missRate: number;
  troubleLevel: "none" | "low" | "medium" | "high";
  missingCount: number;
  timingMissCount: number;
  directionMissCount: number;
  attemptCount: number;
}

const EMPTY_VERSION_SUMMARY: AudioVersionAccuracySummary = {
  averageScore: null,
  latestScore: null,
  attemptCount: 0,
};

function normalizeScore(value: number): number {
  return Math.max(0, Math.min(100, Math.round(value)));
}

function majorityDirection(directions: TapDirection[]): TapDirection {
  const counts: Record<TapDirection, number> = { up: 0, same: 0, down: 0 };
  for (const direction of directions) {
    counts[direction] += 1;
  }
  const ranked = (Object.entries(counts) as Array<[TapDirection, number]>).sort((a, b) => b[1] - a[1]);
  return ranked[0][0];
}

function getRecentCompatibleTakes(
  takes: AnswerKeyTake[],
  segmentId: string,
  audioVersion: TapAudioVersion
): AnswerKeyTake[] {
  return takes
    .filter((take) => take.segmentId === segmentId && take.audioVersion === audioVersion)
    .sort((a, b) => Date.parse(b.recordedAt) - Date.parse(a.recordedAt))
    .slice(0, 3);
}

export function deriveAnswerKeyFromTakes(
  takes: AnswerKeyTake[],
  segmentId: string,
  audioVersion: TapAudioVersion
): DerivedAnswerKey | null {
  const recent = getRecentCompatibleTakes(takes, segmentId, audioVersion);
  if (recent.length < 3) {
    return null;
  }

  const tapCount = recent[0].taps.length;
  if (!recent.every((take) => take.taps.length === tapCount)) {
    return null;
  }

  return {
    segmentId,
    audioVersion,
    sourceTakeIds: recent.map((take) => take.id),
    taps: Array.from({ length: tapCount }, (_, index) => {
      const tapsAtIndex = recent.map((take) => take.taps[index]);
      const averageTimeOffsetMs = Math.round(
        tapsAtIndex.reduce((sum, tap) => sum + tap.timeOffsetMs, 0) / tapsAtIndex.length
      );
      return {
        id: `derived-${segmentId}-${audioVersion}-${index}`,
        timeOffsetMs: averageTimeOffsetMs,
        direction: majorityDirection(tapsAtIndex.map((tap) => tap.direction)),
      };
    }),
  };
}

export function getAnswerKeyStatus(
  takes: AnswerKeyTake[],
  segmentId: string,
  audioVersion: TapAudioVersion
): AnswerKeyStatus {
  const recent = getRecentCompatibleTakes(takes, segmentId, audioVersion);
  const derivedKey = deriveAnswerKeyFromTakes(takes, segmentId, audioVersion);

  if (derivedKey) {
    return {
      code: "ready",
      label: "Derived key ready",
      takeCount: recent.length,
      derivedKey,
    };
  }

  if (recent.length === 0) {
    return { code: "none", label: "No answer-key takes yet", takeCount: 0, derivedKey: null };
  }
  if (recent.length === 1) {
    return { code: "one", label: "1 answer-key take recorded", takeCount: 1, derivedKey: null };
  }
  if (recent.length === 2) {
    return { code: "two", label: "2 answer-key takes recorded", takeCount: 2, derivedKey: null };
  }
  return {
    code: "unaligned",
    label: "Needs another clean take",
    takeCount: recent.length,
    derivedKey: null,
  };
}

export function scoreTapAttempt(
  derivedKey: DerivedAnswerKey,
  attemptTaps: DirectionTap[],
  timeToleranceMs: number
): TapScoreResult {
  const totalTaps = derivedKey.taps.length;
  const details: TapScoreDetail[] = [];
  let matchedTaps = 0;

  for (let index = 0; index < totalTaps; index += 1) {
    const expected = derivedKey.taps[index];
    const actual = attemptTaps[index];
    if (!actual) {
      details.push({ index, expected, status: "missing" });
      continue;
    }

    const timingDeltaMs = actual.timeOffsetMs - expected.timeOffsetMs;
    if (actual.direction !== expected.direction) {
      details.push({ index, expected, actual, status: "direction", timingDeltaMs });
      continue;
    }
    if (Math.abs(timingDeltaMs) > timeToleranceMs) {
      details.push({ index, expected, actual, status: "timing", timingDeltaMs });
      continue;
    }

    matchedTaps += 1;
    details.push({ index, expected, actual, status: "matched", timingDeltaMs });
  }

  for (let index = totalTaps; index < attemptTaps.length; index += 1) {
    details.push({ index, actual: attemptTaps[index], status: "extra" });
  }

  return {
    matchedTaps,
    totalTaps,
    extraTaps: Math.max(0, attemptTaps.length - totalTaps),
    scorePercent: totalTaps === 0 ? 100 : normalizeScore((matchedTaps / totalTaps) * 100),
    details,
  };
}

export function summarizeAccuracyByAudioVersion(attempts: TapAttemptSummary[]): AccuracyByAudioVersion {
  const entries = (["blend", "straight"] as const).map((audioVersion) => {
    const scored = attempts
      .filter((attempt) => attempt.audioVersion === audioVersion && attempt.autoScorePercent !== null)
      .sort((a, b) => Date.parse(b.completedAt) - Date.parse(a.completedAt));

    if (scored.length === 0) {
      return [audioVersion, { ...EMPTY_VERSION_SUMMARY }] as const;
    }

    const average = scored.reduce((sum, attempt) => sum + (attempt.autoScorePercent ?? 0), 0) / scored.length;
    return [
      audioVersion,
      {
        averageScore: normalizeScore(average),
        latestScore: scored[0].autoScorePercent,
        attemptCount: scored.length,
      },
    ] as const;
  });

  return Object.fromEntries(entries) as AccuracyByAudioVersion;
}

export function buildBlendTapHeatMap(
  derivedKey: DerivedAnswerKey | null,
  scoredAttempts: TapScoreResult[]
): BlendTapHeatMapMarker[] {
  if (!derivedKey || derivedKey.audioVersion !== "blend") {
    return [];
  }

  return derivedKey.taps.map((_, index) => {
    let missingCount = 0;
    let timingMissCount = 0;
    let directionMissCount = 0;
    let missCount = 0;

    for (const attempt of scoredAttempts) {
      const detail = attempt.details.find((item) => item.index === index);
      if (!detail || detail.status === "matched" || detail.status === "extra") {
        continue;
      }
      missCount += 1;
      if (detail.status === "missing") {
        missingCount += 1;
      } else if (detail.status === "timing") {
        timingMissCount += 1;
      } else if (detail.status === "direction") {
        directionMissCount += 1;
      }
    }

    const attemptCount = scoredAttempts.length;
    const missRate = attemptCount === 0 ? 0 : missCount / attemptCount;
    const troubleLevel =
      missRate >= 0.67 ? "high" : missRate >= 0.34 ? "medium" : missRate > 0 ? "low" : "none";

    return {
      index,
      missRate,
      troubleLevel,
      missingCount,
      timingMissCount,
      directionMissCount,
      attemptCount,
    };
  });
}
