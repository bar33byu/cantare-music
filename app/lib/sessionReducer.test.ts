import { describe, it, expect } from 'vitest';
import { sessionReducer } from './sessionReducer';
import { makeSession } from './factories';

describe('sessionReducer', () => {
  it('NEXT_SEGMENT increments currentSegmentIndex', () => {
    const state = makeSession({ currentSegmentIndex: 0 });
    const next = sessionReducer(state, { type: 'NEXT_SEGMENT' });
    expect(next.currentSegmentIndex).toBe(1);
  });

  it('PREV_SEGMENT at index 0 stays at 0', () => {
    const state = makeSession({ currentSegmentIndex: 0 });
    const next = sessionReducer(state, { type: 'PREV_SEGMENT' });
    expect(next.currentSegmentIndex).toBe(0);
  });

  it('PREV_SEGMENT decrements when index > 0', () => {
    const state = makeSession({ currentSegmentIndex: 2 });
    const next = sessionReducer(state, { type: 'PREV_SEGMENT' });
    expect(next.currentSegmentIndex).toBe(1);
  });

  it('SET_SEGMENT_INDEX sets the exact index', () => {
    const state = makeSession({ currentSegmentIndex: 0 });
    const next = sessionReducer(state, { type: 'SET_SEGMENT_INDEX', index: 3 });
    expect(next.currentSegmentIndex).toBe(3);
  });

  it('SET_SEGMENT_INDEX clamps negative values to 0', () => {
    const state = makeSession({ currentSegmentIndex: 2 });
    const next = sessionReducer(state, { type: 'SET_SEGMENT_INDEX', index: -5 });
    expect(next.currentSegmentIndex).toBe(0);
  });

  it('TOGGLE_LOCK flips isLocked', () => {
    const state = makeSession({ isLocked: false });
    const locked = sessionReducer(state, { type: 'TOGGLE_LOCK' });
    expect(locked.isLocked).toBe(true);
    const unlocked = sessionReducer(locked, { type: 'TOGGLE_LOCK' });
    expect(unlocked.isLocked).toBe(false);
  });

  it('RATE_SEGMENT appends rating with correct segmentId and rating value', () => {
    const state = makeSession({ ratings: [] });
    const next = sessionReducer(state, { type: 'RATE_SEGMENT', segmentId: 'seg1', rating: 4 });
    expect(next.ratings).toHaveLength(1);
    expect(next.ratings[0].segmentId).toBe('seg1');
    expect(next.ratings[0].rating).toBe(4);
  });

  it('multiple RATE_SEGMENT dispatches for same segment results in multiple entries', () => {
    const state = makeSession({ ratings: [] });
    const s1 = sessionReducer(state, { type: 'RATE_SEGMENT', segmentId: 'seg1', rating: 2 });
    const s2 = sessionReducer(s1, { type: 'RATE_SEGMENT', segmentId: 'seg1', rating: 5 });
    expect(s2.ratings).toHaveLength(2);
    expect(s2.ratings[0].rating).toBe(2);
    expect(s2.ratings[1].rating).toBe(5);
  });

  it('COMPLETE sets completedAt', () => {
    const state = makeSession({ completedAt: undefined });
    const next = sessionReducer(state, { type: 'COMPLETE' });
    expect(next.completedAt).toBeTruthy();
    expect(typeof next.completedAt).toBe('string');
  });

  it('RESET clears ratings and resets index to 0', () => {
    const state = makeSession({ currentSegmentIndex: 3, ratings: [
      { id: 'r1', segmentId: 'seg1', rating: 3, ratedAt: new Date().toISOString() },
    ]});
    const next = sessionReducer(state, { type: 'RESET', songId: 'song-abc' });
    expect(next.currentSegmentIndex).toBe(0);
    expect(next.ratings).toHaveLength(0);
    expect(next.songId).toBe('song-abc');
    expect(next.isLocked).toBe(false);
  });

  it('original state is never mutated', () => {
    const state = makeSession({ currentSegmentIndex: 0, ratings: [] });
    const originalIndex = state.currentSegmentIndex;
    const originalRatings = state.ratings;
    sessionReducer(state, { type: 'NEXT_SEGMENT' });
    sessionReducer(state, { type: 'RATE_SEGMENT', segmentId: 'seg1', rating: 1 });
    expect(state.currentSegmentIndex).toBe(originalIndex);
    expect(state.ratings).toBe(originalRatings);
    expect(state.ratings).toHaveLength(0);
  });

  it('initial state has current_song_id as null', () => {
    const state = makeSession({ currentSegmentIndex: 0 }) as any;
    expect(state.currentSongId).toBeNull();
  });

  it('SET_CURRENT_SONG action updates current_song_id', () => {
    const state = makeSession({ currentSegmentIndex: 0 }) as any;
    const next = sessionReducer(state, { type: 'SET_CURRENT_SONG', songId: 'song-123' } as any);
    expect((next as any).currentSongId).toBe('song-123');
  });

  it('SET_CURRENT_SONG preserves other state properties', () => {
    const state = makeSession({ currentSegmentIndex: 2, ratings: [
      { id: 'r1', segmentId: 'seg1', rating: 3, ratedAt: new Date().toISOString() },
    ]}) as any;
    const next = sessionReducer(state, { type: 'SET_CURRENT_SONG', songId: 'song-456' } as any);
    expect((next as any).currentSongId).toBe('song-456');
    expect(next.currentSegmentIndex).toBe(2);
    expect(next.ratings).toHaveLength(1);
  });

  it('other actions preserve current_song_id', () => {
    const state = makeSession({ currentSegmentIndex: 0 }) as any;
    state.currentSongId = 'song-abc';
    const next = sessionReducer(state, { type: 'NEXT_SEGMENT' });
    expect((next as any).currentSongId).toBe('song-abc');
  });

  it('RESET preserves current_song_id', () => {
    const state = makeSession({ currentSegmentIndex: 3 }) as any;
    state.currentSongId = 'song-xyz';
    const next = sessionReducer(state, { type: 'RESET', songId: 'song-different' });
    expect((next as any).currentSongId).toBe('song-xyz');
  });
});
