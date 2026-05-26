import { eq, asc, desc, inArray, and, count, lte, sql, isNull } from "drizzle-orm";
import { db } from "./index";
import { songs, segments, practiceRatings, playlists, playlistSongs, orphanedAudioKeys, draftRecordings, users, magicLinkTokens, userSessions, auditLogs, tapPracticeSessions, tapPracticeTaps, midiSources, midiAlignments } from "./schema";
import type { SongRow, SegmentRow, PlaylistRow, OrphanedAudioKeyRow, DraftRecordingRow, TapPracticeSessionRow, MidiSourceRow, MidiAlignmentRow, RawMidiNoteData, CleanedMidiNoteData, MidiCleanupSettingsData, UserRow, MagicLinkTokenRow, UserSessionRow, AuditLogRow } from "./schema";
import { getPublicUrl } from "../lib/r2";
import type { SelfRating, TapAudioVersion, TapDirection, TapPracticeMode, TapScoreResult } from "../app/lib/enhancedTapPractice";
import type { MidiAlignment } from "../app/lib/midiGuidedTapPractice";

const DEFAULT_QUERY_USER_ID = "default";
let ensureTapPracticeTablesPromise: Promise<void> | null = null;
let ensureMidiTablesPromise: Promise<void> | null = null;
let ensureDraftRecordingTablesPromise: Promise<void> | null = null;

function normalizeDbUserId(value: string | null | undefined): string {
  if (!value) {
    return DEFAULT_QUERY_USER_ID;
  }

  const normalized = value.trim().toLowerCase().replace(/[^a-z0-9_-]/g, "-").slice(0, 48);
  return normalized.length > 0 ? normalized : DEFAULT_QUERY_USER_ID;
}

export function getLeadingTitleNumber(title: string): string | null {
  const match = title.match(/^\s*(\d+)/);
  return match ? match[1] : null;
}

export function getImportedSongTitle(sourceTitle: string, playlistName: string, existingTitles: string[]): string {
  const leadingNumber = getLeadingTitleNumber(sourceTitle);
  if (!leadingNumber) {
    return sourceTitle;
  }

  const hasNumberCollision = existingTitles.some((title) => getLeadingTitleNumber(title) === leadingNumber);
  if (!hasNumberCollision) {
    return sourceTitle;
  }

  const suffix = ` (from ${playlistName.trim() || "imported playlist"})`;
  return sourceTitle.endsWith(suffix) ? sourceTitle : `${sourceTitle}${suffix}`;
}

export type AuditEventType =
  | "impersonation.started"
  | "impersonation.stopped"
  | "impersonation.action"
  | "user.email_changed"
  | "user.username_changed"
  | "auth.admin_status_resolved";

export interface AuditLogInput {
  eventType: AuditEventType;
  actorUserId?: string | null;
  effectiveUserId?: string | null;
  resourceType?: string | null;
  resourceId?: string | null;
  metadata?: Record<string, unknown>;
}

export type PersistedMemoryRating = 1 | 2 | 3 | 4 | 5;

export interface PersistedSegmentRating {
  id: string;
  segmentId: string;
  rating: PersistedMemoryRating;
  ratedAt: string;
}

export interface PersistedTapPracticeTap {
  id: string;
  noteId: string;
  segmentId: string;
  timeOffsetMs: number;
  durationMs: number;
  lane: number;
  direction?: TapDirection;
  createdAt: string;
}

export interface PersistedTapPracticeSessionSummary {
  id: string;
  songId: string;
  segmentId?: string;
  audioVersion: TapAudioVersion;
  mode: TapPracticeMode;
  startedAt: string;
  completedAt?: string;
  finalizedAt?: string;
  autoScorePercent?: number;
  selfRating?: SelfRating;
  scoreDetails?: unknown;
  tapCount: number;
}

export interface PersistedTapPracticeSessionDetail {
  id: string;
  songId: string;
  segmentId?: string;
  audioVersion: TapAudioVersion;
  mode: TapPracticeMode;
  startedAt: string;
  completedAt?: string;
  finalizedAt?: string;
  autoScorePercent?: number;
  selfRating?: SelfRating;
  scoreDetails?: unknown;
  taps: PersistedTapPracticeTap[];
}

export interface PersistedMidiSource {
  id: string;
  songId: string;
  originalFilename: string;
  storageKey: string;
  uploadedAt: string;
  contentType?: string | null;
  fileSize: number;
  parseStatus: string;
  cleanupSettings: MidiCleanupSettingsData;
  rawNotes: RawMidiNoteData[];
  cleanedNotes: CleanedMidiNoteData[];
  rawNoteCount: number;
  cleanedNoteCount: number;
  ignoredShortNoteCount: number;
  parseError?: string | null;
}

export interface PersistedDraftRecording {
  id: string;
  songId: string | null;
  title?: string | null;
  audioKey: string;
  status: "draft" | "archived" | "discarded";
  trimStartMs?: number | null;
  trimEndMs?: number | null;
  createdAt: string;
  archivedAt?: string | null;
}

export interface PromoteDraftRecordingResult {
  draftRecording: PersistedDraftRecording;
  previousAudioKey?: string | null;
}

export interface PlaylistSongItem {
  id: string;
  title: string;
  artist?: string;
  audioUrl: string;
  alternateAudioUrl?: string;
  pitchContourNotes: SongRow["pitchContourNotes"];
  hasMidiContour?: boolean;
  ratingCount: number;
  segments: SegmentRow[];
  createdAt: string;
  updatedAt?: string;
  position: number;
  masteryPercent: number;
  lastPracticedAt?: string | null;
}

export interface PlaylistDetail {
  id: string;
  name: string;
  eventDate?: string;
  isRetired: boolean;
  isPublic?: boolean;
  publishedAt?: string | null;
  shareToken?: string | null;
  sharedAt?: string | null;
  shareAudioMode?: PlaylistShareAudioMode;
  sourcePlaylistId?: string | null;
  sourceOwnerId?: string | null;
  sourceShareToken?: string | null;
  importedAt?: string | null;
  createdAt: string;
  songs: PlaylistSongItem[];
}

export interface PlaylistSummary {
  id: string;
  name: string;
  eventDate?: string;
  isRetired: boolean;
  isPublic?: boolean;
  publishedAt?: string | null;
  shareToken?: string | null;
  sharedAt?: string | null;
  shareAudioMode?: PlaylistShareAudioMode;
  sourcePlaylistId?: string | null;
  sourceOwnerId?: string | null;
  sourceShareToken?: string | null;
  importedAt?: string | null;
  createdAt: string;
  songCount: number;
  knowledgePercent?: number;
  healthStats?: {
    songsWithPartAudio: number;
    songsWithBlendAudio: number;
    songsWithSegments: number;
    songsWithMidiContour: number;
  };
}

export interface SharedPlaylistDetail extends PlaylistDetail {
  owner: {
    id: string;
    displayName: string;
    username: string;
  };
}

export interface PublicSharedPlaylistSummary extends PlaylistSummary {
  isPublic: boolean;
  publishedAt?: string | null;
  owner: {
    id: string;
    displayName: string;
    username: string;
  };
}

function isMissingLastPracticedColumnError(error: unknown): boolean {
  if (!(error instanceof Error)) {
    return false;
  }

  const message = error.message.toLowerCase();
  if (message.includes("last_practiced_at") && message.includes("does not exist")) {
    return true;
  }

  const cause = (error as Error & { cause?: unknown }).cause;
  if (cause && typeof cause === "object") {
    const causeRecord = cause as Record<string, unknown>;
    const causeMessage = typeof causeRecord.message === "string" ? causeRecord.message.toLowerCase() : "";
    const causeCode = typeof causeRecord.code === "string" ? causeRecord.code : "";
    if (causeMessage.includes("last_practiced_at") && causeMessage.includes("does not exist")) {
      return true;
    }
    if (causeCode === "42703" && message.includes("last_practiced_at")) {
      return true;
    }
  }

  return false;
}

function isMissingPitchContourNotesColumnError(error: unknown): boolean {
  if (!(error instanceof Error)) {
    return false;
  }

  const message = error.message.toLowerCase();
  if (message.includes("pitch_contour_notes") && message.includes("does not exist")) {
    return true;
  }

  const cause = (error as Error & { cause?: unknown }).cause;
  if (cause && typeof cause === "object") {
    const causeRecord = cause as Record<string, unknown>;
    const causeMessage = typeof causeRecord.message === "string" ? causeRecord.message.toLowerCase() : "";
    const causeCode = typeof causeRecord.code === "string" ? causeRecord.code : "";
    if (causeMessage.includes("pitch_contour_notes") && causeMessage.includes("does not exist")) {
      return true;
    }
    if (causeCode === "42703" && message.includes("pitch_contour_notes")) {
      return true;
    }
  }

  return false;
}

function isMissingAlternateAudioKeyColumnError(error: unknown): boolean {
  if (!(error instanceof Error)) {
    return false;
  }

  const message = error.message.toLowerCase();
  if (message.includes("alternate_audio_key") && message.includes("does not exist")) {
    return true;
  }

  const cause = (error as Error & { cause?: unknown }).cause;
  if (cause && typeof cause === "object") {
    const causeRecord = cause as Record<string, unknown>;
    const causeMessage = typeof causeRecord.message === "string" ? causeRecord.message.toLowerCase() : "";
    const causeCode = typeof causeRecord.code === "string" ? causeRecord.code : "";
    if (causeMessage.includes("alternate_audio_key") && causeMessage.includes("does not exist")) {
      return true;
    }
    if (causeCode === "42703" && message.includes("alternate_audio_key")) {
      return true;
    }
  }

  return false;
}

function isMissingUserIdColumnError(error: unknown): boolean {
  if (!(error instanceof Error)) {
    return false;
  }

  const message = error.message.toLowerCase();
  if (message.includes("user_id") && message.includes("does not exist")) {
    return true;
  }

  const cause = (error as Error & { cause?: unknown }).cause;
  if (cause && typeof cause === "object") {
    const causeRecord = cause as Record<string, unknown>;
    const causeMessage = typeof causeRecord.message === "string" ? causeRecord.message.toLowerCase() : "";
    const causeCode = typeof causeRecord.code === "string" ? causeRecord.code : "";
    if (causeMessage.includes("user_id") && causeMessage.includes("does not exist")) {
      return true;
    }
    if (causeCode === "42703" && message.includes("user_id")) {
      return true;
    }
  }

  return false;
}

function isMissingUsersTableError(error: unknown): boolean {
  if (!(error instanceof Error)) {
    return false;
  }

  const message = error.message.toLowerCase();
  if (message.includes('relation "users" does not exist') || (message.includes("users") && message.includes("does not exist"))) {
    return true;
  }

  const cause = (error as Error & { cause?: unknown }).cause;
  if (cause && typeof cause === "object") {
    const causeRecord = cause as Record<string, unknown>;
    const causeMessage = typeof causeRecord.message === "string" ? causeRecord.message.toLowerCase() : "";
    const causeCode = typeof causeRecord.code === "string" ? causeRecord.code : "";
    if (causeMessage.includes('relation "users" does not exist')) {
      return true;
    }
    if (causeCode === "42P01" && causeMessage.includes("users")) {
      return true;
    }
  }

  return false;
}

function isMissingAuthTableError(error: unknown): boolean {
  if (!(error instanceof Error)) {
    return false;
  }

  const message = error.message.toLowerCase();
  const mentionsAuthTables = message.includes("magic_link_tokens") || message.includes("user_sessions");
  if (mentionsAuthTables && message.includes("does not exist")) {
    return true;
  }

  const cause = (error as Error & { cause?: unknown }).cause;
  if (cause && typeof cause === "object") {
    const causeRecord = cause as Record<string, unknown>;
    const causeMessage = typeof causeRecord.message === "string" ? causeRecord.message.toLowerCase() : "";
    const causeCode = typeof causeRecord.code === "string" ? causeRecord.code : "";
    if (causeCode === "42P01" && (causeMessage.includes("magic_link_tokens") || causeMessage.includes("user_sessions"))) {
      return true;
    }
  }

  return false;
}

function isMissingAuditLogTableError(error: unknown): boolean {
  if (!(error instanceof Error)) {
    return false;
  }

  const message = error.message.toLowerCase();
  if (message.includes("audit_logs") && message.includes("does not exist")) {
    return true;
  }

  const cause = (error as Error & { cause?: unknown }).cause;
  if (cause && typeof cause === "object") {
    const causeRecord = cause as Record<string, unknown>;
    const causeMessage = typeof causeRecord.message === "string" ? causeRecord.message.toLowerCase() : "";
    const causeCode = typeof causeRecord.code === "string" ? causeRecord.code : "";
    if (causeCode === "42P01" && causeMessage.includes("audit_logs")) {
      return true;
    }
  }

  return false;
}

function isMissingUserProfileColumnError(error: unknown): boolean {
  if (!(error instanceof Error)) {
    return false;
  }

  const profileColumns = ["username", "email", "avatar_url", "profile_visibility", "updated_at"];
  const message = error.message.toLowerCase();
  if (profileColumns.some((column) => message.includes(column)) && message.includes("does not exist")) {
    return true;
  }

  const cause = (error as Error & { cause?: unknown }).cause;
  if (cause && typeof cause === "object") {
    const causeRecord = cause as Record<string, unknown>;
    const causeMessage = typeof causeRecord.message === "string" ? causeRecord.message.toLowerCase() : "";
    const causeCode = typeof causeRecord.code === "string" ? causeRecord.code : "";
    if (profileColumns.some((column) => causeMessage.includes(column)) && causeMessage.includes("does not exist")) {
      return true;
    }
    if (causeCode === "42703" && profileColumns.some((column) => message.includes(column))) {
      return true;
    }
  }

  return false;
}

function isMissingPlaylistSharingColumnError(error: unknown): boolean {
  if (!(error instanceof Error)) {
    return false;
  }

  const columns = ["share_token", "shared_at", "source_playlist_id", "source_owner_id", "source_share_token", "imported_at", "is_public", "published_at"];
  const message = error.message.toLowerCase();
  if (columns.some((column) => message.includes(column)) && message.includes("does not exist")) {
    return true;
  }

  const cause = (error as Error & { cause?: unknown }).cause;
  if (cause && typeof cause === "object") {
    const causeRecord = cause as Record<string, unknown>;
    const causeMessage = typeof causeRecord.message === "string" ? causeRecord.message.toLowerCase() : "";
    const causeCode = typeof causeRecord.code === "string" ? causeRecord.code : "";
    if (columns.some((column) => causeMessage.includes(column)) && causeMessage.includes("does not exist")) {
      return true;
    }
    if (causeCode === "42703" && columns.some((column) => message.includes(column))) {
      return true;
    }
  }

  return false;
}

function isMissingImportLineageColumnError(error: unknown): boolean {
  if (!(error instanceof Error)) {
    return false;
  }

  const columns = ["source_song_id", "source_segment_id"];
  const message = error.message.toLowerCase();
  if (columns.some((column) => message.includes(column)) && message.includes("does not exist")) {
    return true;
  }

  const cause = (error as Error & { cause?: unknown }).cause;
  if (cause && typeof cause === "object") {
    const causeRecord = cause as Record<string, unknown>;
    const causeMessage = typeof causeRecord.message === "string" ? causeRecord.message.toLowerCase() : "";
    const causeCode = typeof causeRecord.code === "string" ? causeRecord.code : "";
    if (columns.some((column) => causeMessage.includes(column)) && causeMessage.includes("does not exist")) {
      return true;
    }
    if (causeCode === "42703" && columns.some((column) => message.includes(column))) {
      return true;
    }
  }

  return false;
}

function isMissingTapPracticeTableError(error: unknown): boolean {
  if (!(error instanceof Error)) {
    return false;
  }

  const message = error.message.toLowerCase();
  const mentionsTapTables =
    message.includes("tap_practice_sessions") ||
    message.includes("tap_practice_taps") ||
    (message.includes("tap_practice") && message.includes("does not exist"));

  if (mentionsTapTables && message.includes("does not exist")) {
    return true;
  }

  const cause = (error as Error & { cause?: unknown }).cause;
  if (cause && typeof cause === "object") {
    const causeRecord = cause as Record<string, unknown>;
    const causeMessage = typeof causeRecord.message === "string" ? causeRecord.message.toLowerCase() : "";
    const causeCode = typeof causeRecord.code === "string" ? causeRecord.code : "";
    const causeMentionsTapTables =
      causeMessage.includes("tap_practice_sessions") ||
      causeMessage.includes("tap_practice_taps") ||
      causeMessage.includes("tap_practice");

    if (causeCode === "42P01" && causeMentionsTapTables) {
      return true;
    }

    if (causeMentionsTapTables && causeMessage.includes("does not exist")) {
      return true;
    }
  }

  return false;
}

function isMissingDraftRecordingTableError(error: unknown): boolean {
  if (!(error instanceof Error)) {
    return false;
  }

  const message = error.message.toLowerCase();
  if (message.includes("draft_recordings") && message.includes("does not exist")) {
    return true;
  }

  const cause = (error as Error & { cause?: unknown }).cause;
  if (cause && typeof cause === "object") {
    const causeRecord = cause as Record<string, unknown>;
    const causeMessage = typeof causeRecord.message === "string" ? causeRecord.message.toLowerCase() : "";
    const causeCode = typeof causeRecord.code === "string" ? causeRecord.code : "";
    if (causeCode === "42P01" && causeMessage.includes("draft_recordings")) {
      return true;
    }
    if (causeMessage.includes("draft_recordings") && causeMessage.includes("does not exist")) {
      return true;
    }
  }

  return false;
}

function isMissingMidiTableError(error: unknown): boolean {
  if (!(error instanceof Error)) {
    return false;
  }

  const message = error.message.toLowerCase();
  const mentionsMidiTables =
    message.includes("midi_sources") ||
    message.includes("midi_alignments") ||
    (message.includes("midi_") && message.includes("does not exist"));

  if (mentionsMidiTables && message.includes("does not exist")) {
    return true;
  }

  const cause = (error as Error & { cause?: unknown }).cause;
  if (cause && typeof cause === "object") {
    const causeRecord = cause as Record<string, unknown>;
    const causeMessage = typeof causeRecord.message === "string" ? causeRecord.message.toLowerCase() : "";
    const causeCode = typeof causeRecord.code === "string" ? causeRecord.code : "";
    const causeMentionsMidiTables = causeMessage.includes("midi_sources") || causeMessage.includes("midi_alignments") || causeMessage.includes("midi_");
    if (causeCode === "42P01" && causeMentionsMidiTables) {
      return true;
    }
    if (causeMentionsMidiTables && causeMessage.includes("does not exist")) {
      return true;
    }
  }

  return false;
}

