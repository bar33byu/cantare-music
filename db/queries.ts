import { eq, asc, desc, inArray, and, count, lte, sql, isNull, ne, or } from "drizzle-orm";
import { db } from "./index";
import { songs, segments, practiceRatings, playlists, playlistSongs, orphanedAudioKeys, draftRecordings, users, magicLinkTokens, userSessions, auditLogs, tapPracticeSessions, tapPracticeTaps, songPracticeSessions, midiSources, midiAlignments, vocalExercises, vocalExerciseCollections, vocalExerciseCollectionItems, vocalExercisePracticeSessions, userVocalRanges } from "./schema";
import type { SongRow, SegmentRow, PlaylistRow, OrphanedAudioKeyRow, DraftRecordingRow, TapPracticeSessionRow, SongPracticeSessionRow, MidiSourceRow, MidiAlignmentRow, RawMidiNoteData, CleanedMidiNoteData, MidiCleanupSettingsData, UserRow, MagicLinkTokenRow, UserSessionRow, AuditLogRow, VocalExerciseEventData, VocalExerciseRow, VocalExercisePracticeSessionRow } from "./schema";
import { getPublicUrl } from "../lib/r2";
import type { PracticeInputMethod, SelfRating, TapAudioVersion, TapDirection, TapPracticeMode, TapScoreResult } from "../app/lib/enhancedTapPractice";
import type { MidiAlignment } from "../app/lib/midiGuidedTapPractice";

const DEFAULT_QUERY_USER_ID = "default";

async function ensureMigratedSchema(): Promise<void> {
  // Schema is managed by Drizzle migrations. Request handlers must not run DDL.
}

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

function normalizeImportedNameKey(name: string): string {
  return name.trim().toLowerCase();
}

function getNextImportedCopyName(baseName: string, existingNames: string[]): string {
  const fallbackBaseName = baseName.trim() || "Imported copy";
  const existingNameKeys = new Set(existingNames.map(normalizeImportedNameKey));

  if (!existingNameKeys.has(normalizeImportedNameKey(fallbackBaseName))) {
    return fallbackBaseName;
  }

  let copyNumber = 2;
  while (existingNameKeys.has(normalizeImportedNameKey(`${fallbackBaseName} (import ${copyNumber})`))) {
    copyNumber += 1;
  }

  return `${fallbackBaseName} (import ${copyNumber})`;
}

export function getImportedPlaylistName(sourceName: string, existingNames: string[]): string {
  return getNextImportedCopyName(sourceName, existingNames);
}

export const PLAYLIST_PERFORMANCE_STATUSES = ["Performed", "Recorded", "Absent", "Sick", "Canceled"] as const;
export type PlaylistPerformanceStatus = typeof PLAYLIST_PERFORMANCE_STATUSES[number];

function normalizePlaylistPerformanceStatus(value: unknown): PlaylistPerformanceStatus | null {
  return PLAYLIST_PERFORMANCE_STATUSES.find((status) => status === value) ?? null;
}

function getNextDuplicatedPlaylistName(baseName: string, existingNames: string[]): string {
  const fallbackBaseName = baseName.trim() || "Playlist";
  const existingNameKeys = new Set(existingNames.map(normalizeImportedNameKey));
  let copyNumber = 2;
  let candidate = `${fallbackBaseName} (copy)`;
  while (existingNameKeys.has(normalizeImportedNameKey(candidate))) {
    candidate = `${fallbackBaseName} (copy ${copyNumber})`;
    copyNumber += 1;
  }
  return candidate;
}

const MONTH_NAME_TO_NUMBER: Record<string, number> = {
  jan: 1,
  january: 1,
  feb: 2,
  february: 2,
  mar: 3,
  march: 3,
  apr: 4,
  april: 4,
  may: 5,
  jun: 6,
  june: 6,
  jul: 7,
  july: 7,
  aug: 8,
  august: 8,
  sep: 9,
  sept: 9,
  september: 9,
  oct: 10,
  october: 10,
  nov: 11,
  november: 11,
  dec: 12,
  december: 12,
};

function toValidDateKey(year: number, month: number, day: number): string | null {
  if (year < 1900 || year > 2100 || month < 1 || month > 12 || day < 1 || day > 31) {
    return null;
  }
  const value = new Date(Date.UTC(year, month - 1, day));
  if (value.getUTCFullYear() !== year || value.getUTCMonth() !== month - 1 || value.getUTCDate() !== day) {
    return null;
  }
  return `${year.toString().padStart(4, "0")}-${month.toString().padStart(2, "0")}-${day.toString().padStart(2, "0")}`;
}

export function extractPlaylistEventDateFromName(name: string): string | null {
  const trimmed = name.trim();
  const isoMatch = trimmed.match(/\b(20\d{2}|19\d{2})[-/.](\d{1,2})[-/.](\d{1,2})\b/);
  if (isoMatch) {
    return toValidDateKey(Number(isoMatch[1]), Number(isoMatch[2]), Number(isoMatch[3]));
  }

  const usNumericMatch = trimmed.match(/\b(\d{1,2})[-/.](\d{1,2})[-/.](20\d{2}|19\d{2})\b/);
  if (usNumericMatch) {
    return toValidDateKey(Number(usNumericMatch[3]), Number(usNumericMatch[1]), Number(usNumericMatch[2]));
  }

  const monthNamePattern = "(jan(?:uary)?|feb(?:ruary)?|mar(?:ch)?|apr(?:il)?|may|jun(?:e)?|jul(?:y)?|aug(?:ust)?|sep(?:t|tember)?|oct(?:ober)?|nov(?:ember)?|dec(?:ember)?)";
  const monthFirstMatch = trimmed.match(new RegExp(`\\b${monthNamePattern}\\.?\\s+(\\d{1,2})(?:st|nd|rd|th)?[,]?\\s+(20\\d{2}|19\\d{2})\\b`, "i"));
  if (monthFirstMatch) {
    return toValidDateKey(Number(monthFirstMatch[3]), MONTH_NAME_TO_NUMBER[monthFirstMatch[1].toLowerCase()], Number(monthFirstMatch[2]));
  }

  const dayFirstMatch = trimmed.match(new RegExp(`\\b(\\d{1,2})(?:st|nd|rd|th)?\\s+${monthNamePattern}\\.?[,]?\\s+(20\\d{2}|19\\d{2})\\b`, "i"));
  if (dayFirstMatch) {
    return toValidDateKey(Number(dayFirstMatch[3]), MONTH_NAME_TO_NUMBER[dayFirstMatch[2].toLowerCase()], Number(dayFirstMatch[1]));
  }

  return null;
}

export function getImportedSongTitle(sourceTitle: string, playlistName: string, existingTitles: string[]): string {
  const leadingNumber = getLeadingTitleNumber(sourceTitle);
  const trimmedPlaylistName = playlistName.trim() || "imported playlist";
  if (!leadingNumber) {
    return getNextImportedCopyName(sourceTitle, existingTitles);
  }

  const hasNumberCollision = existingTitles.some((title) => getLeadingTitleNumber(title) === leadingNumber);
  if (!hasNumberCollision) {
    return getNextImportedCopyName(sourceTitle, existingTitles);
  }

  const suffix = ` (from ${trimmedPlaylistName})`;
  const contextualTitle = sourceTitle.endsWith(suffix) ? sourceTitle : `${sourceTitle}${suffix}`;
  return getNextImportedCopyName(contextualTitle, existingTitles);
}

export type AuditEventType =
  | "impersonation.started"
  | "impersonation.stopped"
  | "impersonation.action"
  | "user.email_changed"
  | "user.username_changed"
  | "user.account_deletion_scheduled"
  | "user.account_deletion_canceled"
  | "user.account_purged"
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
  inputMethod?: PracticeInputMethod;
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
  inputMethod?: PracticeInputMethod;
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

export interface PersistedVocalExercise {
  id: string;
  slug?: string;
  title: string;
  category?: string;
  syllable?: string;
  description?: string;
  difficulty?: string;
  pattern?: string;
  coachingNotes?: string[];
  audioKey?: string;
  audioUrl?: string;
  lyricHint?: string;
  collectionSlug?: string;
  collectionTitle?: string;
  routinePosition?: number;
  sourceMidiFile: string;
  exerciseStartBeat: number;
  tempoBpm: number;
  timeSignature: { numerator: number; denominator: number };
  durationBeats: number;
  events: VocalExerciseEventData[];
  createdAt: string;
}

export interface PersistedVocalExerciseCollection {
  slug: string;
  title: string;
  description?: string;
  intendedSinger?: string;
  primaryGoals: string[];
  restBetweenIterationsMeasures: number;
  transposeMode: string;
}

export interface PersistedVocalRange {
  low: number;
  high: number;
}

export interface PersistedVocalExercisePracticeSession {
  id: string;
  userId: string;
  exerciseId: string;
  exerciseTitle?: string;
  startedAt: string;
  completedAt?: string | null;
  durationSeconds: number;
  tempoPercent: number;
  repetitionCount: number;
}

export interface PersistedSongPracticeSession {
  id: string;
  userId: string;
  songId: string;
  songTitle?: string;
  segmentId?: string | null;
  source: string;
  startedAt: string;
  completedAt?: string | null;
  durationSeconds: number;
}

export interface StatsBucket {
  label: string;
  seconds: number;
  sessionCount: number;
}

export interface PracticeStatsSummary {
  userId: string;
  generatedAt: string;
  songs: {
    total: number;
    masteredAbove80: number;
    practicedInRange: number;
    untouchedOverSixMonths: number;
    neverPracticed: number;
    averageMasteryPercent: number;
    untouchedSongs: Array<{ id: string; title: string; artist?: string | null; lastPracticedAt: string | null; masteryPercent: number }>;
    stalestSong?: { id: string; title: string; lastPracticedAt: string | null; masteryPercent: number };
  };
  songPractice: {
    totalSessions: number;
    totalSeconds: number;
    practicedDays: number;
    averageSecondsPerPracticedDay: number;
    averageSecondsPerSession: number;
    daily: StatsBucket[];
    weekly: StatsBucket[];
    monthly: StatsBucket[];
    weekday: StatsBucket[];
    recentSessions: PersistedSongPracticeSession[];
  };
  exercises: {
    totalSessions: number;
    totalSeconds: number;
    practicedDays: number;
    averageSecondsPerPracticedDay: number;
    averageSecondsPerSession: number;
    daily: StatsBucket[];
    weekly: StatsBucket[];
    monthly: StatsBucket[];
    weekday: StatsBucket[];
    recentSessions: PersistedVocalExercisePracticeSession[];
  };
  playlists: {
    totalPlaylists: number;
    performedPlaylists: number;
    songsInAnyPlaylist: number;
    songsNotInAnyPlaylist: number;
    totalSongPlacements: number;
    averagePlacementsPerSong: number;
    averagePlacementsPerPlaylist: number;
    mostIncludedSongs: Array<{ id: string; title: string; playlistCount: number; playlistNames: string[] }>;
    mostPerformedSongs: Array<{ id: string; title: string; performanceCount: number; performanceDates: string[] }>;
  };
}

