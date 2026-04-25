import { describe, expect, it } from 'vitest';
import {
  buildContourDirectionEvents,
  compareContourAttempt,
  compareContourAttemptDetailed,
  compareContourAttemptStable,
  computeContourNoteHeatMap,
} from './contourPractice';

describe('contourPractice', () => {
  it('builds up/down/same direction events', () => {
    const events = buildContourDirectionEvents([
      { id: 'n1', timeOffsetMs: 0, durationMs: 100, lane: 0.3 },
      { id: 'n2', timeOffsetMs: 400, durationMs: 100, lane: 0.6 },
      { id: 'n3', timeOffsetMs: 800, durationMs: 100, lane: 0.58 },
      { id: 'n4', timeOffsetMs: 1200, durationMs: 100, lane: 0.2 },
    ]);

    expect(events.map((event) => event.direction)).toEqual(['up', 'same', 'down']);
  });

  it('treats a 0.07 lane rise as up with the tighter same dead zone', () => {
    const events = buildContourDirectionEvents([
      { id: 'n1', timeOffsetMs: 0, durationMs: 100, lane: 0.528 },
      { id: 'n2', timeOffsetMs: 400, durationMs: 100, lane: 0.598 },
    ]);

    expect(events.map((event) => event.direction)).toEqual(['up']);
  });

  it('does not match when the attempt is outside the time tolerance window', () => {
    const result = compareContourAttempt(
      [
        { id: 'a1', timeOffsetMs: 0, durationMs: 100, lane: 0.2 },
        { id: 'a2', timeOffsetMs: 600, durationMs: 100, lane: 0.6 },
        { id: 'a3', timeOffsetMs: 1200, durationMs: 100, lane: 0.3 },
      ],
      [
        { id: 'u1', timeOffsetMs: 40, durationMs: 100, lane: 0.25 },
        { id: 'u2', timeOffsetMs: 760, durationMs: 100, lane: 0.7 },
        { id: 'u3', timeOffsetMs: 1400, durationMs: 100, lane: 0.35 },
      ],
      { timeToleranceMs: 10 }
    );

    expect(result.totalEvents).toBe(2);
    expect(result.matchedEvents).toBe(0);
    expect(result.score).toBe(0);
  });

  it('penalizes wrong direction even when timing is close', () => {
    const result = compareContourAttempt(
      [
        { id: 'a1', timeOffsetMs: 0, durationMs: 100, lane: 0.2 },
        { id: 'a2', timeOffsetMs: 500, durationMs: 100, lane: 0.7 },
      ],
      [
        { id: 'u1', timeOffsetMs: 50, durationMs: 100, lane: 0.7 },
        { id: 'u2', timeOffsetMs: 520, durationMs: 100, lane: 0.3 },
      ]
    );

    expect(result.totalEvents).toBe(1);
    expect(result.matchedEvents).toBe(0);
    expect(result.score).toBe(0);
  });

  it('marks attempt notes as matched when direction is correct despite duration mismatch', () => {
    const detailed = compareContourAttemptDetailed(
      [
        { id: 'a1', timeOffsetMs: 0, durationMs: 100, lane: 0.2 },
        { id: 'a2', timeOffsetMs: 500, durationMs: 500, lane: 0.8 },
      ],
      [
        { id: 'u1', timeOffsetMs: 20, durationMs: 100, lane: 0.2 },
        { id: 'u2', timeOffsetMs: 520, durationMs: 40, lane: 0.8 },
      ]
    );

    expect(detailed.matchedEvents).toBe(1);
    expect(detailed.attemptNoteStatuses.u2).toBe('matched');
  });

  it('treats same-direction transitions as matched regardless of absolute lane location', () => {
    const detailed = compareContourAttemptDetailed(
      [
        { id: 'a1', timeOffsetMs: 0, durationMs: 100, lane: 0.8 },
        { id: 'a2', timeOffsetMs: 100, durationMs: 100, lane: 0.8 },
      ],
      [
        { id: 'u1', timeOffsetMs: 20, durationMs: 100, lane: 0.2 },
        { id: 'u2', timeOffsetMs: 100, durationMs: 40, lane: 0.2 },
      ],
      { timeToleranceMs: 20, durationToleranceRatio: 0.01 }
    );

    expect(detailed.matchedEvents).toBe(1);
    expect(detailed.attemptNoteStatuses.u2).toBe('matched');
  });

  it('does not backfill an earlier missed transition with a later tap', () => {
    const result = compareContourAttemptStable(
      [
        { id: 'a1', timeOffsetMs: 0, durationMs: 100, lane: 0.2 },
        { id: 'a2', timeOffsetMs: 100, durationMs: 100, lane: 0.8 },
        { id: 'a3', timeOffsetMs: 200, durationMs: 100, lane: 0.2 },
        { id: 'a4', timeOffsetMs: 300, durationMs: 100, lane: 0.8 },
      ],
      [
        { id: 'u1', timeOffsetMs: 0, durationMs: 100, lane: 0.2 },
        { id: 'u2', timeOffsetMs: 100, durationMs: 100, lane: 0.8 },
        { id: 'u3', timeOffsetMs: 300, durationMs: 100, lane: 0.2 },
      ]
    );

    expect(result.transitionResults).toEqual([
      {
        attemptEventIndex: 0,
        attemptNoteId: 'u2',
        direction: 'up',
        status: 'matched',
        expectedDirection: 'up',
        answerEventIndex: 0,
      },
      {
        attemptEventIndex: 1,
        attemptNoteId: 'u3',
        direction: 'down',
        status: 'mismatched',
        expectedDirection: 'up',
        answerEventIndex: 2,
      },
    ]);
    expect(result.matchedEvents).toBe(1);
    expect(result.totalEvents).toBe(3);
    expect(result.score).toBeCloseTo(1 / 3);
  });

  it('matches later practice transitions to later answer transitions by timestamp', () => {
    const result = compareContourAttemptStable(
      [
        { id: 'a1', timeOffsetMs: 0, durationMs: 100, lane: 0.2 },
        { id: 'a2', timeOffsetMs: 100, durationMs: 100, lane: 0.4 },
        { id: 'a3', timeOffsetMs: 200, durationMs: 100, lane: 0.8 },
        { id: 'a4', timeOffsetMs: 300, durationMs: 100, lane: 0.8 },
      ],
      [
        { id: 'u1', timeOffsetMs: 150, durationMs: 100, lane: 0.2 },
        { id: 'u2', timeOffsetMs: 200, durationMs: 100, lane: 0.8 },
        { id: 'u3', timeOffsetMs: 300, durationMs: 100, lane: 0.8 },
      ]
    );

    expect(result.transitionResults).toEqual([
      {
        attemptEventIndex: 0,
        attemptNoteId: 'u2',
        direction: 'up',
        status: 'matched',
        expectedDirection: 'up',
        answerEventIndex: 1,
      },
      {
        attemptEventIndex: 1,
        attemptNoteId: 'u3',
        direction: 'same',
        status: 'matched',
        expectedDirection: 'same',
        answerEventIndex: 2,
      },
    ]);
    expect(result.matchedEvents).toBe(2);
    expect(result.totalEvents).toBe(3);
    expect(result.score).toBeCloseTo(2 / 3);
  });

  it('marks a wrong-direction transition as missed even when it is close in time', () => {
    const result = compareContourAttemptStable(
      [
        { id: 'a1', timeOffsetMs: 0, durationMs: 100, lane: 0.2 },
        { id: 'a2', timeOffsetMs: 100, durationMs: 100, lane: 0.8 },
        { id: 'a3', timeOffsetMs: 200, durationMs: 100, lane: 0.8 },
        { id: 'a4', timeOffsetMs: 300, durationMs: 100, lane: 0.2 },
      ],
      [
        { id: 'u1', timeOffsetMs: 0, durationMs: 100, lane: 0.2 },
        { id: 'u2', timeOffsetMs: 100, durationMs: 100, lane: 0.8 },
        { id: 'u3', timeOffsetMs: 200, durationMs: 100, lane: 0.2 },
        { id: 'u4', timeOffsetMs: 300, durationMs: 100, lane: 0.2 },
      ]
    );

    expect(result.transitionResults).toEqual([
      {
        attemptEventIndex: 0,
        attemptNoteId: 'u2',
        direction: 'up',
        status: 'matched',
        expectedDirection: 'up',
        answerEventIndex: 0,
      },
      {
        attemptEventIndex: 1,
        attemptNoteId: 'u3',
        direction: 'down',
        status: 'mismatched',
        expectedDirection: 'same',
        answerEventIndex: 1,
      },
      {
        attemptEventIndex: 2,
        attemptNoteId: 'u4',
        direction: 'same',
        status: 'mismatched',
        expectedDirection: 'down',
        answerEventIndex: 2,
      },
    ]);
    expect(result.matchedEvents).toBe(1);
    expect(result.totalEvents).toBe(3);
    expect(result.score).toBeCloseTo(1 / 3);
  });

  it('awards whole-segment partial credit when only the later part is attempted correctly', () => {
    const result = compareContourAttemptStable(
      Array.from({ length: 20 }, (_, index) => ({
        id: `a${index + 1}`,
        timeOffsetMs: index * 100,
        durationMs: 100,
        lane: index % 2 === 0 ? 0.2 : 0.8,
      })),
      Array.from({ length: 10 }, (_, index) => ({
        id: `u${index + 1}`,
        timeOffsetMs: (index + 10) * 100,
        durationMs: 100,
        lane: (index + 10) % 2 === 0 ? 0.2 : 0.8,
      }))
    );

    expect(result.matchedEvents).toBe(9);
    expect(result.totalEvents).toBe(19);
    expect(result.score).toBeCloseTo(9 / 19);
  });

  it('computes note heat from recent whole-segment practice sessions', () => {
    const heatMap = computeContourNoteHeatMap(
      [
        { id: 'a1', timeOffsetMs: 0, durationMs: 100, lane: 0.2 },
        { id: 'a2', timeOffsetMs: 100, durationMs: 100, lane: 0.8 },
        { id: 'a3', timeOffsetMs: 200, durationMs: 100, lane: 0.8 },
        { id: 'a4', timeOffsetMs: 300, durationMs: 100, lane: 0.2 },
      ],
      [
        [
          { id: 'u1', timeOffsetMs: 0, durationMs: 100, lane: 0.2 },
          { id: 'u2', timeOffsetMs: 100, durationMs: 100, lane: 0.8 },
          { id: 'u3', timeOffsetMs: 200, durationMs: 100, lane: 0.8 },
          { id: 'u4', timeOffsetMs: 300, durationMs: 100, lane: 0.2 },
        ],
        [
          { id: 'v1', timeOffsetMs: 0, durationMs: 100, lane: 0.2 },
          { id: 'v2', timeOffsetMs: 100, durationMs: 100, lane: 0.8 },
          { id: 'v3', timeOffsetMs: 200, durationMs: 100, lane: 0.2 },
          { id: 'v4', timeOffsetMs: 300, durationMs: 100, lane: 0.2 },
        ],
      ]
    );

    expect(heatMap).toEqual({
      a2: { sessionCount: 2, missCount: 0, missRate: 0 },
      a3: { sessionCount: 2, missCount: 1, missRate: 0.5 },
      a4: { sessionCount: 2, missCount: 1, missRate: 0.5 },
    });
  });
});
