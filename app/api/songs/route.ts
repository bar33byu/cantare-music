import { NextRequest, NextResponse } from 'next/server';
import { getAllSongs, createSong, getLatestRatingTimeBySongIds } from '../../../db/queries';

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

export async function GET() {
  try {
    const songs = await getAllSongs();
    const ratingFallbackBySongId = await getLatestRatingTimeBySongIds(songs.map((song) => song.id));
    return NextResponse.json(
      songs.map((song) => ({
        ...song,
        createdAt: toIsoString(song.createdAt) ?? new Date(0).toISOString(),
        lastPracticedAt: toIsoString(song.lastPracticedAt ?? ratingFallbackBySongId[song.id] ?? null),
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
    const body = await request.json();
    const { title, artist } = body;

    if (!title || typeof title !== 'string') {
      return NextResponse.json({ error: 'Title is required and must be a string' }, { status: 400 });
    }

    if (artist !== undefined && typeof artist !== 'string') {
      return NextResponse.json({ error: 'Artist must be a string' }, { status: 400 });
    }

    const id = crypto.randomUUID();
    const song = await createSong({ id, title, artist });

    return NextResponse.json(song, { status: 201 });
  } catch (error) {
    console.error('Error creating song:', error);
    return NextResponse.json(formatError(error), { status: 500 });
  }
}