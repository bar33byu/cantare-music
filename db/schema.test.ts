import { describe, it, expect } from "vitest";
import { songs, segments, practiceRatings, playlists, playlistSongs, users, orphanedAudioKeys } from "./schema";

describe("schema tables", () => {
  it("users table has expected columns", () => {
    const cols = Object.keys(users);
    expect(cols).toContain("id");
    expect(cols).toContain("name");
    expect(cols).toContain("createdAt");
  });
  it("songs table has expected columns", () => {
    const cols = Object.keys(songs);
    expect(cols).toContain("id");
    expect(cols).toContain("userId");
    expect(cols).toContain("title");
    expect(cols).toContain("artist");
    expect(cols).toContain("audioKey");
    expect(cols).toContain("createdAt");
    expect(cols).toContain("lastPracticedAt");
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
    expect(cols).toContain("pitchContourNotes");
  });

  it("practiceRatings table has expected columns", () => {
    const cols = Object.keys(practiceRatings);
    expect(cols).toContain("id");
    expect(cols).toContain("segmentId");
    expect(cols).toContain("rating");
    expect(cols).toContain("ratedAt");
  });

  it("playlists table has expected columns", () => {
    const cols = Object.keys(playlists);
    expect(cols).toContain("id");
    expect(cols).toContain("userId");
    expect(cols).toContain("name");
    expect(cols).toContain("eventDate");
    expect(cols).toContain("isRetired");
    expect(cols).toContain("createdAt");
  });

  it("playlistSongs table has expected columns", () => {
    const cols = Object.keys(playlistSongs);
    expect(cols).toContain("playlistId");
    expect(cols).toContain("songId");
    expect(cols).toContain("position");
  });

  it("orphanedAudioKeys table has expected columns", () => {
    const cols = Object.keys(orphanedAudioKeys);
    expect(cols).toContain("id");
    expect(cols).toContain("userId");
    expect(cols).toContain("audioKey");
    expect(cols).toContain("failedAt");
  });
});