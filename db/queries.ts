import { eq, asc, desc, inArray, and, count, lte, sql } from "drizzle-orm";
import { db } from "./index";
import { songs, segments, practiceRatings, playlists, playlistSongs, orphanedAudioKeys, users, tapPracticeSessions, tapPracticeTaps, midiSources, midiAlignments } from "./schema";
import type { SongRow, SegmentRow, PlaylistRow, OrphanedAudioKeyRow, TapPracticeSessionRow, MidiSourceRow, MidiAlignmentRow, RawMidiNoteData, CleanedMidiNoteData, MidiCleanupSettingsData } from "./schema";
import { getPublicUrl } from "../lib/r2";
import type { SelfRating, TapAudioVersion, TapDirection, TapPracticeMode, TapScoreResult } from "../app/lib/enhancedTapPractice";
import type { MidiAlignment } from "../app/lib/midiGuidedTapPractice";

const DEFAULT_QUERY_USER_ID = "default";
let ensureTapPracticeTablesPromise: Promise<void> | null = null;
let ensureMidiTablesPromise: Promise<void> | null = null;

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
  createdAt: string;
  songs: PlaylistSongItem[];
}

export interface PlaylistSummary {
  id: string;
  name: string;
  eventDate?: string;
  isRetired: boolean;
  createdAt: string;
  songCount: number;
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

// ── Users ─────────────────────────────────────────────────────────────────

export async function getAllUsers(): Promise<Array<{ id: string; name: string }>> {
  try {
    const rows = await db().select({ id: users.id, name: users.name }).from(users).orderBy(asc(users.name));
    if (rows.length === 0) {
      return [{ id: DEFAULT_QUERY_USER_ID, name: "Default User" }];
    }
    return rows;
  } catch (error) {
    if (!isMissingUsersTableError(error)) {
      throw error;
    }
    return [{ id: DEFAULT_QUERY_USER_ID, name: "Default User" }];
  }
}

export async function upsertUser(data: { id: string; name: string }): Promise<{ id: string; name: string }> {
  try {
    const rows = await db()
      .insert(users)
      .values({ id: data.id, name: data.name })
      .onConflictDoUpdate({
        target: users.id,
        set: { name: data.name },
      })
      .returning({ id: users.id, name: users.name });
    return rows[0] ?? data;
  } catch (error) {
    if (!isMissingUsersTableError(error)) {
      throw error;
    }
    return data;
  }
}

// ── Songs ──────────────────────────────────────────────────────────────────

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
      })
      .returning();
    return rows[0];
  } catch (error) {
    if (!isMissingUserIdColumnError(error)) {
      throw error;
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

    return { ...rows[0], userId: DEFAULT_QUERY_USER_ID } as SongRow;
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

    if (!isMissingPitchContourNotesColumnError(error)) {
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
          pitchContourNotes: s.pitchContourNotes ?? [],
        }))
      );
    } catch (error) {
      if (!isMissingPitchContourNotesColumnError(error)) {
        throw error;
      }

      await db().insert(segments).values(
        newSegments.map(({ pitchContourNotes: _pitchContourNotes, ...segment }) => ({
          ...segment,
          songId,
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
        pitchContourNotes: data.pitchContourNotes ?? [],
      })
      .returning();
    return rows[0];
  } catch (error) {
    if (!isMissingPitchContourNotesColumnError(error)) {
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
  const rows = await db()
    .select({
      id: practiceRatings.id,
      segmentId: practiceRatings.segmentId,
      rating: practiceRatings.rating,
      ratedAt: practiceRatings.ratedAt,
    })
    .from(practiceRatings)
    .innerJoin(segments, eq(practiceRatings.segmentId, segments.id))
    .innerJoin(songs, eq(segments.songId, songs.id))
    .where(and(eq(segments.songId, songId), eq(songs.userId, userId)))
    .orderBy(desc(practiceRatings.ratedAt));

  // Keep only the latest rating per segment.
  const latestBySegment: Record<string, PersistedSegmentRating> = {};
  for (const row of rows) {
    if (!latestBySegment[row.segmentId]) {
      latestBySegment[row.segmentId] = {
        id: row.id,
        segmentId: row.segmentId,
        rating: row.rating as PersistedMemoryRating,
        ratedAt: row.ratedAt.toISOString(),
      };
    }
  }

  return Object.values(latestBySegment).sort((a, b) => Date.parse(b.ratedAt) - Date.parse(a.ratedAt));
}

export async function getLatestRatingTimeBySongIds(
  songIds: string[],
  userId: string = DEFAULT_QUERY_USER_ID
): Promise<Record<string, Date>> {
  if (songIds.length === 0) {
    return {};
  }

  const rows = await db()
    .select({
      songId: segments.songId,
      ratedAt: practiceRatings.ratedAt,
    })
    .from(practiceRatings)
    .innerJoin(segments, eq(practiceRatings.segmentId, segments.id))
    .innerJoin(songs, eq(segments.songId, songs.id))
    .where(and(inArray(segments.songId, songIds), eq(songs.userId, userId)))
    .orderBy(desc(practiceRatings.ratedAt));

  const bySong: Record<string, Date> = {};
  for (const row of rows) {
    if (!bySong[row.songId]) {
      bySong[row.songId] = row.ratedAt;
    }
  }

  return bySong;
}

export async function getSongKnowledgeBySongIds(
  songIds: string[],
  userId: string = DEFAULT_QUERY_USER_ID
): Promise<Record<string, number>> {
  if (songIds.length === 0) {
    return {};
  }

  // Get all segments for these songs (including unrated)
  const allSegmentRows = await db()
    .select({
      songId: segments.songId,
      segmentId: segments.id,
    })
    .from(segments)
    .innerJoin(songs, eq(segments.songId, songs.id))
    .where(and(inArray(segments.songId, songIds), eq(songs.userId, userId)));

  const allSegmentsBySong: Record<string, Set<string>> = {};
  for (const row of allSegmentRows) {
    if (!allSegmentsBySong[row.songId]) {
      allSegmentsBySong[row.songId] = new Set();
    }
    allSegmentsBySong[row.songId].add(row.segmentId);
  }

  // Get ratings for segments in these songs
  const rows = await db()
    .select({
      songId: segments.songId,
      segmentId: segments.id,
      rating: practiceRatings.rating,
      ratedAt: practiceRatings.ratedAt,
    })
    .from(practiceRatings)
    .innerJoin(segments, eq(practiceRatings.segmentId, segments.id))
    .innerJoin(songs, eq(segments.songId, songs.id))
    .where(and(inArray(segments.songId, songIds), eq(songs.userId, userId)))
    .orderBy(desc(practiceRatings.ratedAt));

  const latestBySongSegment: Record<string, Record<string, number>> = {};

  for (const row of rows) {
    if (!latestBySongSegment[row.songId]) {
      latestBySongSegment[row.songId] = {};
    }
    if (latestBySongSegment[row.songId][row.segmentId] !== undefined) {
      continue;
    }
    latestBySongSegment[row.songId][row.segmentId] = row.rating;
  }

  const knowledgeBySong: Record<string, number> = {};
  for (const songId of songIds) {
    const segments = allSegmentsBySong[songId];
    if (!segments || segments.size === 0) {
      knowledgeBySong[songId] = 0;
      continue;
    }
    // Calculate average rating across ALL segments (including unrated as 0)
    const totalRating = Array.from(segments).reduce((sum, segmentId) => {
      return sum + (latestBySongSegment[songId]?.[segmentId] ?? 0);
    }, 0);
    const averageRating = totalRating / segments.size;
    knowledgeBySong[songId] = Math.round(averageRating * 20);
  }

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
  const segmentIds = uniqueRatings.map((rating) => rating.segmentId);

  let filteredRatings = uniqueRatings;
  if (songId) {
    const allowedSegments = await db()
      .select({ id: segments.id })
      .from(segments)
      .innerJoin(songs, eq(segments.songId, songs.id))
      .where(and(eq(segments.songId, songId), eq(songs.userId, userId), inArray(segments.id, segmentIds)));

    const allowedSegmentIds = new Set(allowedSegments.map((segment) => segment.id));
    filteredRatings = uniqueRatings.filter((rating) => allowedSegmentIds.has(rating.segmentId));
  }

  if (filteredRatings.length === 0) {
    return;
  }

  await db()
    .delete(practiceRatings)
    .where(inArray(practiceRatings.segmentId, filteredRatings.map((rating) => rating.segmentId)));

  await db()
    .insert(practiceRatings)
    .values(
      filteredRatings.map((rating) => ({
        id: crypto.randomUUID(),
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
  const songSegments = await db()
    .select({ id: segments.id })
    .from(segments)
    .innerJoin(songs, eq(segments.songId, songs.id))
    .where(and(eq(segments.songId, songId), eq(songs.userId, userId)));

  if (songSegments.length === 0) {
    return;
  }

  await db()
    .delete(practiceRatings)
    .where(inArray(practiceRatings.segmentId, songSegments.map((segment) => segment.id)));
}

// ── Tap Practice ─────────────────────────────────────────────────────────

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
          "cleanup_settings" jsonb NOT NULL DEFAULT '{"shortNoteThresholdMs":100,"simultaneousThresholdMs":30}'::jsonb,
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
  return {
    id: row.id,
    name: row.name,
    eventDate: row.eventDate ?? undefined,
    isRetired: row.isRetired,
    createdAt: toIso(row.createdAt),
    songCount,
  };
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
    if (!isMissingUserIdColumnError(error)) {
      throw error;
    }

    const legacyBaseQuery = db()
      .select({
        id: playlists.id,
        name: playlists.name,
        eventDate: playlists.eventDate,
        isRetired: playlists.isRetired,
        createdAt: playlists.createdAt,
      })
      .from(playlists)
      .orderBy(desc(playlists.createdAt));

    const legacyRows = includeRetired
      ? await legacyBaseQuery
      : await legacyBaseQuery.where(eq(playlists.isRetired, false));

    rows = legacyRows.map((row) => ({ ...row, userId: DEFAULT_QUERY_USER_ID } as PlaylistRow));
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

  return rows.map((row) => mapPlaylistSummary(row, countMap[row.id] ?? 0));
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
    if (!isMissingUserIdColumnError(error)) {
      throw error;
    }

    const legacyPlaylistRows = await db()
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

    playlistRows = legacyPlaylistRows.map((row) => ({ ...row, userId: DEFAULT_QUERY_USER_ID } as PlaylistRow));
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
        const hasMidiContour = (song.pitchContourNotes?.length ?? 0) > 0 || (source?.cleanedNoteCount ?? 0) > 0;
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
    pitchContourNotes: songRow.pitchContourNotes ?? [],
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

async function getRatingCountBySongIds(
  songIds: string[],
  userId: string = DEFAULT_QUERY_USER_ID
): Promise<Record<string, number>> {
  if (songIds.length === 0) {
    return {};
  }

  const rows = await db()
    .select({
      songId: segments.songId,
      segmentId: segments.id,
      ratedAt: practiceRatings.ratedAt,
    })
    .from(practiceRatings)
    .innerJoin(segments, eq(practiceRatings.segmentId, segments.id))
    .innerJoin(songs, eq(segments.songId, songs.id))
    .where(and(inArray(segments.songId, songIds), eq(songs.userId, userId)))
    .orderBy(desc(practiceRatings.ratedAt));

  const bySong: Record<string, number> = {};
  const seenBySong = new Map<string, Set<string>>();

  for (const row of rows) {
    const seenSegments = seenBySong.get(row.songId) ?? new Set<string>();
    if (!seenBySong.has(row.songId)) {
      seenBySong.set(row.songId, seenSegments);
    }

    if (seenSegments.has(row.segmentId)) {
      continue;
    }

    seenSegments.add(row.segmentId);
    bySong[row.songId] = (bySong[row.songId] ?? 0) + 1;
  }

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
  const updates: Partial<Pick<PlaylistRow, "name" | "eventDate" | "isRetired">> = {};
  if (data.name !== undefined) updates.name = data.name;
  if (data.eventDate !== undefined) updates.eventDate = data.eventDate;
  if (data.isRetired !== undefined) updates.isRetired = data.isRetired;

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
