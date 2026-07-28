import {
  pgTable,
  text,
  integer,
  timestamp,
  boolean,
  jsonb,
  primaryKey,
  index,
  uniqueIndex,
} from "drizzle-orm/pg-core";
import { InferSelectModel, sql } from "drizzle-orm";

export interface SegmentPitchContourPoint {
  id: string;
  timeOffsetMs: number;
  lane: number;
  durationMs: number;
}

export interface SongPitchContourPoint {
  id: string;
  absoluteMs: number;
  lane: number;
  durationMs: number;
}

export interface RawMidiNoteData {
  index: number;
  trackIndex: number;
  midiPitch: number;
  pitchName: string;
  velocity: number;
  midiStartTick: number;
  midiDurationTicks: number;
  midiStartSeconds: number;
  midiDurationSeconds: number;
}

export interface CleanedMidiNoteData {
  index: number;
  sourceRawIndex: number;
  midiPitch: number;
  pitchName: string;
  midiStartSeconds: number;
  midiDurationSeconds: number;
  midiStartTick: number;
  midiDurationTicks: number;
  movementFromPrevious: "start" | "up" | "down" | "same";
}

export interface MidiCleanupSettingsData {
  shortNoteThresholdMs: number;
  simultaneousThresholdMs: number;
}

export interface VocalExerciseEventData {
  id: string;
  startBeat: number;
  durationBeats: number;
  midi: number;
  velocity: number;
  region: "context" | "exercise";
  lyric?: string;
  role?: string;
}

export const users = pgTable(
  "users",
  {
    id: text("id").primaryKey(),
    username: text("username").notNull(),
    name: text("name").notNull(),
    email: text("email").notNull().default(""),
    avatarUrl: text("avatar_url"),
    profileVisibility: text("profile_visibility").notNull().default("private"),
    accountDeletionRequestedAt: timestamp("account_deletion_requested_at"),
    accountDeletionScheduledFor: timestamp("account_deletion_scheduled_for"),
    createdAt: timestamp("created_at").defaultNow(),
    updatedAt: timestamp("updated_at").defaultNow(),
  },
  (table) => ({
    usernameUniqueIdx: uniqueIndex("users_username_unique").on(table.username),
    emailUniqueIdx: uniqueIndex("users_email_unique").on(table.email).where(sql`${table.email} IS NOT NULL AND ${table.email} <> ''`),
  })
);

export const magicLinkTokens = pgTable(
  "magic_link_tokens",
  {
    id: text("id").primaryKey(),
    email: text("email").notNull(),
    tokenHash: text("token_hash").notNull(),
    createdAt: timestamp("created_at").notNull().defaultNow(),
    expiresAt: timestamp("expires_at").notNull(),
    consumedAt: timestamp("consumed_at"),
  },
  (table) => ({
    tokenHashUniqueIdx: uniqueIndex("magic_link_tokens_token_hash_unique").on(table.tokenHash),
    emailCreatedAtIdx: index("idx_magic_link_tokens_email_created_at").on(table.email, table.createdAt),
  })
);

export const userSessions = pgTable(
  "user_sessions",
  {
    id: text("id").primaryKey(),
    userId: text("user_id")
      .notNull()
      .references(() => users.id, { onDelete: "cascade" }),
    tokenHash: text("token_hash").notNull(),
    createdAt: timestamp("created_at").notNull().defaultNow(),
    expiresAt: timestamp("expires_at").notNull(),
    revokedAt: timestamp("revoked_at"),
  },
  (table) => ({
    tokenHashUniqueIdx: uniqueIndex("user_sessions_token_hash_unique").on(table.tokenHash),
    userExpiresAtIdx: index("idx_user_sessions_user_expires_at").on(table.userId, table.expiresAt),
  })
);

export const auditLogs = pgTable(
  "audit_logs",
  {
    id: text("id").primaryKey(),
    eventType: text("event_type").notNull(),
    actorUserId: text("actor_user_id").references(() => users.id, { onDelete: "set null" }),
    effectiveUserId: text("effective_user_id").references(() => users.id, { onDelete: "set null" }),
    resourceType: text("resource_type"),
    resourceId: text("resource_id"),
    metadata: jsonb("metadata").$type<Record<string, unknown>>().notNull().default(sql`'{}'::jsonb`),
    createdAt: timestamp("created_at").notNull().defaultNow(),
  },
  (table) => ({
    eventTypeCreatedAtIdx: index("idx_audit_logs_event_type_created_at").on(table.eventType, table.createdAt),
    actorCreatedAtIdx: index("idx_audit_logs_actor_created_at").on(table.actorUserId, table.createdAt),
    effectiveCreatedAtIdx: index("idx_audit_logs_effective_created_at").on(table.effectiveUserId, table.createdAt),
    resourceIdx: index("idx_audit_logs_resource").on(table.resourceType, table.resourceId),
  })
);