function isMissingEnhancedTapPracticeColumnError(error: unknown): boolean {
  if (!(error instanceof Error)) {
    return false;
  }

  const message = error.message.toLowerCase();
  const columnNames = [
    "segment_id",
    "audio_version",
    "mode",
    "completed_at",
    "finalized_at",
    "auto_score_percent",
    "self_rating",
    "score_details",
    "direction",
  ];
  if (columnNames.some((column) => message.includes(column)) && message.includes("does not exist")) {
    return true;
  }

  const cause = (error as Error & { cause?: unknown }).cause;
  if (cause && typeof cause === "object") {
    const causeRecord = cause as Record<string, unknown>;
    const causeMessage = typeof causeRecord.message === "string" ? causeRecord.message.toLowerCase() : "";
    const causeCode = typeof causeRecord.code === "string" ? causeRecord.code : "";
    if (columnNames.some((column) => causeMessage.includes(column)) && causeMessage.includes("does not exist")) {
      return true;
    }
    if (causeCode === "42703" && columnNames.some((column) => message.includes(column))) {
      return true;
    }
  }

  return false;
}

async function ensureTapPracticeTables(): Promise<void> {
  if (!ensureTapPracticeTablesPromise) {
    ensureTapPracticeTablesPromise = (async () => {
      await db().execute(sql.raw(`
        CREATE TABLE IF NOT EXISTS "tap_practice_sessions" (
          "id" text PRIMARY KEY NOT NULL,
          "user_id" text NOT NULL DEFAULT 'default',
          "song_id" text NOT NULL REFERENCES "songs"("id") ON DELETE cascade,
          "started_at" timestamp NOT NULL DEFAULT now()
        )
      `));

      await db().execute(sql.raw(`
        CREATE TABLE IF NOT EXISTS "tap_practice_taps" (
          "id" text PRIMARY KEY NOT NULL,
          "session_id" text NOT NULL REFERENCES "tap_practice_sessions"("id") ON DELETE cascade,
          "segment_id" text NOT NULL REFERENCES "segments"("id") ON DELETE cascade,
          "note_id" text NOT NULL,
          "time_offset_ms" integer NOT NULL,
          "duration_ms" integer NOT NULL,
          "lane_milli" integer NOT NULL,
          "created_at" timestamp NOT NULL DEFAULT now()
        )
      `));

      await db().execute(sql.raw(`
        CREATE INDEX IF NOT EXISTS "idx_tap_practice_sessions_user_started_at"
          ON "tap_practice_sessions" ("user_id", "started_at")
      `));

      await db().execute(sql.raw(`
        CREATE INDEX IF NOT EXISTS "idx_tap_practice_sessions_user_song_started_at"
          ON "tap_practice_sessions" ("user_id", "song_id", "started_at")
      `));

      await db().execute(sql.raw(`
        CREATE INDEX IF NOT EXISTS "idx_tap_practice_taps_session_created_at"
          ON "tap_practice_taps" ("session_id", "created_at")
      `));

      await db().execute(sql.raw(`
        ALTER TABLE "tap_practice_sessions" ADD COLUMN IF NOT EXISTS "segment_id" text REFERENCES "segments"("id") ON DELETE cascade
      `));
      await db().execute(sql.raw(`
        ALTER TABLE "tap_practice_sessions" ADD COLUMN IF NOT EXISTS "audio_version" text NOT NULL DEFAULT 'straight'
      `));
      await db().execute(sql.raw(`
        ALTER TABLE "tap_practice_sessions" ADD COLUMN IF NOT EXISTS "mode" text NOT NULL DEFAULT 'practice'
      `));
      await db().execute(sql.raw(`
        ALTER TABLE "tap_practice_sessions" ADD COLUMN IF NOT EXISTS "completed_at" timestamp
      `));
      await db().execute(sql.raw(`
        ALTER TABLE "tap_practice_sessions" ADD COLUMN IF NOT EXISTS "finalized_at" timestamp
      `));
      await db().execute(sql.raw(`
        ALTER TABLE "tap_practice_sessions" ADD COLUMN IF NOT EXISTS "auto_score_percent" integer
      `));
      await db().execute(sql.raw(`
        ALTER TABLE "tap_practice_sessions" ADD COLUMN IF NOT EXISTS "self_rating" integer
      `));
      await db().execute(sql.raw(`
        ALTER TABLE "tap_practice_sessions" ADD COLUMN IF NOT EXISTS "score_details" jsonb NOT NULL DEFAULT '{}'::jsonb
      `));
      await db().execute(sql.raw(`
        ALTER TABLE "tap_practice_taps" ADD COLUMN IF NOT EXISTS "direction" text
      `));
      await db().execute(sql.raw(`
        CREATE INDEX IF NOT EXISTS "idx_tap_practice_sessions_user_song_segment_mode"
          ON "tap_practice_sessions" ("user_id", "song_id", "segment_id", "mode")
      `));
    })().catch((error) => {
      ensureTapPracticeTablesPromise = null;
      throw error;
    });
  }

  await ensureTapPracticeTablesPromise;
}

async function ensureDraftRecordingTables(): Promise<void> {
  if (!ensureDraftRecordingTablesPromise) {
    ensureDraftRecordingTablesPromise = (async () => {
      await db().execute(sql.raw(`
        CREATE TABLE IF NOT EXISTS "draft_recordings" (
          "id" text PRIMARY KEY NOT NULL,
          "user_id" text NOT NULL DEFAULT 'default',
          "song_id" text REFERENCES "songs"("id") ON DELETE cascade,
          "title" text,
          "audio_key" text NOT NULL,
          "status" text NOT NULL DEFAULT 'draft',
          "trim_start_ms" integer,
          "trim_end_ms" integer,
          "created_at" timestamp NOT NULL DEFAULT now()
        )
      `));

      await db().execute(sql.raw(`
        ALTER TABLE "draft_recordings" ADD COLUMN IF NOT EXISTS "user_id" text NOT NULL DEFAULT 'default'
      `));
      await db().execute(sql.raw(`
        ALTER TABLE "draft_recordings" ALTER COLUMN "song_id" DROP NOT NULL
      `));
      await db().execute(sql.raw(`
        ALTER TABLE "draft_recordings" ADD COLUMN IF NOT EXISTS "trim_start_ms" integer
      `));
      await db().execute(sql.raw(`
        ALTER TABLE "draft_recordings" ADD COLUMN IF NOT EXISTS "trim_end_ms" integer
      `));
      await db().execute(sql.raw(`
        ALTER TABLE "draft_recordings" ADD COLUMN IF NOT EXISTS "archived_at" timestamp
      `));
      await db().execute(sql.raw(`
        ALTER TABLE "songs" ADD COLUMN IF NOT EXISTS "audio_trim_start_ms" integer
      `));
      await db().execute(sql.raw(`
        ALTER TABLE "songs" ADD COLUMN IF NOT EXISTS "audio_trim_end_ms" integer
      `));

      await db().execute(sql.raw(`
        CREATE INDEX IF NOT EXISTS "idx_draft_recordings_song_status_created_at"
          ON "draft_recordings" ("song_id", "status", "created_at")
      `));
      await db().execute(sql.raw(`
        CREATE INDEX IF NOT EXISTS "idx_draft_recordings_user_status_created_at"
          ON "draft_recordings" ("user_id", "status", "created_at")
      `));
    })().catch((error) => {
      ensureDraftRecordingTablesPromise = null;
      throw error;
    });
  }

  await ensureDraftRecordingTablesPromise;
}

// Audit logs are intentionally lightweight: high-risk auth/account events only.
export async function logAuditEvent(input: AuditLogInput): Promise<AuditLogRow | null> {
  try {
    const rows = await db()
      .insert(auditLogs)
      .values({
        id: crypto.randomUUID(),
        eventType: input.eventType,
        actorUserId: input.actorUserId ?? null,
        effectiveUserId: input.effectiveUserId ?? null,
        resourceType: input.resourceType ?? null,
        resourceId: input.resourceId ?? null,
        metadata: input.metadata ?? {},
      })
      .returning();
    return rows[0] ?? null;
  } catch (error) {
    if (isMissingAuditLogTableError(error)) {
      console.warn("Audit log table is missing; skipping audit event", input.eventType);
      return null;
    }
    throw error;
  }
}

export async function listAuditLogsForTroubleshooting(limit: number = 100): Promise<AuditLogRow[]> {
  try {
    return await db()
      .select()
      .from(auditLogs)
      .orderBy(desc(auditLogs.createdAt))
      .limit(Math.min(Math.max(limit, 1), 500));
  } catch (error) {
    if (isMissingAuditLogTableError(error)) {
      return [];
    }
    throw error;
  }
}

// ── Users ─────────────────────────────────────────────────────────────────

export interface PublicUser {
  id: string;
  username: string;
  name: string;
  email: string;
  avatarUrl?: string | null;
  profileVisibility: string;
}

function fallbackUsername(id: string, name: string): string {
  const base = (name || id).trim().toLowerCase().replace(/[^a-z0-9_-]/g, "-").replace(/^-+|-+$/g, "").slice(0, 32);
  return base || "default";
}

function mapUserRow(row: Pick<UserRow, "id" | "username" | "name" | "email" | "avatarUrl" | "profileVisibility">): PublicUser {
  return {
    id: row.id,
    username: row.username,
    name: row.name,
    email: row.email,
    avatarUrl: row.avatarUrl,
    profileVisibility: row.profileVisibility,
  };
}

function normalizeEmail(value: string): string {
  return value.trim().toLowerCase();
}

function usernameFromEmail(email: string): string {
  const localPart = email.split("@")[0] ?? "user";
  const base = localPart.toLowerCase().replace(/[^a-z0-9_-]/g, "-").replace(/^-+|-+$/g, "").slice(0, 24);
  return base || "user";
}

export async function getAllUsers(): Promise<PublicUser[]> {
  try {
    const rows = await db()
      .select({
        id: users.id,
        username: users.username,
        name: users.name,
        email: users.email,
        avatarUrl: users.avatarUrl,
        profileVisibility: users.profileVisibility,
      })
      .from(users)
      .orderBy(asc(users.name));
    if (rows.length === 0) {
      return [{ id: DEFAULT_QUERY_USER_ID, username: "default", name: "Default User", email: "", avatarUrl: null, profileVisibility: "private" }];
    }
    return rows.map(mapUserRow);
  } catch (error) {
    if (!isMissingUsersTableError(error)) {
      if (isMissingUserProfileColumnError(error)) {
        const legacyRows = await db().select({ id: users.id, name: users.name }).from(users).orderBy(asc(users.name));
        return legacyRows.length > 0
          ? legacyRows.map((row) => ({
              id: row.id,
              username: fallbackUsername(row.id, row.name),
              name: row.name,
              email: "",
              avatarUrl: null,
              profileVisibility: "private",
            }))
          : [{ id: DEFAULT_QUERY_USER_ID, username: "default", name: "Default User", email: "", avatarUrl: null, profileVisibility: "private" }];
      }
      throw error;
    }
    return [{ id: DEFAULT_QUERY_USER_ID, username: "default", name: "Default User", email: "", avatarUrl: null, profileVisibility: "private" }];
  }
}

export async function getUserById(id: string): Promise<PublicUser | null> {
  try {
    const rows = await db()
      .select({
        id: users.id,
        username: users.username,
        name: users.name,
        email: users.email,
        avatarUrl: users.avatarUrl,
        profileVisibility: users.profileVisibility,
      })
      .from(users)
      .where(eq(users.id, id))
      .limit(1);
    return rows[0] ? mapUserRow(rows[0]) : null;
  } catch (error) {
    if (isMissingUsersTableError(error)) {
      return id === DEFAULT_QUERY_USER_ID
        ? { id: DEFAULT_QUERY_USER_ID, username: "default", name: "Default User", email: "", avatarUrl: null, profileVisibility: "private" }
        : null;
    }
    if (isMissingUserProfileColumnError(error)) {
      const rows = await db().select({ id: users.id, name: users.name }).from(users).where(eq(users.id, id)).limit(1);
      return rows[0]
        ? {
            id: rows[0].id,
            username: fallbackUsername(rows[0].id, rows[0].name),
            name: rows[0].name,
            email: "",
            avatarUrl: null,
            profileVisibility: "private",
          }
        : null;
    }
    throw error;
  }
}

export async function getUserByEmail(email: string): Promise<PublicUser | null> {
  const normalizedEmail = normalizeEmail(email);
  if (!normalizedEmail) {
    return null;
  }

  try {
    const rows = await db()
      .select({
        id: users.id,
        username: users.username,
        name: users.name,
        email: users.email,
        avatarUrl: users.avatarUrl,
        profileVisibility: users.profileVisibility,
      })
      .from(users)
      .where(eq(users.email, normalizedEmail))
      .limit(1);
    return rows[0] ? mapUserRow(rows[0]) : null;
  } catch (error) {
    if (isMissingUsersTableError(error) || isMissingUserProfileColumnError(error)) {
      return null;
    }
    throw error;
  }
}

export async function updateUserProfile(
  id: string,
  data: {
    name?: string;
    avatarUrl?: string | null;
    profileVisibility?: string;
  }
): Promise<PublicUser | null> {
  const updates: Partial<Pick<UserRow, "name" | "avatarUrl" | "profileVisibility" | "updatedAt">> = {
    updatedAt: new Date(),
  };
  if (data.name !== undefined) updates.name = data.name;
  if (data.avatarUrl !== undefined) updates.avatarUrl = data.avatarUrl;
  if (data.profileVisibility !== undefined) updates.profileVisibility = data.profileVisibility;

  try {
    const rows = await db()
      .update(users)
      .set(updates)
      .where(eq(users.id, id))
      .returning({
        id: users.id,
        username: users.username,
        name: users.name,
        email: users.email,
        avatarUrl: users.avatarUrl,
        profileVisibility: users.profileVisibility,
      });
    return rows[0] ? mapUserRow(rows[0]) : null;
  } catch (error) {
    if (isMissingUsersTableError(error) || isMissingUserProfileColumnError(error)) {
      return null;
    }
    throw error;
  }
}

export async function upsertUser(data: {
  id: string;
  username: string;
  name: string;
  email?: string;
  avatarUrl?: string | null;
  profileVisibility?: string;
}): Promise<PublicUser> {
  const values = {
    id: data.id,
    username: data.username,
    name: data.name,
    email: data.email ?? "",
    avatarUrl: data.avatarUrl ?? null,
    profileVisibility: data.profileVisibility ?? "private",
    updatedAt: new Date(),
  };

  try {
    const rows = await db()
      .insert(users)
      .values(values)
      .onConflictDoUpdate({
        target: users.id,
        set: {
          username: values.username,
          name: values.name,
          email: values.email,
          avatarUrl: values.avatarUrl,
          profileVisibility: values.profileVisibility,
          updatedAt: values.updatedAt,
        },
      })
      .returning({
        id: users.id,
        username: users.username,
        name: users.name,
        email: users.email,
        avatarUrl: users.avatarUrl,
        profileVisibility: users.profileVisibility,
      });
    return rows[0] ? mapUserRow(rows[0]) : { ...values, avatarUrl: values.avatarUrl };
  } catch (error) {
    if (isMissingUserProfileColumnError(error)) {
      const rows = await db()
        .insert(users)
        .values({ id: data.id, name: data.name } as typeof users.$inferInsert)
        .onConflictDoUpdate({
          target: users.id,
          set: { name: data.name },
        })
        .returning({ id: users.id, name: users.name });
      const row = rows[0] ?? { id: data.id, name: data.name };
      return {
        id: row.id,
        username: fallbackUsername(row.id, row.name),
        name: row.name,
        email: data.email ?? "",
        avatarUrl: data.avatarUrl ?? null,
        profileVisibility: data.profileVisibility ?? "private",
      };
    }
    if (!isMissingUsersTableError(error)) {
      throw error;
    }
    return { ...values, avatarUrl: values.avatarUrl };
  }
}

// ── Songs ──────────────────────────────────────────────────────────────────

export async function getOrCreateUserForEmail(email: string): Promise<PublicUser> {
  const normalizedEmail = normalizeEmail(email);
  const existing = await getUserByEmail(normalizedEmail);
  if (existing) {
    return existing;
  }

  const baseUsername = usernameFromEmail(normalizedEmail);
  for (let attempt = 0; attempt < 6; attempt += 1) {
    const username = attempt === 0 ? baseUsername : `${baseUsername}-${attempt + 1}`;
    try {
      return await upsertUser({
        id: crypto.randomUUID(),
        username,
        name: normalizedEmail.split("@")[0] || "Cantare Singer",
        email: normalizedEmail,
        profileVisibility: "private",
      });
    } catch (error) {
      const message = error instanceof Error ? error.message.toLowerCase() : "";
      if (message.includes("users_username_unique") || message.includes("users_email_unique")) {
        const racedUser = await getUserByEmail(normalizedEmail);
        if (racedUser) {
          return racedUser;
        }
        continue;
      }
      throw error;
    }
  }

  return upsertUser({
    id: crypto.randomUUID(),
    username: `${baseUsername}-${Math.random().toString(36).slice(2, 8)}`,
    name: normalizedEmail.split("@")[0] || "Cantare Singer",
    email: normalizedEmail,
    profileVisibility: "private",
  });
}

export async function createMagicLinkToken(data: {
  email: string;
  tokenHash: string;
  expiresAt: Date;
}): Promise<MagicLinkTokenRow> {
  try {
    const rows = await db()
      .insert(magicLinkTokens)
      .values({
        id: crypto.randomUUID(),
        email: normalizeEmail(data.email),
        tokenHash: data.tokenHash,
        expiresAt: data.expiresAt,
      })
      .returning();
    return rows[0];
  } catch (error) {
    if (isMissingAuthTableError(error)) {
      throw Object.assign(new Error("Auth tables are missing; run database migrations before enabling magic-link auth."), {
        code: "AUTH_MIGRATION_REQUIRED",
      });
    }
    throw error;
  }
}

export async function consumeMagicLinkToken(tokenHash: string, now: Date = new Date()): Promise<MagicLinkTokenRow | null> {
  try {
    const rows = await db()
      .select()
      .from(magicLinkTokens)
      .where(eq(magicLinkTokens.tokenHash, tokenHash))
      .limit(1);
    const token = rows[0];
    if (!token || token.consumedAt || token.expiresAt <= now) {
      return null;
    }

    const consumedRows = await db()
      .update(magicLinkTokens)
      .set({ consumedAt: now })
      .where(and(eq(magicLinkTokens.tokenHash, tokenHash), sql`${magicLinkTokens.consumedAt} IS NULL`))
      .returning();
    return consumedRows[0] ?? null;
  } catch (error) {
    if (isMissingAuthTableError(error)) {
      return null;
    }
    throw error;
  }
}

