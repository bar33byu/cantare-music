import { describe, expect, it } from 'vitest';
import { buildContourDirectionEvents, compareContourAttempt } from './contourPractice';

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

  it('matches nearby events with tolerant timing', () => {
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
      { timeToleranceMs: 250 }
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
});
