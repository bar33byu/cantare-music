import { eq, asc, desc, inArray } from "drizzle-orm";
import { db } from "./index";
import { songs, segments, practiceRatings } from "./schema";
import type { SongRow, SegmentRow } from "./schema";

export type PersistedMemoryRating = 1 | 2 | 3 | 4 | 5;

export interface PersistedSegmentRating {
  id: string;
  segmentId: string;
  rating: PersistedMemoryRating;
  ratedAt: string;
}

// ── Songs ──────────────────────────────────────────────────────────────────

export async function getAllSongs(): Promise<SongRow[]> {
  return db().select().from(songs).orderBy(desc(songs.createdAt));
}

export async function getSongById(
  id: string
): Promise<SongRow | undefined> {
  const rows = await db()
    .select()
    .from(songs)
    .where(eq(songs.id, id))
    .limit(1);
  return rows[0];
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