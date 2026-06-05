import { describe, it, expect } from "vitest";
import {
  songs,
  segments,
  practiceRatings,
  playlists,
  playlistSongs,
  users,
  magicLinkTokens,
  emailChangeTokens,
  userSessions,
  auditLogs,
  orphanedAudioKeys,
  draftRecordings,
  tapPracticeSessions,
  tapPracticeTaps,
} from "./schema";

describe("schema tables", () => {
  it("users table has expected columns", () => {
    const cols = Object.keys(users);
    expect(cols).toContain("id");
    expect(cols).toContain("username");
    expect(cols).toContain("name");
    expect(cols).toContain("email");
    expect(cols).toContain("avatarUrl");
    expect(cols).toContain("profileVisibility");
    expect(cols).toContain("accountDeletionRequestedAt");
    expect(cols).toContain("accountDeletionScheduledFor");
    expect(cols).toContain("createdAt");
    expect(cols).toContain("updatedAt");
  });
  it("magic link tokens table has expected columns", () => {
    const cols = Object.keys(magicLinkTokens);
    expect(cols).toContain("id");
    expect(cols).toContain("email");
    expect(cols).toContain("tokenHash");
    expect(cols).toContain("createdAt");
    expect(cols).toContain("expiresAt");
    expect(cols).toContain("consumedAt");
  });

  it("email change tokens table has expected columns", () => {
    const cols = Object.keys(emailChangeTokens);
    expect(cols).toContain("id");
    expect(cols).toContain("userId");
    expect(cols).toContain("email");
    expect(cols).toContain("tokenHash");
    expect(cols).toContain("createdAt");
    expect(cols).toContain("expiresAt");
    expect(cols).toContain("consumedAt");
  });

  it("user sessions table has expected columns", () => {
    const cols = Object.keys(userSessions);
    expect(cols).toContain("id");
    expect(cols).toContain("userId");
    expect(cols).toContain("tokenHash");
    expect(cols).toContain("createdAt");
    expect(cols).toContain("expiresAt");
    expect(cols).toContain("revokedAt");
  });

  it("audit logs table has expected columns", () => {
    const cols = Object.keys(auditLogs);
    expect(cols).toContain("id");
    expect(cols).toContain("eventType");
    expect(cols).toContain("actorUserId");
    expect(cols).toContain("effectiveUserId");
    expect(cols).toContain("resourceType");
    expect(cols).toContain("resourceId");
    expect(cols).toContain("metadata");
    expect(cols).toContain("createdAt");
  });

  it("songs table has expected columns", () => {
    const cols = Object.keys(songs);
    expect(cols).toContain("id");
    expect(cols).toContain("userId");
    expect(cols).toContain("title");
    expect(cols).toContain("artist");
    expect(cols).toContain("audioKey");
    expect(cols).toContain("alternateAudioKey");
    expect(cols).toContain("audioTrimStartMs");
    expect(cols).toContain("audioTrimEndMs");
    expect(cols).toContain("sourceSongId");
    expect(cols).toContain("shareToken");
    expect(cols).toContain("sharedAt");
    expect(cols).toContain("shareAudioMode");
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
    expect(cols).toContain("sourceSegmentId");
    expect(cols).toContain("pitchContourNotes");
  });

  it("practiceRatings table has expected columns", () => {
    const cols = Object.keys(practiceRatings);
    expect(cols).toContain("id");
    expect(cols).toContain("userId");
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
    expect(cols).toContain("isPublic");
    expect(cols).toContain("publishedAt");
    expect(cols).toContain("shareToken");
    expect(cols).toContain("sharedAt");
    expect(cols).toContain("shareAudioMode");
    expect(cols).toContain("publicShareAudioMode");
    expect(cols).toContain("sourcePlaylistId");
    expect(cols).toContain("sourceOwnerId");
    expect(cols).toContain("sourceShareToken");
    expect(cols).toContain("importedAt");
    expect(cols).toContain("lastSourceSyncCheckedAt");
    expect(cols).toContain("lastSourceSyncedAt");
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

  it("draftRecordings table has expected columns", () => {
    const cols = Object.keys(draftRecordings);
    expect(cols).toContain("id");
    expect(cols).toContain("songId");
    expect(cols).toContain("title");
    expect(cols).toContain("audioKey");
    expect(cols).toContain("status");
    expect(cols).toContain("trimStartMs");
    expect(cols).toContain("trimEndMs");
    expect(cols).toContain("createdAt");
    expect(cols).toContain("archivedAt");
  });

  it("tapPracticeSessions table has expected columns", () => {
    const cols = Object.keys(tapPracticeSessions);
    expect(cols).toContain("id");
    expect(cols).toContain("userId");
    expect(cols).toContain("songId");
    expect(cols).toContain("startedAt");
  });

  it("tapPracticeTaps table has expected columns", () => {
    const cols = Object.keys(tapPracticeTaps);
    expect(cols).toContain("id");
    expect(cols).toContain("sessionId");
    expect(cols).toContain("segmentId");
    expect(cols).toContain("noteId");
    expect(cols).toContain("timeOffsetMs");
    expect(cols).toContain("durationMs");
    expect(cols).toContain("laneMilli");
    expect(cols).toContain("createdAt");
  });
});
