import { eq, asc, desc, inArray, and, count } from "drizzle-orm";
import { db } from "./index";
import { songs, segments, practiceRatings, playlists, playlistSongs, orphanedAudioKeys } from "./schema";
import type { SongRow, SegmentRow, PlaylistRow, OrphanedAudioKeyRow } from "./schema";

const DEFAULT_QUERY_USER_ID = "default";

export type PersistedMemoryRating = 1 | 2 | 3 | 4 | 5;

export interface PersistedSegmentRating {
  id: string;
  segmentId: string;
  rating: PersistedMemoryRating;
  ratedAt: string;
}

export interface PlaylistSongItem {
  id: string;
  title: string;
  artist?: string;
  audioUrl: string;
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

      return legacyRows.map((row) => ({ ...row, userId: DEFAULT_QUERY_USER_ID } as SongRow));
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

      return legacyRows.map((row) => ({ ...row, userId: DEFAULT_QUERY_USER_ID, lastPracticedAt: null } as SongRow));
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

    return legacyRows.map((row) => ({ ...row, lastPracticedAt: null } as SongRow));
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
      return { ...row, userId: DEFAULT_QUERY_USER_ID } as SongRow;
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

      return { ...row, userId: DEFAULT_QUERY_USER_ID, lastPracticedAt: null } as SongRow;
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

    return { ...row, lastPracticedAt: null } as SongRow;
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
  updates: Partial<Pick<SongRow, 'audioKey' | 'title' | 'artist'>>,
  userId: string = DEFAULT_QUERY_USER_ID
): Promise<void> {
  await db()
    .update(songs)
    .set(updates)
    .where(and(eq(songs.id, id), eq(songs.userId, userId)));
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

// ── Playlists ─────────────────────────────────────────────────────────────

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

    playlistRows = await db()
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

    playlistRows = playlistRows.map((row) => ({ ...row, userId: DEFAULT_QUERY_USER_ID } as PlaylistRow));
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
        createdAt: songs.createdAt,
        lastPracticedAt: songs.lastPracticedAt,
      })
      .from(playlistSongs)
      .innerJoin(songs, eq(playlistSongs.songId, songs.id))
      .where(and(eq(playlistSongs.playlistId, id), eq(songs.userId, playlist.userId)))
      .orderBy(asc(playlistSongs.position));
  } catch (error) {
    if (!isMissingUserIdColumnError(error)) {
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
        createdAt: songs.createdAt,
        lastPracticedAt: songs.lastPracticedAt,
      })
      .from(playlistSongs)
      .innerJoin(songs, eq(playlistSongs.songId, songs.id))
      .where(eq(playlistSongs.playlistId, id))
      .orderBy(asc(playlistSongs.position));
  }

  const songIds = linkedSongs.map((s) => s.songId);
  const [segmentsBySong, masteryBySong, latestRatingTimes, ratingCounts] = await Promise.all([
    Promise.all(linkedSongs.map((s) => getSegmentsBySongId(s.songId))),
    getSongKnowledgeBySongIds(songIds, playlist.userId),
    getLatestRatingTimeBySongIds(songIds, playlist.userId),
    getRatingCountBySongIds(songIds, playlist.userId),
  ]);

  const songsWithSegments: PlaylistSongItem[] = linkedSongs.map((songRow, i) => ({
    id: songRow.songId,
    title: songRow.title,
    artist: songRow.artist ?? undefined,
    audioUrl: songRow.audioKey ?? "",
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
  userId: string = DEFAULT_QUERY_USER_ID
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
  userId: string = DEFAULT_QUERY_USER_ID
): Promise<void> {
  await db()
    .delete(playlistSongs)
    .where(and(eq(playlistSongs.playlistId, playlistId), eq(playlistSongs.songId, songId)));
}

export async function reorderPlaylistSongs(
  playlistId: string,
  orderedSongIds: string[],
  userId: string = DEFAULT_QUERY_USER_ID
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