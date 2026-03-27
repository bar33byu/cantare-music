import { MemoryRating, PracticeSession } from '../types/index';

export type SessionAction =
  | { type: 'NEXT_SEGMENT' }
  | { type: 'PREV_SEGMENT' }
  | { type: 'TOGGLE_LOCK' }
  | { type: 'RATE_SEGMENT'; segmentId: string; rating: MemoryRating }
  | { type: 'COMPLETE' }
  | { type: 'RESET'; songId: string };

export function sessionReducer(
  state: PracticeSession,
  action: SessionAction
): PracticeSession {
  switch (action.type) {
    case 'NEXT_SEGMENT':
      return { ...state, currentSegmentIndex: state.currentSegmentIndex + 1 };

    case 'PREV_SEGMENT':
      return {
        ...state,
        currentSegmentIndex: Math.max(0, state.currentSegmentIndex - 1),
      };

    case 'TOGGLE_LOCK':
      return { ...state, isLocked: !state.isLocked };

    case 'RATE_SEGMENT':
      return {
        ...state,
        ratings: [
          ...state.ratings,
          {
            id: crypto.randomUUID(),
            segmentId: action.segmentId,
            rating: action.rating,
            ratedAt: new Date().toISOString(),
          },
        ],
      };

    case 'COMPLETE':
      return { ...state, completedAt: new Date().toISOString() };

    case 'RESET':
      return {
        id: crypto.randomUUID(),
        songId: action.songId,
        currentSegmentIndex: 0,
        isLocked: false,
        ratings: [],
        startedAt: new Date().toISOString(),
        completedAt: undefined,
      };

    default:
      return state;
  }
}
