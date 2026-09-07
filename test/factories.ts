import { makeSession } from "../app/lib/factories";
import type { Segment, SegmentRating, Song } from "../app/types";

export { makeSession };

export function makeSegment(overrides?: Partial<Segment>): Segment {
  return {
    id: crypto.randomUUID(),
    songId: "seed-1",
    order: 0,
    label: "Section 1",
    lyricText: "Sample lyric text here.",
    startMs: 0,
    endMs: 8000,
    ...overrides,
  };
}

export function makeSong(overrides?: Partial<Song>): Song {
  return {
    id: crypto.randomUUID(),
    title: "Untitled",
    artist: "Unknown",
    audioUrl: "/audio/placeholder.mp3",
    segments: [],
    createdAt: new Date().toISOString(),
    updatedAt: new Date().toISOString(),
    ...overrides,
  };
}

export function makeRating(overrides?: Partial<SegmentRating>): SegmentRating {
  return {
    id: crypto.randomUUID(),
    segmentId: "seg-1",
    rating: 3,
    ratedAt: new Date().toISOString(),
    ...overrides,
  };
}
