import { describe, it, expect } from "vitest";
import type {
  Segment,
  Song,
  MemoryRating,
  SegmentRating,
  PracticeSession,
  KnowledgeScore,
} from "./index";

describe("Core types", () => {
  it("Segment satisfies type", () => {
    const seg = {
      id: "seg-1",
      songId: "song-1",
      order: 0,
      label: "Section 1",
      lyricText: "Amazing grace how sweet the sound",
      startMs: 0,
      endMs: 8000,
    } satisfies Segment;
    expect(seg.id).toBe("seg-1");
  });

  it("Song has segments.length > 0", () => {
    const song = {
      id: "song-1",
      title: "Amazing Grace",
      composer: "John Newton",
      audioUrl: "/audio/amazing-grace.mp3",
      segments: [
        {
          id: "seg-1", songId: "song-1", order: 0,
          label: "Section 1", lyricText: "Amazing grace",
          startMs: 0, endMs: 8000,
        },
      ],
      createdAt: new Date().toISOString(),
      updatedAt: new Date().toISOString(),
    } satisfies Song;
    expect(song.segments.length).toBeGreaterThan(0);
  });

  it("MemoryRating satisfies type", () => {
    const r: MemoryRating = 3;
    expect(r).toBe(3);
  });

  it("SegmentRating satisfies type", () => {
    const rating = {
      id: "rating-1",
      segmentId: "seg-1",
      rating: 4 as MemoryRating,
      ratedAt: new Date().toISOString(),
    } satisfies SegmentRating;
    expect(rating.rating).toBe(4);
  });

  it("PracticeSession starts with isLocked: false and currentSegmentIndex: 0", () => {
    const session = {
      id: "session-1",
      songId: "song-1",
      currentSegmentIndex: 0,
      isLocked: false,
      ratings: [],
      startedAt: new Date().toISOString(),
    } satisfies PracticeSession;
    expect(session.isLocked).toBe(false);
    expect(session.currentSegmentIndex).toBe(0);
  });

  it("KnowledgeScore satisfies type", () => {
    const score = {
      overall: 60,
      bySegment: { "seg-1": 60, "seg-2": 80 },
    } satisfies KnowledgeScore;
    expect(score.overall).toBe(60);
  });
});