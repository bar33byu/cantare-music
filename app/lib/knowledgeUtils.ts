import { KnowledgeScore, MemoryRating, PracticeSession, Song } from '../types/index';

export function getSegmentKnowledgePercent(rating: MemoryRating): number {
  return rating * 20;
}

export function computeKnowledgeScore(
  session: PracticeSession,
  song: Song
): KnowledgeScore {
  const bySegment: Record<string, number> = {};

  for (const segment of song.segments) {
    const ratings = session.ratings
      .filter((r) => r.segmentId === segment.id)
      .sort((a, b) => new Date(b.ratedAt).getTime() - new Date(a.ratedAt).getTime());

    if (ratings.length > 0) {
      bySegment[segment.id] = getSegmentKnowledgePercent(ratings[0].rating);
    }
  }

  const values = Object.values(bySegment);
  const overall =
    values.length === 0
      ? 0
      : values.reduce((sum, v) => sum + v, 0) / values.length;

  return { bySegment, overall };
}
