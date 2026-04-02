import { MemoryRating, PracticeSession } from '../types/index';

export interface SessionState extends PracticeSession {
  currentSongId: string | null;
}

export type SessionAction =
  | { type: 'NEXT_SEGMENT' }
  | { type: 'PREV_SEGMENT' }
  | { type: 'SET_SEGMENT_INDEX'; index: number }
  | { type: 'TOGGLE_LOCK' }
  | { type: 'RATE_SEGMENT'; segmentId: string; rating: MemoryRating }
  | { type: 'CLEAR_SEGMENT_RATING'; segmentId: string }
  | { type: 'LOAD_RATINGS'; ratings: PracticeSession['ratings'] }
  | { type: 'COMPLETE' }
  | { type: 'RESET'; songId: string }
  | { type: 'SET_CURRENT_SONG'; songId: string };

export function sessionReducer(
  state: SessionState,
  action: SessionAction
): SessionState {
  switch (action.type) {
    case 'NEXT_SEGMENT':
      return { ...state, currentSegmentIndex: state.currentSegmentIndex + 1 };

    case 'PREV_SEGMENT':
      return {
        ...state,
        currentSegmentIndex: Math.max(0, state.currentSegmentIndex - 1),
      };

    case 'SET_SEGMENT_INDEX':
      return {
        ...state,
        currentSegmentIndex: Math.max(0, action.index),
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

    case 'CLEAR_SEGMENT_RATING':
      return {
        ...state,
        ratings: state.ratings.filter((rating) => rating.segmentId !== action.segmentId),
      };

    case 'LOAD_RATINGS':
      if (state.completedAt) {
        return state;
      }
      return {
        ...state,
        ratings: action.ratings,
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
        currentSongId: state.currentSongId,
      };

    case 'SET_CURRENT_SONG':
      return { ...state, currentSongId: action.songId };

    default:
      return state;
  }
}

export function setSongId(songId: string): SessionAction {
  return { type: 'SET_CURRENT_SONG', songId };
}