export const songs = pgTable(
  "songs",
  {
    id: text("id").primaryKey(),
    userId: text("user_id").notNull().default("default"),
    title: text("title").notNull(),
    artist: text("artist"),
    audioKey: text("audio_key"),
    alternateAudioKey: text("alternate_audio_key"),
    audioTrimStartMs: integer("audio_trim_start_ms"),
    audioTrimEndMs: integer("audio_trim_end_ms"),
    sourceSongId: text("source_song_id"),
    pitchContourNotes: jsonb("pitch_contour_notes")
      .$type<SongPitchContourPoint[]>()
      .notNull()
      .default(sql`'[]'::jsonb`),
    createdAt: timestamp("created_at").defaultNow(),
    lastPracticedAt: timestamp("last_practiced_at"),
  },
  (table) => ({
    userIdIdx: index("idx_songs_user_id").on(table.userId),
    userCreatedAtIdx: index("idx_songs_user_created_at").on(table.userId, table.createdAt),
    sourceSongIdx: index("idx_songs_source_song_id").on(table.sourceSongId),
  })
);

export const segments = pgTable("segments", {
  id: text("id").primaryKey(),
  songId: text("song_id")
    .notNull()
    .references(() => songs.id, { onDelete: "cascade" }),
  label: text("label").notNull(),
  order: integer("order").notNull(),
  startMs: integer("start_ms").notNull().default(0),
  endMs: integer("end_ms").notNull().default(0),
  lyricText: text("lyric_text").default(""),
  sourceSegmentId: text("source_segment_id"),
  pitchContourNotes: jsonb("pitch_contour_notes")
    .$type<SegmentPitchContourPoint[]>()
    .notNull()
    .default(sql`'[]'::jsonb`),
});

export const practiceRatings = pgTable("practice_ratings", {
  id: text("id").primaryKey(),
  userId: text("user_id").notNull().default("default"),
  segmentId: text("segment_id")
    .notNull()
    .references(() => segments.id, { onDelete: "cascade" }),
  rating: integer("rating").notNull(),
  ratedAt: timestamp("rated_at").notNull(),
});

export const playlists = pgTable(
  "playlists",
  {
    id: text("id").primaryKey(),
    userId: text("user_id").notNull().default("default"),
    name: text("name").notNull(),
    eventDate: text("event_date"),
    performanceStatus: text("performance_status"),
    isRetired: boolean("is_retired").notNull().default(false),
    isPublic: boolean("is_public").notNull().default(false),
    publishedAt: timestamp("published_at"),
    shareToken: text("share_token"),
    sharedAt: timestamp("shared_at"),
    shareAudioMode: text("share_audio_mode").notNull().default("both"),
    publicShareAudioMode: text("public_share_audio_mode").notNull().default("both"),
    sourcePlaylistId: text("source_playlist_id"),
    sourceOwnerId: text("source_owner_id"),
    sourceShareToken: text("source_share_token"),
    importedAt: timestamp("imported_at"),
    createdAt: timestamp("created_at").defaultNow(),
  },
  (table) => ({
    userIdIdx: index("idx_playlists_user_id").on(table.userId),
    userCreatedAtIdx: index("idx_playlists_user_created_at").on(table.userId, table.createdAt),
    publicPublishedAtIdx: index("idx_playlists_public_published_at").on(table.isPublic, table.publishedAt),
    sourceImportIdx: index("idx_playlists_user_source_playlist").on(table.userId, table.sourcePlaylistId),
    shareTokenUniqueIdx: uniqueIndex("playlists_share_token_unique").on(table.shareToken).where(sql`${table.shareToken} IS NOT NULL`),
  })
);

export const playlistSongs = pgTable(
  "playlist_songs",
  {
    playlistId: text("playlist_id")
      .notNull()
      .references(() => playlists.id, { onDelete: "cascade" }),
    songId: text("song_id")
      .notNull()
      .references(() => songs.id, { onDelete: "cascade" }),
    position: integer("position").notNull().default(0),
  },
  (table) => ({
    pk: primaryKey({ columns: [table.playlistId, table.songId] }),
  })
);

