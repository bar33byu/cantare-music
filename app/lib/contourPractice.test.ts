import { describe, expect, it } from 'vitest';
import {
  buildContourDirectionEvents,
  compareContourAttempt,
  compareContourAttemptDetailed,
  compareContourAttemptStable,
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

  it('matches direction sequence even when timing is far apart', () => {
    const result = compareContourAttempt(
      [
        { id: 'a1', timeOffsetMs: 0, durationMs: 100, lane: 0.2 },
        { id: 'a2', timeOffsetMs: 600, durationMs: 100, lane: 0.6 },
        { id: 'a3', timeOffsetMs: 1200, durationMs: 100, lane: 0.3 },
      ],
      [
        { id: 'u1', timeOffsetMs: 40, durationMs: 100, lane: 0.25 },
        { id: 'u2', timeOffsetMs: 760, durationMs: 100, lane: 0.7 },
        { id: 'u3', timeOffsetMs: 1100, durationMs: 100, lane: 0.35 },
      ],
      { timeToleranceMs: 10 }
    );

    expect(result.totalEvents).toBe(2);
    expect(result.matchedEvents).toBe(2);
    expect(result.score).toBe(1);
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
        { id: 'u2', timeOffsetMs: 600, durationMs: 40, lane: 0.2 },
      ],
      { timeToleranceMs: 1, durationToleranceRatio: 0.01 }
    );

    expect(detailed.matchedEvents).toBe(1);
    expect(detailed.attemptNoteStatuses.u2).toBe('matched');
  });

  it('re-aligns later stable matches after a skipped transition', () => {
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
      },
      {
        attemptEventIndex: 1,
        attemptNoteId: 'u3',
        direction: 'down',
        status: 'matched',
        expectedDirection: 'down',
      },
    ]);
    expect(result.matchedEvents).toBe(2);
    expect(result.totalEvents).toBe(3);
    expect(result.score).toBeCloseTo(2 / 3);
  });

  it('allows a later transition to match the next nearby answer slot within the lookahead window', () => {
    const result = compareContourAttemptStable(
      [
        { id: 'a1', timeOffsetMs: 0, durationMs: 100, lane: 0.2 },
        { id: 'a2', timeOffsetMs: 100, durationMs: 100, lane: 0.8 },
        { id: 'a3', timeOffsetMs: 200, durationMs: 100, lane: 0.9 },
        { id: 'a4', timeOffsetMs: 300, durationMs: 100, lane: 0.9 },
      ],
      [
        { id: 'u1', timeOffsetMs: 0, durationMs: 100, lane: 0.2 },
        { id: 'u2', timeOffsetMs: 100, durationMs: 100, lane: 0.2 },
        { id: 'u3', timeOffsetMs: 200, durationMs: 100, lane: 0.8 },
        { id: 'u4', timeOffsetMs: 300, durationMs: 100, lane: 0.8 },
      ]
    );

    expect(result.transitionResults).toEqual([
      {
        attemptEventIndex: 0,
        attemptNoteId: 'u2',
        direction: 'same',
        status: 'mismatched',
        expectedDirection: 'up',
      },
      {
        attemptEventIndex: 1,
        attemptNoteId: 'u3',
        direction: 'up',
        status: 'matched',
        expectedDirection: 'up',
      },
      {
        attemptEventIndex: 2,
        attemptNoteId: 'u4',
        direction: 'same',
        status: 'matched',
        expectedDirection: 'same',
      },
    ]);
    expect(result.matchedEvents).toBe(2);
    expect(result.totalEvents).toBe(3);
    expect(result.score).toBeCloseTo(2 / 3);
  });

  it('treats a stray transition as extra while allowing later taps to claim the next slots', () => {
    const result = compareContourAttemptStable(
      [
        { id: 'a1', timeOffsetMs: 0, durationMs: 100, lane: 0.2 },
        { id: 'a2', timeOffsetMs: 100, durationMs: 100, lane: 0.8 },
        { id: 'a3', timeOffsetMs: 200, durationMs: 100, lane: 0.8 },
        { id: 'a4', timeOffsetMs: 300, durationMs: 100, lane: 0.2 },
      ],
      [
        { id: 'u1', timeOffsetMs: 0, durationMs: 100, lane: 0.5 },
        { id: 'u2', timeOffsetMs: 100, durationMs: 100, lane: 0.2 },
        { id: 'u3', timeOffsetMs: 200, durationMs: 100, lane: 0.8 },
        { id: 'u4', timeOffsetMs: 300, durationMs: 100, lane: 0.8 },
        { id: 'u5', timeOffsetMs: 400, durationMs: 100, lane: 0.2 },
      ]
    );

    expect(result.transitionResults).toEqual([
      {
        attemptEventIndex: 0,
        attemptNoteId: 'u2',
        direction: 'down',
        status: 'mismatched',
        expectedDirection: 'up',
      },
      {
        attemptEventIndex: 1,
        attemptNoteId: 'u3',
        direction: 'up',
        status: 'matched',
        expectedDirection: 'up',
      },
      {
        attemptEventIndex: 2,
        attemptNoteId: 'u4',
        direction: 'same',
        status: 'matched',
        expectedDirection: 'same',
      },
      {
        attemptEventIndex: 3,
        attemptNoteId: 'u5',
        direction: 'down',
        status: 'matched',
        expectedDirection: 'down',
      },
    ]);
    expect(result.matchedEvents).toBe(3);
    expect(result.totalEvents).toBe(4);
    expect(result.score).toBeCloseTo(0.75);
  });

  it('does not skip more than one answer slot ahead by default', () => {
    const result = compareContourAttemptStable(
      [
        { id: 'a1', timeOffsetMs: 0, durationMs: 100, lane: 0.2 },
        { id: 'a2', timeOffsetMs: 100, durationMs: 100, lane: 0.8 },
        { id: 'a3', timeOffsetMs: 200, durationMs: 100, lane: 0.9 },
        { id: 'a4', timeOffsetMs: 300, durationMs: 100, lane: 0.9 },
      ],
      [
        { id: 'u1', timeOffsetMs: 0, durationMs: 100, lane: 0.2 },
        { id: 'u2', timeOffsetMs: 100, durationMs: 100, lane: 0.2 },
      ]
    );

    expect(result.transitionResults).toEqual([
      {
        attemptEventIndex: 0,
        attemptNoteId: 'u2',
        direction: 'same',
        status: 'mismatched',
        expectedDirection: 'up',
      },
    ]);
  });
});
