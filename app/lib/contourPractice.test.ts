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

  it('does not penalize duration mismatch when direction is correct', () => {
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

  it('scores stable transitions by step index without rescoring earlier matches', () => {
    const answer = [
      { id: 'a1', timeOffsetMs: 0, durationMs: 100, lane: 0.2 },
      { id: 'a2', timeOffsetMs: 100, durationMs: 100, lane: 0.8 },
      { id: 'a3', timeOffsetMs: 200, durationMs: 100, lane: 0.3 },
    ];

    const partialAttempt = [
      { id: 'u1', timeOffsetMs: 0, durationMs: 100, lane: 0.2 },
      { id: 'u2', timeOffsetMs: 100, durationMs: 100, lane: 0.8 },
    ];
    const fullAttempt = [
      ...partialAttempt,
      { id: 'u3', timeOffsetMs: 200, durationMs: 100, lane: 0.95 },
    ];

    const partial = compareContourAttemptStable(answer, partialAttempt);
    const full = compareContourAttemptStable(answer, fullAttempt);

    expect(partial.transitionResults).toEqual([
      {
        attemptEventIndex: 0,
        attemptNoteId: 'u2',
        direction: 'up',
        status: 'matched',
        expectedDirection: 'up',
      },
    ]);
    expect(full.transitionResults[0]).toEqual(partial.transitionResults[0]);
    expect(full.transitionResults[1]).toEqual({
      attemptEventIndex: 1,
      attemptNoteId: 'u3',
      direction: 'up',
      status: 'mismatched',
      expectedDirection: 'down',
    });
    expect(full.attemptNoteStatuses.u2).toBe('matched');
    expect(full.attemptNoteStatuses.u3).toBe('mismatched');
  });

  it('marks extra transitions once the attempt outlasts the answer key', () => {
    const result = compareContourAttemptStable(
      [
        { id: 'a1', timeOffsetMs: 0, durationMs: 100, lane: 0.2 },
        { id: 'a2', timeOffsetMs: 100, durationMs: 100, lane: 0.8 },
      ],
      [
        { id: 'u1', timeOffsetMs: 0, durationMs: 100, lane: 0.2 },
        { id: 'u2', timeOffsetMs: 100, durationMs: 100, lane: 0.8 },
        { id: 'u3', timeOffsetMs: 200, durationMs: 100, lane: 0.1 },
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
        status: 'extra',
        expectedDirection: null,
      },
    ]);
    expect(result.attemptNoteStatuses.u3).toBe('mismatched');
    expect(result.totalEvents).toBe(2);
    expect(result.score).toBe(0.5);
  });
});