export async function createUserSession(data: {
  userId: string;
  tokenHash: string;
  expiresAt: Date;
}): Promise<UserSessionRow> {
  try {
    const rows = await db()
      .insert(userSessions)
      .values({
        id: crypto.randomUUID(),
        userId: data.userId,
        tokenHash: data.tokenHash,
        expiresAt: data.expiresAt,
      })
      .returning();
    return rows[0];
  } catch (error) {
    if (isMissingAuthTableError(error)) {
      throw Object.assign(new Error("Auth tables are missing; run database migrations before enabling sessions."), {
        code: "AUTH_MIGRATION_REQUIRED",
      });
    }
    throw error;
  }
}

export async function getUserForSessionTokenHash(tokenHash: string, now: Date = new Date()): Promise<PublicUser | null> {
  try {
    const rows = await db()
      .select({ user: users, session: userSessions })
      .from(userSessions)
      .innerJoin(users, eq(userSessions.userId, users.id))
      .where(and(eq(userSessions.tokenHash, tokenHash), sql`${userSessions.revokedAt} IS NULL`, sql`${userSessions.expiresAt} > ${now}`))
      .limit(1);
    return rows[0] ? mapUserRow(rows[0].user) : null;
  } catch (error) {
    if (isMissingAuthTableError(error) || isMissingUsersTableError(error) || isMissingUserProfileColumnError(error)) {
      return null;
    }
    throw error;
  }
}

export async function revokeUserSession(tokenHash: string, revokedAt: Date = new Date()): Promise<void> {
  try {
    await db()
      .update(userSessions)
      .set({ revokedAt })
      .where(eq(userSessions.tokenHash, tokenHash));
  } catch (error) {
    if (!isMissingAuthTableError(error)) {
      throw error;
    }
  }
}

export async function getAllSongs(userId: string = DEFAULT_QUERY_USER_ID): Promise<SongRow[]> {
  let primaryError: unknown;
  try {
    return await db()
      .select()
      .from(songs)
      .where(eq(songs.userId, userId))
      .orderBy(desc(songs.createdAt));
  } catch (error) {
    primaryError = error;
  }

  if (isMissingPitchContourNotesColumnError(primaryError)) {
    return db()
      .select({
        id: songs.id,
        userId: songs.userId,
        title: songs.title,
        artist: songs.artist,
        audioKey: songs.audioKey,
        createdAt: songs.createdAt,
        lastPracticedAt: songs.lastPracticedAt,
      })
      .from(songs)
      .where(eq(songs.userId, userId))
      .orderBy(desc(songs.createdAt))
      .then((rows) => rows.map((row) => ({ ...row, alternateAudioKey: null, pitchContourNotes: [] } as SongRow)));
  }

  if (isMissingAlternateAudioKeyColumnError(primaryError)) {
    return db()
      .select({
        id: songs.id,
        userId: songs.userId,
        title: songs.title,
        artist: songs.artist,
        audioKey: songs.audioKey,
        pitchContourNotes: songs.pitchContourNotes,
        createdAt: songs.createdAt,
        lastPracticedAt: songs.lastPracticedAt,
      })
      .from(songs)
      .where(eq(songs.userId, userId))
      .orderBy(desc(songs.createdAt))
      .then((rows) => rows.map((row) => ({ ...row, alternateAudioKey: null } as SongRow)));
  }

  if (isMissingUserIdColumnError(primaryError)) {
    try {
      const legacyRows = await db()
        .select({
          id: songs.id,
          title: songs.title,
          artist: songs.artist,
          audioKey: songs.audioKey,
          createdAt: songs.createdAt,
          lastPracticedAt: songs.lastPracticedAt,
        })
        .from(songs)
        .orderBy(desc(songs.createdAt));

      return legacyRows.map((row) => ({ ...row, userId: DEFAULT_QUERY_USER_ID, alternateAudioKey: null, pitchContourNotes: [] } as SongRow));
    } catch (legacyError) {
      if (!isMissingLastPracticedColumnError(legacyError)) {
        throw legacyError;
      }

      const legacyRows = await db()
        .select({
          id: songs.id,
          title: songs.title,
          artist: songs.artist,
          audioKey: songs.audioKey,
          createdAt: songs.createdAt,
        })
        .from(songs)
        .orderBy(desc(songs.createdAt));

      return legacyRows.map((row) => ({ ...row, userId: DEFAULT_QUERY_USER_ID, alternateAudioKey: null, lastPracticedAt: null, pitchContourNotes: [] } as SongRow));
    }
  }

  try {
    const legacyRows = await db()
      .select({
        id: songs.id,
        userId: songs.userId,
        title: songs.title,
        artist: songs.artist,
        audioKey: songs.audioKey,
        createdAt: songs.createdAt,
      })
      .from(songs)
      .where(eq(songs.userId, userId))
      .orderBy(desc(songs.createdAt));

    return legacyRows.map((row) => ({ ...row, alternateAudioKey: null, lastPracticedAt: null, pitchContourNotes: [] } as SongRow));
  } catch {
    throw primaryError;
  }
}

export async function getSongById(
  id: string,
  userId: string = DEFAULT_QUERY_USER_ID
): Promise<SongRow | undefined> {
  let primaryError: unknown;
  try {
    const rows = await db()
      .select()
      .from(songs)
      .where(and(eq(songs.id, id), eq(songs.userId, userId)))
      .limit(1);
    return rows[0];
  } catch (error) {
    primaryError = error;
  }

  if (isMissingPitchContourNotesColumnError(primaryError)) {
    const rows = await db()
      .select({
        id: songs.id,
        userId: songs.userId,
        title: songs.title,
        artist: songs.artist,
        audioKey: songs.audioKey,
        createdAt: songs.createdAt,
        lastPracticedAt: songs.lastPracticedAt,
      })
      .from(songs)
      .where(and(eq(songs.id, id), eq(songs.userId, userId)))
      .limit(1);

    const row = rows[0];
    return row ? ({ ...row, alternateAudioKey: null, pitchContourNotes: [] } as SongRow) : undefined;
  }

  if (isMissingAlternateAudioKeyColumnError(primaryError)) {
    const rows = await db()
      .select({
        id: songs.id,
        userId: songs.userId,
        title: songs.title,
        artist: songs.artist,
        audioKey: songs.audioKey,
        pitchContourNotes: songs.pitchContourNotes,
        createdAt: songs.createdAt,
        lastPracticedAt: songs.lastPracticedAt,
      })
      .from(songs)
      .where(and(eq(songs.id, id), eq(songs.userId, userId)))
      .limit(1);

    const row = rows[0];
    return row ? ({ ...row, alternateAudioKey: null } as SongRow) : undefined;
  }

  if (isMissingUserIdColumnError(primaryError)) {
    try {
      const rows = await db()
        .select({
          id: songs.id,
          title: songs.title,
          artist: songs.artist,
          audioKey: songs.audioKey,
          createdAt: songs.createdAt,
          lastPracticedAt: songs.lastPracticedAt,
        })
        .from(songs)
        .where(eq(songs.id, id))
        .limit(1);
      const row = rows[0];
      if (!row) {
        return undefined;
      }
      return { ...row, userId: DEFAULT_QUERY_USER_ID, alternateAudioKey: null, pitchContourNotes: [] } as SongRow;
    } catch (legacyError) {
      if (!isMissingLastPracticedColumnError(legacyError)) {
        throw legacyError;
      }

      const rows = await db()
        .select({
          id: songs.id,
          title: songs.title,
          artist: songs.artist,
          audioKey: songs.audioKey,
          createdAt: songs.createdAt,
        })
        .from(songs)
        .where(eq(songs.id, id))
        .limit(1);

      const row = rows[0];
      if (!row) {
        return undefined;
      }

      return { ...row, userId: DEFAULT_QUERY_USER_ID, alternateAudioKey: null, lastPracticedAt: null, pitchContourNotes: [] } as SongRow;
    }
  }

  try {
    const rows = await db()
      .select({
        id: songs.id,
        userId: songs.userId,
        title: songs.title,
        artist: songs.artist,
        audioKey: songs.audioKey,
        createdAt: songs.createdAt,
      })
      .from(songs)
      .where(and(eq(songs.id, id), eq(songs.userId, userId)))
      .limit(1);

    const row = rows[0];
    if (!row) {
      return undefined;
    }

    return { ...row, alternateAudioKey: null, lastPracticedAt: null, pitchContourNotes: [] } as SongRow;
  } catch {
    throw primaryError;
  }
}

export async function createSong(data: {
  id: string;
  userId: string;
  title: string;
  artist?: string;
  audioKey?: string;
  alternateAudioKey?: string;
}): Promise<SongRow> {
  try {
    const rows = await db()
      .insert(songs)
      .values({
        id: data.id,
        userId: data.userId,
        title: data.title,
        artist: data.artist ?? null,
        audioKey: data.audioKey ?? null,
        alternateAudioKey: data.alternateAudioKey ?? null,
        sourceSongId: data.id,
      })
      .returning();
    return rows[0];
  } catch (error) {
    if (!isMissingUserIdColumnError(error) && !isMissingImportLineageColumnError(error)) {
      throw error;
    }

    try {
      const rows = await db()
        .insert(songs)
        .values({
          id: data.id,
          userId: data.userId,
          title: data.title,
          artist: data.artist ?? null,
          audioKey: data.audioKey ?? null,
          alternateAudioKey: data.alternateAudioKey ?? null,
        })
        .returning();

      return { ...rows[0], sourceSongId: data.id } as SongRow;
    } catch (fallbackError) {
      if (!isMissingUserIdColumnError(fallbackError)) {
        throw fallbackError;
      }

      const rows = await db()
        .insert(songs)
        .values({
          id: data.id,
          title: data.title,
          artist: data.artist ?? null,
          audioKey: data.audioKey ?? null,
        })
        .returning();

      return { ...rows[0], userId: DEFAULT_QUERY_USER_ID, sourceSongId: data.id } as SongRow;
    }
  }
}

export async function updateSongAudioKey(
  id: string,
  audioKey: string,
  userId: string = DEFAULT_QUERY_USER_ID
): Promise<void> {
  await db()
    .update(songs)
    .set({ audioKey })
    .where(and(eq(songs.id, id), eq(songs.userId, userId)));
}

export async function updateSong(
  id: string,
  updates: Partial<Pick<SongRow, 'audioKey' | 'alternateAudioKey' | 'title' | 'artist' | 'pitchContourNotes'>>,
  userId: string = DEFAULT_QUERY_USER_ID
): Promise<void> {
  try {
    await db()
      .update(songs)
      .set(updates)
      .where(and(eq(songs.id, id), eq(songs.userId, userId)));
  } catch (error) {
    if (isMissingAlternateAudioKeyColumnError(error)) {
      const { alternateAudioKey: _alternateAudioKey, ...legacyUpdates } = updates;
      if (Object.keys(legacyUpdates).length === 0) {
        const migrationError = new Error(
          'Alternate song audio requires database migration 0009_alternate_audio_key.sql before it can be saved.'
        ) as Error & { code?: string };
        migrationError.code = 'SONG_ALTERNATE_AUDIO_MIGRATION_REQUIRED';
        throw migrationError;
      }

      await db()
        .update(songs)
        .set(legacyUpdates)
        .where(and(eq(songs.id, id), eq(songs.userId, userId)));
      return;
    }

    if (!isMissingPitchContourNotesColumnError(error) && !isMissingImportLineageColumnError(error)) {
      throw error;
    }

    const { pitchContourNotes: _pitchContourNotes, ...legacyUpdates } = updates;
    if (Object.keys(legacyUpdates).length === 0) {
      const migrationError = new Error(
        'Song pitch contour notes require database migration 0008_song_timeline_contour.sql before they can be saved.'
      ) as Error & { code?: string };
      migrationError.code = 'SONG_PITCH_CONTOUR_MIGRATION_REQUIRED';
      throw migrationError;
    }

    await db()
      .update(songs)
      .set(legacyUpdates)
      .where(and(eq(songs.id, id), eq(songs.userId, userId)));
  }
}

export async function markSongPracticed(
  id: string,
  userIdOrPracticedAt: string | Date = DEFAULT_QUERY_USER_ID,
  maybePracticedAt: Date = new Date()
): Promise<void> {
  const userId = typeof userIdOrPracticedAt === "string" ? userIdOrPracticedAt : DEFAULT_QUERY_USER_ID;
  const practicedAt = userIdOrPracticedAt instanceof Date ? userIdOrPracticedAt : maybePracticedAt;
  try {
    await db()
      .update(songs)
      .set({ lastPracticedAt: practicedAt })
      .where(and(eq(songs.id, id), eq(songs.userId, userId)));
  } catch (error) {
    if (isMissingLastPracticedColumnError(error)) {
      return;
    }
    throw error;
  }
}

export async function deleteSong(id: string, userId: string = DEFAULT_QUERY_USER_ID): Promise<void> {
  await db().delete(songs).where(and(eq(songs.id, id), eq(songs.userId, userId)));
}

export async function recordOrphanedAudioKey(
  id: string,
  audioKey: string,
  userId: string = DEFAULT_QUERY_USER_ID
): Promise<void> {
  await db().insert(orphanedAudioKeys).values({ id, audioKey, userId });
}

export async function getOrphanedAudioKeys(userId: string = DEFAULT_QUERY_USER_ID): Promise<OrphanedAudioKeyRow[]> {
  return db().select().from(orphanedAudioKeys).where(eq(orphanedAudioKeys.userId, userId));
}

export async function deleteOrphanedAudioKey(id: string, userId: string = DEFAULT_QUERY_USER_ID): Promise<void> {
  await db()
    .delete(orphanedAudioKeys)
    .where(and(eq(orphanedAudioKeys.id, id), eq(orphanedAudioKeys.userId, userId)));
}

function mapDraftRecording(row: DraftRecordingRow): PersistedDraftRecording {
  return {
    id: row.id,
    songId: row.songId,
    title: row.title,
    audioKey: row.audioKey,
    status: row.status === "archived" ? "archived" : row.status === "discarded" ? "discarded" : "draft",
    trimStartMs: row.trimStartMs,
    trimEndMs: row.trimEndMs,
    createdAt: row.createdAt.toISOString(),
    archivedAt: row.archivedAt ? row.archivedAt.toISOString() : null,
  };
}

export async function createDraftRecording(data: {
  songId?: string | null;
  audioKey: string;
  title?: string | null;
  createdAt?: Date;
}, userId: string = DEFAULT_QUERY_USER_ID): Promise<PersistedDraftRecording> {
  await ensureDraftRecordingTables();
  if (data.songId) {
    const song = await getSongById(data.songId, userId);
    if (!song) {
      throw Object.assign(new Error("Song not found"), { code: "SONG_NOT_FOUND" });
    }
  }

  const rows = await db()
    .insert(draftRecordings)
    .values({
      id: crypto.randomUUID(),
      userId,
      songId: data.songId ?? null,
      audioKey: data.audioKey,
      title: data.title ?? null,
      status: "draft",
      trimStartMs: null,
      trimEndMs: null,
      createdAt: data.createdAt ?? new Date(),
    })
    .returning();

  return mapDraftRecording(rows[0]);
}

export type PlaylistShareAudioMode = "part" | "blend" | "both";

export async function getUnassignedDraftRecordings(
  userId: string = DEFAULT_QUERY_USER_ID
): Promise<PersistedDraftRecording[]> {
  try {
    await ensureDraftRecordingTables();
    const rows = await db()
      .select()
      .from(draftRecordings)
      .where(and(eq(draftRecordings.userId, userId), isNull(draftRecordings.songId), eq(draftRecordings.status, "draft")))
      .orderBy(desc(draftRecordings.createdAt));

    return rows.map(mapDraftRecording);
  } catch (error) {
    if (isMissingDraftRecordingTableError(error)) {
      return [];
    }
    throw error;
  }
}

export async function assignDraftRecordingToSong(
  draftRecordingId: string,
  songId: string,
  userId: string = DEFAULT_QUERY_USER_ID
): Promise<PersistedDraftRecording | null> {
  await ensureDraftRecordingTables();
  const song = await getSongById(songId, userId);
  if (!song) {
    return null;
  }

  const rows = await db()
    .update(draftRecordings)
    .set({ songId })
    .where(and(
      eq(draftRecordings.id, draftRecordingId),
      eq(draftRecordings.userId, userId),
      isNull(draftRecordings.songId),
      eq(draftRecordings.status, "draft")
    ))
    .returning();

  return rows[0] ? mapDraftRecording(rows[0]) : null;
}

export async function discardUnassignedDraftRecording(
  draftRecordingId: string,
  userId: string = DEFAULT_QUERY_USER_ID
): Promise<PersistedDraftRecording | null> {
  await ensureDraftRecordingTables();
  const rows = await db()
    .update(draftRecordings)
    .set({
      status: "discarded",
      archivedAt: new Date(),
    })
    .where(and(
      eq(draftRecordings.id, draftRecordingId),
      eq(draftRecordings.userId, userId),
      isNull(draftRecordings.songId),
      eq(draftRecordings.status, "draft")
    ))
    .returning();

  return rows[0] ? mapDraftRecording(rows[0]) : null;
}

export async function updateDraftRecordingTrim(
  songId: string,
  draftRecordingId: string,
  data: { trimStartMs: number; trimEndMs: number },
  userId: string = DEFAULT_QUERY_USER_ID
): Promise<PersistedDraftRecording | null> {
  await ensureDraftRecordingTables();
  const song = await getSongById(songId, userId);
  if (!song) {
    return null;
  }

  const rows = await db()
    .update(draftRecordings)
    .set({
      trimStartMs: data.trimStartMs,
      trimEndMs: data.trimEndMs,
    })
    .where(and(eq(draftRecordings.id, draftRecordingId), eq(draftRecordings.songId, songId), eq(draftRecordings.status, "draft")))
    .returning();

  return rows[0] ? mapDraftRecording(rows[0]) : null;
}

export async function promoteDraftRecordingToSongVersion(
  songId: string,
  draftRecordingId: string,
  data: { trimStartMs?: number | null; trimEndMs?: number | null } = {},
  userId: string = DEFAULT_QUERY_USER_ID
): Promise<PromoteDraftRecordingResult | null> {
  await ensureDraftRecordingTables();
  const song = await getSongById(songId, userId);
  if (!song) {
    return null;
  }

  const draftRows = await db()
    .select()
    .from(draftRecordings)
    .where(and(eq(draftRecordings.id, draftRecordingId), eq(draftRecordings.songId, songId), eq(draftRecordings.status, "draft")))
    .limit(1);

  const draft = draftRows[0];
  if (!draft) {
    return null;
  }
  const trimStartMs = data.trimStartMs !== undefined ? data.trimStartMs : draft.trimStartMs;
  const trimEndMs = data.trimEndMs !== undefined ? data.trimEndMs : draft.trimEndMs;

  await db()
    .update(songs)
    .set({
      audioKey: draft.audioKey,
      audioTrimStartMs: trimStartMs,
      audioTrimEndMs: trimEndMs,
    })
    .where(and(eq(songs.id, songId), eq(songs.userId, userId)));

  const archivedAt = new Date();
  const archivedRows = await db()
    .update(draftRecordings)
    .set({
      status: "archived",
      trimStartMs,
      trimEndMs,
      archivedAt,
    })
    .where(and(eq(draftRecordings.id, draftRecordingId), eq(draftRecordings.songId, songId)))
    .returning();

  return {
    draftRecording: mapDraftRecording(archivedRows[0] ?? { ...draft, status: "archived", archivedAt }),
    previousAudioKey: song.audioKey,
  };
}

