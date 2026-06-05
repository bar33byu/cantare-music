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
  if (songs.length === 0) {
    return 0;
  }

  const perSongScores = songs.map((song) => {
    if (!song.segments || song.segments.length === 0) {
      return 0;
    }

    const segmentScores = song.segments.map((segment) => {
      const latest = ratings
        .filter((rating) => rating.segmentId === segment.id)
        .sort((a, b) => new Date(b.ratedAt).getTime() - new Date(a.ratedAt).getTime())[0];

      return latest ? getSegmentKnowledgePercent(latest.rating as MemoryRating) : 0;
    });

    return segmentScores.reduce((sum, value) => sum + value, 0) / segmentScores.length;
  });

  return perSongScores.reduce((sum, score) => sum + score, 0) / perSongScores.length;
}
