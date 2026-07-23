import { NextRequest, NextResponse } from 'next/server';
import { createPlaylist, getAllPlaylists, PLAYLIST_PERFORMANCE_STATUSES } from '../../../db/queries';
import { resolveEffectiveRequestUserId } from '../_user';

const userScopedHeaders = {
  'Cache-Control': 'private, no-store',
  Vary: 'Cookie, X-User-ID',
};

function formatError(error: unknown) {
  const message = error instanceof Error ? error.message : 'Unknown server error';
  const shouldExpose =
    process.env.NODE_ENV === 'development' ||
    process.env.NEXT_PUBLIC_DEBUG_API_ERRORS === 'true';

  return shouldExpose ? { error: message } : { error: 'Internal server error' };
}

export async function GET(request: NextRequest) {
  try {
    const userId = await resolveEffectiveRequestUserId(request);
    const includeRetired = new URL(request.url).searchParams.get('includeRetired') === 'true';
    const playlists = await getAllPlaylists(userId, includeRetired);
    return NextResponse.json({ playlists }, {
      headers: userScopedHeaders,
    });
  } catch (error) {
    console.error('Error fetching playlists:', error);
    return NextResponse.json(formatError(error), { status: 500 });
  }
}

export async function POST(request: NextRequest) {
  try {
    const userId = await resolveEffectiveRequestUserId(request);
    const body = await request.json();
    const { name, eventDate, performanceStatus } = body;

    if (!name || typeof name !== 'string') {
      return NextResponse.json({ error: 'name is required and must be a string' }, { status: 400 });
    }

    if (eventDate !== undefined && typeof eventDate !== 'string') {
      return NextResponse.json({ error: 'eventDate must be a string' }, { status: 400 });
    }

    if (
      performanceStatus !== undefined &&
      performanceStatus !== null &&
      !PLAYLIST_PERFORMANCE_STATUSES.includes(performanceStatus)
    ) {
      return NextResponse.json({ error: 'performanceStatus must be Performed, Recorded, Absent, Sick, or Canceled' }, { status: 400 });
    }

    const playlist = await createPlaylist({ userId, name: name.trim(), eventDate, performanceStatus });
    return NextResponse.json(playlist, { status: 201 });
  } catch (error) {
    console.error('Error creating playlist:', error);
    return NextResponse.json(formatError(error), { status: 500 });
  }
}
