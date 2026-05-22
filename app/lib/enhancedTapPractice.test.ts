import { describe, expect, it } from "vitest";
import {
  buildBlendTapHeatMap,
  deriveAnswerKeyFromTakes,
  getAnswerKeyStatus,
  scoreTapAttempt,
  summarizeAccuracyByAudioVersion,
  type AnswerKeyTake,
  type DerivedAnswerKey,
} from "./enhancedTapPractice";

const takes: AnswerKeyTake[] = [
  {
    id: "take-1",
    segmentId: "seg-1",
    audioVersion: "blend",
    recordedAt: "2026-05-01T00:00:00.000Z",
    taps: [
      { timeOffsetMs: 100, direction: "up" },
      { timeOffsetMs: 500, direction: "same" },
    ],
  },
  {
    id: "take-2",
    segmentId: "seg-1",
    audioVersion: "blend",
    recordedAt: "2026-05-02T00:00:00.000Z",
    taps: [
      { timeOffsetMs: 120, direction: "up" },
      { timeOffsetMs: 540, direction: "down" },
    ],
  },
  {
    id: "take-3",
    segmentId: "seg-1",
    audioVersion: "blend",
    recordedAt: "2026-05-03T00:00:00.000Z",
    taps: [
      { timeOffsetMs: 140, direction: "same" },
      { timeOffsetMs: 560, direction: "same" },
    ],
  },
];

describe("enhancedTapPractice", () => {
  it("derives an answer key from the three most recent compatible takes", () => {
    const key = deriveAnswerKeyFromTakes(takes, "seg-1", "blend");

    expect(key).toEqual({
      segmentId: "seg-1",
      audioVersion: "blend",
      sourceTakeIds: ["take-3", "take-2", "take-1"],
      taps: [
        { id: "derived-seg-1-blend-0", timeOffsetMs: 120, direction: "up" },
        { id: "derived-seg-1-blend-1", timeOffsetMs: 533, direction: "same" },
      ],
    });
  });

  it("refuses to derive a key from incompatible recent tap counts", () => {
    const incompatible: AnswerKeyTake[] = [
      ...takes,
      {
        id: "take-4",
        segmentId: "seg-1",
        audioVersion: "blend",
        recordedAt: "2026-05-04T00:00:00.000Z",
        taps: [{ timeOffsetMs: 100, direction: "up" }],
      },
    ];

    expect(deriveAnswerKeyFromTakes(incompatible, "seg-1", "blend")).toBeNull();
    expect(getAnswerKeyStatus(incompatible, "seg-1", "blend").label).toBe("Needs another clean take");
  });

  it("scores a practice attempt against a derived key", () => {
    const key = deriveAnswerKeyFromTakes(takes, "seg-1", "blend");
    expect(key).not.toBeNull();

    const score = scoreTapAttempt(key as DerivedAnswerKey, [
      { timeOffsetMs: 160, direction: "up" },
      { timeOffsetMs: 900, direction: "same" },
      { timeOffsetMs: 1200, direction: "down" },
    ], 100);

    expect(score.scorePercent).toBe(50);
    expect(score.extraTaps).toBe(1);
    expect(score.details.map((detail) => detail.status)).toEqual(["matched", "timing", "extra"]);
  });

  it("summarizes only automatic scores by audio version", () => {
    const summary = summarizeAccuracyByAudioVersion([
      { id: "a", segmentId: "seg-1", audioVersion: "blend", completedAt: "2026-05-01T00:00:00.000Z", autoScorePercent: 60 },
      { id: "b", segmentId: "seg-1", audioVersion: "blend", completedAt: "2026-05-02T00:00:00.000Z", autoScorePercent: 80 },
      { id: "c", segmentId: "seg-1", audioVersion: "straight", completedAt: "2026-05-03T00:00:00.000Z", autoScorePercent: null },
    ]);

    expect(summary.blend).toEqual({ averageScore: 70, latestScore: 80, attemptCount: 2 });
    expect(summary.straight).toEqual({ averageScore: null, latestScore: null, attemptCount: 0 });
  });

  it("builds a blend heat map from scored attempts", () => {
    const key = deriveAnswerKeyFromTakes(takes, "seg-1", "blend") as DerivedAnswerKey;
    const scores = [
      scoreTapAttempt(key, [{ timeOffsetMs: 120, direction: "up" }, { timeOffsetMs: 533, direction: "same" }], 100),
      scoreTapAttempt(key, [{ timeOffsetMs: 120, direction: "down" }], 100),
    ];

    expect(buildBlendTapHeatMap(key, scores)).toMatchObject([
      { index: 0, directionMissCount: 1, troubleLevel: "medium" },
      { index: 1, missingCount: 1, troubleLevel: "medium" },
    ]);
  });
});