export const orphanedAudioKeys = pgTable("orphaned_audio_keys", {
  id: text("id").primaryKey(),
  userId: text("user_id").notNull().default("default"),
  audioKey: text("audio_key").notNull(),
  failedAt: timestamp("failed_at").defaultNow(),
});

export const draftRecordings = pgTable(
  "draft_recordings",
  {
    id: text("id").primaryKey(),
    userId: text("user_id").notNull().default("default"),
    songId: text("song_id")
      .references(() => songs.id, { onDelete: "cascade" }),
    title: text("title"),
    audioKey: text("audio_key").notNull(),
    status: text("status").notNull().default("draft"),
    trimStartMs: integer("trim_start_ms"),
    trimEndMs: integer("trim_end_ms"),
    createdAt: timestamp("created_at").notNull().defaultNow(),
    archivedAt: timestamp("archived_at"),
  },
  (table) => ({
    songStatusCreatedAtIdx: index("idx_draft_recordings_song_status_created_at").on(table.songId, table.status, table.createdAt),
    userStatusCreatedAtIdx: index("idx_draft_recordings_user_status_created_at").on(table.userId, table.status, table.createdAt),
  })
);

export const tapPracticeSessions = pgTable(
  "tap_practice_sessions",
  {
    id: text("id").primaryKey(),
    userId: text("user_id").notNull().default("default"),
    songId: text("song_id")
      .notNull()
      .references(() => songs.id, { onDelete: "cascade" }),
    segmentId: text("segment_id").references(() => segments.id, { onDelete: "cascade" }),
    audioVersion: text("audio_version").notNull().default("straight"),
    mode: text("mode").notNull().default("practice"),
    inputMethod: text("input_method").notNull().default("tap"),
    startedAt: timestamp("started_at").notNull().defaultNow(),
    completedAt: timestamp("completed_at"),
    finalizedAt: timestamp("finalized_at"),
    autoScorePercent: integer("auto_score_percent"),
    selfRating: integer("self_rating"),
    scoreDetails: jsonb("score_details").$type<unknown>().notNull().default(sql`'{}'::jsonb`),
  },
  (table) => ({
    userIdStartedAtIdx: index("idx_tap_practice_sessions_user_started_at").on(table.userId, table.startedAt),
    userSongStartedAtIdx: index("idx_tap_practice_sessions_user_song_started_at").on(table.userId, table.songId, table.startedAt),
    userSongSegmentModeIdx: index("idx_tap_practice_sessions_user_song_segment_mode").on(table.userId, table.songId, table.segmentId, table.mode),
  })
);

export const tapPracticeTaps = pgTable(
  "tap_practice_taps",
  {
    id: text("id").primaryKey(),
    sessionId: text("session_id")
      .notNull()
      .references(() => tapPracticeSessions.id, { onDelete: "cascade" }),
    segmentId: text("segment_id")
      .notNull()
      .references(() => segments.id, { onDelete: "cascade" }),
    noteId: text("note_id").notNull(),
    timeOffsetMs: integer("time_offset_ms").notNull(),
    durationMs: integer("duration_ms").notNull(),
    laneMilli: integer("lane_milli").notNull(),
    direction: text("direction"),
    createdAt: timestamp("created_at").notNull().defaultNow(),
  },
  (table) => ({
    sessionCreatedAtIdx: index("idx_tap_practice_taps_session_created_at").on(table.sessionId, table.createdAt),
  })
);

export const songPracticeSessions = pgTable(
  "song_practice_sessions",
  {
    id: text("id").primaryKey(),
    userId: text("user_id").notNull().default("default"),
    songId: text("song_id")
      .notNull()
      .references(() => songs.id, { onDelete: "cascade" }),
    segmentId: text("segment_id").references(() => segments.id, { onDelete: "set null" }),
    source: text("source").notNull().default("song"),
    startedAt: timestamp("started_at").notNull().defaultNow(),
    completedAt: timestamp("completed_at"),
    durationSeconds: integer("duration_seconds").notNull().default(0),
  },
  (table) => ({
    userStartedAtIdx: index("idx_song_practice_sessions_user_started_at").on(table.userId, table.startedAt),
    userSongStartedAtIdx: index("idx_song_practice_sessions_user_song_started_at").on(table.userId, table.songId, table.startedAt),
  })
);

