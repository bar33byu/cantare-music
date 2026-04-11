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

export interface ContourMatchDetailedResult extends ContourMatchResult {
  attemptNoteStatuses: Record<string, AttemptNoteStatus>;
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