export async function discardDraftRecording(
  songId: string,
  draftRecordingId: string,
  userId: string = DEFAULT_QUERY_USER_ID
): Promise<PersistedDraftRecording | null> {
  await ensureDraftRecordingTables();
  const song = await getSongById(songId, userId);
  if (!song) {
    return null;
  }

  const rows = await db()
    .update(draftRecordings)
    .set({
      status: "discarded",
      archivedAt: new Date(),
    })
    .where(and(eq(draftRecordings.id, draftRecordingId), eq(draftRecordings.songId, songId), eq(draftRecordings.status, "draft")))
    .returning();

  return rows[0] ? mapDraftRecording(rows[0]) : null;
}

export async function getDraftRecordingsForSong(
  songId: string,
  userId: string = DEFAULT_QUERY_USER_ID
): Promise<PersistedDraftRecording[]> {
  return getDraftRecordingsForSongByStatus(songId, "draft", userId);
}

export async function getArchivedDraftRecordingsForSong(
  songId: string,
  userId: string = DEFAULT_QUERY_USER_ID
): Promise<PersistedDraftRecording[]> {
  return getDraftRecordingsForSongByStatus(songId, "archived", userId);
}

async function getDraftRecordingsForSongByStatus(
  songId: string,
  status: "draft" | "archived",
  userId: string = DEFAULT_QUERY_USER_ID
): Promise<PersistedDraftRecording[]> {
  try {
    await ensureDraftRecordingTables();
    const rows = await db()
      .select({ draftRecording: draftRecordings })
      .from(draftRecordings)
      .innerJoin(songs, eq(draftRecordings.songId, songs.id))
      .where(and(eq(draftRecordings.songId, songId), eq(draftRecordings.status, status), eq(songs.userId, userId)))
      .orderBy(desc(draftRecordings.createdAt));

    return rows.map((row) => mapDraftRecording(row.draftRecording));
  } catch (error) {
    if (isMissingDraftRecordingTableError(error)) {
      return [];
    }
    throw error;
  }
}

// ── Segments ───────────────────────────────────────────────────────────────

export async function getSegmentsBySongId(
  songId: string
): Promise<SegmentRow[]> {
  let primaryError: unknown;
  try {
    return await db()
      .select()
      .from(segments)
      .where(eq(segments.songId, songId))
      .orderBy(asc(segments.order));
  } catch (error) {
    primaryError = error;
    if (!isMissingPitchContourNotesColumnError(error)) {
      throw error;
    }
  }

  try {
    const legacyRows = await db()
      .select({
        id: segments.id,
        songId: segments.songId,
        label: segments.label,
        order: segments.order,
        startMs: segments.startMs,
        endMs: segments.endMs,
        lyricText: segments.lyricText,
      })
      .from(segments)
      .where(eq(segments.songId, songId))
      .orderBy(asc(segments.order));

    return legacyRows.map((row) => ({
      ...row,
      pitchContourNotes: [],
    } as SegmentRow));
  } catch {
    throw primaryError;
  }
}

export async function upsertSegments(
  songId: string,
  newSegments: Array<{
    id: string;
    label: string;
    order: number;
    startMs: number;
    endMs: number;
    lyricText: string;
    pitchContourNotes?: SegmentRow["pitchContourNotes"];
  }>
): Promise<void> {
  await db().delete(segments).where(eq(segments.songId, songId));
  if (newSegments.length > 0) {
    try {
      await db().insert(segments).values(
        newSegments.map((s) => ({
          ...s,
          songId,
          sourceSegmentId: s.id,
          pitchContourNotes: s.pitchContourNotes ?? [],
        }))
      );
    } catch (error) {
      if (!isMissingPitchContourNotesColumnError(error) && !isMissingImportLineageColumnError(error)) {
        throw error;
      }

      const includeSourceSegmentId = !isMissingImportLineageColumnError(error);
      await db().insert(segments).values(
        newSegments.map(({ pitchContourNotes: _pitchContourNotes, ...segment }) => ({
          ...segment,
          songId,
          ...(includeSourceSegmentId ? { sourceSegmentId: segment.id } : {}),
        }))
      );
    }
  }
}

export async function createSegment(data: {
  id: string;
  songId: string;
  label: string;
  order: number;
  startMs: number;
  endMs: number;
  lyricText: string;
  pitchContourNotes?: SegmentRow["pitchContourNotes"];
}): Promise<SegmentRow> {
  try {
    const rows = await db()
      .insert(segments)
      .values({
        ...data,
        sourceSegmentId: data.id,
        pitchContourNotes: data.pitchContourNotes ?? [],
      })
      .returning();
    return rows[0];
  } catch (error) {
    if (!isMissingPitchContourNotesColumnError(error) && !isMissingImportLineageColumnError(error)) {
      throw error;
    }

    const { pitchContourNotes: _pitchContourNotes, ...legacyData } = data;
    const rows = await db()
      .insert(segments)
      .values(legacyData)
      .returning();
    return {
      ...rows[0],
      pitchContourNotes: [],
    } as SegmentRow;
  }
}

export async function updateSegment(
  id: string,
  updates: Partial<Pick<SegmentRow, 'label' | 'order' | 'startMs' | 'endMs' | 'lyricText' | 'pitchContourNotes'>>
): Promise<void> {
  try {
    await db()
      .update(segments)
      .set(updates)
      .where(eq(segments.id, id));
  } catch (error) {
    if (!isMissingPitchContourNotesColumnError(error)) {
      throw error;
    }

    const { pitchContourNotes: _pitchContourNotes, ...legacyUpdates } = updates;
    if (Object.keys(legacyUpdates).length === 0) {
      const migrationError = new Error(
        'Pitch contour notes require database migration 0004_song_pitch_contour.sql before they can be saved.'
      ) as Error & { code?: string };
      migrationError.code = 'PITCH_CONTOUR_MIGRATION_REQUIRED';
      throw migrationError;
    }

    await db()
      .update(segments)
      .set(legacyUpdates)
      .where(eq(segments.id, id));
  }
}

export async function reorderSegments(
  orders: Array<{ id: string; order: number }>
): Promise<void> {
  await Promise.all(orders.map(({ id, order }) => updateSegment(id, { order })));
}

export async function deleteSegment(id: string): Promise<void> {
  await db().delete(segments).where(eq(segments.id, id));
}

// ── Practice Ratings ──────────────────────────────────────────────────────

export async function getRatingsForSong(
  songId: string,
  userId: string = DEFAULT_QUERY_USER_ID
): Promise<PersistedSegmentRating[]> {
  const segmentGroups = await getScoreSegmentGroupsForSong(songId, userId);
  if (segmentGroups.currentSegments.length === 0 || segmentGroups.allScoreSegmentIds.length === 0) {
    return [];
  }

  let rows: Array<{
    id: string;
    segmentId: string;
    rating: number;
    ratedAt: Date;
  }>;
  try {
    rows = await db()
      .select({
        id: practiceRatings.id,
        segmentId: practiceRatings.segmentId,
        rating: practiceRatings.rating,
        ratedAt: practiceRatings.ratedAt,
      })
      .from(practiceRatings)
      .where(and(eq(practiceRatings.userId, userId), inArray(practiceRatings.segmentId, segmentGroups.allScoreSegmentIds)))
      .orderBy(desc(practiceRatings.ratedAt));
  } catch (error) {
    if (!isMissingUserIdColumnError(error)) {
      throw error;
    }

    rows = await db()
      .select({
        id: practiceRatings.id,
        segmentId: practiceRatings.segmentId,
        rating: practiceRatings.rating,
        ratedAt: practiceRatings.ratedAt,
      })
      .from(practiceRatings)
      .where(inArray(practiceRatings.segmentId, segmentGroups.allScoreSegmentIds))
      .orderBy(desc(practiceRatings.ratedAt));
  }

  // Keep only the latest rating per segment.
  const latestBySegment: Record<string, PersistedSegmentRating> = {};
  for (const row of rows) {
    const scoreSegmentId = segmentGroups.scoreSegmentIdBySegmentId.get(row.segmentId);
    const currentSegmentId = scoreSegmentId ? segmentGroups.currentSegmentIdByScoreSegmentId.get(scoreSegmentId) : undefined;
    if (!scoreSegmentId || !currentSegmentId || latestBySegment[currentSegmentId]) {
      continue;
    }
    latestBySegment[currentSegmentId] = {
        id: row.id,
        segmentId: currentSegmentId,
        rating: row.rating as PersistedMemoryRating,
        ratedAt: row.ratedAt.toISOString(),
    };
  }

  return Object.values(latestBySegment).sort((a, b) => Date.parse(b.ratedAt) - Date.parse(a.ratedAt));
}

type ScoreSegmentGroups = {
  currentSegments: SegmentRow[];
  allScoreSegmentIds: string[];
  scoreSegmentIdBySegmentId: Map<string, string>;
  currentSegmentIdByScoreSegmentId: Map<string, string>;
  scoreGroupSegmentIdsByCurrentSegmentId: Map<string, string[]>;
};

function scoreId(id: string | null | undefined, fallbackId: string): string {
  return id ?? fallbackId;
}

async function getScoreSegmentGroupsForSong(
  songId: string,
  userId: string = DEFAULT_QUERY_USER_ID
): Promise<ScoreSegmentGroups> {
  let songRows: Array<{ id: string; sourceSongId?: string | null }>;
  try {
    songRows = await db()
      .select({ id: songs.id, sourceSongId: songs.sourceSongId })
      .from(songs)
      .where(and(eq(songs.id, songId), eq(songs.userId, userId)))
      .limit(1);
  } catch (error) {
    if (!isMissingImportLineageColumnError(error)) {
      throw error;
    }

    const legacyRows = await db()
      .select({ id: songs.id })
      .from(songs)
      .where(and(eq(songs.id, songId), eq(songs.userId, userId)))
      .limit(1);
    songRows = legacyRows.map((row) => ({ ...row, sourceSongId: row.id }));
  }
  const currentSegments = await getSegmentsBySongId(songId);

  const song = songRows[0];
  if (!song) {
    return {
      currentSegments: [],
      allScoreSegmentIds: [],
      scoreSegmentIdBySegmentId: new Map(),
      currentSegmentIdByScoreSegmentId: new Map(),
      scoreGroupSegmentIdsByCurrentSegmentId: new Map(),
    };
  }

  const scoreSongId = scoreId(song.sourceSongId, song.id);
  const currentSegmentIdByScoreSegmentId = new Map<string, string>();
  for (const segment of currentSegments) {
    currentSegmentIdByScoreSegmentId.set(scoreId(segment.sourceSegmentId, segment.id), segment.id);
  }

  if (currentSegmentIdByScoreSegmentId.size === 0) {
    return {
      currentSegments,
      allScoreSegmentIds: [],
      scoreSegmentIdBySegmentId: new Map(),
      currentSegmentIdByScoreSegmentId,
      scoreGroupSegmentIdsByCurrentSegmentId: new Map(),
    };
  }

  let siblingSegments: Array<{ id: string; sourceSegmentId?: string | null }>;
  try {
    siblingSegments = await db()
      .select({
        id: segments.id,
        sourceSegmentId: segments.sourceSegmentId,
      })
      .from(segments)
      .innerJoin(songs, eq(segments.songId, songs.id))
      .where(and(eq(songs.userId, userId), sql`COALESCE(${songs.sourceSongId}, ${songs.id}) = ${scoreSongId}`));
  } catch (error) {
    if (!isMissingImportLineageColumnError(error)) {
      throw error;
    }
    siblingSegments = currentSegments.map((segment) => ({
      id: segment.id,
      sourceSegmentId: segment.sourceSegmentId ?? segment.id,
    }));
  }

  const scoreSegmentIdBySegmentId = new Map<string, string>();
  const scoreGroupSegmentIdsByCurrentSegmentId = new Map<string, string[]>();

  for (const segment of siblingSegments) {
    const currentScoreSegmentId = scoreId(segment.sourceSegmentId, segment.id);
    const currentSegmentId = currentSegmentIdByScoreSegmentId.get(currentScoreSegmentId);
    if (!currentSegmentId) {
      continue;
    }

    scoreSegmentIdBySegmentId.set(segment.id, currentScoreSegmentId);
    const group = scoreGroupSegmentIdsByCurrentSegmentId.get(currentSegmentId) ?? [];
    if (!scoreGroupSegmentIdsByCurrentSegmentId.has(currentSegmentId)) {
      scoreGroupSegmentIdsByCurrentSegmentId.set(currentSegmentId, group);
    }
    group.push(segment.id);
  }

  return {
    currentSegments,
    allScoreSegmentIds: Array.from(scoreSegmentIdBySegmentId.keys()),
    scoreSegmentIdBySegmentId,
    currentSegmentIdByScoreSegmentId,
    scoreGroupSegmentIdsByCurrentSegmentId,
  };
}

export async function getLatestRatingTimeBySongIds(
  songIds: string[],
  userId: string = DEFAULT_QUERY_USER_ID
): Promise<Record<string, Date>> {
  const bySong: Record<string, Date> = {};
  await Promise.all(songIds.map(async (id) => {
    const ratings = await getRatingsForSong(id, userId);
    const latest = ratings[0];
    if (latest) {
      bySong[id] = new Date(latest.ratedAt);
    }
  }));

  return bySong;
}

export async function getSongKnowledgeBySongIds(
  songIds: string[],
  userId: string = DEFAULT_QUERY_USER_ID
): Promise<Record<string, number>> {
  const knowledgeBySong: Record<string, number> = {};
  await Promise.all(songIds.map(async (songId) => {
    const [songSegments, ratings] = await Promise.all([
      getSegmentsBySongId(songId),
      getRatingsForSong(songId, userId),
    ]);
    if (songSegments.length === 0) {
      knowledgeBySong[songId] = 0;
      return;
    }
    const ratingBySegmentId = new Map(ratings.map((rating) => [rating.segmentId, rating.rating]));
    const totalRating = songSegments.reduce((sum, segment) => {
      return sum + (ratingBySegmentId.get(segment.id) ?? 0);
    }, 0);
    const averageRating = totalRating / songSegments.length;
    knowledgeBySong[songId] = Math.round(averageRating * 20);
  }));

  return knowledgeBySong;
}

export async function saveRatings(
  songIdOrRatings: string | Array<{
    segmentId: string;
    rating: PersistedMemoryRating;
    ratedAt: Date;
  }>,
  userIdOrRatings?: string | Array<{
    segmentId: string;
    rating: PersistedMemoryRating;
    ratedAt: Date;
  }>,
  maybeRatings?: Array<{
    segmentId: string;
    rating: PersistedMemoryRating;
    ratedAt: Date;
  }>
): Promise<void> {
  let songId: string | undefined;
  let userId = DEFAULT_QUERY_USER_ID;
  let ratings: Array<{ segmentId: string; rating: PersistedMemoryRating; ratedAt: Date }>;

  if (Array.isArray(songIdOrRatings)) {
    ratings = songIdOrRatings;
  } else {
    songId = songIdOrRatings;
    if (Array.isArray(userIdOrRatings)) {
      ratings = userIdOrRatings;
    } else {
      userId = userIdOrRatings ?? DEFAULT_QUERY_USER_ID;
      ratings = maybeRatings ?? [];
    }
  }

  if (ratings.length === 0) {
    return;
  }

  const latestBySegment = new Map<string, { segmentId: string; rating: PersistedMemoryRating; ratedAt: Date }>();
  for (const rating of ratings) {
    const existing = latestBySegment.get(rating.segmentId);
    if (!existing || rating.ratedAt.getTime() >= existing.ratedAt.getTime()) {
      latestBySegment.set(rating.segmentId, rating);
    }
  }

  const uniqueRatings = Array.from(latestBySegment.values());
  let filteredRatings = uniqueRatings;
  let deleteSegmentIdsByCurrentSegmentId = new Map<string, string[]>();
  if (songId) {
    const segmentGroups = await getScoreSegmentGroupsForSong(songId, userId);
    deleteSegmentIdsByCurrentSegmentId = segmentGroups.scoreGroupSegmentIdsByCurrentSegmentId;
    filteredRatings = uniqueRatings.filter((rating) => deleteSegmentIdsByCurrentSegmentId.has(rating.segmentId));
  }

  if (filteredRatings.length === 0) {
    return;
  }

  const deleteSegmentIds = Array.from(new Set(
    filteredRatings.flatMap((rating) => deleteSegmentIdsByCurrentSegmentId.get(rating.segmentId) ?? [rating.segmentId])
  ));

  await db()
    .delete(practiceRatings)
    .where(and(eq(practiceRatings.userId, userId), inArray(practiceRatings.segmentId, deleteSegmentIds)));

  await db()
    .insert(practiceRatings)
    .values(
      filteredRatings.map((rating) => ({
        id: crypto.randomUUID(),
        userId,
        segmentId: rating.segmentId,
        rating: rating.rating,
        ratedAt: rating.ratedAt,
      }))
    );
}

export async function deleteRatingsForSong(
  songId: string,
  userId: string = DEFAULT_QUERY_USER_ID
): Promise<void> {
  const segmentGroups = await getScoreSegmentGroupsForSong(songId, userId);
  const songSegments = segmentGroups.allScoreSegmentIds;

  if (songSegments.length === 0) {
    return;
  }

  await db()
    .delete(practiceRatings)
    .where(and(eq(practiceRatings.userId, userId), inArray(practiceRatings.segmentId, songSegments)));
}

// ── Tap Practice ─────────────────────────────────────────────────────────

export interface GuestProgressClaimResult {
  claimedSongIds: string[];
  transferredSongIds: string[];
  mergedSongIds: string[];
  skippedSongIds: string[];
  importedRatingCount: number;
  importedTapSessionCount: number;
}

function normalizeSongIdentityPart(value: string | null | undefined): string {
  return (value ?? "").trim().toLowerCase().replace(/\s+/g, " ");
}

function buildSongIdentityKey(song: Pick<SongRow, "title" | "artist">): string {
  return `${normalizeSongIdentityPart(song.title)}\n${normalizeSongIdentityPart(song.artist)}`;
}

function buildSegmentIdentityKey(segment: Pick<SegmentRow, "order" | "label" | "startMs" | "endMs">): string {
  return `${segment.order}\n${normalizeSongIdentityPart(segment.label)}\n${segment.startMs}\n${segment.endMs}`;
}

