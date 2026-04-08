import { NextRequest, NextResponse } from 'next/server';
import { createPlaylist, getAllPlaylists } from '../../../db/queries';
import { resolveRequestUserId } from '../_user';

function formatError(error: unknown) {
  const message = error instanceof Error ? error.message : 'Unknown server error';
  const shouldExpose =
    process.env.NODE_ENV === 'development' ||
    process.env.NEXT_PUBLIC_DEBUG_API_ERRORS === 'true';

  return shouldExpose ? { error: message } : { error: 'Internal server error' };
}

export async function GET(request: NextRequest) {
  try {
    const userId = resolveRequestUserId(request);
    const includeRetired = new URL(request.url).searchParams.get('includeRetired') === 'true';
    const playlists = await getAllPlaylists(userId, includeRetired);
    return NextResponse.json({ playlists });
  } catch (error) {
    console.error('Error fetching playlists:', error);
    return NextResponse.json(formatError(error), { status: 500 });
  }
}

export async function POST(request: NextRequest) {
  try {
    const userId = resolveRequestUserId(request);
    const body = await request.json();
    const { name, eventDate } = body;

    if (!name || typeof name !== 'string') {
      return NextResponse.json({ error: 'name is required and must be a string' }, { status: 400 });
    }

    if (eventDate !== undefined && typeof eventDate !== 'string') {
      return NextResponse.json({ error: 'eventDate must be a string' }, { status: 400 });
    }

    const playlist = await createPlaylist({ userId, name: name.trim(), eventDate });
    return NextResponse.json(playlist, { status: 201 });
  } catch (error) {
    console.error('Error creating playlist:', error);
    return NextResponse.json(formatError(error), { status: 500 });
  }
}