export type PracticeStatsRange = 30 | 90 | "all";

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
  sourceSongId?: string | null;
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
  performanceStatus?: PlaylistPerformanceStatus | null;
  isRetired: boolean;
  isPublic?: boolean;
  publishedAt?: string | null;
  shareToken?: string | null;
  sharedAt?: string | null;
  shareAudioMode?: PlaylistShareAudioMode;
  publicShareAudioMode?: PlaylistShareAudioMode;
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
  performanceStatus?: PlaylistPerformanceStatus | null;
  isRetired: boolean;
  isPublic?: boolean;
  publishedAt?: string | null;
  shareToken?: string | null;
  sharedAt?: string | null;
  shareAudioMode?: PlaylistShareAudioMode;
  publicShareAudioMode?: PlaylistShareAudioMode;
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

  const profileColumns = [
    "username",
    "email",
    "avatar_url",
    "profile_visibility",
    "updated_at",
    "account_deletion_requested_at",
    "account_deletion_scheduled_for",
  ];
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

  const columns = ["share_token", "shared_at", "share_audio_mode", "public_share_audio_mode", "source_playlist_id", "source_owner_id", "source_share_token", "imported_at", "is_public", "published_at", "performance_status"];
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

function isMissingVocalExercisePracticeSessionTableError(error: unknown): boolean {
  if (!(error instanceof Error)) {
    return false;
  }

  const message = error.message.toLowerCase();
  if (message.includes("vocal_exercise_practice_sessions") && message.includes("does not exist")) {
    return true;
  }

  const cause = (error as Error & { cause?: unknown }).cause;
  if (cause && typeof cause === "object") {
    const causeRecord = cause as Record<string, unknown>;
    const causeMessage = typeof causeRecord.message === "string" ? causeRecord.message.toLowerCase() : "";
    const causeCode = typeof causeRecord.code === "string" ? causeRecord.code : "";
    if (causeCode === "42P01" && causeMessage.includes("vocal_exercise_practice_sessions")) {
      return true;
    }
    if (causeMessage.includes("vocal_exercise_practice_sessions") && causeMessage.includes("does not exist")) {
      return true;
    }
  }

  return false;
}

function isMissingSongPracticeSessionTableError(error: unknown): boolean {
  if (!(error instanceof Error)) {
    return false;
  }

  const message = error.message.toLowerCase();
  if (message.includes("song_practice_sessions") && message.includes("does not exist")) {
    return true;
  }

  const cause = (error as Error & { cause?: unknown }).cause;
  if (cause && typeof cause === "object") {
    const causeRecord = cause as Record<string, unknown>;
    const causeMessage = typeof causeRecord.message === "string" ? causeRecord.message.toLowerCase() : "";
    const causeCode = typeof causeRecord.code === "string" ? causeRecord.code : "";
    if (causeCode === "42P01" && causeMessage.includes("song_practice_sessions")) {
      return true;
    }
    if (causeMessage.includes("song_practice_sessions") && causeMessage.includes("does not exist")) {
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
    "input_method",
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
  await ensureMigratedSchema();
}

async function ensureDraftRecordingTables(): Promise<void> {
  await ensureMigratedSchema();
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
  accountDeletionRequestedAt?: string | null;
  accountDeletionScheduledFor?: string | null;
}

type LegacyUserRow = Pick<UserRow, "id" | "username" | "name" | "email" | "avatarUrl" | "profileVisibility">;

function fallbackUsername(id: string, name: string): string {
  const base = (name || id).trim().toLowerCase().replace(/[^a-z0-9_-]/g, "-").replace(/^-+|-+$/g, "").slice(0, 32);
  return base || "default";
}

function mapLegacyUserRow(row: LegacyUserRow): PublicUser {
  return {
    id: row.id,
    username: row.username,
    name: row.name,
    email: row.email,
    avatarUrl: row.avatarUrl,
    profileVisibility: row.profileVisibility,
    accountDeletionRequestedAt: null,
    accountDeletionScheduledFor: null,
  };
}

function mapUserRow(
  row: Pick<UserRow, "id" | "username" | "name" | "email" | "avatarUrl" | "profileVisibility" | "accountDeletionRequestedAt" | "accountDeletionScheduledFor">
): PublicUser {
  return {
    id: row.id,
    username: row.username,
    name: row.name,
    email: row.email,
    avatarUrl: row.avatarUrl,
    profileVisibility: row.profileVisibility,
    accountDeletionRequestedAt: row.accountDeletionRequestedAt ? row.accountDeletionRequestedAt.toISOString() : null,
    accountDeletionScheduledFor: row.accountDeletionScheduledFor ? row.accountDeletionScheduledFor.toISOString() : null,
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
        accountDeletionRequestedAt: users.accountDeletionRequestedAt,
        accountDeletionScheduledFor: users.accountDeletionScheduledFor,
      })
      .from(users)
      .orderBy(asc(users.name));
    if (rows.length === 0) {
      return [{
        id: DEFAULT_QUERY_USER_ID,
        username: "default",
        name: "Default User",
        email: "",
        avatarUrl: null,
        profileVisibility: "private",
        accountDeletionRequestedAt: null,
        accountDeletionScheduledFor: null,
      }];
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
          : [{
              id: DEFAULT_QUERY_USER_ID,
              username: "default",
              name: "Default User",
              email: "",
              avatarUrl: null,
              profileVisibility: "private",
              accountDeletionRequestedAt: null,
              accountDeletionScheduledFor: null,
            }];
      }
      throw error;
    }
    return [{
      id: DEFAULT_QUERY_USER_ID,
      username: "default",
      name: "Default User",
      email: "",
      avatarUrl: null,
      profileVisibility: "private",
      accountDeletionRequestedAt: null,
      accountDeletionScheduledFor: null,
    }];
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
        accountDeletionRequestedAt: users.accountDeletionRequestedAt,
        accountDeletionScheduledFor: users.accountDeletionScheduledFor,
      })
      .from(users)
      .where(eq(users.id, id))
      .limit(1);
    return rows[0] ? mapUserRow(rows[0]) : null;
  } catch (error) {
    if (isMissingUsersTableError(error)) {
      return id === DEFAULT_QUERY_USER_ID
        ? {
            id: DEFAULT_QUERY_USER_ID,
            username: "default",
            name: "Default User",
            email: "",
            avatarUrl: null,
            profileVisibility: "private",
            accountDeletionRequestedAt: null,
            accountDeletionScheduledFor: null,
          }
        : null;
    }
    if (isMissingUserProfileColumnError(error)) {
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
      return rows[0] ? mapLegacyUserRow(rows[0]) : null;
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
        accountDeletionRequestedAt: users.accountDeletionRequestedAt,
        accountDeletionScheduledFor: users.accountDeletionScheduledFor,
      })
      .from(users)
      .where(eq(users.email, normalizedEmail))
      .limit(1);
    return rows[0] ? mapUserRow(rows[0]) : null;
  } catch (error) {
    if (isMissingUsersTableError(error)) {
      return null;
    }
    if (isMissingUserProfileColumnError(error)) {
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
      return rows[0] ? mapLegacyUserRow(rows[0]) : null;
    }
    throw error;
  }
}

export async function updateUserProfile(
  id: string,
  data: {
    username?: string;
    name?: string;
    avatarUrl?: string | null;
    profileVisibility?: string;
  }
): Promise<PublicUser | null> {
  const updates: Partial<Pick<UserRow, "username" | "name" | "avatarUrl" | "profileVisibility" | "updatedAt">> = {
    updatedAt: new Date(),
  };
  if (data.username !== undefined) updates.username = data.username;
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
        accountDeletionRequestedAt: users.accountDeletionRequestedAt,
        accountDeletionScheduledFor: users.accountDeletionScheduledFor,
      });
    return rows[0] ? mapUserRow(rows[0]) : null;
  } catch (error) {
    if (isMissingUsersTableError(error)) {
      return null;
    }
    if (isMissingUserProfileColumnError(error)) {
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
      return rows[0] ? mapLegacyUserRow(rows[0]) : null;
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
        accountDeletionRequestedAt: users.accountDeletionRequestedAt,
        accountDeletionScheduledFor: users.accountDeletionScheduledFor,
      });
    return rows[0]
      ? mapUserRow(rows[0])
      : { ...values, avatarUrl: values.avatarUrl, accountDeletionRequestedAt: null, accountDeletionScheduledFor: null };
  } catch (error) {
    if (isMissingUserProfileColumnError(error)) {
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
      const row = rows[0] ?? values;
      return mapLegacyUserRow(row);
    }
    if (!isMissingUsersTableError(error)) {
      throw error;
    }
    return { ...values, avatarUrl: values.avatarUrl, accountDeletionRequestedAt: null, accountDeletionScheduledFor: null };
  }
}

// ── Songs ──────────────────────────────────────────────────────────────────

export async function getOrCreateUserForEmail(email: string): Promise<PublicUser> {
  const result = await getOrCreateUserForEmailWithStatus(email);
  return result.user;
}

export interface PlaylistRefreshCandidate {
  sourceSongId: string;
  currentSongId?: string | null;
  title: string;
  artist?: string;
  position: number;
  status: "new" | "refreshable";
  segmentCount: number;
  hasPartAudio: boolean;
  hasBlendAudio: boolean;
}

export interface PlaylistRefreshPreview {
  sourcePlaylist: {
    id: string;
    name: string;
    owner: SharedPlaylistDetail["owner"];
  };
  candidates: PlaylistRefreshCandidate[];
}

export interface RefreshImportedPlaylistResult {
  importedCount: number;
  playlist: PlaylistDetail;
}

export async function getOrCreateUserForEmailWithStatus(email: string): Promise<{ user: PublicUser; created: boolean }> {
  const normalizedEmail = normalizeEmail(email);
  const existing = await getUserByEmail(normalizedEmail);
  if (existing) {
    return { user: existing, created: false };
  }

  const baseUsername = usernameFromEmail(normalizedEmail);
  for (let attempt = 0; attempt < 6; attempt += 1) {
    const username = attempt === 0 ? baseUsername : `${baseUsername}-${attempt + 1}`;
    try {
      const user = await upsertUser({
        id: crypto.randomUUID(),
        username,
        name: normalizedEmail.split("@")[0] || "Cantare Singer",
        email: normalizedEmail,
        profileVisibility: "private",
      });
      return { user, created: true };
    } catch (error) {
      const message = error instanceof Error ? error.message.toLowerCase() : "";
      if (message.includes("users_username_unique") || message.includes("users_email_unique")) {
        const racedUser = await getUserByEmail(normalizedEmail);
        if (racedUser) {
          return { user: racedUser, created: false };
        }
        continue;
      }
      throw error;
    }
  }

  const user = await upsertUser({
    id: crypto.randomUUID(),
    username: `${baseUsername}-${Math.random().toString(36).slice(2, 8)}`,
    name: normalizedEmail.split("@")[0] || "Cantare Singer",
    email: normalizedEmail,
    profileVisibility: "private",
  });
  return { user, created: true };
}

export interface UserAccountDeletionStatus {
  requestedAt: string | null;
  scheduledFor: string | null;
}

async function ensureUserAccountDeletionColumns(): Promise<void> {
  await ensureMigratedSchema();
}

