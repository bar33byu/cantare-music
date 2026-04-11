import { NextRequest, NextResponse } from 'next/server';
import { getAllSongs, createSong, getLatestRatingTimeBySongIds, getSongKnowledgeBySongIds, getSegmentsBySongId } from '../../../db/queries';
import { resolveRequestUserId } from '../_user';

function toIsoString(value: unknown): string | null {
  if (!value) {
    return null;
  }
  if (value instanceof Date) {
    return value.toISOString();
  }
  if (typeof value === 'string') {
    const parsed = new Date(value);
    if (!Number.isNaN(parsed.getTime())) {
      return parsed.toISOString();
    }
  }
  return null;
}

function formatError(error: unknown) {
  const message = error instanceof Error ? error.message : 'Unknown server error';
  const shouldExpose =
    process.env.NODE_ENV === 'development' ||
    process.env.NEXT_PUBLIC_DEBUG_API_ERRORS === 'true';

  return shouldExpose ? { error: message } : { error: 'Internal server error' };
}

function isMissingDatabaseConfigError(error: unknown): boolean {
  return error instanceof Error && error.message.includes('DATABASE_URL environment variable is not set');
}

export async function GET(request: NextRequest) {
  try {
    const userId = resolveRequestUserId(request);
    const songs = await getAllSongs(userId);
    const songIds = songs.map((song) => song.id);
    const [ratingFallbackBySongId, knowledgeBySongId, readinessBySongId] = await Promise.all([
      getLatestRatingTimeBySongIds(songIds, userId),
      getSongKnowledgeBySongIds(songIds, userId),
      Promise.all(
        songIds.map(async (songId) => {
          const segments = await getSegmentsBySongId(songId);
          const hasSegments = segments.length > 0;
          const hasTapKeys = segments.some((segment) => (segment.pitchContourNotes?.length ?? 0) > 0);

          return [songId, { hasSegments, hasTapKeys }] as const;
        })
      ).then((entries) => Object.fromEntries(entries)),
    ]);

    return NextResponse.json(
      songs.map((song) => ({
        ...song,
        createdAt: toIsoString(song.createdAt) ?? new Date(0).toISOString(),
        lastPracticedAt: toIsoString(song.lastPracticedAt ?? ratingFallbackBySongId[song.id] ?? null),
        masteryPercent: knowledgeBySongId[song.id] ?? 0,
        hasAudio: Boolean(song.audioKey),
        hasSegments: readinessBySongId[song.id]?.hasSegments ?? false,
        hasTapKeys: readinessBySongId[song.id]?.hasTapKeys ?? false,
      }))
    );
  } catch (error) {
    if (isMissingDatabaseConfigError(error)) {
      // Local/dev environments may intentionally run without DB while wiring UI.
      return NextResponse.json([]);
    }
    console.error('Error fetching songs:', error);
    return NextResponse.json(formatError(error), { status: 500 });
  }
}

export async function POST(request: NextRequest) {
  try {
    const userId = resolveRequestUserId(request);
    const body = await request.json();
    const { title, artist } = body;

    if (!title || typeof title !== 'string') {
      return NextResponse.json({ error: 'Title is required and must be a string' }, { status: 400 });
    }

    if (artist !== undefined && typeof artist !== 'string') {
      return NextResponse.json({ error: 'Artist must be a string' }, { status: 400 });
    }

    const id = crypto.randomUUID();
    const song = await createSong({ id, userId, title, artist });

    return NextResponse.json(song, { status: 201 });
  } catch (error) {
    console.error('Error creating song:', error);
    return NextResponse.json(formatError(error), { status: 500 });
  }
}