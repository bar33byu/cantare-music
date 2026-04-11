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
  let searchStartIndex = 0;

  for (let answerIndex = 0; answerIndex < answerEvents.length; answerIndex += 1) {
    const answerEvent = answerEvents[answerIndex];
    let matchedAttemptIndex = -1;

    for (let i = searchStartIndex; i < attemptEvents.length; i += 1) {
      if (usedAttemptIndices.has(i)) {
        continue;
      }

      const attemptEvent = attemptEvents[i];
      if (attemptEvent.direction !== answerEvent.direction) {
        continue;
      }

      matchedAttemptIndex = i;
      break;
    }

    if (matchedAttemptIndex !== -1) {
      usedAttemptIndices.add(matchedAttemptIndex);
      matchedEvents += 1;
      searchStartIndex = matchedAttemptIndex + 1;
      const matchedNote = sortedAttempt[Math.min(sortedAttempt.length - 1, matchedAttemptIndex + 1)];
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
  let matchedEvents = 0;

  for (let index = 0; index < attemptEvents.length; index += 1) {
    const attemptEvent = attemptEvents[index];
    const attemptNote = sortedAttempt[index + 1];
    if (!attemptNote) {
      continue;
    }

    const expectedEvent = answerEvents[index];
    let status: AttemptTransitionStatus = 'extra';
    let expectedDirection: ContourDirection | null = null;

    if (expectedEvent) {
      expectedDirection = expectedEvent.direction;
      status = attemptEvent.direction === expectedEvent.direction ? 'matched' : 'mismatched';
    }

    if (status === 'matched') {
      matchedEvents += 1;
      attemptNoteStatuses[attemptNote.id] = 'matched';
    } else {
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
