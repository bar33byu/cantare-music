import { eq, asc, desc } from "drizzle-orm";
import { db } from "./index";
import { songs, segments } from "./schema";
import type { SongRow, SegmentRow } from "./schema";

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

export async function deleteSegment(id: string): Promise<void> {
  await db().delete(segments).where(eq(segments.id, id));
}