function mapGuestSegmentsToTarget(guestSegments: SegmentRow[], targetSegments: SegmentRow[]): Map<string, string> {
  const targetById = new Map(targetSegments.map((segment) => [segment.id, segment.id]));
  const targetByIdentity = new Map(targetSegments.map((segment) => [buildSegmentIdentityKey(segment), segment.id]));
  const targetByOrder = new Map(targetSegments.map((segment) => [segment.order, segment.id]));
  const mapped = new Map<string, string>();

  for (const guestSegment of guestSegments) {
    const targetSegmentId =
      targetById.get(guestSegment.id) ??
      targetByIdentity.get(buildSegmentIdentityKey(guestSegment)) ??
      targetByOrder.get(guestSegment.order);
    if (targetSegmentId) {
      mapped.set(guestSegment.id, targetSegmentId);
    }
  }

  return mapped;
}

function isTapScoreResultForClaim(value: unknown): value is TapScoreResult {
  return Boolean(value && typeof value === "object" && Array.isArray((value as TapScoreResult).details));
}

async function copyGuestRatingsToTarget(
  guestSongId: string,
  targetSongId: string,
  targetUserId: string,
  segmentIdMap: Map<string, string>,
  sourceGuestUserId: string = DEFAULT_QUERY_USER_ID
): Promise<number> {
  const [guestRatings, targetRatings] = await Promise.all([
    getRatingsForSong(guestSongId, sourceGuestUserId),
    getRatingsForSong(targetSongId, targetUserId),
  ]);
  const mergedBySegment = new Map<string, { segmentId: string; rating: PersistedMemoryRating; ratedAt: Date }>();

  for (const rating of targetRatings) {
    mergedBySegment.set(rating.segmentId, {
      segmentId: rating.segmentId,
      rating: rating.rating,
      ratedAt: new Date(rating.ratedAt),
    });
  }

  let importedCount = 0;
  for (const rating of guestRatings) {
    const targetSegmentId = segmentIdMap.get(rating.segmentId);
    if (!targetSegmentId) {
      continue;
    }

    const nextRating = {
      segmentId: targetSegmentId,
      rating: rating.rating,
      ratedAt: new Date(rating.ratedAt),
    };
    const existing = mergedBySegment.get(targetSegmentId);
    if (!existing || nextRating.ratedAt.getTime() >= existing.ratedAt.getTime()) {
      mergedBySegment.set(targetSegmentId, nextRating);
    }
    importedCount += 1;
  }

  if (importedCount > 0) {
    await saveRatings(targetSongId, targetUserId, Array.from(mergedBySegment.values()));
  }

  return importedCount;
}

async function copyGuestTapSessionsToTarget(
  guestSongId: string,
  targetSongId: string,
  targetUserId: string,
  segmentIdMap: Map<string, string>,
  sourceGuestUserId: string = DEFAULT_QUERY_USER_ID
): Promise<number> {
  const sessions = await listTapPracticeSessionsForSong(guestSongId, sourceGuestUserId, 100);
  let importedCount = 0;

  for (const session of sessions) {
    const detail = await getTapPracticeSessionDetail(session.id, sourceGuestUserId);
    if (!detail) {
      continue;
    }
    const targetSegmentId = detail.segmentId ? segmentIdMap.get(detail.segmentId) : undefined;
    if (detail.segmentId && !targetSegmentId) {
      continue;
    }

    const imported = await createTapPracticeSession(targetSongId, targetUserId, new Date(detail.startedAt), {
      ...(targetSegmentId ? { segmentId: targetSegmentId } : {}),
      audioVersion: detail.audioVersion,
      mode: detail.mode,
    });

    for (const tap of detail.taps) {
      const tapSegmentId = segmentIdMap.get(tap.segmentId);
      if (!tapSegmentId) {
        continue;
      }
      await addTapPracticeTap(imported.id, {
        segmentId: tapSegmentId,
        noteId: tap.noteId,
        timeOffsetMs: tap.timeOffsetMs,
        durationMs: tap.durationMs,
        lane: tap.lane,
        direction: tap.direction,
      });
    }

    if (detail.finalizedAt) {
      await finalizeTapPracticeSession(imported.id, targetUserId, {
        completedAt: detail.completedAt ? new Date(detail.completedAt) : undefined,
        autoScorePercent: detail.autoScorePercent ?? null,
        selfRating: detail.selfRating ?? null,
        scoreDetails: isTapScoreResultForClaim(detail.scoreDetails) ? detail.scoreDetails : null,
      });
    } else if (detail.completedAt || detail.autoScorePercent !== undefined || detail.scoreDetails) {
      await updateTapPracticeSessionProgress(imported.id, targetUserId, {
        completedAt: detail.completedAt ? new Date(detail.completedAt) : undefined,
        autoScorePercent: detail.autoScorePercent ?? null,
        scoreDetails: isTapScoreResultForClaim(detail.scoreDetails) ? detail.scoreDetails : null,
      });
    }

    importedCount += 1;
  }

  return importedCount;
}

export async function claimGuestProgressForUser(
  targetUserId: string,
  guestSongIds: string[],
  sourceGuestUserId: string = DEFAULT_QUERY_USER_ID
): Promise<GuestProgressClaimResult> {
  const guestUserId = normalizeDbUserId(sourceGuestUserId);
  const uniqueGuestSongIds = Array.from(new Set(guestSongIds.filter((id) => typeof id === "string" && id.trim().length > 0)));
  const result: GuestProgressClaimResult = {
    claimedSongIds: [],
    transferredSongIds: [],
    mergedSongIds: [],
    skippedSongIds: [],
    importedRatingCount: 0,
    importedTapSessionCount: 0,
  };

  if (targetUserId === DEFAULT_QUERY_USER_ID || uniqueGuestSongIds.length === 0) {
    return result;
  }

  const [guestSongs, targetSongs] = await Promise.all([
    db()
      .select()
      .from(songs)
      .where(and(eq(songs.userId, guestUserId), inArray(songs.id, uniqueGuestSongIds))),
    getAllSongs(targetUserId),
  ]);

  const targetByIdentity = new Map<string, SongRow>();
  for (const song of targetSongs) {
    const key = buildSongIdentityKey(song);
    if (!targetByIdentity.has(key)) {
      targetByIdentity.set(key, song);
    }
  }

  for (const guestSong of guestSongs) {
    const targetSong = targetByIdentity.get(buildSongIdentityKey(guestSong));
    if (!targetSong) {
      await db()
        .update(songs)
        .set({ userId: targetUserId })
        .where(and(eq(songs.id, guestSong.id), eq(songs.userId, guestUserId)));
      try {
        await db()
          .update(tapPracticeSessions)
          .set({ userId: targetUserId })
          .where(and(eq(tapPracticeSessions.songId, guestSong.id), eq(tapPracticeSessions.userId, guestUserId)));
      } catch (error) {
        if (!isMissingTapPracticeTableError(error)) {
          throw error;
        }
      }

      result.claimedSongIds.push(guestSong.id);
      result.transferredSongIds.push(guestSong.id);
      continue;
    }

    const [guestSegments, targetSegments] = await Promise.all([
      getSegmentsBySongId(guestSong.id),
      getSegmentsBySongId(targetSong.id),
    ]);
    const segmentIdMap = mapGuestSegmentsToTarget(guestSegments, targetSegments);
    if (segmentIdMap.size === 0 && guestSegments.length > 0) {
      result.skippedSongIds.push(guestSong.id);
      continue;
    }

    result.importedRatingCount += await copyGuestRatingsToTarget(guestSong.id, targetSong.id, targetUserId, segmentIdMap, guestUserId);
    result.importedTapSessionCount += await copyGuestTapSessionsToTarget(guestSong.id, targetSong.id, targetUserId, segmentIdMap, guestUserId);

    const guestPracticedAt = guestSong.lastPracticedAt?.getTime() ?? 0;
    const targetPracticedAt = targetSong.lastPracticedAt?.getTime() ?? 0;
    if (guestSong.lastPracticedAt && guestPracticedAt > targetPracticedAt) {
      await markSongPracticed(targetSong.id, targetUserId, guestSong.lastPracticedAt);
    }

    await deleteSong(guestSong.id, guestUserId);
    result.claimedSongIds.push(targetSong.id);
    result.mergedSongIds.push(targetSong.id);
  }

  const foundGuestSongIds = new Set(guestSongs.map((song) => song.id));
  for (const songId of uniqueGuestSongIds) {
    if (!foundGuestSongIds.has(songId)) {
      result.skippedSongIds.push(songId);
    }
  }

  return result;
}

function normalizeTapAudioVersion(value: string | null | undefined): TapAudioVersion {
  return value === "blend" ? "blend" : "straight";
}

async function ensureMidiTables(): Promise<void> {
  if (!ensureMidiTablesPromise) {
    ensureMidiTablesPromise = (async () => {
      await db().execute(sql.raw(`
        CREATE TABLE IF NOT EXISTS "midi_sources" (
          "id" text PRIMARY KEY NOT NULL,
          "song_id" text NOT NULL REFERENCES "songs"("id") ON DELETE cascade,
          "original_filename" text NOT NULL,
          "storage_key" text NOT NULL,
          "uploaded_at" timestamp NOT NULL DEFAULT now(),
          "content_type" text,
          "file_size" integer NOT NULL DEFAULT 0,
          "parse_status" text NOT NULL DEFAULT 'parsed',
          "cleanup_settings" jsonb NOT NULL DEFAULT '{"shortNoteThresholdMs":0,"simultaneousThresholdMs":30}'::jsonb,
          "raw_notes" jsonb NOT NULL DEFAULT '[]'::jsonb,
          "cleaned_notes" jsonb NOT NULL DEFAULT '[]'::jsonb,
          "raw_note_count" integer NOT NULL DEFAULT 0,
          "cleaned_note_count" integer NOT NULL DEFAULT 0,
          "ignored_short_note_count" integer NOT NULL DEFAULT 0,
          "parse_error" text
        )
      `));
      await db().execute(sql.raw(`
        CREATE INDEX IF NOT EXISTS "idx_midi_sources_song_uploaded_at"
          ON "midi_sources" ("song_id", "uploaded_at")
      `));
      await db().execute(sql.raw(`
        CREATE TABLE IF NOT EXISTS "midi_alignments" (
          "id" text PRIMARY KEY NOT NULL,
          "song_id" text NOT NULL REFERENCES "songs"("id") ON DELETE cascade,
          "midi_source_id" text NOT NULL REFERENCES "midi_sources"("id") ON DELETE cascade,
          "tapped_start_times_seconds" jsonb NOT NULL DEFAULT '[]'::jsonb,
          "retained_midi_note_count" integer NOT NULL DEFAULT 0,
          "is_complete" boolean NOT NULL DEFAULT false,
          "status" text NOT NULL DEFAULT 'partial',
          "notes" text,
          "created_at" timestamp NOT NULL DEFAULT now(),
          "updated_at" timestamp NOT NULL DEFAULT now()
        )
      `));
      await db().execute(sql.raw(`
        CREATE INDEX IF NOT EXISTS "idx_midi_alignments_song_updated_at"
          ON "midi_alignments" ("song_id", "updated_at")
      `));
      await db().execute(sql.raw(`
        CREATE INDEX IF NOT EXISTS "idx_midi_alignments_source_updated_at"
          ON "midi_alignments" ("midi_source_id", "updated_at")
      `));
    })().catch((error) => {
      ensureMidiTablesPromise = null;
      throw error;
    });
  }

  await ensureMidiTablesPromise;
}

function normalizeTapPracticeMode(value: string | null | undefined): TapPracticeMode {
  return value === "answer_key" ? "answer_key" : "practice";
}

function normalizeTapDirection(value: string | null | undefined): TapDirection | undefined {
  return value === "up" || value === "down" || value === "same" ? value : undefined;
}

type TapPracticeSessionProjection = Pick<TapPracticeSessionRow, "id" | "songId" | "startedAt"> &
  Partial<Pick<TapPracticeSessionRow, "segmentId" | "audioVersion" | "mode" | "completedAt" | "finalizedAt" | "autoScorePercent" | "selfRating" | "scoreDetails">>;

const TAP_PRACTICE_SESSION_KEEP_LIMIT = 5;

function mapTapPracticeSession(row: TapPracticeSessionProjection): PersistedTapPracticeSessionSummary {
  const selfRating = row.selfRating === 1 || row.selfRating === 2 || row.selfRating === 3 || row.selfRating === 4 || row.selfRating === 5 ? row.selfRating : undefined;
  return {
    id: row.id,
    songId: row.songId,
    audioVersion: normalizeTapAudioVersion(row.audioVersion),
    mode: normalizeTapPracticeMode(row.mode),
    startedAt: row.startedAt.toISOString(),
    ...(row.segmentId ? { segmentId: row.segmentId } : {}),
    ...(row.completedAt ? { completedAt: row.completedAt.toISOString() } : {}),
    ...(row.finalizedAt ? { finalizedAt: row.finalizedAt.toISOString() } : {}),
    ...(row.autoScorePercent !== null && row.autoScorePercent !== undefined ? { autoScorePercent: row.autoScorePercent } : {}),
    ...(selfRating ? { selfRating } : {}),
    ...(row.scoreDetails ? { scoreDetails: row.scoreDetails } : {}),
    tapCount: 0,
  };
}

function laneToMilli(lane: number): number {
  return Math.max(0, Math.min(1000, Math.round(lane * 1000)));
}

function laneFromMilli(laneMilli: number): number {
  return Math.max(0, Math.min(1, laneMilli / 1000));
}

export async function deleteExpiredTapPracticeData(
  userId: string = DEFAULT_QUERY_USER_ID,
  cutoff: Date = new Date(Date.now() - 14 * 24 * 60 * 60 * 1000)
): Promise<void> {
  try {
    await db()
      .delete(tapPracticeSessions)
      .where(and(eq(tapPracticeSessions.userId, userId), lte(tapPracticeSessions.startedAt, cutoff)));
  } catch (error) {
    if (isMissingTapPracticeTableError(error)) {
      await ensureTapPracticeTables();
      await db()
        .delete(tapPracticeSessions)
        .where(and(eq(tapPracticeSessions.userId, userId), lte(tapPracticeSessions.startedAt, cutoff)));
      return;
    }
    throw error;
  }
}

async function pruneTapPracticeSessionsForSegment(
  songId: string,
  segmentId: string,
  currentSessionId: string,
  userId: string = DEFAULT_QUERY_USER_ID,
  keepLimit: number = TAP_PRACTICE_SESSION_KEEP_LIMIT
): Promise<void> {
  let sessions: Array<{ id: string; startedAt: Date }> = [];
  try {
    sessions = await db()
      .select({
        id: tapPracticeSessions.id,
        startedAt: tapPracticeSessions.startedAt,
      })
      .from(tapPracticeSessions)
      .innerJoin(songs, eq(tapPracticeSessions.songId, songs.id))
      .where(and(
        eq(tapPracticeSessions.songId, songId),
        eq(tapPracticeSessions.segmentId, segmentId),
        eq(tapPracticeSessions.mode, "practice"),
        eq(songs.userId, userId)
      ))
      .orderBy(desc(tapPracticeSessions.startedAt));
  } catch (error) {
    if (isMissingTapPracticeTableError(error) || isMissingEnhancedTapPracticeColumnError(error)) {
      await ensureTapPracticeTables();
      sessions = await db()
        .select({
          id: tapPracticeSessions.id,
          startedAt: tapPracticeSessions.startedAt,
        })
        .from(tapPracticeSessions)
        .innerJoin(songs, eq(tapPracticeSessions.songId, songs.id))
        .where(and(
          eq(tapPracticeSessions.songId, songId),
          eq(tapPracticeSessions.segmentId, segmentId),
          eq(tapPracticeSessions.mode, "practice"),
          eq(songs.userId, userId)
        ))
        .orderBy(desc(tapPracticeSessions.startedAt));
    } else {
      throw error;
    }
  }

  const retained = new Set<string>([currentSessionId]);
  for (const session of sessions) {
    if (retained.size >= Math.max(1, keepLimit)) {
      break;
    }
    retained.add(session.id);
  }

  const staleSessionIds = sessions.map((session) => session.id).filter((id) => !retained.has(id));
  if (staleSessionIds.length === 0) {
    return;
  }

  try {
    await db()
      .delete(tapPracticeSessions)
      .where(inArray(tapPracticeSessions.id, staleSessionIds));
  } catch (error) {
    if (isMissingTapPracticeTableError(error)) {
      await ensureTapPracticeTables();
      await db()
        .delete(tapPracticeSessions)
        .where(inArray(tapPracticeSessions.id, staleSessionIds));
      return;
    }
    throw error;
  }
}

export async function createTapPracticeSession(
  songId: string,
  userId: string = DEFAULT_QUERY_USER_ID,
  startedAt: Date = new Date(),
  options: {
    segmentId?: string;
    audioVersion?: TapAudioVersion;
    mode?: TapPracticeMode;
  } = {}
): Promise<PersistedTapPracticeSessionSummary> {
  try {
    const rows = await db()
      .insert(tapPracticeSessions)
      .values({
        id: crypto.randomUUID(),
        userId,
        songId,
        segmentId: options.segmentId ?? null,
        audioVersion: options.audioVersion ?? "straight",
        mode: options.mode ?? "practice",
        startedAt,
      })
      .returning();

    return mapTapPracticeSession(rows[0]);
  } catch (error) {
    if (isMissingTapPracticeTableError(error) || isMissingEnhancedTapPracticeColumnError(error)) {
      await ensureTapPracticeTables();
      const rows = await db()
        .insert(tapPracticeSessions)
        .values({
          id: crypto.randomUUID(),
          userId,
          songId,
          segmentId: options.segmentId ?? null,
          audioVersion: options.audioVersion ?? "straight",
          mode: options.mode ?? "practice",
          startedAt,
        })
        .returning();

      return mapTapPracticeSession(rows[0]);
    }
    throw error;
  }
}

export async function addTapPracticeTap(
  sessionId: string,
  data: {
    segmentId: string;
    noteId: string;
    timeOffsetMs: number;
    durationMs: number;
    lane: number;
    direction?: TapDirection;
  }
): Promise<void> {
  try {
    await db()
      .insert(tapPracticeTaps)
      .values({
        id: crypto.randomUUID(),
        sessionId,
        segmentId: data.segmentId,
        noteId: data.noteId,
        timeOffsetMs: data.timeOffsetMs,
        durationMs: data.durationMs,
        laneMilli: laneToMilli(data.lane),
        direction: data.direction ?? null,
        createdAt: new Date(),
      });
  } catch (error) {
    if (isMissingTapPracticeTableError(error) || isMissingEnhancedTapPracticeColumnError(error)) {
      await ensureTapPracticeTables();
      await db()
        .insert(tapPracticeTaps)
        .values({
          id: crypto.randomUUID(),
          sessionId,
          segmentId: data.segmentId,
          noteId: data.noteId,
          timeOffsetMs: data.timeOffsetMs,
          durationMs: data.durationMs,
          laneMilli: laneToMilli(data.lane),
          direction: data.direction ?? null,
          createdAt: new Date(),
        });
      return;
    }
    throw error;
  }
}

