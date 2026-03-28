import { describe, it, expect } from "vitest";
import { songs, segments, practiceRatings } from "./schema";

describe("schema tables", () => {
  it("songs table has expected columns", () => {
    const cols = Object.keys(songs);
    expect(cols).toContain("id");
    expect(cols).toContain("title");
    expect(cols).toContain("artist");
    expect(cols).toContain("audioKey");
    expect(cols).toContain("createdAt");
  });

  it("segments table has expected columns", () => {
    const cols = Object.keys(segments);
    expect(cols).toContain("id");
    expect(cols).toContain("songId");
    expect(cols).toContain("label");
    expect(cols).toContain("order");
    expect(cols).toContain("startMs");
    expect(cols).toContain("endMs");
    expect(cols).toContain("lyricText");
  });

  it("practiceRatings table has expected columns", () => {
    const cols = Object.keys(practiceRatings);
    expect(cols).toContain("id");
    expect(cols).toContain("segmentId");
    expect(cols).toContain("rating");
    expect(cols).toContain("ratedAt");
  });
});