export async function getUserAccountDeletionStatus(userId: string): Promise<UserAccountDeletionStatus | null> {
  await ensureUserAccountDeletionColumns();

  const rows = await db()
    .select({
      requestedAt: users.accountDeletionRequestedAt,
      scheduledFor: users.accountDeletionScheduledFor,
    })
    .from(users)
    .where(eq(users.id, userId))
    .limit(1);

  const row = rows[0];
  if (!row) {
    return null;
  }

  return {
    requestedAt: row.requestedAt ? row.requestedAt.toISOString() : null,
    scheduledFor: row.scheduledFor ? row.scheduledFor.toISOString() : null,
  };
}

export async function scheduleUserAccountDeletion(
  userId: string,
  requestedAt: Date,
  scheduledFor: Date
): Promise<UserAccountDeletionStatus | null> {
  await ensureUserAccountDeletionColumns();

  const rows = await db()
    .update(users)
    .set({
      accountDeletionRequestedAt: requestedAt,
      accountDeletionScheduledFor: scheduledFor,
      updatedAt: requestedAt,
    })
    .where(eq(users.id, userId))
    .returning({
      requestedAt: users.accountDeletionRequestedAt,
      scheduledFor: users.accountDeletionScheduledFor,
    });

  const row = rows[0];
  if (!row) {
    return null;
  }

  return {
    requestedAt: row.requestedAt ? row.requestedAt.toISOString() : null,
    scheduledFor: row.scheduledFor ? row.scheduledFor.toISOString() : null,
  };
}

export async function cancelUserAccountDeletion(userId: string): Promise<UserAccountDeletionStatus | null> {
  await ensureUserAccountDeletionColumns();

  const rows = await db()
    .update(users)
    .set({
      accountDeletionRequestedAt: null,
      accountDeletionScheduledFor: null,
      updatedAt: new Date(),
    })
    .where(eq(users.id, userId))
    .returning({
      requestedAt: users.accountDeletionRequestedAt,
      scheduledFor: users.accountDeletionScheduledFor,
    });

  const row = rows[0];
  if (!row) {
    return null;
  }

  return {
    requestedAt: row.requestedAt ? row.requestedAt.toISOString() : null,
    scheduledFor: row.scheduledFor ? row.scheduledFor.toISOString() : null,
  };
}

export async function getUsersPendingAccountDeletion(before: Date = new Date()): Promise<PublicUser[]> {
  await ensureUserAccountDeletionColumns();

  const rows = await db()
    .select({
      id: users.id,
      username: users.username,
      name: users.name,
      email: users.email,
      avatarUrl: users.avatarUrl,
      profileVisibility: users.profileVisibility,
      accountDeletionRequestedAt: users.accountDeletionRequestedAt,
      accountDeletionScheduledFor: users.accountDeletionScheduledFor,
    })
    .from(users)
    .where(lte(users.accountDeletionScheduledFor, before))
    .orderBy(asc(users.accountDeletionScheduledFor));

  return rows.map(mapUserRow);
}

export interface UserStorageKeys {
  songAudioKeys: string[];
  draftAudioKeys: string[];
  midiStorageKeys: string[];
  orphanedAudioKeys: string[];
}

export async function getUserStorageKeys(userId: string): Promise<UserStorageKeys> {
  const [songRows, draftRows, midiRows, orphanedRows] = await Promise.all([
    db()
      .select({ audioKey: songs.audioKey, alternateAudioKey: songs.alternateAudioKey })
      .from(songs)
      .where(eq(songs.userId, userId)),
    db()
      .select({ audioKey: draftRecordings.audioKey })
      .from(draftRecordings)
      .where(eq(draftRecordings.userId, userId)),
    db()
      .select({ storageKey: midiSources.storageKey })
      .from(midiSources)
      .innerJoin(songs, eq(midiSources.songId, songs.id))
      .where(eq(songs.userId, userId)),
    db()
      .select({ audioKey: orphanedAudioKeys.audioKey })
      .from(orphanedAudioKeys)
      .where(eq(orphanedAudioKeys.userId, userId)),
  ]);

  return {
    songAudioKeys: songRows.flatMap((row) => [row.audioKey, row.alternateAudioKey].filter((value): value is string => Boolean(value))),
    draftAudioKeys: draftRows.map((row) => row.audioKey).filter((value): value is string => Boolean(value)),
    midiStorageKeys: midiRows.map((row) => row.storageKey).filter((value): value is string => Boolean(value)),
    orphanedAudioKeys: orphanedRows.map((row) => row.audioKey).filter((value): value is string => Boolean(value)),
  };
}

export async function getSongStorageKeys(songId: string, userId: string = DEFAULT_QUERY_USER_ID): Promise<string[]> {
  const [songRows, draftRows, midiRows] = await Promise.all([
    db()
      .select({ audioKey: songs.audioKey, alternateAudioKey: songs.alternateAudioKey })
      .from(songs)
      .where(and(eq(songs.id, songId), eq(songs.userId, userId)))
      .limit(1),
    db()
      .select({ audioKey: draftRecordings.audioKey })
      .from(draftRecordings)
      .innerJoin(songs, eq(draftRecordings.songId, songs.id))
      .where(and(eq(draftRecordings.songId, songId), eq(songs.userId, userId))),
    db()
      .select({ storageKey: midiSources.storageKey })
      .from(midiSources)
      .innerJoin(songs, eq(midiSources.songId, songs.id))
      .where(and(eq(midiSources.songId, songId), eq(songs.userId, userId))),
  ]);

  const song = songRows[0];
  if (!song) {
    return [];
  }

  return [
    ...[song.audioKey, song.alternateAudioKey].filter((value): value is string => Boolean(value)),
    ...draftRows.map((row) => row.audioKey).filter((value): value is string => Boolean(value)),
    ...midiRows.map((row) => row.storageKey).filter((value): value is string => Boolean(value)),
  ];
}

export async function isStorageKeyReferenced(
  storageKey: string,
  exclusions: { songId?: string; userId?: string } = {}
): Promise<boolean> {
  const songConditions = [
    or(eq(songs.audioKey, storageKey), eq(songs.alternateAudioKey, storageKey)),
    exclusions.songId ? ne(songs.id, exclusions.songId) : undefined,
    exclusions.userId ? ne(songs.userId, exclusions.userId) : undefined,
  ].filter(Boolean);
  const draftConditions = [
    eq(draftRecordings.audioKey, storageKey),
    exclusions.songId ? ne(draftRecordings.songId, exclusions.songId) : undefined,
    exclusions.userId ? ne(draftRecordings.userId, exclusions.userId) : undefined,
  ].filter(Boolean);
  const midiConditions = [
    eq(midiSources.storageKey, storageKey),
    exclusions.songId ? ne(midiSources.songId, exclusions.songId) : undefined,
    exclusions.userId ? ne(songs.userId, exclusions.userId) : undefined,
  ].filter(Boolean);

  const [songRows, draftRows, midiRows] = await Promise.all([
    db().select({ id: songs.id }).from(songs).where(and(...songConditions)).limit(1),
    db().select({ id: draftRecordings.id }).from(draftRecordings).where(and(...draftConditions)).limit(1),
    db()
      .select({ id: midiSources.id })
      .from(midiSources)
      .innerJoin(songs, eq(midiSources.songId, songs.id))
      .where(and(...midiConditions))
      .limit(1),
  ]);

  return songRows.length > 0 || draftRows.length > 0 || midiRows.length > 0;
}