export async function updateTapPracticeSessionProgress(
  sessionId: string,
  userId: string = DEFAULT_QUERY_USER_ID,
  data: {
    completedAt?: Date;
    autoScorePercent?: number | null;
    scoreDetails?: TapScoreResult | null;
  } = {}
): Promise<PersistedTapPracticeSessionDetail | null> {
  const existing = await getTapPracticeSessionDetail(sessionId, userId);
  if (!existing) {
    return null;
  }

  const completedAt = data.completedAt ?? new Date();
  try {
    await db()
      .update(tapPracticeSessions)
      .set({
        completedAt,
        autoScorePercent: data.autoScorePercent ?? null,
        scoreDetails: data.scoreDetails ?? {},
      })
      .where(eq(tapPracticeSessions.id, sessionId));
  } catch (error) {
    if (isMissingTapPracticeTableError(error) || isMissingEnhancedTapPracticeColumnError(error)) {
      await ensureTapPracticeTables();
      await db()
        .update(tapPracticeSessions)
        .set({
          completedAt,
          autoScorePercent: data.autoScorePercent ?? null,
          scoreDetails: data.scoreDetails ?? {},
        })
        .where(eq(tapPracticeSessions.id, sessionId));
    } else {
      throw error;
    }
  }

  if (existing.segmentId && existing.mode === "practice") {
    await pruneTapPracticeSessionsForSegment(existing.songId, existing.segmentId, sessionId, userId);
  }

  return getTapPracticeSessionDetail(sessionId, userId);
}

export async function deleteTapPracticeSessionsForSong(
  songId: string,
  userId: string = DEFAULT_QUERY_USER_ID
): Promise<void> {
  try {
    await db()
      .delete(tapPracticeSessions)
      .where(and(eq(tapPracticeSessions.songId, songId), eq(tapPracticeSessions.userId, userId)));
  } catch (error) {
    if (isMissingTapPracticeTableError(error)) {
      await ensureTapPracticeTables();
      await db()
        .delete(tapPracticeSessions)
        .where(and(eq(tapPracticeSessions.songId, songId), eq(tapPracticeSessions.userId, userId)));
      return;
    }
    throw error;
  }
}

export async function listTapPracticeSessionsForSong(
  songId: string,
  userId: string = DEFAULT_QUERY_USER_ID,
  limit: number = 20
): Promise<PersistedTapPracticeSessionSummary[]> {
  let sessions: TapPracticeSessionProjection[] = [];
  try {
    sessions = await db()
      .select({
        id: tapPracticeSessions.id,
        songId: tapPracticeSessions.songId,
        segmentId: tapPracticeSessions.segmentId,
        audioVersion: tapPracticeSessions.audioVersion,
        mode: tapPracticeSessions.mode,
        startedAt: tapPracticeSessions.startedAt,
        completedAt: tapPracticeSessions.completedAt,
        finalizedAt: tapPracticeSessions.finalizedAt,
        autoScorePercent: tapPracticeSessions.autoScorePercent,
        selfRating: tapPracticeSessions.selfRating,
        scoreDetails: tapPracticeSessions.scoreDetails,
      })
      .from(tapPracticeSessions)
      .innerJoin(songs, eq(tapPracticeSessions.songId, songs.id))
      .where(and(eq(tapPracticeSessions.songId, songId), eq(songs.userId, userId)))
      .orderBy(desc(tapPracticeSessions.startedAt));
  } catch (error) {
    if (isMissingTapPracticeTableError(error) || isMissingEnhancedTapPracticeColumnError(error)) {
      await ensureTapPracticeTables();
      sessions = await db()
        .select({
          id: tapPracticeSessions.id,
          songId: tapPracticeSessions.songId,
          segmentId: tapPracticeSessions.segmentId,
          audioVersion: tapPracticeSessions.audioVersion,
          mode: tapPracticeSessions.mode,
          startedAt: tapPracticeSessions.startedAt,
          completedAt: tapPracticeSessions.completedAt,
          finalizedAt: tapPracticeSessions.finalizedAt,
          autoScorePercent: tapPracticeSessions.autoScorePercent,
          selfRating: tapPracticeSessions.selfRating,
          scoreDetails: tapPracticeSessions.scoreDetails,
        })
        .from(tapPracticeSessions)
        .innerJoin(songs, eq(tapPracticeSessions.songId, songs.id))
        .where(and(eq(tapPracticeSessions.songId, songId), eq(songs.userId, userId)))
        .orderBy(desc(tapPracticeSessions.startedAt));
    } else {
      throw error;
    }
  }

  const selectedSessions = sessions.slice(0, Math.max(1, limit));
  if (selectedSessions.length === 0) {
    return [];
  }

  const sessionIds = selectedSessions.map((row) => row.id);
  let tapRows: Array<{ sessionId: string }> = [];
  try {
    tapRows = await db()
      .select({ sessionId: tapPracticeTaps.sessionId })
      .from(tapPracticeTaps)
      .where(inArray(tapPracticeTaps.sessionId, sessionIds));
  } catch (error) {
    if (isMissingTapPracticeTableError(error)) {
      await ensureTapPracticeTables();
      tapRows = await db()
        .select({ sessionId: tapPracticeTaps.sessionId })
        .from(tapPracticeTaps)
        .where(inArray(tapPracticeTaps.sessionId, sessionIds));
    } else {
      throw error;
    }
  }

  const tapCountBySession = tapRows.reduce<Record<string, number>>((accumulator, row) => {
    accumulator[row.sessionId] = (accumulator[row.sessionId] ?? 0) + 1;
    return accumulator;
  }, {});

  return selectedSessions.map((row) => ({
    ...mapTapPracticeSession(row),
    tapCount: tapCountBySession[row.id] ?? 0,
  }));
}

export async function getTapPracticeSessionDetail(
  sessionId: string,
  userId: string = DEFAULT_QUERY_USER_ID
): Promise<PersistedTapPracticeSessionDetail | null> {
  let sessionRows: TapPracticeSessionProjection[] = [];
  try {
    sessionRows = await db()
      .select({
        id: tapPracticeSessions.id,
        songId: tapPracticeSessions.songId,
        segmentId: tapPracticeSessions.segmentId,
        audioVersion: tapPracticeSessions.audioVersion,
        mode: tapPracticeSessions.mode,
        startedAt: tapPracticeSessions.startedAt,
        completedAt: tapPracticeSessions.completedAt,
        finalizedAt: tapPracticeSessions.finalizedAt,
        autoScorePercent: tapPracticeSessions.autoScorePercent,
        selfRating: tapPracticeSessions.selfRating,
        scoreDetails: tapPracticeSessions.scoreDetails,
      })
      .from(tapPracticeSessions)
      .innerJoin(songs, eq(tapPracticeSessions.songId, songs.id))
      .where(and(eq(tapPracticeSessions.id, sessionId), eq(songs.userId, userId)))
      .limit(1);
  } catch (error) {
    if (isMissingTapPracticeTableError(error) || isMissingEnhancedTapPracticeColumnError(error)) {
      await ensureTapPracticeTables();
      sessionRows = await db()
        .select({
          id: tapPracticeSessions.id,
          songId: tapPracticeSessions.songId,
          segmentId: tapPracticeSessions.segmentId,
          audioVersion: tapPracticeSessions.audioVersion,
          mode: tapPracticeSessions.mode,
          startedAt: tapPracticeSessions.startedAt,
          completedAt: tapPracticeSessions.completedAt,
          finalizedAt: tapPracticeSessions.finalizedAt,
          autoScorePercent: tapPracticeSessions.autoScorePercent,
          selfRating: tapPracticeSessions.selfRating,
          scoreDetails: tapPracticeSessions.scoreDetails,
        })
        .from(tapPracticeSessions)
        .innerJoin(songs, eq(tapPracticeSessions.songId, songs.id))
        .where(and(eq(tapPracticeSessions.id, sessionId), eq(songs.userId, userId)))
        .limit(1);
    } else {
      throw error;
    }
  }

  const sessionRow = sessionRows[0];
  if (!sessionRow) {
    return null;
  }

  let taps: Array<{
    id: string;
    noteId: string;
    segmentId: string;
    timeOffsetMs: number;
    durationMs: number;
    laneMilli: number;
    direction: string | null;
    createdAt: Date;
  }> = [];
  try {
    taps = await db()
      .select()
      .from(tapPracticeTaps)
      .where(eq(tapPracticeTaps.sessionId, sessionId))
      .orderBy(asc(tapPracticeTaps.createdAt));
  } catch (error) {
    if (isMissingTapPracticeTableError(error) || isMissingEnhancedTapPracticeColumnError(error)) {
      await ensureTapPracticeTables();
      taps = await db()
        .select()
        .from(tapPracticeTaps)
        .where(eq(tapPracticeTaps.sessionId, sessionId))
        .orderBy(asc(tapPracticeTaps.createdAt));
    } else {
      throw error;
    }
  }

  const selfRating = sessionRow.selfRating === 1 || sessionRow.selfRating === 2 || sessionRow.selfRating === 3 || sessionRow.selfRating === 4 || sessionRow.selfRating === 5 ? sessionRow.selfRating : undefined;
  return {
    id: sessionRow.id,
    songId: sessionRow.songId,
    audioVersion: normalizeTapAudioVersion(sessionRow.audioVersion),
    mode: normalizeTapPracticeMode(sessionRow.mode),
    startedAt: sessionRow.startedAt.toISOString(),
    ...(sessionRow.segmentId ? { segmentId: sessionRow.segmentId } : {}),
    ...(sessionRow.completedAt ? { completedAt: sessionRow.completedAt.toISOString() } : {}),
    ...(sessionRow.finalizedAt ? { finalizedAt: sessionRow.finalizedAt.toISOString() } : {}),
    ...(sessionRow.autoScorePercent !== null && sessionRow.autoScorePercent !== undefined ? { autoScorePercent: sessionRow.autoScorePercent } : {}),
    ...(selfRating ? { selfRating } : {}),
    ...(sessionRow.scoreDetails ? { scoreDetails: sessionRow.scoreDetails } : {}),
    taps: taps.map((tap) => {
      const direction = normalizeTapDirection(tap.direction);
      return {
        id: tap.id,
        noteId: tap.noteId,
        segmentId: tap.segmentId,
        timeOffsetMs: tap.timeOffsetMs,
        durationMs: tap.durationMs,
        lane: laneFromMilli(tap.laneMilli),
        ...(direction ? { direction } : {}),
        createdAt: tap.createdAt.toISOString(),
      };
    }),
  };
}

export async function finalizeTapPracticeSession(
  sessionId: string,
  userId: string = DEFAULT_QUERY_USER_ID,
  data: {
    completedAt?: Date;
    autoScorePercent?: number | null;
    selfRating?: SelfRating | null;
    scoreDetails?: TapScoreResult | null;
  } = {}
): Promise<PersistedTapPracticeSessionDetail | null> {
  const existing = await getTapPracticeSessionDetail(sessionId, userId);
  if (!existing) {
    return null;
  }

  if (existing.finalizedAt) {
    return existing;
  }

  const completedAt = data.completedAt ?? new Date();
  try {
    await db()
      .update(tapPracticeSessions)
      .set({
        completedAt,
        finalizedAt: new Date(),
        autoScorePercent: data.autoScorePercent ?? null,
        selfRating: data.selfRating ?? null,
        scoreDetails: data.scoreDetails ?? {},
      })
      .where(eq(tapPracticeSessions.id, sessionId));
  } catch (error) {
    if (isMissingTapPracticeTableError(error) || isMissingEnhancedTapPracticeColumnError(error)) {
      await ensureTapPracticeTables();
      await db()
        .update(tapPracticeSessions)
        .set({
          completedAt,
          finalizedAt: new Date(),
          autoScorePercent: data.autoScorePercent ?? null,
          selfRating: data.selfRating ?? null,
          scoreDetails: data.scoreDetails ?? {},
        })
        .where(eq(tapPracticeSessions.id, sessionId));
    } else {
      throw error;
    }
  }

  if (existing.segmentId && existing.mode === "practice") {
    await pruneTapPracticeSessionsForSegment(existing.songId, existing.segmentId, sessionId, userId);
  }

  return getTapPracticeSessionDetail(sessionId, userId);
}

// ── Playlists ─────────────────────────────────────────────────────────────

// MIDI-guided Tap Practice

function mapMidiSource(row: MidiSourceRow): PersistedMidiSource {
  return {
    id: row.id,
    songId: row.songId,
    originalFilename: row.originalFilename,
    storageKey: row.storageKey,
    uploadedAt: row.uploadedAt.toISOString(),
    contentType: row.contentType,
    fileSize: row.fileSize,
    parseStatus: row.parseStatus,
    cleanupSettings: row.cleanupSettings,
    rawNotes: row.rawNotes,
    cleanedNotes: row.cleanedNotes,
    rawNoteCount: row.rawNoteCount,
    cleanedNoteCount: row.cleanedNoteCount,
    ignoredShortNoteCount: row.ignoredShortNoteCount,
    parseError: row.parseError,
  };
}

function mapMidiAlignment(row: MidiAlignmentRow): MidiAlignment {
  const tappedStartTimesSeconds = Array.isArray(row.tappedStartTimesSeconds)
    ? row.tappedStartTimesSeconds.filter((value): value is number => typeof value === "number" && Number.isFinite(value))
    : [];
  return {
    id: row.id,
    songId: row.songId,
    midiSourceId: row.midiSourceId,
    tappedStartTimesSeconds,
    retainedMidiNoteCount: row.retainedMidiNoteCount,
    isComplete: row.isComplete,
    status: row.status === "complete" ? "complete" : "partial",
    createdAt: row.createdAt.toISOString(),
    updatedAt: row.updatedAt.toISOString(),
    ...(row.notes ? { notes: row.notes } : {}),
  };
}

export async function createMidiSource(data: Omit<PersistedMidiSource, "uploadedAt">): Promise<PersistedMidiSource> {
  try {
    const rows = await db()
      .insert(midiSources)
      .values({
        ...data,
        uploadedAt: new Date(),
        contentType: data.contentType ?? null,
        parseError: data.parseError ?? null,
      })
      .returning();
    return mapMidiSource(rows[0]);
  } catch (error) {
    if (isMissingMidiTableError(error)) {
      await ensureMidiTables();
      const rows = await db()
        .insert(midiSources)
        .values({
          ...data,
          uploadedAt: new Date(),
          contentType: data.contentType ?? null,
          parseError: data.parseError ?? null,
        })
        .returning();
      return mapMidiSource(rows[0]);
    }
    throw error;
  }
}

export async function getLatestMidiSourceForSong(songId: string, userId: string = DEFAULT_QUERY_USER_ID): Promise<PersistedMidiSource | null> {
  try {
    const rows = await db()
      .select({ source: midiSources })
      .from(midiSources)
      .innerJoin(songs, eq(midiSources.songId, songs.id))
      .where(and(eq(midiSources.songId, songId), eq(songs.userId, userId)))
      .orderBy(desc(midiSources.uploadedAt))
      .limit(1);
    return rows[0] ? mapMidiSource(rows[0].source) : null;
  } catch (error) {
    if (isMissingMidiTableError(error)) {
      await ensureMidiTables();
      return null;
    }
    throw error;
  }
}

export async function getMidiSourceById(midiSourceId: string, userId: string = DEFAULT_QUERY_USER_ID): Promise<PersistedMidiSource | null> {
  try {
    const rows = await db()
      .select({ source: midiSources })
      .from(midiSources)
      .innerJoin(songs, eq(midiSources.songId, songs.id))
      .where(and(eq(midiSources.id, midiSourceId), eq(songs.userId, userId)))
      .limit(1);
    return rows[0] ? mapMidiSource(rows[0].source) : null;
  } catch (error) {
    if (isMissingMidiTableError(error)) {
      await ensureMidiTables();
      return null;
    }
    throw error;
  }
}

export async function updateMidiSourceCleanup(
  midiSourceId: string,
  userId: string,
  data: {
    cleanupSettings: MidiCleanupSettingsData;
    cleanedNotes: CleanedMidiNoteData[];
    cleanedNoteCount: number;
    ignoredShortNoteCount: number;
  }
): Promise<PersistedMidiSource | null> {
  await ensureMidiTables();
  const source = await getMidiSourceById(midiSourceId, userId);
  if (!source) {
    return null;
  }
  const rows = await db()
    .update(midiSources)
    .set({
      cleanupSettings: data.cleanupSettings,
      cleanedNotes: data.cleanedNotes,
      cleanedNoteCount: data.cleanedNoteCount,
      ignoredShortNoteCount: data.ignoredShortNoteCount,
    })
    .where(eq(midiSources.id, midiSourceId))
    .returning();
  return rows[0] ? mapMidiSource(rows[0]) : null;
}

export async function getLatestMidiAlignmentForSource(midiSourceId: string, userId: string = DEFAULT_QUERY_USER_ID): Promise<MidiAlignment | null> {
  try {
    const rows = await db()
      .select({ alignment: midiAlignments })
      .from(midiAlignments)
      .innerJoin(songs, eq(midiAlignments.songId, songs.id))
      .where(and(eq(midiAlignments.midiSourceId, midiSourceId), eq(songs.userId, userId)))
      .orderBy(desc(midiAlignments.updatedAt))
      .limit(1);
    return rows[0] ? mapMidiAlignment(rows[0].alignment) : null;
  } catch (error) {
    if (isMissingMidiTableError(error)) {
      await ensureMidiTables();
      return null;
    }
    throw error;
  }
}

export async function getLatestCompleteMidiAlignmentForSource(midiSourceId: string, userId: string = DEFAULT_QUERY_USER_ID): Promise<MidiAlignment | null> {
  try {
    const rows = await db()
      .select({ alignment: midiAlignments })
      .from(midiAlignments)
      .innerJoin(songs, eq(midiAlignments.songId, songs.id))
      .where(and(eq(midiAlignments.midiSourceId, midiSourceId), eq(midiAlignments.isComplete, true), eq(songs.userId, userId)))
      .orderBy(desc(midiAlignments.updatedAt))
      .limit(1);
    return rows[0] ? mapMidiAlignment(rows[0].alignment) : null;
  } catch (error) {
    if (isMissingMidiTableError(error)) {
      await ensureMidiTables();
      return null;
    }
    throw error;
  }
}

