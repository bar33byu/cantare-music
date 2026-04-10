import { PitchContourNote } from '../types';

export type ContourDirection = 'up' | 'down' | 'same';

export interface ContourEvent {
  direction: ContourDirection;
  timeOffsetMs: number;
}

export interface ContourMatchOptions {
  timeToleranceMs: number;
  sameDeadZone: number;
}

export interface ContourMatchResult {
  matchedEvents: number;
  totalEvents: number;
  score: number;
}

const DEFAULT_MATCH_OPTIONS: ContourMatchOptions = {
  timeToleranceMs: 400,
  sameDeadZone: 0.08,
};

function toDirection(deltaLane: number, deadZone: number): ContourDirection {
  if (deltaLane > deadZone) {
    return 'up';
  }
  if (deltaLane < -deadZone) {
    return 'down';
  }
  return 'same';
}

export function buildContourDirectionEvents(
  notes: PitchContourNote[],
  options: Partial<ContourMatchOptions> = {}
): ContourEvent[] {
  const effective = { ...DEFAULT_MATCH_OPTIONS, ...options };
  const sorted = [...notes].sort((a, b) => a.timeOffsetMs - b.timeOffsetMs);
  if (sorted.length < 2) {
    return [];
  }

  const events: ContourEvent[] = [];
  for (let i = 1; i < sorted.length; i += 1) {
    const previous = sorted[i - 1];
    const next = sorted[i];
    events.push({
      direction: toDirection(next.lane - previous.lane, effective.sameDeadZone),
      timeOffsetMs: next.timeOffsetMs,
    });
  }

  return events;
}

export function compareContourAttempt(
  answerKey: PitchContourNote[],
  attempt: PitchContourNote[],
  options: Partial<ContourMatchOptions> = {}
): ContourMatchResult {
  const effective = { ...DEFAULT_MATCH_OPTIONS, ...options };
  const answerEvents = buildContourDirectionEvents(answerKey, effective);
  const attemptEvents = buildContourDirectionEvents(attempt, effective);

  if (answerEvents.length === 0) {
    return {
      matchedEvents: 0,
      totalEvents: 0,
      score: 1,
    };
  }

  const usedAttemptIndices = new Set<number>();
  let matchedEvents = 0;

  for (const answerEvent of answerEvents) {
    let bestAttemptIndex = -1;
    let bestDelta = Number.POSITIVE_INFINITY;

    for (let i = 0; i < attemptEvents.length; i += 1) {
      if (usedAttemptIndices.has(i)) {
        continue;
      }

      const attemptEvent = attemptEvents[i];
      if (attemptEvent.direction !== answerEvent.direction) {
        continue;
      }

      const delta = Math.abs(attemptEvent.timeOffsetMs - answerEvent.timeOffsetMs);
      if (delta > effective.timeToleranceMs) {
        continue;
      }

      if (delta < bestDelta) {
        bestDelta = delta;
        bestAttemptIndex = i;
      }
    }

    if (bestAttemptIndex !== -1) {
      usedAttemptIndices.add(bestAttemptIndex);
      matchedEvents += 1;
    }
  }

  const totalEvents = answerEvents.length;

  return {
    matchedEvents,
    totalEvents,
    score: totalEvents === 0 ? 1 : matchedEvents / totalEvents,
  };
}
