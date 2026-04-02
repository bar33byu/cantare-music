import { eq, asc, desc, inArray, and, count } from "drizzle-orm";
import { db } from "./index";
import { songs, segments, practiceRatings, playlists, playlistSongs } from "./schema";
import type { SongRow, SegmentRow, PlaylistRow } from "./schema";

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

// ── Songs ──────────────────────────────────────────────────────────────────

export async function getAllSongs(): Promise<SongRow[]> {
  let primaryError: unknown;
  try {
    return await db().select().from(songs).orderBy(desc(songs.createdAt));
  } catch (error) {
    primaryError = error;
  }

  try {
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

    return legacyRows.map((row) => ({ ...row, lastPracticedAt: null } as SongRow));
  } catch {
    throw primaryError;
  }
}

export async function getSongById(
  id: string
): Promise<SongRow | undefined> {
  let primaryError: unknown;
  try {
    const rows = await db()
      .select()
      .from(songs)
      .where(eq(songs.id, id))
      .limit(1);
    return rows[0];
  } catch (error) {
    primaryError = error;
  }

  try {
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

    return { ...row, lastPracticedAt: null } as SongRow;
  } catch {
    throw primaryError;
  }
}

export async function createSong(data: {
  id: string;
  title: string;
  artist?: string;
  audioKey?: string;
}): Promise<SongRow> {
  const rows = await db()
    .insert(songs)
    .values({
      id: data.id,
      title: data.title,
      artist: data.artist ?? null,
      audioKey: data.audioKey ?? null,
    })
    .returning();
  return rows[0];
}

export async function updateSongAudioKey(
  id: string,
  audioKey: string
): Promise<void> {
  await db()
    .update(songs)
    .set({ audioKey })
    .where(eq(songs.id, id));
}

export async function updateSong(
  id: string,
  updates: Partial<Pick<SongRow, 'audioKey' | 'title' | 'artist'>>
): Promise<void> {
  await db()
    .update(songs)
    .set(updates)
    .where(eq(songs.id, id));
}

export async function markSongPracticed(
  id: string,
  practicedAt: Date = new Date()
): Promise<void> {
  try {
    await db()
      .update(songs)
      .set({ lastPracticedAt: practicedAt })
      .where(eq(songs.id, id));
  } catch (error) {
    if (isMissingLastPracticedColumnError(error)) {
      return;
    }
    throw error;
  }
}

export async function deleteSong(id: string): Promise<void> {
  await db().delete(songs).where(eq(songs.id, id));
}

// ── Segments ───────────────────────────────────────────────────────────────

export async function getSegmentsBySongId(
  songId: string
): Promise<SegmentRow[]> {
  return db()
    .select()
    .from(segments)
    .where(eq(segments.songId, songId))
    .orderBy(asc(segments.order));
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
  }>
): Promise<void> {
  await db().delete(segments).where(eq(segments.songId, songId));
  if (newSegments.length > 0) {
    await db().insert(segments).values(
      newSegments.map((s) => ({ ...s, songId }))
    );
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
}): Promise<SegmentRow> {
  const rows = await db()
    .insert(segments)
    .values(data)
    .returning();
  return rows[0];
}

export async function updateSegment(
  id: string,
  updates: Partial<Pick<SegmentRow, 'label' | 'order' | 'startMs' | 'endMs' | 'lyricText'>>
): Promise<void> {
  await db()
    .update(segments)
    .set(updates)
    .where(eq(segments.id, id));
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
  songId: string
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
    .where(eq(segments.songId, songId))
    .orderBy(desc(practiceRatings.ratedAt));

  return rows.map((row) => ({
    id: row.id,
    segmentId: row.segmentId,
    rating: row.rating as PersistedMemoryRating,
    ratedAt: row.ratedAt.toISOString(),
  }));
}

