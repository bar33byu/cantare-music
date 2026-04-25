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
  answerLookaheadSlots: number;
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
  answerLookaheadSlots: 2,
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

function scoreContourAttemptSlots(
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

    if (expectedEvent) {
      expectedDirection = expectedEvent.direction;
      const maxAnswerIndex = Math.min(
        answerEvents.length - 1,
        nextAnswerIndex + Math.max(0, options.answerLookaheadSlots - 1)
      );

      let matchedAnswerIndex = -1;
      for (let answerIndex = nextAnswerIndex; answerIndex <= maxAnswerIndex; answerIndex += 1) {
        if (answerEvents[answerIndex]?.direction === attemptEvent.direction) {
          matchedAnswerIndex = answerIndex;
          break;
        }
      }

      if (matchedAnswerIndex !== -1) {
        status = 'matched';
        attemptNoteStatuses[attemptNote.id] = 'matched';
        matchedEvents += 1;
        expectedDirection = answerEvents[matchedAnswerIndex].direction;
        nextAnswerIndex = matchedAnswerIndex + 1;
      } else {
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

  const scored = scoreContourAttemptSlots(answerEvents, attemptEvents, sortedAttempt, effective);
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

  return scoreContourAttemptSlots(answerEvents, attemptEvents, sortedAttempt, effective);
}
