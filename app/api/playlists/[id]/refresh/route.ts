import { NextRequest, NextResponse } from 'next/server';
import { getImportedPlaylistRefreshPreview, refreshImportedPlaylistSongs } from '../../../../../db/queries';
import { resolveEffectiveRequestUserId } from '../../../_user';

const userScopedHeaders = {
  'Cache-Control': 'private, no-store',
  Vary: 'X-User-ID',
};

function formatError(error: unknown) {
  const message = error instanceof Error ? error.message : 'Unknown server error';
  const shouldExpose =
    process.env.NODE_ENV === 'development' ||
    process.env.NEXT_PUBLIC_DEBUG_API_ERRORS === 'true';

  return shouldExpose ? { error: message } : { error: 'Internal server error' };
}

function errorCode(error: unknown): string | undefined {
  return error instanceof Error ? (error as Error & { code?: string }).code : undefined;
}

export async function GET(
  request: NextRequest,
  { params }: { params: Promise<{ id: string }> }
) {
  try {
    const userId = await resolveEffectiveRequestUserId(request);
    const { id } = await params;
    const preview = await getImportedPlaylistRefreshPreview(id, userId);

    if (!preview) {
      return NextResponse.json({ error: 'Shared playlist is no longer available.' }, { status: 404, headers: userScopedHeaders });
    }

    return NextResponse.json(preview, { headers: userScopedHeaders });
  } catch (error) {
    if (errorCode(error) === 'PLAYLIST_NOT_FOUND') {
      return NextResponse.json({ error: 'Playlist not found' }, { status: 404, headers: userScopedHeaders });
    }
    console.error('Error fetching playlist refresh preview:', error);
    return NextResponse.json(formatError(error), { status: 500, headers: userScopedHeaders });
  }
}

export async function POST(
  request: NextRequest,
  { params }: { params: Promise<{ id: string }> }
) {
  try {
    const userId = await resolveEffectiveRequestUserId(request);
    const { id } = await params;
    const body = await request.json().catch(() => ({})) as { sourceSongIds?: unknown };

    if (!Array.isArray(body.sourceSongIds) || body.sourceSongIds.some((item) => typeof item !== 'string')) {
      return NextResponse.json({ error: 'sourceSongIds must be a string array' }, { status: 400, headers: userScopedHeaders });
    }

    const result = await refreshImportedPlaylistSongs(id, body.sourceSongIds, userId);
    return NextResponse.json(result, { headers: userScopedHeaders });
  } catch (error) {
    const code = errorCode(error);
    if (code === 'PLAYLIST_NOT_FOUND') {
      return NextResponse.json({ error: 'Playlist not found' }, { status: 404, headers: userScopedHeaders });
    }
    if (code === 'SHARED_PLAYLIST_NOT_FOUND') {
      return NextResponse.json({ error: 'Shared playlist is no longer available.' }, { status: 404, headers: userScopedHeaders });
    }
    console.error('Error refreshing imported playlist:', error);
    return NextResponse.json(formatError(error), { status: 500, headers: userScopedHeaders });
  }
}