export async function upsertMidiAlignment(
  data: {
    id?: string;
    songId: string;
    midiSourceId: string;
    tappedStartTimesSeconds: number[];
    retainedMidiNoteCount: number;
    notes?: string | null;
  },
  userId: string = DEFAULT_QUERY_USER_ID
): Promise<MidiAlignment> {
  await ensureMidiTables();
  const song = await getSongById(data.songId, userId);
  if (!song) {
    throw new Error("Song not found");
  }
  const now = new Date();
  const tapped = data.tappedStartTimesSeconds.slice(0, data.retainedMidiNoteCount);
  const isComplete = tapped.length >= data.retainedMidiNoteCount;
  const id = data.id ?? crypto.randomUUID();
  const values = {
    id,
    songId: data.songId,
    midiSourceId: data.midiSourceId,
    tappedStartTimesSeconds: tapped,
    retainedMidiNoteCount: data.retainedMidiNoteCount,
    isComplete,
    status: isComplete ? "complete" : "partial",
    notes: data.notes ?? null,
    updatedAt: now,
  };
  const rows = await db()
    .insert(midiAlignments)
    .values({ ...values, createdAt: now })
    .onConflictDoUpdate({
      target: midiAlignments.id,
      set: values,
    })
    .returning();
  return mapMidiAlignment(rows[0]);
}

function toIso(value: Date | null): string {
  return value ? value.toISOString() : new Date(0).toISOString();
}

function mapPlaylistSummary(row: PlaylistRow, songCount: number = 0): PlaylistSummary {
  const shareAudioMode = row.shareAudioMode === "part" || row.shareAudioMode === "blend" ? row.shareAudioMode : "both";
  return {
    id: row.id,
    name: row.name,
    eventDate: row.eventDate ?? undefined,
    isRetired: row.isRetired,
    isPublic: Boolean(row.isPublic),
    publishedAt: row.publishedAt ? row.publishedAt.toISOString() : null,
    shareToken: row.shareToken ?? null,
    sharedAt: row.sharedAt ? row.sharedAt.toISOString() : null,
    shareAudioMode,
    sourcePlaylistId: row.sourcePlaylistId ?? null,
    sourceOwnerId: row.sourceOwnerId ?? null,
    sourceShareToken: row.sourceShareToken ?? null,
    importedAt: row.importedAt ? row.importedAt.toISOString() : null,
    createdAt: toIso(row.createdAt),
    songCount,
  };
}

function emptyPlaylistHealthStats() {
  return {
    songsWithPartAudio: 0,
    songsWithBlendAudio: 0,
    songsWithSegments: 0,
    songsWithMidiContour: 0,
  };
}

async function ensurePlaylistSharingColumns(): Promise<void> {
  await db().execute(sql.raw(`ALTER TABLE "playlists" ADD COLUMN IF NOT EXISTS "share_token" text`));
  await db().execute(sql.raw(`ALTER TABLE "playlists" ADD COLUMN IF NOT EXISTS "shared_at" timestamp`));
  await db().execute(sql.raw(`ALTER TABLE "playlists" ADD COLUMN IF NOT EXISTS "share_audio_mode" text NOT NULL DEFAULT 'both'`));
  await db().execute(sql.raw(`ALTER TABLE "playlists" ADD COLUMN IF NOT EXISTS "is_public" boolean NOT NULL DEFAULT false`));
  await db().execute(sql.raw(`ALTER TABLE "playlists" ADD COLUMN IF NOT EXISTS "published_at" timestamp`));
  await db().execute(sql.raw(`ALTER TABLE "playlists" ADD COLUMN IF NOT EXISTS "source_playlist_id" text`));
  await db().execute(sql.raw(`ALTER TABLE "playlists" ADD COLUMN IF NOT EXISTS "source_owner_id" text`));
  await db().execute(sql.raw(`ALTER TABLE "playlists" ADD COLUMN IF NOT EXISTS "source_share_token" text`));
  await db().execute(sql.raw(`ALTER TABLE "playlists" ADD COLUMN IF NOT EXISTS "imported_at" timestamp`));
  await db().execute(sql.raw(`
    CREATE UNIQUE INDEX IF NOT EXISTS "playlists_share_token_unique"
      ON "playlists" ("share_token")
      WHERE "share_token" IS NOT NULL
  `));
  await db().execute(sql.raw(`
    CREATE INDEX IF NOT EXISTS "idx_playlists_public_published_at"
      ON "playlists" ("is_public", "published_at")
  `));
  await db().execute(sql.raw(`
    CREATE INDEX IF NOT EXISTS "idx_playlists_user_source_playlist"
      ON "playlists" ("user_id", "source_playlist_id")
  `));
}

function normalizeShareAudioMode(mode: unknown): PlaylistShareAudioMode {
  return mode === "part" || mode === "blend" || mode === "both" ? mode : "both";
}

function applyShareAudioModeToPlaylist(detail: PlaylistDetail): PlaylistDetail {
  const mode = normalizeShareAudioMode(detail.shareAudioMode);
  return {
    ...detail,
    shareAudioMode: mode,
    songs: detail.songs.map((song) => ({
      ...song,
      audioUrl: mode === "blend" ? "" : song.audioUrl,
      alternateAudioUrl: mode === "part" ? undefined : song.alternateAudioUrl,
    })),
  };
}

function createShareToken(): string {
  return crypto.randomUUID();
}

export async function getAllPlaylists(
  userIdOrIncludeRetired: string | boolean = DEFAULT_QUERY_USER_ID,
  maybeIncludeRetired = false
): Promise<PlaylistSummary[]> {
  const legacyMode = typeof userIdOrIncludeRetired === "boolean";
  const userId = typeof userIdOrIncludeRetired === "string" ? userIdOrIncludeRetired : DEFAULT_QUERY_USER_ID;
  const includeRetired = typeof userIdOrIncludeRetired === "boolean" ? userIdOrIncludeRetired : maybeIncludeRetired;
  const baseQuery = db().select().from(playlists).orderBy(desc(playlists.createdAt));
  let rows: PlaylistRow[];
  try {
    rows = legacyMode
      ? includeRetired
        ? await baseQuery
        : await baseQuery.where(eq(playlists.isRetired, false))
      : includeRetired
        ? await baseQuery.where(eq(playlists.userId, userId))
        : await baseQuery.where(and(eq(playlists.userId, userId), eq(playlists.isRetired, false)));
  } catch (error) {
    if (!isMissingUserIdColumnError(error) && !isMissingPlaylistSharingColumnError(error)) {
      throw error;
    }

    const legacyBaseQuery = db()
      .select({
        id: playlists.id,
        userId: playlists.userId,
        name: playlists.name,
        eventDate: playlists.eventDate,
        isRetired: playlists.isRetired,
        createdAt: playlists.createdAt,
      })
      .from(playlists)
      .orderBy(desc(playlists.createdAt));

    try {
      const legacyRows = legacyMode
        ? includeRetired
          ? await legacyBaseQuery
          : await legacyBaseQuery.where(eq(playlists.isRetired, false))
        : includeRetired
          ? await legacyBaseQuery.where(eq(playlists.userId, userId))
          : await legacyBaseQuery.where(and(eq(playlists.userId, userId), eq(playlists.isRetired, false)));

      rows = legacyRows.map((row) => ({ ...row, isPublic: false, publishedAt: null, shareToken: null, sharedAt: null, shareAudioMode: "both" } as PlaylistRow));
    } catch (legacyError) {
      if (!isMissingUserIdColumnError(legacyError)) {
        throw legacyError;
      }

      const userlessBaseQuery = db()
        .select({
          id: playlists.id,
          name: playlists.name,
          eventDate: playlists.eventDate,
          isRetired: playlists.isRetired,
          createdAt: playlists.createdAt,
        })
        .from(playlists)
        .orderBy(desc(playlists.createdAt));

      const userlessRows = includeRetired
        ? await userlessBaseQuery
        : await userlessBaseQuery.where(eq(playlists.isRetired, false));

      rows = userlessRows.map((row) => ({ ...row, userId: DEFAULT_QUERY_USER_ID, isPublic: false, publishedAt: null, shareToken: null, sharedAt: null, shareAudioMode: "both" } as PlaylistRow));
    }
  }

  // Get song counts for each playlist
  const songCounts = await db()
    .select({
      playlistId: playlistSongs.playlistId,
      count: count(playlistSongs.songId),
    })
    .from(playlistSongs)
    .groupBy(playlistSongs.playlistId);

  const countMap = Object.fromEntries(
    songCounts.map((row) => [row.playlistId, row.count])
  );

  const summaries = rows.map((row) => mapPlaylistSummary(row, countMap[row.id] ?? 0));
  const playlistIds = summaries.map((playlist) => playlist.id);
  if (playlistIds.length === 0) {
    return summaries;
  }

  const linkedSongs = await db()
    .select({
      playlistId: playlistSongs.playlistId,
      songId: playlistSongs.songId,
      audioKey: songs.audioKey,
      alternateAudioKey: songs.alternateAudioKey,
    })
    .from(playlistSongs)
    .innerJoin(songs, eq(playlistSongs.songId, songs.id))
    .where(legacyMode ? inArray(playlistSongs.playlistId, playlistIds) : and(inArray(playlistSongs.playlistId, playlistIds), eq(songs.userId, userId)));

  const songIds = Array.from(new Set(linkedSongs.map((song) => song.songId)));
  const [segmentCountRows, midiContourRows, knowledgeBySong] = await Promise.all([
    songIds.length > 0
      ? db()
          .select({
            songId: segments.songId,
            count: count(segments.id),
          })
          .from(segments)
          .where(inArray(segments.songId, songIds))
          .groupBy(segments.songId)
      : Promise.resolve([]),
    songIds.length > 0
      ? db()
          .select({
            songId: midiSources.songId,
            count: count(midiSources.id),
          })
          .from(midiSources)
          .where(and(inArray(midiSources.songId, songIds), sql`${midiSources.cleanedNoteCount} > 0`))
          .groupBy(midiSources.songId)
      : Promise.resolve([]),
    getSongKnowledgeBySongIds(songIds, userId),
  ]);

  const segmentCountBySong = new Map(segmentCountRows.map((row) => [row.songId, Number(row.count)]));
  const midiSongIds = new Set(midiContourRows.map((row) => row.songId));
  const statsByPlaylist = new Map<string, ReturnType<typeof emptyPlaylistHealthStats>>();
  const knowledgeNumeratorByPlaylist = new Map<string, number>();
  const knowledgeSegmentCountByPlaylist = new Map<string, number>();

  for (const linkedSong of linkedSongs) {
    const stats = statsByPlaylist.get(linkedSong.playlistId) ?? emptyPlaylistHealthStats();
    if (linkedSong.audioKey?.trim()) {
      stats.songsWithPartAudio += 1;
    }
    if (linkedSong.alternateAudioKey?.trim()) {
      stats.songsWithBlendAudio += 1;
    }

    const segmentCount = segmentCountBySong.get(linkedSong.songId) ?? 0;
    if (segmentCount > 0) {
      stats.songsWithSegments += 1;
      knowledgeNumeratorByPlaylist.set(
        linkedSong.playlistId,
        (knowledgeNumeratorByPlaylist.get(linkedSong.playlistId) ?? 0) + (knowledgeBySong[linkedSong.songId] ?? 0) * segmentCount
      );
      knowledgeSegmentCountByPlaylist.set(
        linkedSong.playlistId,
        (knowledgeSegmentCountByPlaylist.get(linkedSong.playlistId) ?? 0) + segmentCount
      );
    }
    if (midiSongIds.has(linkedSong.songId)) {
      stats.songsWithMidiContour += 1;
    }
    statsByPlaylist.set(linkedSong.playlistId, stats);
  }

  return summaries.map((playlist) => {
    const segmentCount = knowledgeSegmentCountByPlaylist.get(playlist.id) ?? 0;
    return {
      ...playlist,
      knowledgePercent: segmentCount > 0 ? Math.round((knowledgeNumeratorByPlaylist.get(playlist.id) ?? 0) / segmentCount) : 0,
      healthStats: statsByPlaylist.get(playlist.id) ?? emptyPlaylistHealthStats(),
    };
  });
}

export async function getPlaylistById(
  id: string,
  userId: string = DEFAULT_QUERY_USER_ID
): Promise<PlaylistDetail | null> {
  let playlistRows: PlaylistRow[];
  try {
    playlistRows = await db()
      .select()
      .from(playlists)
      .where(and(eq(playlists.id, id), eq(playlists.userId, userId)))
      .limit(1);
  } catch (error) {
    if (!isMissingUserIdColumnError(error) && !isMissingPlaylistSharingColumnError(error)) {
      throw error;
    }

    try {
      const legacyPlaylistRows = await db()
        .select({
          id: playlists.id,
          userId: playlists.userId,
          name: playlists.name,
          eventDate: playlists.eventDate,
          isRetired: playlists.isRetired,
          createdAt: playlists.createdAt,
        })
        .from(playlists)
        .where(and(eq(playlists.id, id), eq(playlists.userId, userId)))
        .limit(1);

      playlistRows = legacyPlaylistRows.map((row) => ({ ...row, isPublic: false, publishedAt: null, shareToken: null, sharedAt: null, shareAudioMode: "both" } as PlaylistRow));
    } catch (legacyError) {
      if (!isMissingUserIdColumnError(legacyError)) {
        throw legacyError;
      }

      const userlessPlaylistRows = await db()
        .select({
          id: playlists.id,
          name: playlists.name,
          eventDate: playlists.eventDate,
          isRetired: playlists.isRetired,
          createdAt: playlists.createdAt,
        })
        .from(playlists)
        .where(eq(playlists.id, id))
        .limit(1);

      playlistRows = userlessPlaylistRows.map((row) => ({ ...row, userId: DEFAULT_QUERY_USER_ID, isPublic: false, publishedAt: null, shareToken: null, sharedAt: null, shareAudioMode: "both" } as PlaylistRow));
    }
  }

  const playlist = playlistRows[0];
  if (!playlist) {
    return null;
  }

  let linkedSongs: Array<{
    playlistId: string;
    songId: string;
    position: number;
    title: string;
    artist: string | null;
    audioKey: string | null;
    alternateAudioKey: string | null;
    pitchContourNotes: SongRow["pitchContourNotes"];
    createdAt: Date | null;
    lastPracticedAt: Date | null;
  }>;
  try {
    linkedSongs = await db()
      .select({
        playlistId: playlistSongs.playlistId,
        songId: playlistSongs.songId,
        position: playlistSongs.position,
        title: songs.title,
        artist: songs.artist,
        audioKey: songs.audioKey,
        alternateAudioKey: songs.alternateAudioKey,
        pitchContourNotes: songs.pitchContourNotes,
        createdAt: songs.createdAt,
        lastPracticedAt: songs.lastPracticedAt,
      })
      .from(playlistSongs)
      .innerJoin(songs, eq(playlistSongs.songId, songs.id))
      .where(and(eq(playlistSongs.playlistId, id), eq(songs.userId, playlist.userId)))
      .orderBy(asc(playlistSongs.position));
  } catch (error) {
    if (!isMissingUserIdColumnError(error) && !isMissingPitchContourNotesColumnError(error) && !isMissingAlternateAudioKeyColumnError(error)) {
      throw error;
    }

    linkedSongs = await db()
      .select({
        playlistId: playlistSongs.playlistId,
        songId: playlistSongs.songId,
        position: playlistSongs.position,
        title: songs.title,
        artist: songs.artist,
        audioKey: songs.audioKey,
        alternateAudioKey: sql<string | null>`null`,
        pitchContourNotes: sql<SongRow["pitchContourNotes"]>`'[]'::jsonb`,
        createdAt: songs.createdAt,
        lastPracticedAt: songs.lastPracticedAt,
      })
      .from(playlistSongs)
      .innerJoin(songs, eq(playlistSongs.songId, songs.id))
      .where(eq(playlistSongs.playlistId, id))
      .orderBy(asc(playlistSongs.position));
  }

  const songIds = linkedSongs.map((s) => s.songId);
  const [segmentsBySong, masteryBySong, latestRatingTimes, ratingCounts, midiContourEntries] = await Promise.all([
    Promise.all(linkedSongs.map((s) => getSegmentsBySongId(s.songId))),
    getSongKnowledgeBySongIds(songIds, playlist.userId),
    getLatestRatingTimeBySongIds(songIds, playlist.userId),
    getRatingCountBySongIds(songIds, playlist.userId),
    Promise.all(
      linkedSongs.map(async (song) => {
        const source = await getLatestMidiSourceForSong(song.songId, playlist.userId);
        const hasMidiContour = (source?.cleanedNoteCount ?? 0) > 0;
        return [song.songId, hasMidiContour] as const;
      })
    ).then((entries) => Object.fromEntries(entries)),
  ]);

  const songsWithSegments: PlaylistSongItem[] = linkedSongs.map((songRow, i) => ({
    id: songRow.songId,
    title: songRow.title,
    artist: songRow.artist ?? undefined,
    audioUrl: songRow.audioKey ? getPublicUrl(songRow.audioKey) : "",
    alternateAudioUrl: songRow.alternateAudioKey ? getPublicUrl(songRow.alternateAudioKey) : undefined,
    pitchContourNotes: [],
    hasMidiContour: midiContourEntries[songRow.songId] ?? false,
    ratingCount: ratingCounts[songRow.songId] ?? 0,
    segments: segmentsBySong[i],
    createdAt: toIso(songRow.createdAt),
    updatedAt: toIso(songRow.createdAt),
    position: songRow.position,
    masteryPercent: masteryBySong[songRow.songId] ?? 0,
    lastPracticedAt: songRow.lastPracticedAt
      ? toIso(songRow.lastPracticedAt)
      : latestRatingTimes[songRow.songId]
        ? toIso(latestRatingTimes[songRow.songId])
        : null,
  }));

  return {
    ...mapPlaylistSummary(playlist),
    songs: songsWithSegments,
  };
}

export async function enablePlaylistSharing(
  id: string,
  userId: string = DEFAULT_QUERY_USER_ID,
  shareAudioMode: PlaylistShareAudioMode = "both"
): Promise<PlaylistSummary | null> {
  await ensurePlaylistSharingColumns();
  const existingRows = await db()
    .select()
    .from(playlists)
    .where(and(eq(playlists.id, id), eq(playlists.userId, userId)))
    .limit(1);

  const existing = existingRows[0];
  if (!existing) {
    return null;
  }

  const mode = normalizeShareAudioMode(shareAudioMode);
  if (existing.shareToken) {
    if (normalizeShareAudioMode(existing.shareAudioMode) === mode) {
      return mapPlaylistSummary(existing);
    }
    const rows = await db()
      .update(playlists)
      .set({ shareAudioMode: mode })
      .where(and(eq(playlists.id, id), eq(playlists.userId, userId)))
      .returning();
    return rows[0] ? mapPlaylistSummary(rows[0]) : null;
  }

  const sharedAt = new Date();
  const rows = await db()
    .update(playlists)
    .set({ shareToken: createShareToken(), sharedAt, shareAudioMode: mode })
    .where(and(eq(playlists.id, id), eq(playlists.userId, userId)))
    .returning();

  return rows[0] ? mapPlaylistSummary(rows[0]) : null;
}

