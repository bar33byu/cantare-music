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
  answerEventIndex: number | null;
}

export interface ContourMatchDetailedResult extends ContourMatchResult {
  attemptNoteStatuses: Record<string, AttemptNoteStatus>;
}

export interface StableContourMatchResult extends ContourMatchDetailedResult {
  transitionResults: AttemptTransitionResult[];
  answerEventStatuses: Array<'matched' | 'mismatched' | 'unattempted'>;
}

export interface ContourNoteHeatStat {
  sessionCount: number;
  missCount: number;
  missRate: number;
}

const DEFAULT_MATCH_OPTIONS: ContourMatchOptions = {
  timeToleranceMs: 400,
  sameDeadZone: 0.05,
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

function findClosestAnswerEventIndex(
  answerEvents: ContourEvent[],
  startIndex: number,
  targetTimeOffsetMs: number,
  timeToleranceMs: number
): number {
  let closestIndex = -1;
  let closestDistance = Number.POSITIVE_INFINITY;

  for (let answerIndex = startIndex; answerIndex < answerEvents.length; answerIndex += 1) {
    const distance = Math.abs(answerEvents[answerIndex].timeOffsetMs - targetTimeOffsetMs);
    if (distance > timeToleranceMs) {
      if (answerEvents[answerIndex].timeOffsetMs > targetTimeOffsetMs && closestIndex !== -1) {
        break;
      }
      continue;
    }
    if (distance < closestDistance) {
      closestDistance = distance;
      closestIndex = answerIndex;
    }
  }

  return closestIndex;
}

function scoreContourAttemptByTime(
  answerEvents: ContourEvent[],
  attemptEvents: ContourEvent[],
  sortedAttempt: PitchContourNote[],
  options: ContourMatchOptions
): StableContourMatchResult {
  const attemptNoteStatuses: Record<string, AttemptNoteStatus> = {};
  for (const note of sortedAttempt) {
    attemptNoteStatuses[note.id] = 'pending';
  }

  const transitionResults: AttemptTransitionResult[] = [];
  const answerEventStatuses: StableContourMatchResult['answerEventStatuses'] = answerEvents.map(
    () => 'unattempted'
  );
  let nextAnswerIndex = 0;
  let matchedEvents = 0;

  for (let attemptIndex = 0; attemptIndex < attemptEvents.length; attemptIndex += 1) {
    const attemptEvent = attemptEvents[attemptIndex];
    const attemptNote = sortedAttempt[attemptIndex + 1];
    if (!attemptNote) {
      continue;
    }

    const expectedEvent = answerEvents[nextAnswerIndex];
    let status: AttemptTransitionStatus = 'extra';
    let expectedDirection: ContourDirection | null = null;
    let answerEventIndex: number | null = null;

    if (expectedEvent) {
      const matchedAnswerIndex = findClosestAnswerEventIndex(
        answerEvents,
        nextAnswerIndex,
        attemptEvent.timeOffsetMs,
        options.timeToleranceMs
      );

      if (matchedAnswerIndex !== -1) {
        answerEventIndex = matchedAnswerIndex;
        expectedDirection = answerEvents[matchedAnswerIndex].direction;
        if (attemptEvent.direction === expectedDirection) {
          status = 'matched';
          attemptNoteStatuses[attemptNote.id] = 'matched';
          matchedEvents += 1;
          answerEventStatuses[matchedAnswerIndex] = 'matched';
        } else {
          status = 'mismatched';
          attemptNoteStatuses[attemptNote.id] = 'mismatched';
          answerEventStatuses[matchedAnswerIndex] = 'mismatched';
        }
        nextAnswerIndex = matchedAnswerIndex + 1;
      } else {
        expectedDirection = expectedEvent.direction;
        status = 'mismatched';
        attemptNoteStatuses[attemptNote.id] = 'mismatched';
      }
    } else {
      attemptNoteStatuses[attemptNote.id] = 'mismatched';
    }

    transitionResults.push({
      attemptEventIndex: attemptIndex,
      attemptNoteId: attemptNote.id,
      direction: attemptEvent.direction,
      status,
      expectedDirection,
      answerEventIndex,
    });
  }

  const totalEvents = answerEvents.length;

  return {
    matchedEvents,
    totalEvents,
    score: totalEvents === 0 ? 1 : matchedEvents / totalEvents,
    attemptNoteStatuses,
    transitionResults,
    answerEventStatuses,
  };
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

  if (answerEvents.length === 0) {
    const attemptNoteStatuses: Record<string, AttemptNoteStatus> = {};
    for (const note of sortedAttempt) {
      attemptNoteStatuses[note.id] = 'pending';
    }
    return {
      matchedEvents: 0,
      totalEvents: 0,
      score: 1,
      attemptNoteStatuses,
    };
  }

  const scored = scoreContourAttemptByTime(answerEvents, attemptEvents, sortedAttempt, effective);
  return {
    matchedEvents: scored.matchedEvents,
    totalEvents: scored.totalEvents,
    score: scored.score,
    attemptNoteStatuses: scored.attemptNoteStatuses,
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

  return scoreContourAttemptByTime(answerEvents, attemptEvents, sortedAttempt, effective);
}

export function computeContourNoteHeatMap(
  answerKey: PitchContourNote[],
  attempts: PitchContourNote[][],
  options: Partial<ContourMatchOptions> = {}
): Record<string, ContourNoteHeatStat> {
  const sortedAnswer = [...answerKey].sort((a, b) => a.timeOffsetMs - b.timeOffsetMs);
  if (sortedAnswer.length < 2) {
    return {};
  }

  const noteIds = sortedAnswer.slice(1).map((note) => note.id);
  const totals = new Map<string, { sessionCount: number; missCount: number }>(
    noteIds.map((noteId) => [noteId, { sessionCount: 0, missCount: 0 }])
  );

  for (const attempt of attempts) {
    if (attempt.length < 2) {
      continue;
    }

    const match = compareContourAttemptStable(sortedAnswer, attempt, options);
    for (let answerEventIndex = 0; answerEventIndex < match.answerEventStatuses.length; answerEventIndex += 1) {
      const noteId = sortedAnswer[answerEventIndex + 1]?.id;
      if (!noteId) {
        continue;
      }
      const aggregate = totals.get(noteId);
      if (!aggregate) {
        continue;
      }
      aggregate.sessionCount += 1;
      if (match.answerEventStatuses[answerEventIndex] !== 'matched') {
        aggregate.missCount += 1;
      }
    }
  }

  return Object.fromEntries(
    [...totals.entries()].map(([noteId, aggregate]) => [
      noteId,
      {
        sessionCount: aggregate.sessionCount,
        missCount: aggregate.missCount,
        missRate: aggregate.sessionCount === 0 ? 0 : aggregate.missCount / aggregate.sessionCount,
      },
    ])
  );
}