export async function getLatestRatingTimeBySongIds(
  songIds: string[]
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
    .where(inArray(segments.songId, songIds))
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
  songIds: string[]
): Promise<Record<string, number>> {
  if (songIds.length === 0) {
    return {};
  }

  const rows = await db()
    .select({
      songId: segments.songId,
      segmentId: segments.id,
      rating: practiceRatings.rating,
      ratedAt: practiceRatings.ratedAt,
    })
    .from(practiceRatings)
    .innerJoin(segments, eq(practiceRatings.segmentId, segments.id))
    .where(inArray(segments.songId, songIds))
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
  for (const songId of Object.keys(latestBySongSegment)) {
    const segmentRatings = Object.values(latestBySongSegment[songId]);
    if (segmentRatings.length === 0) {
      knowledgeBySong[songId] = 0;
      continue;
    }
    const averageRating = segmentRatings.reduce((sum, rating) => sum + rating, 0) / segmentRatings.length;
    knowledgeBySong[songId] = Math.round(averageRating * 20);
  }

  return knowledgeBySong;
}

export async function saveRatings(
  ratings: Array<{
    segmentId: string;
    rating: PersistedMemoryRating;
    ratedAt: Date;
  }>
): Promise<void> {
  if (ratings.length === 0) {
    return;
  }

  await db()
    .insert(practiceRatings)
    .values(
      ratings.map((rating) => ({
        id: crypto.randomUUID(),
        segmentId: rating.segmentId,
        rating: rating.rating,
        ratedAt: rating.ratedAt,
      }))
    )
    .onConflictDoNothing();
}

export async function deleteRatingsForSong(songId: string): Promise<void> {
  const songSegments = await db()
    .select({ id: segments.id })
    .from(segments)
    .where(eq(segments.songId, songId));

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

export async function getAllPlaylists(includeRetired = false): Promise<PlaylistSummary[]> {
  const baseQuery = db().select().from(playlists).orderBy(desc(playlists.createdAt));
  const rows = includeRetired
    ? await baseQuery
    : await baseQuery.where(eq(playlists.isRetired, false));

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

export async function getPlaylistById(id: string): Promise<PlaylistDetail | null> {
  const playlistRows = await db()
    .select()
    .from(playlists)
    .where(eq(playlists.id, id))
    .limit(1);

  const playlist = playlistRows[0];
  if (!playlist) {
    return null;
  }

  const linkedSongs = await db()
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

  const songIds = linkedSongs.map((s) => s.songId);
  const [segmentsBySong, masteryBySong, latestRatingTimes] = await Promise.all([
    Promise.all(linkedSongs.map((s) => getSegmentsBySongId(s.songId))),
    getSongKnowledgeBySongIds(songIds),
    getLatestRatingTimeBySongIds(songIds),
  ]);

  const songsWithSegments: PlaylistSongItem[] = linkedSongs.map((songRow, i) => ({
    id: songRow.songId,
    title: songRow.title,
    artist: songRow.artist ?? undefined,
    audioUrl: songRow.audioKey ?? "",
    segments: segmentsBySong[i],
    createdAt: toIso(songRow.createdAt),
    updatedAt: toIso(songRow.createdAt),
    position: songRow.position,
    masteryPercent: masteryBySong[songRow.songId] ?? 0,
    lastPracticedAt: songRow.lastPracticedAt
      ? toIso(songRow.lastPracticedAt)
      : latestRatingTimes[songRow.songId] ?? null,
  }));

  return {
    ...mapPlaylistSummary(playlist),
    songs: songsWithSegments,
  };
}

export async function createPlaylist(data: {
  name: string;
  eventDate?: string;
}): Promise<PlaylistSummary> {
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

export async function updatePlaylist(
  id: string,
  data: { name?: string; eventDate?: string; isRetired?: boolean }
): Promise<void> {
  const updates: Partial<Pick<PlaylistRow, "name" | "eventDate" | "isRetired">> = {};
  if (data.name !== undefined) updates.name = data.name;
  if (data.eventDate !== undefined) updates.eventDate = data.eventDate;
  if (data.isRetired !== undefined) updates.isRetired = data.isRetired;

  if (Object.keys(updates).length === 0) {
    return;
  }

  await db().update(playlists).set(updates).where(eq(playlists.id, id));
}

export async function deletePlaylist(id: string): Promise<void> {
  await db().delete(playlists).where(eq(playlists.id, id));
}

export async function addSongToPlaylist(
  playlistId: string,
  songId: string,
  position?: number
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

export async function removeSongFromPlaylist(playlistId: string, songId: string): Promise<void> {
  await db()
    .delete(playlistSongs)
    .where(and(eq(playlistSongs.playlistId, playlistId), eq(playlistSongs.songId, songId)));
}

export async function reorderPlaylistSongs(
  playlistId: string,
  orderedSongIds: string[]
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