export const midiSources = pgTable(
  "midi_sources",
  {
    id: text("id").primaryKey(),
    songId: text("song_id")
      .notNull()
      .references(() => songs.id, { onDelete: "cascade" }),
    originalFilename: text("original_filename").notNull(),
    storageKey: text("storage_key").notNull(),
    uploadedAt: timestamp("uploaded_at").notNull().defaultNow(),
    contentType: text("content_type"),
    fileSize: integer("file_size").notNull().default(0),
    parseStatus: text("parse_status").notNull().default("parsed"),
    cleanupSettings: jsonb("cleanup_settings")
      .$type<MidiCleanupSettingsData>()
      .notNull()
      .default(sql`'{"shortNoteThresholdMs":0,"simultaneousThresholdMs":30}'::jsonb`),
    rawNotes: jsonb("raw_notes").$type<RawMidiNoteData[]>().notNull().default(sql`'[]'::jsonb`),
    cleanedNotes: jsonb("cleaned_notes").$type<CleanedMidiNoteData[]>().notNull().default(sql`'[]'::jsonb`),
    rawNoteCount: integer("raw_note_count").notNull().default(0),
    cleanedNoteCount: integer("cleaned_note_count").notNull().default(0),
    ignoredShortNoteCount: integer("ignored_short_note_count").notNull().default(0),
    parseError: text("parse_error"),
  },
  (table) => ({
    songUploadedAtIdx: index("idx_midi_sources_song_uploaded_at").on(table.songId, table.uploadedAt),
  })
);

export const midiAlignments = pgTable(
  "midi_alignments",
  {
    id: text("id").primaryKey(),
    songId: text("song_id")
      .notNull()
      .references(() => songs.id, { onDelete: "cascade" }),
    midiSourceId: text("midi_source_id")
      .notNull()
      .references(() => midiSources.id, { onDelete: "cascade" }),
    tappedStartTimesSeconds: jsonb("tapped_start_times_seconds")
      .$type<number[]>()
      .notNull()
      .default(sql`'[]'::jsonb`),
    retainedMidiNoteCount: integer("retained_midi_note_count").notNull().default(0),
    isComplete: boolean("is_complete").notNull().default(false),
    status: text("status").notNull().default("partial"),
    notes: text("notes"),
    createdAt: timestamp("created_at").notNull().defaultNow(),
    updatedAt: timestamp("updated_at").notNull().defaultNow(),
  },
  (table) => ({
    songUpdatedAtIdx: index("idx_midi_alignments_song_updated_at").on(table.songId, table.updatedAt),
    sourceUpdatedAtIdx: index("idx_midi_alignments_source_updated_at").on(table.midiSourceId, table.updatedAt),
  })
);

export const vocalExercises = pgTable(
  "vocal_exercises",
  {
    id: text("id").primaryKey(),
    slug: text("slug"),
    title: text("title").notNull(),
    category: text("category"),
    syllable: text("syllable"),
    description: text("description"),
    difficulty: text("difficulty"),
    pattern: text("pattern"),
    coachingNotes: jsonb("coaching_notes").$type<string[]>().notNull().default(sql`'[]'::jsonb`),
    sourceMidiFile: text("source_midi_file").notNull(),
    audioKey: text("audio_key"),
    alternateAudioKey: text("alternate_audio_key"),
    lyricHint: text("lyric_hint").notNull().default(""),
    exerciseStartBeatMilli: integer("exercise_start_beat_milli").notNull().default(0),
    tempoBpmMilli: integer("tempo_bpm_milli").notNull().default(120000),
    timeSignatureNumerator: integer("time_signature_numerator").notNull().default(4),
    timeSignatureDenominator: integer("time_signature_denominator").notNull().default(4),
    durationBeatsMilli: integer("duration_beats_milli").notNull(),
    events: jsonb("events").$type<VocalExerciseEventData[]>().notNull().default(sql`'[]'::jsonb`),
    createdByUserId: text("created_by_user_id").references(() => users.id, { onDelete: "set null" }),
    createdAt: timestamp("created_at").notNull().defaultNow(),
    updatedAt: timestamp("updated_at").notNull().defaultNow(),
  },
  (table) => ({
    titleIdx: index("idx_vocal_exercises_title").on(table.title),
    slugUniqueIdx: uniqueIndex("vocal_exercises_slug_unique").on(table.slug).where(sql`${table.slug} IS NOT NULL`),
  })
);

export const vocalExerciseCollections = pgTable("vocal_exercise_collections", {
  slug: text("slug").primaryKey(),
  title: text("title").notNull(),
  description: text("description"),
  intendedSinger: text("intended_singer"),
  primaryGoals: jsonb("primary_goals").$type<string[]>().notNull().default(sql`'[]'::jsonb`),
  restBetweenIterationsMeasures: integer("rest_between_iterations_measures").notNull().default(0),
  transposeMode: text("transpose_mode").notNull().default("semitone_all_notes"),
  createdAt: timestamp("created_at").notNull().defaultNow(),
  updatedAt: timestamp("updated_at").notNull().defaultNow(),
});