export async function disablePlaylistSharing(
  id: string,
  userId: string = DEFAULT_QUERY_USER_ID
): Promise<boolean> {
  await ensurePlaylistSharingColumns();
  const rows = await db()
    .update(playlists)
    .set({ shareToken: null, sharedAt: null })
    .where(and(eq(playlists.id, id), eq(playlists.userId, userId)))
    .returning({ id: playlists.id });

  return rows.length > 0;
}

export async function enablePlaylistPublicSharing(
  id: string,
  userId: string = DEFAULT_QUERY_USER_ID,
  shareAudioMode: PlaylistShareAudioMode = "both"
): Promise<PlaylistSummary | null> {
  await ensurePlaylistSharingColumns();
  const existingRows = await db()
    .select()
    .from(playlists)
    .where(and(eq(playlists.id, id), eq(playlists.userId, userId)))
    .limit(1);

  const existing = existingRows[0];
  if (!existing) {
    return null;
  }

  const mode = normalizeShareAudioMode(shareAudioMode);
  if (existing.isPublic && normalizeShareAudioMode(existing.shareAudioMode) === mode) {
    return mapPlaylistSummary(existing);
  }

  const now = new Date();
  const rows = await db()
    .update(playlists)
    .set({
      isPublic: true,
      publishedAt: existing.publishedAt ?? now,
      shareAudioMode: mode,
    })
    .where(and(eq(playlists.id, id), eq(playlists.userId, userId)))
    .returning();

  return rows[0] ? mapPlaylistSummary(rows[0]) : null;
}

export async function disablePlaylistPublicSharing(
  id: string,
  userId: string = DEFAULT_QUERY_USER_ID
): Promise<boolean> {
  await ensurePlaylistSharingColumns();
  const rows = await db()
    .update(playlists)
    .set({ isPublic: false, publishedAt: null })
    .where(and(eq(playlists.id, id), eq(playlists.userId, userId)))
    .returning({ id: playlists.id });

  return rows.length > 0;
}

export async function getPublicSharedPlaylists(excludeOwnerUserId?: string): Promise<PublicSharedPlaylistSummary[]> {
  await ensurePlaylistSharingColumns();
  let rows: Array<{
    playlist: PlaylistRow;
    ownerId: string;
    ownerName: string;
    ownerUsername: string;
  }>;

  try {
    rows = await db()
      .select({
        playlist: playlists,
        ownerId: users.id,
        ownerName: users.name,
        ownerUsername: users.username,
      })
      .from(playlists)
      .innerJoin(users, eq(playlists.userId, users.id))
      .where(and(eq(playlists.isPublic, true), eq(playlists.isRetired, false)))
      .orderBy(desc(playlists.publishedAt));
  } catch (error) {
    if (isMissingPlaylistSharingColumnError(error)) {
      return [];
    }
    if (!isMissingUsersTableError(error) && !isMissingUserProfileColumnError(error)) {
      throw error;
    }

    const playlistRows = await db()
      .select()
      .from(playlists)
      .where(and(eq(playlists.isPublic, true), eq(playlists.isRetired, false)))
      .orderBy(desc(playlists.publishedAt));
    rows = playlistRows.map((playlist) => ({
      playlist,
      ownerId: playlist.userId,
      ownerName: "Default User",
      ownerUsername: "default",
    }));
  }

  if (rows.length === 0) {
    return [];
  }

  if (excludeOwnerUserId) {
    rows = rows.filter((row) => row.playlist.userId !== excludeOwnerUserId);
  }

  if (rows.length === 0) {
    return [];
  }

  const playlistIds = rows.map((row) => row.playlist.id);
  const songCounts = await db()
    .select({
      playlistId: playlistSongs.playlistId,
      count: count(playlistSongs.songId),
    })
    .from(playlistSongs)
    .where(inArray(playlistSongs.playlistId, playlistIds))
    .groupBy(playlistSongs.playlistId);

  const countMap = Object.fromEntries(songCounts.map((row) => [row.playlistId, row.count]));
  return rows.map((row) => ({
    ...mapPlaylistSummary(row.playlist, countMap[row.playlist.id] ?? 0),
    isPublic: true,
    owner: {
      id: row.ownerId,
      displayName: row.ownerName,
      username: row.ownerUsername,
    },
  }));
}

export async function getPublicPlaylistById(id: string, viewerUserId?: string): Promise<SharedPlaylistDetail | null> {
  await ensurePlaylistSharingColumns();
  let rows: Array<{
    playlist: PlaylistRow;
    ownerId: string;
    ownerName: string;
    ownerUsername: string;
  }>;

  try {
    rows = await db()
      .select({
        playlist: playlists,
        ownerId: users.id,
        ownerName: users.name,
        ownerUsername: users.username,
      })
      .from(playlists)
      .innerJoin(users, eq(playlists.userId, users.id))
      .where(and(eq(playlists.id, id), eq(playlists.isPublic, true), eq(playlists.isRetired, false)))
      .limit(1);
  } catch (error) {
    if (isMissingPlaylistSharingColumnError(error)) {
      return null;
    }
    if (!isMissingUsersTableError(error) && !isMissingUserProfileColumnError(error)) {
      throw error;
    }

    const playlistRows = await db()
      .select()
      .from(playlists)
      .where(and(eq(playlists.id, id), eq(playlists.isPublic, true), eq(playlists.isRetired, false)))
      .limit(1);
    rows = playlistRows.map((playlist) => ({
      playlist,
      ownerId: playlist.userId,
      ownerName: "Default User",
      ownerUsername: "default",
    }));
  }

  const row = rows[0];
  if (!row) {
    return null;
  }
  if (viewerUserId && row.playlist.userId === viewerUserId) {
    return null;
  }

  const detail = await getPlaylistById(row.playlist.id, row.playlist.userId);
  if (!detail?.isPublic) {
    return null;
  }

  return {
    ...applyShareAudioModeToPlaylist(detail),
    owner: {
      id: row.ownerId,
      displayName: row.ownerName,
      username: row.ownerUsername,
    },
  };
}

export async function getSharedPlaylistByToken(token: string): Promise<SharedPlaylistDetail | null> {
  if (!token.trim()) {
    return null;
  }
  await ensurePlaylistSharingColumns();

  let rows: Array<{
    playlist: PlaylistRow;
    ownerId: string;
    ownerName: string;
    ownerUsername: string;
  }>;

  try {
    rows = await db()
      .select({
        playlist: playlists,
        ownerId: users.id,
        ownerName: users.name,
        ownerUsername: users.username,
      })
      .from(playlists)
      .innerJoin(users, eq(playlists.userId, users.id))
      .where(eq(playlists.shareToken, token))
      .limit(1);
  } catch (error) {
    if (isMissingPlaylistSharingColumnError(error)) {
      return null;
    }
    if (isMissingUsersTableError(error) || isMissingUserProfileColumnError(error)) {
      const playlistRows = await db()
        .select()
        .from(playlists)
        .where(eq(playlists.shareToken, token))
        .limit(1);
      rows = playlistRows.map((playlist) => ({
        playlist,
        ownerId: playlist.userId,
        ownerName: "Default User",
        ownerUsername: "default",
      }));
    } else {
      throw error;
    }
  }

  const row = rows[0];
  if (!row || !row.playlist.shareToken) {
    return null;
  }

  const detail = await getPlaylistById(row.playlist.id, row.playlist.userId);
  if (!detail || detail.shareToken !== token) {
    return null;
  }

  return {
    ...applyShareAudioModeToPlaylist(detail),
    owner: {
      id: row.ownerId,
      displayName: row.ownerName,
      username: row.ownerUsername,
    },
  };
}

export async function getPlaylistImportsForSource(
  sourcePlaylistId: string,
  userId: string = DEFAULT_QUERY_USER_ID
): Promise<PlaylistSummary[]> {
  await ensurePlaylistSharingColumns();
  const rows = await db()
    .select()
    .from(playlists)
    .where(and(eq(playlists.userId, userId), eq(playlists.sourcePlaylistId, sourcePlaylistId)))
    .orderBy(desc(playlists.importedAt));

  if (rows.length === 0) {
    return [];
  }

  const songCounts = await db()
    .select({
      playlistId: playlistSongs.playlistId,
      count: count(playlistSongs.songId),
    })
    .from(playlistSongs)
    .where(inArray(playlistSongs.playlistId, rows.map((row) => row.id)))
    .groupBy(playlistSongs.playlistId);

  const countMap = Object.fromEntries(songCounts.map((row) => [row.playlistId, row.count]));
  return rows.map((row) => mapPlaylistSummary(row, countMap[row.id] ?? 0));
}

async function cloneMidiDataForImportedSong(sourceSongId: string, importedSongId: string): Promise<void> {
  try {
    const sourceRows = await db()
      .select()
      .from(midiSources)
      .where(eq(midiSources.songId, sourceSongId));

    if (sourceRows.length === 0) {
      return;
    }

    const sourceIdMap = new Map<string, string>();
    const importedSources = sourceRows.map((source) => {
      const importedSourceId = crypto.randomUUID();
      sourceIdMap.set(source.id, importedSourceId);
      return {
        id: importedSourceId,
        songId: importedSongId,
        originalFilename: source.originalFilename,
        storageKey: source.storageKey,
        uploadedAt: source.uploadedAt,
        contentType: source.contentType,
        fileSize: source.fileSize,
        parseStatus: source.parseStatus,
        cleanupSettings: source.cleanupSettings,
        rawNotes: source.rawNotes,
        cleanedNotes: source.cleanedNotes,
        rawNoteCount: source.rawNoteCount,
        cleanedNoteCount: source.cleanedNoteCount,
        ignoredShortNoteCount: source.ignoredShortNoteCount,
        parseError: source.parseError,
      };
    });

    await db().insert(midiSources).values(importedSources);

    const alignmentRows = await db()
      .select()
      .from(midiAlignments)
      .where(inArray(midiAlignments.midiSourceId, Array.from(sourceIdMap.keys())));

    if (alignmentRows.length === 0) {
      return;
    }

    await db().insert(midiAlignments).values(
      alignmentRows.map((alignment) => ({
        id: crypto.randomUUID(),
        songId: importedSongId,
        midiSourceId: sourceIdMap.get(alignment.midiSourceId) ?? alignment.midiSourceId,
        tappedStartTimesSeconds: alignment.tappedStartTimesSeconds,
        retainedMidiNoteCount: alignment.retainedMidiNoteCount,
        isComplete: alignment.isComplete,
        status: alignment.status,
        notes: alignment.notes,
        createdAt: alignment.createdAt,
        updatedAt: alignment.updatedAt,
      }))
    );
  } catch (error) {
    if (isMissingMidiTableError(error)) {
      return;
    }
    throw error;
  }
}

export async function importSharedPlaylist(
  token: string,
  userId: string = DEFAULT_QUERY_USER_ID,
  options: { force?: boolean } = {}
): Promise<{ status: "imported"; playlist: PlaylistSummary } | { status: "already_imported"; playlist: PlaylistSummary }> {
  await ensurePlaylistSharingColumns();
  const source = await getSharedPlaylistByToken(token);
  if (!source) {
    throw Object.assign(new Error("Shared playlist not found"), { code: "SHARED_PLAYLIST_NOT_FOUND" });
  }

  const existingImports = await getPlaylistImportsForSource(source.id, userId);
  if (existingImports.length > 0 && !options.force) {
    return { status: "already_imported", playlist: existingImports[0] };
  }

  const now = new Date();
  const importedPlaylistId = crypto.randomUUID();
  const playlistRows = await db()
    .insert(playlists)
    .values({
      id: importedPlaylistId,
      userId,
      name: source.name,
      eventDate: source.eventDate ?? null,
      isRetired: false,
      sourcePlaylistId: source.id,
      sourceOwnerId: source.owner.id,
      sourceShareToken: token,
      importedAt: now,
    })
    .returning();

  const importedPlaylist = playlistRows[0];
  const sortedSongs = [...source.songs].sort((a, b) => a.position - b.position);
  const shareAudioMode = normalizeShareAudioMode(source.shareAudioMode);
  let importedSongCount = 0;

  for (const item of sortedSongs) {
    const songRows = await db()
      .select()
      .from(songs)
      .where(eq(songs.id, item.id))
      .limit(1);
    const sourceSongRow = songRows[0];
    if (!sourceSongRow) {
      continue;
    }

    const sourceSongId = sourceSongRow.sourceSongId ?? sourceSongRow.id;
    const existingSongRows = await db()
      .select({ id: songs.id })
      .from(songs)
      .where(and(eq(songs.userId, userId), sql`COALESCE(${songs.sourceSongId}, ${songs.id}) = ${sourceSongId}`))
      .orderBy(asc(songs.createdAt))
      .limit(1);

    const existingSong = existingSongRows[0];
    if (existingSong) {
      await db()
        .insert(playlistSongs)
        .values({
          playlistId: importedPlaylistId,
          songId: existingSong.id,
          position: item.position,
        });
      importedSongCount += 1;
      continue;
    }

    const existingTitleRows = await db()
      .select({ title: songs.title })
      .from(songs)
      .where(eq(songs.userId, userId));
    const importedTitle = getImportedSongTitle(
      sourceSongRow.title,
      source.name,
      existingTitleRows.map((row) => row.title)
    );

    const importedSongId = crypto.randomUUID();
    await db()
      .insert(songs)
      .values({
        id: importedSongId,
        userId,
        title: importedTitle,
        artist: sourceSongRow.artist ?? null,
        audioKey: shareAudioMode === "blend" ? null : sourceSongRow.audioKey ?? null,
        alternateAudioKey: shareAudioMode === "part" ? null : sourceSongRow.alternateAudioKey ?? null,
        pitchContourNotes: sourceSongRow.pitchContourNotes ?? [],
        sourceSongId,
        lastPracticedAt: null,
      });

    const sourceSegments = await getSegmentsBySongId(item.id);
    if (sourceSegments.length > 0) {
      await db().insert(segments).values(
        sourceSegments.map((segment) => ({
          id: crypto.randomUUID(),
          songId: importedSongId,
          label: segment.label,
          order: segment.order,
          startMs: segment.startMs,
          endMs: segment.endMs,
          lyricText: segment.lyricText ?? "",
          sourceSegmentId: segment.sourceSegmentId ?? segment.id,
          pitchContourNotes: segment.pitchContourNotes ?? [],
        }))
      );
    }

    await cloneMidiDataForImportedSong(item.id, importedSongId);

    await db()
      .insert(playlistSongs)
      .values({
        playlistId: importedPlaylistId,
        songId: importedSongId,
        position: item.position,
      });
    importedSongCount += 1;
  }

  return { status: "imported", playlist: mapPlaylistSummary(importedPlaylist, importedSongCount) };
}

async function getRatingCountBySongIds(
  songIds: string[],
  userId: string = DEFAULT_QUERY_USER_ID
): Promise<Record<string, number>> {
  const bySong: Record<string, number> = {};
  await Promise.all(songIds.map(async (songId) => {
    bySong[songId] = (await getRatingsForSong(songId, userId)).length;
  }));

  return bySong;
}

export async function createPlaylist(data: {
  userId: string;
  name: string;
  eventDate?: string;
}): Promise<PlaylistSummary> {
  try {
    const rows = await db()
      .insert(playlists)
      .values({
        id: crypto.randomUUID(),
        userId: data.userId,
        name: data.name,
        eventDate: data.eventDate ?? null,
      })
      .returning();

    return mapPlaylistSummary(rows[0]);
  } catch (error) {
    if (!isMissingUserIdColumnError(error)) {
      throw error;
    }

    const rows = await db()
      .insert(playlists)
      .values({
        id: crypto.randomUUID(),
        name: data.name,
        eventDate: data.eventDate ?? null,
      })
      .returning();

    return mapPlaylistSummary(rows[0]);
  }
}

export async function updatePlaylist(
  id: string,
  data: { name?: string; eventDate?: string; isRetired?: boolean },
  userId: string = DEFAULT_QUERY_USER_ID
): Promise<void> {
  const updates: Partial<Pick<PlaylistRow, "name" | "eventDate" | "isRetired" | "isPublic" | "publishedAt" | "shareToken" | "sharedAt">> = {};
  if (data.name !== undefined) updates.name = data.name;
  if (data.eventDate !== undefined) updates.eventDate = data.eventDate;
  if (data.isRetired !== undefined) {
    updates.isRetired = data.isRetired;
    if (data.isRetired) {
      updates.isPublic = false;
      updates.publishedAt = null;
      updates.shareToken = null;
      updates.sharedAt = null;
    }
  }

  if (Object.keys(updates).length === 0) {
    return;
  }

  await db()
    .update(playlists)
    .set(updates)
    .where(and(eq(playlists.id, id), eq(playlists.userId, userId)));
}

export async function deletePlaylist(id: string, userId: string = DEFAULT_QUERY_USER_ID): Promise<void> {
  await db().delete(playlists).where(and(eq(playlists.id, id), eq(playlists.userId, userId)));
}

export async function addSongToPlaylist(
  playlistId: string,
  songId: string,
  position?: number,
  _userId: string = DEFAULT_QUERY_USER_ID
): Promise<void> {
  let nextPosition = position;
  if (nextPosition === undefined) {
    const rows = await db()
      .select({ position: playlistSongs.position })
      .from(playlistSongs)
      .where(eq(playlistSongs.playlistId, playlistId))
      .orderBy(desc(playlistSongs.position))
      .limit(1);
    nextPosition = rows.length > 0 ? rows[0].position + 1 : 0;
  }

  await db()
    .insert(playlistSongs)
    .values({
      playlistId,
      songId,
      position: nextPosition,
    })
    .onConflictDoNothing();
}

export async function removeSongFromPlaylist(
  playlistId: string,
  songId: string,
  _userId: string = DEFAULT_QUERY_USER_ID
): Promise<void> {
  await db()
    .delete(playlistSongs)
    .where(and(eq(playlistSongs.playlistId, playlistId), eq(playlistSongs.songId, songId)));
}

export async function reorderPlaylistSongs(
  playlistId: string,
  orderedSongIds: string[],
  _userId: string = DEFAULT_QUERY_USER_ID
): Promise<void> {
  await Promise.all(
    orderedSongIds.map((songId, position) =>
      db()
        .update(playlistSongs)
        .set({ position })
        .where(and(eq(playlistSongs.playlistId, playlistId), eq(playlistSongs.songId, songId)))
    )
  );
}