export async function purgeUserAccountData(userId: string): Promise<boolean> {
  await ensureUserAccountDeletionColumns();
  const user = await getUserById(userId);
  if (!user) {
    return false;
  }

  await db().delete(playlists).where(eq(playlists.userId, userId));
  await db().delete(draftRecordings).where(eq(draftRecordings.userId, userId));
  await db().delete(practiceRatings).where(eq(practiceRatings.userId, userId));
  await db().delete(tapPracticeSessions).where(eq(tapPracticeSessions.userId, userId));
  await db().delete(songs).where(eq(songs.userId, userId));
  await db().delete(orphanedAudioKeys).where(eq(orphanedAudioKeys.userId, userId));

  if (user.email.trim()) {
    await db().delete(magicLinkTokens).where(eq(magicLinkTokens.email, user.email.trim().toLowerCase()));
  }

  const deletedUsers = await db().delete(users).where(eq(users.id, userId)).returning({ id: users.id });
  return deletedUsers.length > 0;
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
    if (isMissingAuthTableError(error) || isMissingUsersTableError(error)) {
      return null;
    }
    if (isMissingUserProfileColumnError(error)) {
      const rows = await db()
        .select({
          user: {
            id: users.id,
            username: users.username,
            name: users.name,
            email: users.email,
            avatarUrl: users.avatarUrl,
            profileVisibility: users.profileVisibility,
          },
        })
        .from(userSessions)
        .innerJoin(users, eq(userSessions.userId, users.id))
        .where(and(eq(userSessions.tokenHash, tokenHash), sql`${userSessions.revokedAt} IS NULL`, sql`${userSessions.expiresAt} > ${now}`))
        .limit(1);
      return rows[0] ? mapLegacyUserRow(rows[0].user) : null;
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
      const legacyUpdates = { ...updates };
      delete legacyUpdates.alternateAudioKey;
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

    const legacyUpdates = { ...updates };
    delete legacyUpdates.pitchContourNotes;
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
        newSegments.map((segment) => {
          const legacySegment = { ...segment };
          delete legacySegment.pitchContourNotes;
          return {
            ...legacySegment,
            songId,
            ...(includeSourceSegmentId ? { sourceSegmentId: segment.id } : {}),
          };
        })
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

    const legacyData = { ...data };
    delete legacyData.pitchContourNotes;
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

    const legacyUpdates = { ...updates };
    delete legacyUpdates.pitchContourNotes;
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
    if (!isMissingUserIdColumnError(error) && !isMissingPlaylistSharingColumnError(error)) {
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
  const uniqueSongIds = Array.from(new Set(songIds));
  const bySong: Record<string, Date> = {};
  if (uniqueSongIds.length === 0) {
    return bySong;
  }

  const rows = await db()
    .select({
      songId: segments.songId,
      ratedAt: practiceRatings.ratedAt,
    })
    .from(practiceRatings)
    .innerJoin(segments, eq(practiceRatings.segmentId, segments.id))
    .innerJoin(songs, eq(segments.songId, songs.id))
    .where(and(eq(practiceRatings.userId, userId), eq(songs.userId, userId), inArray(segments.songId, uniqueSongIds)))
    .orderBy(desc(practiceRatings.ratedAt));

  for (const row of rows) {
    if (!bySong[row.songId]) {
      bySong[row.songId] = new Date(row.ratedAt);
    }
  }

  return bySong;
}

async function getLatestRatingsBySegmentIds(
  segmentIds: string[],
  userId: string = DEFAULT_QUERY_USER_ID
): Promise<Map<string, PersistedMemoryRating>> {
  const latestBySegment = new Map<string, PersistedMemoryRating>();
  const uniqueSegmentIds = Array.from(new Set(segmentIds));
  if (uniqueSegmentIds.length === 0) {
    return latestBySegment;
  }

  const rows = await db()
    .select({
      segmentId: practiceRatings.segmentId,
      rating: practiceRatings.rating,
    })
    .from(practiceRatings)
    .where(and(eq(practiceRatings.userId, userId), inArray(practiceRatings.segmentId, uniqueSegmentIds)))
    .orderBy(desc(practiceRatings.ratedAt));

  for (const row of rows) {
    if (!latestBySegment.has(row.segmentId)) {
      latestBySegment.set(row.segmentId, row.rating as PersistedMemoryRating);
    }
  }

  return latestBySegment;
}

export async function getSongKnowledgeBySongIds(
  songIds: string[],
  userId: string = DEFAULT_QUERY_USER_ID
): Promise<Record<string, number>> {
  const uniqueSongIds = Array.from(new Set(songIds));
  const knowledgeBySong: Record<string, number> = {};
  if (uniqueSongIds.length === 0) {
    return knowledgeBySong;
  }

  const segmentsBySong = await getSegmentsBySongIds(uniqueSongIds);
  const allSegmentIds = uniqueSongIds.flatMap((songId) => (segmentsBySong[songId] ?? []).map((segment) => segment.id));
  const latestRatings = await getLatestRatingsBySegmentIds(allSegmentIds, userId);

  for (const songId of uniqueSongIds) {
    const songSegments = segmentsBySong[songId] ?? [];
    if (songSegments.length === 0) {
      knowledgeBySong[songId] = 0;
      continue;
    }
    const totalRating = songSegments.reduce((sum, segment) => {
      return sum + (latestRatings.get(segment.id) ?? 0);
    }, 0);
    const averageRating = totalRating / songSegments.length;
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
  await ensureMigratedSchema();
}

function normalizeTapPracticeMode(value: string | null | undefined): TapPracticeMode {
  return value === "answer_key" ? "answer_key" : "practice";
}

function normalizePracticeInputMethod(value: string | null | undefined): PracticeInputMethod {
  return value === "voice" ? "voice" : "tap";
}

function normalizeTapDirection(value: string | null | undefined): TapDirection | undefined {
  return value === "up" || value === "down" || value === "same" ? value : undefined;
}

type TapPracticeSessionProjection = Pick<TapPracticeSessionRow, "id" | "songId" | "startedAt"> &
  Partial<Pick<TapPracticeSessionRow, "segmentId" | "audioVersion" | "mode" | "inputMethod" | "completedAt" | "finalizedAt" | "autoScorePercent" | "selfRating" | "scoreDetails">>;

const TAP_PRACTICE_SESSION_KEEP_LIMIT = 5;

function mapTapPracticeSession(row: TapPracticeSessionProjection): PersistedTapPracticeSessionSummary {
  const selfRating = row.selfRating === 1 || row.selfRating === 2 || row.selfRating === 3 || row.selfRating === 4 || row.selfRating === 5 ? row.selfRating : undefined;
  return {
    id: row.id,
    songId: row.songId,
    audioVersion: normalizeTapAudioVersion(row.audioVersion),
    mode: normalizeTapPracticeMode(row.mode),
    inputMethod: normalizePracticeInputMethod(row.inputMethod),
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
  inputMethod: PracticeInputMethod,
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
        eq(tapPracticeSessions.inputMethod, inputMethod),
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
          eq(tapPracticeSessions.inputMethod, inputMethod),
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
    inputMethod?: PracticeInputMethod;
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
        inputMethod: options.inputMethod ?? "tap",
        startedAt,
      })
      .returning();

    return mapTapPracticeSession(rows[0]);
  } catch (error) {
    throw error;
  }
}

export async function getSegmentsBySongIds(
  songIds: string[]
): Promise<Record<string, SegmentRow[]>> {
  const uniqueSongIds = Array.from(new Set(songIds));
  const bySong = Object.fromEntries(uniqueSongIds.map((songId) => [songId, [] as SegmentRow[]]));
  if (uniqueSongIds.length === 0) {
    return bySong;
  }

  let primaryError: unknown;
  try {
    const rows = await db()
      .select()
      .from(segments)
      .where(inArray(segments.songId, uniqueSongIds))
      .orderBy(asc(segments.songId), asc(segments.order));

    for (const row of rows) {
      bySong[row.songId] = [...(bySong[row.songId] ?? []), row];
    }
    return bySong;
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
      .where(inArray(segments.songId, uniqueSongIds))
      .orderBy(asc(segments.songId), asc(segments.order));

    for (const row of legacyRows) {
      bySong[row.songId] = [
        ...(bySong[row.songId] ?? []),
        {
          ...row,
          pitchContourNotes: [],
        } as SegmentRow,
      ];
    }
    return bySong;
  } catch {
    throw primaryError;
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
    await pruneTapPracticeSessionsForSegment(existing.songId, existing.segmentId, sessionId, existing.inputMethod ?? "tap", userId);
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
        inputMethod: tapPracticeSessions.inputMethod,
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
          inputMethod: tapPracticeSessions.inputMethod,
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
        inputMethod: tapPracticeSessions.inputMethod,
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
          inputMethod: tapPracticeSessions.inputMethod,
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
    inputMethod: normalizePracticeInputMethod(sessionRow.inputMethod),
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
    await pruneTapPracticeSessionsForSegment(existing.songId, existing.segmentId, sessionId, existing.inputMethod ?? "tap", userId);
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

export async function getMidiContourStatusBySongIds(
  songIds: string[],
  userId: string = DEFAULT_QUERY_USER_ID
): Promise<Record<string, boolean>> {
  const uniqueSongIds = Array.from(new Set(songIds));
  const bySong: Record<string, boolean> = {};
  if (uniqueSongIds.length === 0) {
    return bySong;
  }

  try {
    const rows = await db()
      .select({
        songId: midiSources.songId,
        cleanedNoteCount: midiSources.cleanedNoteCount,
      })
      .from(midiSources)
      .innerJoin(songs, eq(midiSources.songId, songs.id))
      .where(and(eq(songs.userId, userId), inArray(midiSources.songId, uniqueSongIds)))
      .orderBy(desc(midiSources.uploadedAt));

    for (const row of rows) {
      if (bySong[row.songId] === undefined) {
        bySong[row.songId] = row.cleanedNoteCount > 0;
      }
    }
    return bySong;
  } catch (error) {
    if (isMissingMidiTableError(error)) {
      await ensureMidiTables();
      return bySong;
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
  const publicShareAudioMode = row.publicShareAudioMode === "part" || row.publicShareAudioMode === "blend" ? row.publicShareAudioMode : "both";
  return {
    id: row.id,
    name: row.name,
    eventDate: row.eventDate ?? undefined,
    performanceStatus: normalizePlaylistPerformanceStatus(row.performanceStatus),
    isRetired: row.isRetired,
    isPublic: Boolean(row.isPublic),
    publishedAt: row.publishedAt ? row.publishedAt.toISOString() : null,
    shareToken: row.shareToken ?? null,
    sharedAt: row.sharedAt ? row.sharedAt.toISOString() : null,
    shareAudioMode,
    publicShareAudioMode,
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
  await ensureMigratedSchema();
}

function normalizeShareAudioMode(mode: unknown): PlaylistShareAudioMode {
  return mode === "part" || mode === "blend" || mode === "both" ? mode : "both";
}

function applyShareAudioModeToPlaylist(detail: PlaylistDetail, requestedMode?: PlaylistShareAudioMode): PlaylistDetail {
  const mode = normalizeShareAudioMode(requestedMode ?? detail.shareAudioMode);
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

      rows = legacyRows.map((row) => ({ ...row, performanceStatus: null, isPublic: false, publishedAt: null, shareToken: null, sharedAt: null, shareAudioMode: "both", publicShareAudioMode: "both" } as PlaylistRow));
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

      rows = userlessRows.map((row) => ({ ...row, userId: DEFAULT_QUERY_USER_ID, performanceStatus: null, isPublic: false, publishedAt: null, shareToken: null, sharedAt: null, shareAudioMode: "both", publicShareAudioMode: "both" } as PlaylistRow));
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
  const knowledgeSongCountByPlaylist = new Map<string, number>();

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
    }
    knowledgeNumeratorByPlaylist.set(
      linkedSong.playlistId,
      (knowledgeNumeratorByPlaylist.get(linkedSong.playlistId) ?? 0) + (segmentCount > 0 ? (knowledgeBySong[linkedSong.songId] ?? 0) : 0)
    );
    knowledgeSongCountByPlaylist.set(
      linkedSong.playlistId,
      (knowledgeSongCountByPlaylist.get(linkedSong.playlistId) ?? 0) + 1
    );
    if (midiSongIds.has(linkedSong.songId)) {
      stats.songsWithMidiContour += 1;
    }
    statsByPlaylist.set(linkedSong.playlistId, stats);
  }

  return summaries.map((playlist) => {
    const songCount = knowledgeSongCountByPlaylist.get(playlist.id) ?? 0;
    return {
      ...playlist,
      knowledgePercent: songCount > 0 ? Math.round((knowledgeNumeratorByPlaylist.get(playlist.id) ?? 0) / songCount) : 0,
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

      playlistRows = legacyPlaylistRows.map((row) => ({ ...row, performanceStatus: null, isPublic: false, publishedAt: null, shareToken: null, sharedAt: null, shareAudioMode: "both", publicShareAudioMode: "both" } as PlaylistRow));
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

      playlistRows = userlessPlaylistRows.map((row) => ({ ...row, userId: DEFAULT_QUERY_USER_ID, performanceStatus: null, isPublic: false, publishedAt: null, shareToken: null, sharedAt: null, shareAudioMode: "both", publicShareAudioMode: "both" } as PlaylistRow));
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
    sourceSongId: string | null;
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
        sourceSongId: songs.sourceSongId,
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
        sourceSongId: sql<string | null>`null`,
      })
      .from(playlistSongs)
      .innerJoin(songs, eq(playlistSongs.songId, songs.id))
      .where(eq(playlistSongs.playlistId, id))
      .orderBy(asc(playlistSongs.position));
  }

  const songIds = linkedSongs.map((s) => s.songId);
  const [segmentsBySong, masteryBySong, latestRatingTimes, ratingCounts, midiContourEntries] = await Promise.all([
    getSegmentsBySongIds(songIds),
    getSongKnowledgeBySongIds(songIds, playlist.userId),
    getLatestRatingTimeBySongIds(songIds, playlist.userId),
    getRatingCountBySongIds(songIds, playlist.userId),
    getMidiContourStatusBySongIds(songIds, playlist.userId),
  ]);

  const songsWithSegments: PlaylistSongItem[] = linkedSongs.map((songRow) => ({
    id: songRow.songId,
    sourceSongId: songRow.sourceSongId,
    title: songRow.title,
    artist: songRow.artist ?? undefined,
    audioUrl: songRow.audioKey ? getPublicUrl(songRow.audioKey) : "",
    alternateAudioUrl: songRow.alternateAudioKey ? getPublicUrl(songRow.alternateAudioKey) : undefined,
    pitchContourNotes: songRow.pitchContourNotes ?? [],
    hasMidiContour: midiContourEntries[songRow.songId] ?? false,
    ratingCount: ratingCounts[songRow.songId] ?? 0,
    segments: segmentsBySong[songRow.songId] ?? [],
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
  if (existing.isPublic && normalizeShareAudioMode(existing.publicShareAudioMode) === mode) {
    return mapPlaylistSummary(existing);
  }

  const now = new Date();
  const rows = await db()
    .update(playlists)
    .set({
      isPublic: true,
      publishedAt: existing.publishedAt ?? now,
      publicShareAudioMode: mode,
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
    ...applyShareAudioModeToPlaylist(detail, detail.publicShareAudioMode),
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
    ...applyShareAudioModeToPlaylist(detail, detail.shareAudioMode),
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

async function getRefreshSourceForImportedPlaylist(playlist: PlaylistDetail, userId: string): Promise<SharedPlaylistDetail | null> {
  if (!playlist.sourcePlaylistId) {
    return null;
  }

  if (playlist.sourceShareToken) {
    const sharedSource = await getSharedPlaylistByToken(playlist.sourceShareToken);
    if (sharedSource?.id === playlist.sourcePlaylistId && sharedSource.owner.id !== userId) {
      return sharedSource;
    }
  }

  return getPublicPlaylistById(playlist.sourcePlaylistId, userId);
}

function getCanonicalSourceSongId(song: Pick<PlaylistSongItem, "id" | "sourceSongId">): string {
  return song.sourceSongId ?? song.id;
}

function getComparableSegmentContent(segment: SegmentRow) {
  return {
    order: segment.order,
    label: segment.label,
    startMs: segment.startMs,
    endMs: segment.endMs,
    lyricText: segment.lyricText ?? "",
    pitchContourNotes: segment.pitchContourNotes ?? [],
  };
}

function isImportedTitleVariant(sourceTitle: string, currentTitle: string): boolean {
  return currentTitle === sourceTitle ||
    currentTitle.startsWith(`${sourceTitle} (from `) ||
    currentTitle.startsWith(`${sourceTitle} (import `);
}

export function hasSharedSongContentChanged(source: PlaylistSongItem, current: PlaylistSongItem): boolean {
  const sourceSegments = [...source.segments]
    .sort((a, b) => a.order - b.order)
    .map(getComparableSegmentContent);
  const currentSegments = [...current.segments]
    .sort((a, b) => a.order - b.order)
    .map(getComparableSegmentContent);

  return !isImportedTitleVariant(source.title, current.title) ||
    source.artist !== current.artist ||
    source.audioUrl !== current.audioUrl ||
    source.alternateAudioUrl !== current.alternateAudioUrl ||
    source.hasMidiContour !== current.hasMidiContour ||
    JSON.stringify(source.pitchContourNotes ?? []) !== JSON.stringify(current.pitchContourNotes ?? []) ||
    JSON.stringify(sourceSegments) !== JSON.stringify(currentSegments);
}

export async function getImportedPlaylistRefreshPreview(
  playlistId: string,
  userId: string = DEFAULT_QUERY_USER_ID
): Promise<PlaylistRefreshPreview | null> {
  const playlist = await getPlaylistById(playlistId, userId);
  if (!playlist) {
    throw Object.assign(new Error("Playlist not found"), { code: "PLAYLIST_NOT_FOUND" });
  }

  const source = await getRefreshSourceForImportedPlaylist(playlist, userId);
  if (!source) {
    return null;
  }

  const currentBySourceSongId = new Map(
    playlist.songs.map((song) => [getCanonicalSourceSongId(song), song])
  );

  const candidates = [...source.songs]
    .sort((a, b) => a.position - b.position)
    .flatMap((song): PlaylistRefreshCandidate[] => {
      const sourceSongId = getCanonicalSourceSongId(song);
      const currentSong = currentBySourceSongId.get(sourceSongId);
      if (currentSong && !hasSharedSongContentChanged(song, currentSong)) {
        return [];
      }
      return [{
        sourceSongId,
        currentSongId: currentSong?.id ?? null,
        title: song.title,
        artist: song.artist,
        position: song.position,
        status: currentSong ? "refreshable" : "new",
        segmentCount: song.segments.length,
        hasPartAudio: Boolean(song.audioUrl?.trim()),
        hasBlendAudio: Boolean(song.alternateAudioUrl?.trim()),
      }];
    });

  return {
    sourcePlaylist: {
      id: source.id,
      name: source.name,
      owner: source.owner,
    },
    candidates,
  };
}

async function cloneSharedSongIntoLibrary(
  sourceSongId: string,
  sourceSongRow: SongRow,
  userId: string,
  importedPlaylistName: string,
  knownSongTitles: string[],
  shareAudioMode: PlaylistShareAudioMode
): Promise<string> {
  const importedTitle = getImportedSongTitle(sourceSongRow.title, importedPlaylistName, knownSongTitles);
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
      audioTrimStartMs: sourceSongRow.audioTrimStartMs ?? null,
      audioTrimEndMs: sourceSongRow.audioTrimEndMs ?? null,
      pitchContourNotes: sourceSongRow.pitchContourNotes ?? [],
      sourceSongId,
      lastPracticedAt: null,
    });
  knownSongTitles.push(importedTitle);

  const sourceSegments = await getSegmentsBySongId(sourceSongRow.id);
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

  await cloneMidiDataForImportedSong(sourceSongRow.id, importedSongId);
  return importedSongId;
}

export async function refreshImportedPlaylistSongs(
  playlistId: string,
  sourceSongIds: string[],
  userId: string = DEFAULT_QUERY_USER_ID
): Promise<RefreshImportedPlaylistResult> {
  const playlist = await getPlaylistById(playlistId, userId);
  if (!playlist) {
    throw Object.assign(new Error("Playlist not found"), { code: "PLAYLIST_NOT_FOUND" });
  }

  const source = await getRefreshSourceForImportedPlaylist(playlist, userId);
  if (!source) {
    throw Object.assign(new Error("Shared playlist not found"), { code: "SHARED_PLAYLIST_NOT_FOUND" });
  }

  const selectedSourceSongIds = new Set(sourceSongIds.filter((id) => typeof id === "string" && id.trim()));
  if (selectedSourceSongIds.size === 0) {
    return { importedCount: 0, playlist };
  }

  const sourceItemsBySourceSongId = new Map(
    source.songs.map((song) => [getCanonicalSourceSongId(song), song])
  );
  const currentBySourceSongId = new Map(
    playlist.songs.map((song) => [getCanonicalSourceSongId(song), song])
  );

  const existingSongTitleRows = await db()
    .select({ title: songs.title })
    .from(songs)
    .where(eq(songs.userId, userId));
  const knownSongTitles = existingSongTitleRows.map((row) => row.title);
  let nextPosition = playlist.songs.reduce((max, song) => Math.max(max, song.position), -1) + 1;
  let importedCount = 0;
  const shareAudioMode = normalizeShareAudioMode(
    playlist.sourceShareToken ? source.shareAudioMode : source.publicShareAudioMode
  );

  for (const sourceSongId of selectedSourceSongIds) {
    const sourceItem = sourceItemsBySourceSongId.get(sourceSongId);
    if (!sourceItem) {
      continue;
    }

    const sourceSongRows = await db()
      .select()
      .from(songs)
      .where(eq(songs.id, sourceItem.id))
      .limit(1);
    const sourceSongRow = sourceSongRows[0];
    if (!sourceSongRow) {
      continue;
    }

    const importedSongId = await cloneSharedSongIntoLibrary(
      sourceSongId,
      sourceSongRow,
      userId,
      playlist.name,
      knownSongTitles,
      shareAudioMode
    );
    const currentSong = currentBySourceSongId.get(sourceSongId);
    const position = currentSong?.position ?? nextPosition++;

    if (currentSong) {
      await db()
        .delete(playlistSongs)
        .where(and(eq(playlistSongs.playlistId, playlistId), eq(playlistSongs.songId, currentSong.id)));
    }

    await db()
      .insert(playlistSongs)
      .values({
        playlistId,
        songId: importedSongId,
        position,
      });
    importedCount += 1;
  }

  const refreshedPlaylist = await getPlaylistById(playlistId, userId);
  if (!refreshedPlaylist) {
    throw Object.assign(new Error("Playlist not found"), { code: "PLAYLIST_NOT_FOUND" });
  }

  return { importedCount, playlist: refreshedPlaylist };
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
  options: { force?: boolean; shareAudioMode?: PlaylistShareAudioMode } = {}
): Promise<{ status: "imported"; playlist: PlaylistSummary } | { status: "already_imported"; playlist: PlaylistSummary }> {
  await ensurePlaylistSharingColumns();
  const source = await getSharedPlaylistByToken(token);
  if (!source) {
    throw Object.assign(new Error("Shared playlist not found"), { code: "SHARED_PLAYLIST_NOT_FOUND" });
  }

  return importPlaylistSource(source, userId, { ...options, sourceShareToken: token });
}

export async function importPublicPlaylist(
  playlistId: string,
  userId: string = DEFAULT_QUERY_USER_ID,
  options: { force?: boolean; shareAudioMode?: PlaylistShareAudioMode } = {}
): Promise<{ status: "imported"; playlist: PlaylistSummary } | { status: "already_imported"; playlist: PlaylistSummary }> {
  await ensurePlaylistSharingColumns();
  const source = await getPublicPlaylistById(playlistId, userId);
  if (!source) {
    throw Object.assign(new Error("Shared playlist not found"), { code: "SHARED_PLAYLIST_NOT_FOUND" });
  }

  return importPlaylistSource(source, userId, options);
}

async function importPlaylistSource(
  source: SharedPlaylistDetail,
  userId: string,
  options: { force?: boolean; shareAudioMode?: PlaylistShareAudioMode; sourceShareToken?: string | null } = {}
): Promise<{ status: "imported"; playlist: PlaylistSummary } | { status: "already_imported"; playlist: PlaylistSummary }> {
  const existingImports = await getPlaylistImportsForSource(source.id, userId);
  if (existingImports.length > 0 && !options.force) {
    return { status: "already_imported", playlist: existingImports[0] };
  }

  const now = new Date();
  const importedPlaylistId = crypto.randomUUID();
  const existingPlaylistRows = await db()
    .select({ name: playlists.name })
    .from(playlists)
    .where(eq(playlists.userId, userId));
  const importedPlaylistName = getImportedPlaylistName(
    source.name,
    existingPlaylistRows.map((row) => row.name)
  );
  const playlistRows = await db()
    .insert(playlists)
    .values({
      id: importedPlaylistId,
      userId,
      name: importedPlaylistName,
      eventDate: source.eventDate ?? null,
      isRetired: false,
      sourcePlaylistId: source.id,
      sourceOwnerId: source.owner.id,
      sourceShareToken: options.sourceShareToken ?? source.shareToken ?? null,
      importedAt: now,
    })
    .returning();

  const importedPlaylist = playlistRows[0];
  const sortedSongs = [...source.songs].sort((a, b) => a.position - b.position);
  const shareAudioMode = normalizeShareAudioMode(options.shareAudioMode ?? source.shareAudioMode);
  let importedSongCount = 0;
  const existingSongTitleRows = await db()
    .select({ title: songs.title })
    .from(songs)
    .where(eq(songs.userId, userId));
  const knownSongTitles = existingSongTitleRows.map((row) => row.title);
  const importedSongIdsBySourceSongId = new Map<string, string>();

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
    const alreadyImportedSongId = importedSongIdsBySourceSongId.get(sourceSongId);
    if (alreadyImportedSongId) {
      await db()
        .insert(playlistSongs)
        .values({
          playlistId: importedPlaylistId,
          songId: alreadyImportedSongId,
          position: item.position,
        });
      importedSongCount += 1;
      continue;
    }

    if (!options.force) {
      const existingSongRows = await db()
        .select({ id: songs.id })
        .from(songs)
        .where(and(eq(songs.userId, userId), sql`COALESCE(${songs.sourceSongId}, ${songs.id}) = ${sourceSongId}`))
        .orderBy(asc(songs.createdAt))
        .limit(1);

      const existingSong = existingSongRows[0];
      if (existingSong) {
        importedSongIdsBySourceSongId.set(sourceSongId, existingSong.id);
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
    }

    const importedTitle = getImportedSongTitle(sourceSongRow.title, importedPlaylistName, knownSongTitles);

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
    importedSongIdsBySourceSongId.set(sourceSongId, importedSongId);
    knownSongTitles.push(importedTitle);

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
  const uniqueSongIds = Array.from(new Set(songIds));
  const bySong: Record<string, number> = {};
  if (uniqueSongIds.length === 0) {
    return bySong;
  }

  const rows = await db()
    .select({
      songId: segments.songId,
      count: count(practiceRatings.id),
    })
    .from(practiceRatings)
    .innerJoin(segments, eq(practiceRatings.segmentId, segments.id))
    .innerJoin(songs, eq(segments.songId, songs.id))
    .where(and(eq(practiceRatings.userId, userId), eq(songs.userId, userId), inArray(segments.songId, uniqueSongIds)))
    .groupBy(segments.songId);

  for (const row of rows) {
    bySong[row.songId] = row.count;
  }

  return bySong;
}

export async function createPlaylist(data: {
  userId: string;
  name: string;
  eventDate?: string;
  performanceStatus?: PlaylistPerformanceStatus | null;
}): Promise<PlaylistSummary> {
  const eventDate = data.eventDate ?? extractPlaylistEventDateFromName(data.name);
  const performanceStatus = normalizePlaylistPerformanceStatus(data.performanceStatus);
  try {
    const rows = await db()
      .insert(playlists)
      .values({
        id: crypto.randomUUID(),
        userId: data.userId,
        name: data.name,
        eventDate,
        performanceStatus,
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
        eventDate,
      })
      .returning();

    return mapPlaylistSummary(rows[0]);
  }
}

export async function updatePlaylist(
  id: string,
  data: { name?: string; eventDate?: string | null; isRetired?: boolean; performanceStatus?: PlaylistPerformanceStatus | null },
  userId: string = DEFAULT_QUERY_USER_ID
): Promise<void> {
  const updates: Partial<Pick<PlaylistRow, "name" | "eventDate" | "performanceStatus" | "isRetired" | "isPublic" | "publishedAt" | "shareToken" | "sharedAt">> = {};
  if (data.name !== undefined) updates.name = data.name;
  if (data.eventDate !== undefined) updates.eventDate = data.eventDate;
  if (data.performanceStatus !== undefined) updates.performanceStatus = normalizePlaylistPerformanceStatus(data.performanceStatus);
  if (data.isRetired !== undefined) {
    updates.isRetired = data.isRetired;
    if (data.isRetired) {
      if (data.performanceStatus === undefined) {
        updates.performanceStatus = "Performed";
      }
      updates.isPublic = false;
      updates.publishedAt = null;
      updates.shareToken = null;
      updates.sharedAt = null;
    } else if (data.performanceStatus === undefined) {
      updates.performanceStatus = null;
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

export async function duplicatePlaylist(
  id: string,
  userId: string = DEFAULT_QUERY_USER_ID
): Promise<PlaylistSummary | null> {
  const playlistRows = await db()
    .select()
    .from(playlists)
    .where(and(eq(playlists.id, id), eq(playlists.userId, userId)))
    .limit(1);
  const source = playlistRows[0];
  if (!source) {
    return null;
  }

  const existingNameRows = await db()
    .select({ name: playlists.name })
    .from(playlists)
    .where(eq(playlists.userId, userId));
  const duplicatedPlaylistId = crypto.randomUUID();
  const duplicatedName = getNextDuplicatedPlaylistName(
    source.name,
    existingNameRows.map((row) => row.name)
  );
  const createdRows = await db()
    .insert(playlists)
    .values({
      id: duplicatedPlaylistId,
      userId,
      name: duplicatedName,
      eventDate: source.eventDate,
      performanceStatus: null,
      isRetired: false,
      isPublic: false,
      publishedAt: null,
      shareToken: null,
      sharedAt: null,
      shareAudioMode: source.shareAudioMode,
      publicShareAudioMode: source.publicShareAudioMode,
      sourcePlaylistId: source.sourcePlaylistId,
      sourceOwnerId: source.sourceOwnerId,
      sourceShareToken: source.sourceShareToken,
      importedAt: source.importedAt,
    })
    .returning();

  const sourceSongs = await db()
    .select({
      songId: playlistSongs.songId,
      position: playlistSongs.position,
    })
    .from(playlistSongs)
    .innerJoin(songs, and(eq(songs.id, playlistSongs.songId), eq(songs.userId, userId)))
    .where(eq(playlistSongs.playlistId, id))
    .orderBy(asc(playlistSongs.position));

  if (sourceSongs.length > 0) {
    await db().insert(playlistSongs).values(
      sourceSongs.map((song) => ({
        playlistId: duplicatedPlaylistId,
        songId: song.songId,
        position: song.position,
      }))
    );
  }

  return mapPlaylistSummary(createdRows[0], sourceSongs.length);
}

export async function deletePlaylist(id: string, userId: string = DEFAULT_QUERY_USER_ID): Promise<void> {
  await db().delete(playlists).where(and(eq(playlists.id, id), eq(playlists.userId, userId)));
}

async function hasOwnedPlaylist(playlistId: string, userId: string): Promise<boolean> {
  const rows = await db()
    .select({ id: playlists.id })
    .from(playlists)
    .where(and(eq(playlists.id, playlistId), eq(playlists.userId, userId)))
    .limit(1);
  return rows.length > 0;
}

async function canAddOwnedSongToPlaylist(playlistId: string, songId: string, userId: string): Promise<boolean> {
  const rows = await db()
    .select({ playlistId: playlists.id })
    .from(playlists)
    .innerJoin(songs, and(eq(songs.id, songId), eq(songs.userId, userId)))
    .where(and(eq(playlists.id, playlistId), eq(playlists.userId, userId)))
    .limit(1);
  return rows.length > 0;
}

export async function addSongToPlaylist(
  playlistId: string,
  songId: string,
  position?: number,
  userId: string = DEFAULT_QUERY_USER_ID
): Promise<void> {
  if (!(await canAddOwnedSongToPlaylist(playlistId, songId, userId))) {
    return;
  }

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
  userId: string = DEFAULT_QUERY_USER_ID
): Promise<void> {
  if (!(await hasOwnedPlaylist(playlistId, userId))) {
    return;
  }

  await db()
    .delete(playlistSongs)
    .where(and(eq(playlistSongs.playlistId, playlistId), eq(playlistSongs.songId, songId)));
}

export async function reorderPlaylistSongs(
  playlistId: string,
  orderedSongIds: string[],
  userId: string = DEFAULT_QUERY_USER_ID
): Promise<void> {
  if (!(await hasOwnedPlaylist(playlistId, userId))) {
    return;
  }

  await Promise.all(
    orderedSongIds.map((songId, position) =>
      db()
        .update(playlistSongs)
        .set({ position })
        .where(and(eq(playlistSongs.playlistId, playlistId), eq(playlistSongs.songId, songId)))
    )
  );
}

function mapVocalExercise(
  row: VocalExerciseRow,
  collection?: { slug: string | null; title: string | null; position: number | null }
): PersistedVocalExercise {
  return {
    id: row.id,
    slug: row.slug ?? undefined,
    title: row.title,
    category: row.category ?? undefined,
    syllable: row.syllable ?? undefined,
    description: row.description ?? undefined,
    difficulty: row.difficulty ?? undefined,
    pattern: row.pattern ?? undefined,
    coachingNotes: row.coachingNotes,
    audioKey: row.audioKey ?? undefined,
    audioUrl: row.audioKey ? getPublicUrl(row.audioKey) : undefined,
    lyricHint: row.lyricHint,
    collectionSlug: collection?.slug ?? undefined,
    collectionTitle: collection?.title ?? undefined,
    routinePosition: collection?.position ?? undefined,
    sourceMidiFile: row.sourceMidiFile,
    exerciseStartBeat: row.exerciseStartBeatMilli / 1000,
    tempoBpm: row.tempoBpmMilli / 1000,
    timeSignature: {
      numerator: row.timeSignatureNumerator,
      denominator: row.timeSignatureDenominator,
    },
    durationBeats: row.durationBeatsMilli / 1000,
    events: row.events,
    createdAt: row.createdAt.toISOString(),
  };
}

function vocalExerciseValues(exercise: PersistedVocalExercise) {
  return {
    slug: exercise.slug ?? null,
    title: exercise.title,
    category: exercise.category ?? null,
    syllable: exercise.syllable ?? null,
    description: exercise.description ?? null,
    difficulty: exercise.difficulty ?? null,
    pattern: exercise.pattern ?? null,
    coachingNotes: exercise.coachingNotes ?? [],
    audioKey: exercise.audioKey ?? null,
    lyricHint: exercise.lyricHint ?? "",
    sourceMidiFile: exercise.sourceMidiFile,
    exerciseStartBeatMilli: Math.round(exercise.exerciseStartBeat * 1000),
    tempoBpmMilli: Math.round(exercise.tempoBpm * 1000),
    timeSignatureNumerator: exercise.timeSignature.numerator,
    timeSignatureDenominator: exercise.timeSignature.denominator,
    durationBeatsMilli: Math.round(exercise.durationBeats * 1000),
    events: exercise.events,
  };
}

export async function getVocalExercises(): Promise<PersistedVocalExercise[]> {
  const rows = await db()
    .select({
      exercise: vocalExercises,
      collectionSlug: vocalExerciseCollectionItems.collectionSlug,
      collectionTitle: vocalExerciseCollections.title,
      routinePosition: vocalExerciseCollectionItems.position,
    })
    .from(vocalExercises)
    .leftJoin(vocalExerciseCollectionItems, eq(vocalExerciseCollectionItems.exerciseId, vocalExercises.id))
    .leftJoin(vocalExerciseCollections, eq(vocalExerciseCollections.slug, vocalExerciseCollectionItems.collectionSlug))
    .orderBy(asc(vocalExerciseCollectionItems.collectionSlug), asc(vocalExerciseCollectionItems.position), asc(vocalExercises.title));
  return rows.map((row) => mapVocalExercise(row.exercise, {
    slug: row.collectionSlug,
    title: row.collectionTitle,
    position: row.routinePosition,
  }));
}

export async function createVocalExercise(
  exercise: PersistedVocalExercise,
  createdByUserId: string
): Promise<PersistedVocalExercise> {
  const rows = await db()
    .insert(vocalExercises)
    .values({
      id: exercise.id,
      ...vocalExerciseValues(exercise),
      createdByUserId,
      createdAt: new Date(exercise.createdAt),
      updatedAt: new Date(),
    })
    .returning();
  return mapVocalExercise(rows[0]);
}

export async function upsertSeedVocalExercises(
  exercises: PersistedVocalExercise[],
  collection?: PersistedVocalExerciseCollection
): Promise<PersistedVocalExercise[]> {
  if (collection) {
    await db()
      .insert(vocalExerciseCollections)
      .values({
        slug: collection.slug,
        title: collection.title,
        description: collection.description ?? null,
        intendedSinger: collection.intendedSinger ?? null,
        primaryGoals: collection.primaryGoals,
        restBetweenIterationsMeasures: collection.restBetweenIterationsMeasures,
        transposeMode: collection.transposeMode,
        updatedAt: new Date(),
      })
      .onConflictDoUpdate({
        target: vocalExerciseCollections.slug,
        set: {
          title: collection.title,
          description: collection.description ?? null,
          intendedSinger: collection.intendedSinger ?? null,
          primaryGoals: collection.primaryGoals,
          restBetweenIterationsMeasures: collection.restBetweenIterationsMeasures,
          transposeMode: collection.transposeMode,
          updatedAt: new Date(),
        },
      });
  }

  const saved = await Promise.all(exercises.map(async (exercise) => {
    const values = vocalExerciseValues(exercise);
    const rows = await db()
      .insert(vocalExercises)
      .values({
        id: exercise.id,
        ...values,
        createdByUserId: null,
        createdAt: new Date(exercise.createdAt),
        updatedAt: new Date(),
      })
      .onConflictDoUpdate({
        target: vocalExercises.id,
        set: { ...values, updatedAt: new Date() },
      })
      .returning();
    return mapVocalExercise(rows[0]);
  }));

  if (collection) {
    await db().delete(vocalExerciseCollectionItems).where(eq(vocalExerciseCollectionItems.collectionSlug, collection.slug));
    if (exercises.length > 0) {
      await db().insert(vocalExerciseCollectionItems).values(exercises.map((exercise, index) => ({
        collectionSlug: collection.slug,
        exerciseId: exercise.id,
        position: exercise.routinePosition ?? index,
      })));
    }
  }

  return saved;
}

export async function updateVocalExercise(exercise: PersistedVocalExercise): Promise<PersistedVocalExercise | null> {
  const rows = await db()
    .update(vocalExercises)
    .set({ ...vocalExerciseValues(exercise), updatedAt: new Date() })
    .where(eq(vocalExercises.id, exercise.id))
    .returning();
  return rows[0] ? mapVocalExercise(rows[0]) : null;
}

export async function deleteVocalExercise(id: string): Promise<boolean> {
  const rows = await db().delete(vocalExercises).where(eq(vocalExercises.id, id)).returning({ id: vocalExercises.id });
  return rows.length > 0;
}

function mapSongPracticeSession(row: SongPracticeSessionRow, title?: string | null): PersistedSongPracticeSession {
  return {
    id: row.id,
    userId: row.userId,
    songId: row.songId,
    songTitle: title ?? undefined,
    segmentId: row.segmentId,
    source: row.source,
    startedAt: row.startedAt.toISOString(),
    completedAt: row.completedAt ? row.completedAt.toISOString() : null,
    durationSeconds: Math.max(0, row.durationSeconds ?? 0),
  };
}

export async function createSongPracticeSession(data: {
  id?: string;
  userId: string;
  songId: string;
  segmentId?: string | null;
  source?: string;
  startedAt?: Date;
}): Promise<PersistedSongPracticeSession | null> {
  try {
    const rows = await db()
      .insert(songPracticeSessions)
      .values({
        id: data.id ?? crypto.randomUUID(),
        userId: data.userId,
        songId: data.songId,
        segmentId: data.segmentId ?? null,
        source: data.source ?? "song",
        startedAt: data.startedAt ?? new Date(),
      })
      .returning();
    return mapSongPracticeSession(rows[0]);
  } catch (error) {
    if (isMissingSongPracticeSessionTableError(error)) {
      return null;
    }
    throw error;
  }
}

export async function finishSongPracticeSession(data: {
  id: string;
  userId: string;
  completedAt?: Date;
  durationSeconds: number;
}): Promise<PersistedSongPracticeSession | null> {
  try {
    const rows = await db()
      .update(songPracticeSessions)
      .set({
        completedAt: data.completedAt ?? new Date(),
        durationSeconds: Math.max(0, Math.round(data.durationSeconds)),
      })
      .where(and(eq(songPracticeSessions.id, data.id), eq(songPracticeSessions.userId, data.userId)))
      .returning();
    return rows[0] ? mapSongPracticeSession(rows[0]) : null;
  } catch (error) {
    if (isMissingSongPracticeSessionTableError(error)) {
      return null;
    }
    throw error;
  }
}

function mapVocalExercisePracticeSession(row: VocalExercisePracticeSessionRow, title?: string | null): PersistedVocalExercisePracticeSession {
  return {
    id: row.id,
    userId: row.userId,
    exerciseId: row.exerciseId,
    exerciseTitle: title ?? undefined,
    startedAt: row.startedAt.toISOString(),
    completedAt: row.completedAt ? row.completedAt.toISOString() : null,
    durationSeconds: Math.max(0, row.durationSeconds ?? 0),
    tempoPercent: row.tempoPercent,
    repetitionCount: row.repetitionCount,
  };
}

export async function createVocalExercisePracticeSession(data: {
  id?: string;
  userId: string;
  exerciseId: string;
  startedAt?: Date;
  tempoPercent?: number;
  repetitionCount?: number;
}): Promise<PersistedVocalExercisePracticeSession | null> {
  try {
    const rows = await db()
      .insert(vocalExercisePracticeSessions)
      .values({
        id: data.id ?? crypto.randomUUID(),
        userId: data.userId,
        exerciseId: data.exerciseId,
        startedAt: data.startedAt ?? new Date(),
        tempoPercent: Math.max(40, Math.min(150, Math.round(data.tempoPercent ?? 100))),
        repetitionCount: Math.max(0, Math.round(data.repetitionCount ?? 0)),
      })
      .returning();
    return mapVocalExercisePracticeSession(rows[0]);
  } catch (error) {
    if (isMissingVocalExercisePracticeSessionTableError(error)) {
      return null;
    }
    throw error;
  }
}

export async function finishVocalExercisePracticeSession(data: {
  id: string;
  userId: string;
  completedAt?: Date;
  durationSeconds: number;
}): Promise<PersistedVocalExercisePracticeSession | null> {
  try {
    const rows = await db()
      .update(vocalExercisePracticeSessions)
      .set({
        completedAt: data.completedAt ?? new Date(),
        durationSeconds: Math.max(0, Math.round(data.durationSeconds)),
      })
      .where(and(eq(vocalExercisePracticeSessions.id, data.id), eq(vocalExercisePracticeSessions.userId, data.userId)))
      .returning();
    return rows[0] ? mapVocalExercisePracticeSession(rows[0]) : null;
  } catch (error) {
    if (isMissingVocalExercisePracticeSessionTableError(error)) {
      return null;
    }
    throw error;
  }
}

function dateKey(value: Date): string {
  return value.toISOString().slice(0, 10);
}

function monthKey(value: Date): string {
  return value.toISOString().slice(0, 7);
}

function weekKey(value: Date): string {
  const start = new Date(Date.UTC(value.getUTCFullYear(), value.getUTCMonth(), value.getUTCDate()));
  const day = start.getUTCDay() || 7;
  start.setUTCDate(start.getUTCDate() - day + 1);
  return dateKey(start);
}

function emptyBuckets(labels: string[]): Map<string, StatsBucket> {
  return new Map(labels.map((label) => [label, { label, seconds: 0, sessionCount: 0 }]));
}

function recentDayLabels(days: number, now: Date): string[] {
  return Array.from({ length: days }, (_, index) => {
    const date = new Date(Date.UTC(now.getUTCFullYear(), now.getUTCMonth(), now.getUTCDate()));
    date.setUTCDate(date.getUTCDate() - (days - index - 1));
    return dateKey(date);
  });
}

function recentWeekLabels(weeks: number, now: Date): string[] {
  const currentWeekStart = new Date(`${weekKey(now)}T00:00:00.000Z`);
  return Array.from({ length: weeks }, (_, index) => {
    const date = new Date(currentWeekStart);
    date.setUTCDate(date.getUTCDate() - (weeks - index - 1) * 7);
    return weekKey(date);
  });
}

function recentMonthLabels(months: number, now: Date): string[] {
  return Array.from({ length: months }, (_, index) => {
    const date = new Date(Date.UTC(now.getUTCFullYear(), now.getUTCMonth() - (months - index - 1), 1));
    return monthKey(date);
  });
}

function allTimeMonthLabels<T extends { startedAt: string }>(sessions: T[], now: Date): string[] {
  const validDates = sessions
    .map((session) => new Date(session.startedAt))
    .filter((date) => !Number.isNaN(date.getTime()) && date <= now)
    .sort((a, b) => a.getTime() - b.getTime());
  if (validDates.length === 0) {
    return recentMonthLabels(6, now);
  }
  const first = validDates[0];
  const monthCount = (
    (now.getUTCFullYear() - first.getUTCFullYear()) * 12
    + now.getUTCMonth() - first.getUTCMonth()
    + 1
  );
  return recentMonthLabels(Math.max(1, monthCount), now);
}

export function filterPracticeSessionsByRange<T extends { startedAt: string }>(
  sessions: T[],
  range: PracticeStatsRange,
  now: Date,
): T[] {
  if (range === "all") {
    return sessions;
  }
  const cutoff = new Date(now);
  cutoff.setUTCDate(cutoff.getUTCDate() - range);
  return sessions.filter((session) => {
    const startedAt = new Date(session.startedAt);
    return !Number.isNaN(startedAt.getTime()) && startedAt >= cutoff && startedAt <= now;
  });
}

export function averageNonZeroMastery(values: number[]): number {
  const practicedValues = values.filter((value) => value > 0);
  return practicedValues.length > 0
    ? Math.round(practicedValues.reduce((sum, value) => sum + value, 0) / practicedValues.length)
    : 0;
}

export function groupSongPracticeSessions(
  sessions: PersistedSongPracticeSession[],
  maxGapMs = 15 * 60 * 1000,
): PersistedSongPracticeSession[] {
  const sorted = [...sessions].sort((a, b) => Date.parse(a.startedAt) - Date.parse(b.startedAt));
  const grouped: PersistedSongPracticeSession[] = [];

  for (const session of sorted) {
    const previous = grouped[grouped.length - 1];
    const startedAtMs = Date.parse(session.startedAt);
    const previousEndMs = previous
      ? Date.parse(previous.completedAt ?? previous.startedAt)
      : Number.NaN;
    const shouldMerge = Boolean(
      previous
      && previous.songId === session.songId
      && Number.isFinite(startedAtMs)
      && Number.isFinite(previousEndMs)
      && startedAtMs <= previousEndMs + maxGapMs
    );

    if (!shouldMerge || !previous) {
      grouped.push({ ...session });
      continue;
    }

    previous.durationSeconds += Math.max(0, session.durationSeconds);
    previous.completedAt = session.completedAt ?? session.startedAt;
    previous.segmentId = previous.segmentId === session.segmentId ? previous.segmentId : null;
    previous.source = previous.source === session.source ? previous.source : "song";
  }

  return grouped.sort((a, b) => Date.parse(b.startedAt) - Date.parse(a.startedAt));
}

function buildPracticeTimeSummary<T extends { startedAt: string; durationSeconds: number }>(
  sessions: T[],
  now: Date,
  range: PracticeStatsRange,
) {
  const daily = emptyBuckets(recentDayLabels(range === 30 ? 30 : 14, now));
  const weekly = emptyBuckets(recentWeekLabels(range === 90 ? 14 : 8, now));
  const monthly = emptyBuckets(range === "all" ? allTimeMonthLabels(sessions, now) : recentMonthLabels(6, now));
  const weekdayLabels = ["Sun", "Mon", "Tue", "Wed", "Thu", "Fri", "Sat"];
  const weekdays = emptyBuckets(weekdayLabels);
  const practicedDayKeys = new Set<string>();

  for (const session of sessions) {
    const started = new Date(session.startedAt);
    if (Number.isNaN(started.getTime())) {
      continue;
    }
    const seconds = Math.max(0, session.durationSeconds);
    practicedDayKeys.add(dateKey(started));
    for (const bucket of [
      daily.get(dateKey(started)),
      weekly.get(weekKey(started)),
      monthly.get(monthKey(started)),
      weekdays.get(weekdayLabels[started.getUTCDay()]),
    ]) {
      if (!bucket) {
        continue;
      }
      bucket.seconds += seconds;
      bucket.sessionCount += 1;
    }
  }

  const totalSeconds = sessions.reduce((sum, session) => sum + Math.max(0, session.durationSeconds), 0);
  const practicedDays = practicedDayKeys.size;
  return {
    totalSessions: sessions.length,
    totalSeconds,
    practicedDays,
    averageSecondsPerPracticedDay: practicedDays > 0 ? Math.round(totalSeconds / practicedDays) : 0,
    averageSecondsPerSession: sessions.length > 0 ? Math.round(totalSeconds / sessions.length) : 0,
    daily: Array.from(daily.values()),
    weekly: Array.from(weekly.values()),
    monthly: Array.from(monthly.values()),
    weekday: Array.from(weekdays.values()),
  };
}

export async function getPracticeStatsSummary(
  userId: string = DEFAULT_QUERY_USER_ID,
  now: Date = new Date(),
  range: PracticeStatsRange = 30,
): Promise<PracticeStatsSummary> {
  const sixMonthsAgo = new Date(now);
  sixMonthsAgo.setMonth(sixMonthsAgo.getMonth() - 6);
  const allSongs = await getAllSongs(userId);
  const songIds = allSongs.map((song) => song.id);
  const [ratingFallbackBySongId, knowledgeBySongId] = await Promise.all([
    getLatestRatingTimeBySongIds(songIds, userId),
    getSongKnowledgeBySongIds(songIds, userId),
  ]);

  const songStats = allSongs.map((song) => {
    const lastPracticedAt = song.lastPracticedAt ?? ratingFallbackBySongId[song.id] ?? null;
    return {
      id: song.id,
      title: song.title,
      artist: song.artist,
      masteryPercent: knowledgeBySongId[song.id] ?? 0,
      lastPracticedAt,
    };
  });
  const masteredAbove80 = songStats.filter((song) => song.masteryPercent >= 80).length;
  const rangeCutoff = range === "all" ? null : new Date(now.getTime() - range * 24 * 60 * 60 * 1000);
  const practicedInRange = songStats.filter((song) => (
    song.lastPracticedAt
    && song.lastPracticedAt <= now
    && (!rangeCutoff || song.lastPracticedAt >= rangeCutoff)
  )).length;
  const neverPracticed = songStats.filter((song) => !song.lastPracticedAt).length;
  const untouchedSongStats = songStats
    .filter((song) => !song.lastPracticedAt || song.lastPracticedAt < sixMonthsAgo)
    .sort((a, b) => {
      const aTime = a.lastPracticedAt?.getTime() ?? 0;
      const bTime = b.lastPracticedAt?.getTime() ?? 0;
      return aTime - bTime || a.title.localeCompare(b.title);
    });
  const untouchedOverSixMonths = untouchedSongStats.length;
  const averageMasteryPercent = averageNonZeroMastery(songStats.map((song) => song.masteryPercent));
  const stalestSong = [...songStats]
    .sort((a, b) => {
      const aTime = a.lastPracticedAt?.getTime() ?? 0;
      const bTime = b.lastPracticedAt?.getTime() ?? 0;
      return aTime - bTime || a.title.localeCompare(b.title);
    })[0];

  let songSessions: PersistedSongPracticeSession[] = [];
  try {
    const rows = await db()
      .select({
        session: songPracticeSessions,
        title: songs.title,
      })
      .from(songPracticeSessions)
      .leftJoin(songs, eq(songs.id, songPracticeSessions.songId))
      .where(eq(songPracticeSessions.userId, userId))
      .orderBy(desc(songPracticeSessions.startedAt));
    songSessions = rows.map((row) => mapSongPracticeSession(row.session, row.title));
  } catch (error) {
    if (!isMissingSongPracticeSessionTableError(error)) {
      throw error;
    }
  }

  let exerciseSessions: PersistedVocalExercisePracticeSession[] = [];
  try {
    const rows = await db()
      .select({
        session: vocalExercisePracticeSessions,
        title: vocalExercises.title,
      })
      .from(vocalExercisePracticeSessions)
      .leftJoin(vocalExercises, eq(vocalExercises.id, vocalExercisePracticeSessions.exerciseId))
      .where(eq(vocalExercisePracticeSessions.userId, userId))
      .orderBy(desc(vocalExercisePracticeSessions.startedAt));
    exerciseSessions = rows.map((row) => mapVocalExercisePracticeSession(row.session, row.title));
  } catch (error) {
    if (!isMissingVocalExercisePracticeSessionTableError(error)) {
      throw error;
    }
  }

  const groupedSongSessions = groupSongPracticeSessions(songSessions);
  const rangedSongSessions = filterPracticeSessionsByRange(groupedSongSessions, range, now);
  const rangedExerciseSessions = filterPracticeSessionsByRange(exerciseSessions, range, now);
  const songPracticeSummary = buildPracticeTimeSummary(rangedSongSessions, now, range);
  const exercisePracticeSummary = buildPracticeTimeSummary(rangedExerciseSessions, now, range);

  const playlistRows = await db()
    .select({
      songId: songs.id,
      songTitle: songs.title,
      playlistId: playlists.id,
      playlistName: playlists.name,
      playlistEventDate: playlists.eventDate,
      playlistPerformanceStatus: playlists.performanceStatus,
      playlistIsRetired: playlists.isRetired,
    })
    .from(playlistSongs)
    .innerJoin(songs, eq(songs.id, playlistSongs.songId))
    .innerJoin(playlists, eq(playlists.id, playlistSongs.playlistId))
    .where(and(eq(songs.userId, userId), eq(playlists.userId, userId)));
  const playlistCountRows = await db()
    .select({ count: count(playlists.id) })
    .from(playlists)
    .where(eq(playlists.userId, userId));
  const totalPlaylists = playlistCountRows[0]?.count ?? 0;
  const playlistNamesBySong = new Map<string, { title: string; names: Set<string> }>();
  const performancesBySong = new Map<string, { title: string; dates: Set<string> }>();
  const performedPlaylistIds = new Set<string>();
  for (const row of playlistRows) {
    const entry = playlistNamesBySong.get(row.songId) ?? { title: row.songTitle, names: new Set<string>() };
    entry.names.add(row.playlistName);
    playlistNamesBySong.set(row.songId, entry);
    if (row.playlistIsRetired && row.playlistPerformanceStatus === "Performed") {
      performedPlaylistIds.add(row.playlistId);
      const performance = performancesBySong.get(row.songId) ?? { title: row.songTitle, dates: new Set<string>() };
      performance.dates.add(row.playlistEventDate ?? "undated");
      performancesBySong.set(row.songId, performance);
    }
  }
  const mostIncludedSongs = Array.from(playlistNamesBySong.entries())
    .map(([id, entry]) => ({
      id,
      title: entry.title,
      playlistCount: entry.names.size,
      playlistNames: Array.from(entry.names).sort((a, b) => a.localeCompare(b)),
    }))
    .sort((a, b) => b.playlistCount - a.playlistCount || a.title.localeCompare(b.title))
    .slice(0, 8);
  const songsInAnyPlaylist = playlistNamesBySong.size;
  const mostPerformedSongs = Array.from(performancesBySong.entries())
    .map(([id, entry]) => ({
      id,
      title: entry.title,
      performanceCount: entry.dates.size,
      performanceDates: Array.from(entry.dates).sort((a, b) => b.localeCompare(a)),
    }))
    .sort((a, b) => b.performanceCount - a.performanceCount || a.title.localeCompare(b.title))
    .slice(0, 8);

  return {
    userId,
    generatedAt: now.toISOString(),
    songs: {
      total: songStats.length,
      masteredAbove80,
      practicedInRange,
      untouchedOverSixMonths,
      neverPracticed,
      averageMasteryPercent,
      untouchedSongs: untouchedSongStats.map((song) => ({
        id: song.id,
        title: song.title,
        artist: song.artist,
        lastPracticedAt: song.lastPracticedAt ? song.lastPracticedAt.toISOString() : null,
        masteryPercent: song.masteryPercent,
      })),
      stalestSong: stalestSong ? {
        id: stalestSong.id,
        title: stalestSong.title,
        lastPracticedAt: stalestSong.lastPracticedAt ? stalestSong.lastPracticedAt.toISOString() : null,
        masteryPercent: stalestSong.masteryPercent,
      } : undefined,
    },
    songPractice: {
      ...songPracticeSummary,
      recentSessions: rangedSongSessions.slice(0, 8),
    },
    exercises: {
      ...exercisePracticeSummary,
      recentSessions: rangedExerciseSessions.slice(0, 8),
    },
    playlists: {
      totalPlaylists,
      performedPlaylists: performedPlaylistIds.size,
      songsInAnyPlaylist,
      songsNotInAnyPlaylist: Math.max(0, songStats.length - songsInAnyPlaylist),
      totalSongPlacements: playlistRows.length,
      averagePlacementsPerSong: songStats.length > 0 ? Math.round((playlistRows.length / songStats.length) * 10) / 10 : 0,
      averagePlacementsPerPlaylist: totalPlaylists > 0 ? Math.round((playlistRows.length / totalPlaylists) * 10) / 10 : 0,
      mostIncludedSongs,
      mostPerformedSongs,
    },
  };
}

export async function getUserVocalRange(userId: string): Promise<PersistedVocalRange | null> {
  const rows = await db()
    .select({ low: userVocalRanges.lowMidi, high: userVocalRanges.highMidi })
    .from(userVocalRanges)
    .where(eq(userVocalRanges.userId, userId))
    .limit(1);
  return rows[0] ?? null;
}

export async function saveUserVocalRange(userId: string, range: PersistedVocalRange): Promise<PersistedVocalRange> {
  const rows = await db()
    .insert(userVocalRanges)
    .values({ userId, lowMidi: range.low, highMidi: range.high, updatedAt: new Date() })
    .onConflictDoUpdate({
      target: userVocalRanges.userId,
      set: { lowMidi: range.low, highMidi: range.high, updatedAt: new Date() },
    })
    .returning({ low: userVocalRanges.lowMidi, high: userVocalRanges.highMidi });
  return rows[0];
}