export const vocalExerciseCollectionItems = pgTable(
  "vocal_exercise_collection_items",
  {
    collectionSlug: text("collection_slug")
      .notNull()
      .references(() => vocalExerciseCollections.slug, { onDelete: "cascade" }),
    exerciseId: text("exercise_id")
      .notNull()
      .references(() => vocalExercises.id, { onDelete: "cascade" }),
    position: integer("position").notNull(),
  },
  (table) => ({
    pk: primaryKey({ columns: [table.collectionSlug, table.exerciseId] }),
    positionIdx: index("idx_vocal_exercise_collection_position").on(table.collectionSlug, table.position),
  })
);

export const vocalExercisePracticeSessions = pgTable(
  "vocal_exercise_practice_sessions",
  {
    id: text("id").primaryKey(),
    userId: text("user_id").notNull().default("default"),
    exerciseId: text("exercise_id")
      .notNull()
      .references(() => vocalExercises.id, { onDelete: "cascade" }),
    startedAt: timestamp("started_at").notNull().defaultNow(),
    completedAt: timestamp("completed_at"),
    durationSeconds: integer("duration_seconds").notNull().default(0),
    tempoPercent: integer("tempo_percent").notNull().default(100),
    repetitionCount: integer("repetition_count").notNull().default(0),
    audioVersion: text("audio_version").notNull().default("unknown"),
    practiceMode: text("practice_mode").notNull().default("unknown"),
    routineId: text("routine_id"),
    completionStatus: text("completion_status").notNull().default("legacy"),
    routineCompleted: boolean("routine_completed").notNull().default(false),
  },
  (table) => ({
    userStartedAtIdx: index("idx_vocal_exercise_practice_user_started_at").on(table.userId, table.startedAt),
    userExerciseStartedAtIdx: index("idx_vocal_exercise_practice_user_exercise_started_at").on(table.userId, table.exerciseId, table.startedAt),
  })
);

export const userVocalRanges = pgTable("user_vocal_ranges", {
  userId: text("user_id")
    .primaryKey()
    .references(() => users.id, { onDelete: "cascade" }),
  lowMidi: integer("low_midi").notNull(),
  highMidi: integer("high_midi").notNull(),
  updatedAt: timestamp("updated_at").notNull().defaultNow(),
});

export type UserRow = InferSelectModel<typeof users>;
export type MagicLinkTokenRow = InferSelectModel<typeof magicLinkTokens>;
export type UserSessionRow = InferSelectModel<typeof userSessions>;
export type AuditLogRow = InferSelectModel<typeof auditLogs>;
export type SongRow = Omit<InferSelectModel<typeof songs>, "sourceSongId" | "audioTrimStartMs" | "audioTrimEndMs"> & {
  sourceSongId?: string | null;
  audioTrimStartMs?: number | null;
  audioTrimEndMs?: number | null;
};
export type SegmentRow = Omit<InferSelectModel<typeof segments>, "sourceSegmentId"> & {
  sourceSegmentId?: string | null;
};
export type PracticeRatingRow = InferSelectModel<typeof practiceRatings>;
export type PlaylistRow = InferSelectModel<typeof playlists>;
export type PlaylistSongRow = InferSelectModel<typeof playlistSongs>;
export type OrphanedAudioKeyRow = InferSelectModel<typeof orphanedAudioKeys>;
export type DraftRecordingRow = InferSelectModel<typeof draftRecordings>;
export type TapPracticeSessionRow = InferSelectModel<typeof tapPracticeSessions>;
export type TapPracticeTapRow = InferSelectModel<typeof tapPracticeTaps>;
export type SongPracticeSessionRow = InferSelectModel<typeof songPracticeSessions>;
export type MidiSourceRow = InferSelectModel<typeof midiSources>;
export type MidiAlignmentRow = InferSelectModel<typeof midiAlignments>;
export type VocalExerciseRow = InferSelectModel<typeof vocalExercises>;
export type VocalExerciseCollectionRow = InferSelectModel<typeof vocalExerciseCollections>;
export type VocalExercisePracticeSessionRow = InferSelectModel<typeof vocalExercisePracticeSessions>;
export type UserVocalRangeRow = InferSelectModel<typeof userVocalRanges>;
