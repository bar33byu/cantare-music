import { PitchContourNote } from '../types';

export type ContourDirection = 'up' | 'down' | 'same';

export interface ContourEvent {
  direction: ContourDirection;
  timeOffsetMs: number;
}

export interface ContourMatchOptions {
  timeToleranceMs: number;
  sameDeadZone: number;
  durationToleranceRatio: number;
}

export interface ContourMatchResult {
  matchedEvents: number;
  totalEvents: number;
  score: number;
}

export type AttemptNoteStatus = 'pending' | 'matched' | 'mismatched';
export type AttemptTransitionStatus = 'matched' | 'mismatched' | 'extra';

export interface AttemptTransitionResult {
  attemptEventIndex: number;
  attemptNoteId: string;
  direction: ContourDirection;
  status: AttemptTransitionStatus;
  expectedDirection: ContourDirection | null;
}

export interface ContourMatchDetailedResult extends ContourMatchResult {
  attemptNoteStatuses: Record<string, AttemptNoteStatus>;
}

export interface StableContourMatchResult extends ContourMatchDetailedResult {
  transitionResults: AttemptTransitionResult[];
}

const DEFAULT_MATCH_OPTIONS: ContourMatchOptions = {
  timeToleranceMs: 400,
  sameDeadZone: 0.08,
  durationToleranceRatio: 0.6,
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

function alignContourEvents(
  answerEvents: ContourEvent[],
  attemptEvents: ContourEvent[]
): Map<number, number> {
  if (answerEvents.length === 0 || attemptEvents.length === 0) {
    return new Map<number, number>();
  }

  const dp: number[][] = Array.from(
    { length: answerEvents.length + 1 },
    () => Array.from({ length: attemptEvents.length + 1 }, () => 0)
  );

  for (let answerIndex = answerEvents.length - 1; answerIndex >= 0; answerIndex -= 1) {
    for (let attemptIndex = attemptEvents.length - 1; attemptIndex >= 0; attemptIndex -= 1) {
      if (answerEvents[answerIndex].direction === attemptEvents[attemptIndex].direction) {
        dp[answerIndex][attemptIndex] = dp[answerIndex + 1][attemptIndex + 1] + 1;
      } else {
        dp[answerIndex][attemptIndex] = Math.max(
          dp[answerIndex + 1][attemptIndex],
          dp[answerIndex][attemptIndex + 1]
        );
      }
    }
  }

  const attemptToAnswerIndex = new Map<number, number>();
  let answerIndex = 0;
  let attemptIndex = 0;

  while (answerIndex < answerEvents.length && attemptIndex < attemptEvents.length) {
    if (answerEvents[answerIndex].direction === attemptEvents[attemptIndex].direction) {
      attemptToAnswerIndex.set(attemptIndex, answerIndex);
      answerIndex += 1;
      attemptIndex += 1;
      continue;
    }

    if (dp[answerIndex + 1][attemptIndex] >= dp[answerIndex][attemptIndex + 1]) {
      answerIndex += 1;
    } else {
      attemptIndex += 1;
    }
  }

  return attemptToAnswerIndex;
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
  const detailed = compareContourAttemptDetailed(answerKey, attempt, options);
  return {
    matchedEvents: detailed.matchedEvents,
    totalEvents: detailed.totalEvents,
    score: detailed.score,
  };
}

export function compareContourAttemptDetailed(
  answerKey: PitchContourNote[],
  attempt: PitchContourNote[],
  options: Partial<ContourMatchOptions> = {}
): ContourMatchDetailedResult {
  const effective = { ...DEFAULT_MATCH_OPTIONS, ...options };
  const sortedAnswer = [...answerKey].sort((a, b) => a.timeOffsetMs - b.timeOffsetMs);
  const sortedAttempt = [...attempt].sort((a, b) => a.timeOffsetMs - b.timeOffsetMs);
  const answerEvents = buildContourDirectionEvents(sortedAnswer, effective);
  const attemptEvents = buildContourDirectionEvents(sortedAttempt, effective);

  const attemptNoteStatuses: Record<string, AttemptNoteStatus> = {};
  for (const note of sortedAttempt) {
    attemptNoteStatuses[note.id] = 'pending';
  }

  for (let i = 1; i < sortedAttempt.length; i += 1) {
    attemptNoteStatuses[sortedAttempt[i].id] = 'mismatched';
  }

  if (answerEvents.length === 0) {
    return {
      matchedEvents: 0,
      totalEvents: 0,
      score: 1,
      attemptNoteStatuses,
    };
  }

  const usedAttemptIndices = new Set<number>();
  let matchedEvents = 0;

  for (let answerIndex = 0; answerIndex < answerEvents.length; answerIndex += 1) {
    const answerEvent = answerEvents[answerIndex];
    let bestAttemptIndex = -1;
    let bestDelta = Number.POSITIVE_INFINITY;

    for (let attemptIndex = 0; attemptIndex < attemptEvents.length; attemptIndex += 1) {
      if (usedAttemptIndices.has(attemptIndex)) {
        continue;
      }

      const attemptEvent = attemptEvents[attemptIndex];
      if (attemptEvent.direction !== answerEvent.direction) {
        continue;
      }

      const answerDurationMs = Math.max(
        1,
        sortedAnswer[Math.min(sortedAnswer.length - 1, answerIndex + 1)]?.durationMs ?? 1
      );
      const attemptDurationMs = Math.max(
        1,
        sortedAttempt[Math.min(sortedAttempt.length - 1, attemptIndex + 1)]?.durationMs ?? 1
      );
      const durationDeltaRatio = Math.abs(attemptDurationMs - answerDurationMs) / answerDurationMs;
      if (durationDeltaRatio > effective.durationToleranceRatio) {
        continue;
      }

      const delta = Math.abs(attemptEvent.timeOffsetMs - answerEvent.timeOffsetMs);
      if (delta > effective.timeToleranceMs) {
        continue;
      }

      if (delta < bestDelta) {
        bestDelta = delta;
        bestAttemptIndex = attemptIndex;
      }
    }

    if (bestAttemptIndex !== -1) {
      usedAttemptIndices.add(bestAttemptIndex);
      matchedEvents += 1;
      const matchedNote = sortedAttempt[Math.min(sortedAttempt.length - 1, bestAttemptIndex + 1)];
      if (matchedNote) {
        attemptNoteStatuses[matchedNote.id] = 'matched';
      }
    }
  }

  const totalEvents = answerEvents.length;

  return {
    matchedEvents,
    totalEvents,
    score: totalEvents === 0 ? 1 : matchedEvents / totalEvents,
    attemptNoteStatuses,
  };
}

export function compareContourAttemptStable(
  answerKey: PitchContourNote[],
  attempt: PitchContourNote[],
  options: Partial<ContourMatchOptions> = {}
): StableContourMatchResult {
  const effective = { ...DEFAULT_MATCH_OPTIONS, ...options };
  const sortedAnswer = [...answerKey].sort((a, b) => a.timeOffsetMs - b.timeOffsetMs);
  const sortedAttempt = [...attempt].sort((a, b) => a.timeOffsetMs - b.timeOffsetMs);
  const answerEvents = buildContourDirectionEvents(sortedAnswer, effective);
  const attemptEvents = buildContourDirectionEvents(sortedAttempt, effective);

  const attemptNoteStatuses: Record<string, AttemptNoteStatus> = {};
  for (const note of sortedAttempt) {
    attemptNoteStatuses[note.id] = 'pending';
  }

  const transitionResults: AttemptTransitionResult[] = [];
  const matchedAttemptToAnswerIndex = alignContourEvents(answerEvents, attemptEvents);
  const matchedEvents = matchedAttemptToAnswerIndex.size;

  for (let index = 0; index < attemptEvents.length; index += 1) {
    const attemptEvent = attemptEvents[index];
    const attemptNote = sortedAttempt[index + 1];
    if (!attemptNote) {
      continue;
    }

    const alignedAnswerIndex = matchedAttemptToAnswerIndex.get(index);
    const expectedEvent =
      alignedAnswerIndex === undefined ? answerEvents[index] : answerEvents[alignedAnswerIndex];
    let status: AttemptTransitionStatus = 'extra';
    let expectedDirection: ContourDirection | null = null;

    if (alignedAnswerIndex !== undefined && expectedEvent) {
      expectedDirection = expectedEvent.direction;
      status = 'matched';
      attemptNoteStatuses[attemptNote.id] = 'matched';
    } else {
      if (expectedEvent) {
        expectedDirection = expectedEvent.direction;
        status = 'mismatched';
      }
      attemptNoteStatuses[attemptNote.id] = 'mismatched';
    }

    transitionResults.push({
      attemptEventIndex: index,
      attemptNoteId: attemptNote.id,
      direction: attemptEvent.direction,
      status,
      expectedDirection,
    });
  }

  const totalEvents = answerEvents.length === 0 ? 0 : Math.max(answerEvents.length, attemptEvents.length);

  return {
    matchedEvents,
    totalEvents,
    score: totalEvents === 0 ? 1 : matchedEvents / totalEvents,
    attemptNoteStatuses,
    transitionResults,
  };
}
