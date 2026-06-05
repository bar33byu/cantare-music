import { KnowledgeScore, MemoryRating, PracticeSession, Song } from '../types/index';
import { SegmentRating } from '../types/index';

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

  const totalSegments = song.segments.length;
  const totalKnowledge = song.segments.reduce((sum, segment) => {
    return sum + (bySegment[segment.id] ?? 0);
  }, 0);
  const overall = totalSegments === 0 ? 0 : totalKnowledge / totalSegments;

  return { bySegment, overall };
}

export function computePlaylistKnowledge(
  songs: Song[],
  ratings: SegmentRating[]
): number {
  const segments = songs.flatMap((song) => song.segments ?? []);
  if (segments.length === 0) {
    return 0;
  }

  const latestRatingBySegment = new Map<string, SegmentRating>();
  for (const rating of ratings) {
    const previous = latestRatingBySegment.get(rating.segmentId);
    if (!previous || new Date(rating.ratedAt).getTime() > new Date(previous.ratedAt).getTime()) {
      latestRatingBySegment.set(rating.segmentId, rating);
    }
  }

  const total = segments.reduce((sum, segment) => {
    const latest = latestRatingBySegment.get(segment.id);
    return sum + (latest ? getSegmentKnowledgePercent(latest.rating as MemoryRating) : 0);
  }, 0);

  return total / segments.length;
}
