import { describe, it, expect } from 'vitest';
import { hasRehearsedSinceMemoryReview, isMemoryReviewDue, memoryReviewCutoff, pendingMemoryReviewSegments } from './memoryReview';

const now = new Date('2026-05-31T12:00:00Z');
describe('memorization review', () => {
  it('uses three calendar months and clamps month-end dates', () => {
    expect(memoryReviewCutoff(now).toISOString()).toBe('2026-02-28T12:00:00.000Z');
    expect(isMemoryReviewDue(['2026-02-28T11:59:59Z'], null, now)).toBe(true);
    expect(isMemoryReviewDue(['2026-02-28T12:00:00Z'], null, now)).toBe(false);
  });
  it('honors the latest rehearsal or performance, ignoring future events', () => {
    expect(isMemoryReviewDue(['2025-01-01', '2026-05-01'], null, now)).toBe(false);
    expect(isMemoryReviewDue(['2025-01-01', '2027-01-01'], null, now)).toBe(true);
    expect(isMemoryReviewDue([null], null, now)).toBe(false);
  });
  it('does not repeat a reset or undo within the same cycle', () => {
    expect(isMemoryReviewDue(['2025-01-01'], { startedAt: now.toISOString(), segments: [], undone: true }, now)).toBe(false);
    expect(isMemoryReviewDue(['2025-01-01'], { startedAt: '2025-01-01', segments: [] }, now)).toBe(true);
  });
  it('keeps untouched segments pending when another segment is reviewed', () => {
    const state = { startedAt: now.toISOString(), segments: [
      { segmentId: 'a', ratedAt: '2025-01-01' }, { segmentId: 'b', ratedAt: '2025-01-01' },
    ] };
    expect(pendingMemoryReviewSegments(state, [
      { segmentId: 'a', ratedAt: now.toISOString() }, { segmentId: 'b', ratedAt: '2025-01-01' },
    ])).toEqual(['b']);
    expect(pendingMemoryReviewSegments({ ...state, undone: true }, state.segments)).toEqual([]);
  });
});

describe('completing a memorization reminder', () => {
  const state = { startedAt: '2026-05-01T12:00:00Z', segments: [{ segmentId: 'a', ratedAt: '2025-01-01' }] };
  it('clears after a rehearsal or performance without changing segment ratings', () => {
    expect(hasRehearsedSinceMemoryReview(state, ['2026-05-02'], now)).toBe(true);
    expect(pendingMemoryReviewSegments(state, state.segments)).toEqual(['a']);
  });
  it('does not clear for earlier activity, opening a song, or a future event', () => {
    expect(hasRehearsedSinceMemoryReview(state, ['2026-04-30', null, '2027-01-01'], now)).toBe(false);
    expect(hasRehearsedSinceMemoryReview(null, ['2026-05-02'], now)).toBe(false);
  });
});
