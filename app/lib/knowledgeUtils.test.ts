import { describe, it, expect } from 'vitest';
import { computeKnowledgeScore, computePlaylistKnowledge, getSegmentKnowledgePercent } from './knowledgeUtils';
import { makeSong, makeSession, makeRating } from './factories';

describe('getSegmentKnowledgePercent', () => {
  it('returns rating * 20', () => {
    expect(getSegmentKnowledgePercent(5)).toBe(100);
    expect(getSegmentKnowledgePercent(1)).toBe(20);
    expect(getSegmentKnowledgePercent(3)).toBe(60);
  });
});

describe('computeKnowledgeScore', () => {
  it('returns overall 0 and empty bySegment when no ratings', () => {
    const song = makeSong({ segments: [{ id: 'seg1', label: 'Verse 1', order: 0 }] });
    const session = makeSession({ songId: song.id, ratings: [] });
    const result = computeKnowledgeScore(session, song);
    expect(result.overall).toBe(0);
    expect(result.bySegment).toEqual({});
  });

  it('returns bySegment with 60 and overall 60 for one segment rated 3', () => {
    const song = makeSong({ segments: [{ id: 'seg1', label: 'Verse 1', order: 0 }] });
    const rating = makeRating({ segmentId: 'seg1', rating: 3 });
    const session = makeSession({ songId: song.id, ratings: [rating] });
    const result = computeKnowledgeScore(session, song);
    expect(result.bySegment['seg1']).toBe(60);
    expect(result.overall).toBe(60);
  });

  it('returns overall 60 for two segments rated 2 and 4', () => {
    const song = makeSong({
      segments: [
        { id: 'seg1', label: 'Verse 1', order: 0 },
        { id: 'seg2', label: 'Verse 2', order: 1 },
      ],
    });
    const r1 = makeRating({ segmentId: 'seg1', rating: 2 });
    const r2 = makeRating({ segmentId: 'seg2', rating: 4 });
    const session = makeSession({ songId: song.id, ratings: [r1, r2] });
    const result = computeKnowledgeScore(session, song);
    expect(result.bySegment['seg1']).toBe(40);
    expect(result.bySegment['seg2']).toBe(80);
    expect(result.overall).toBe(60);
  });

  it('treats unrated segments as 0 in overall score', () => {
    const song = makeSong({
      segments: [
        { id: 'seg1', label: 'Verse 1', order: 0 },
        { id: 'seg2', label: 'Verse 2', order: 1 },
      ],
    });
    const r1 = makeRating({ segmentId: 'seg1', rating: 3 });
    const session = makeSession({ songId: song.id, ratings: [r1] });
    const result = computeKnowledgeScore(session, song);

    expect(result.bySegment['seg1']).toBe(60);
    expect(result.bySegment['seg2']).toBeUndefined();
    expect(result.overall).toBe(30);
  });

  it('uses most recent rating when multiple exist for same segment', () => {
    const song = makeSong({ segments: [{ id: 'seg1', label: 'Verse 1', order: 0 }] });
    const older = makeRating({
      segmentId: 'seg1',
      rating: 1,
      ratedAt: '2024-01-01T10:00:00.000Z',
    });
    const newer = makeRating({
      segmentId: 'seg1',
      rating: 5,
      ratedAt: '2024-01-02T10:00:00.000Z',
    });
    const session = makeSession({ songId: song.id, ratings: [older, newer] });
    const result = computeKnowledgeScore(session, song);
    expect(result.bySegment['seg1']).toBe(100);
    expect(result.overall).toBe(100);
  });
});

describe('computePlaylistKnowledge', () => {
  it('returns 0 when songs array is empty', () => {
    expect(computePlaylistKnowledge([], [])).toBe(0);
  });

  it('returns 0 for songs with no ratings', () => {
    const songs = [
      makeSong({
        id: 'song-1',
        segments: [
          { id: 'seg-1', label: 'Section 1', order: 0, songId: 'song-1' },
        ],
      }),
    ];
    expect(computePlaylistKnowledge(songs, [])).toBe(0);
  });

  it('averages per-song scores with mixed ratings', () => {
    const songs = [
      makeSong({
        id: 'song-1',
        segments: [
          { id: 'seg-1', label: 'Section 1', order: 0, songId: 'song-1' },
          { id: 'seg-2', label: 'Section 2', order: 1, songId: 'song-1' },
        ],
      }),
      makeSong({
        id: 'song-2',
        segments: [
          { id: 'seg-3', label: 'Section 1', order: 0, songId: 'song-2' },
        ],
      }),
    ];

    const ratings = [
      makeRating({ segmentId: 'seg-1', rating: 5, ratedAt: '2026-03-01T00:00:00.000Z' }),
      makeRating({ segmentId: 'seg-2', rating: 3, ratedAt: '2026-03-01T00:00:00.000Z' }),
      makeRating({ segmentId: 'seg-3', rating: 2, ratedAt: '2026-03-01T00:00:00.000Z' }),
    ];

    // Song1 avg = (100 + 60) / 2 = 80; Song2 avg = 40; playlist avg = 60
    expect(computePlaylistKnowledge(songs, ratings)).toBe(60);
  });
});
