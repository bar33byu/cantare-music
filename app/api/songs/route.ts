import { NextRequest, NextResponse } from 'next/server';
import { getAllSongs, createSong } from '../../../db/queries';

function formatError(error: unknown) {
  const message = error instanceof Error ? error.message : 'Unknown server error';
  const shouldExpose =
    process.env.NODE_ENV === 'development' ||
    process.env.NEXT_PUBLIC_DEBUG_API_ERRORS === 'true';

  return shouldExpose ? { error: message } : { error: 'Internal server error' };
}

export async function GET() {
  try {
    const songs = await getAllSongs();
    return NextResponse.json(songs);
  } catch (error) {
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