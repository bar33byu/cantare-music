import { NextRequest, NextResponse } from 'next/server';
import { disablePlaylistPublicSharing, enablePlaylistPublicSharing, getPlaylistById } from '../../../../../db/queries';
import { resolveRequestUserId } from '../../../_user';

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

export async function POST(
  request: NextRequest,
  { params }: { params: Promise<{ id: string }> }
) {
  try {
    const userId = resolveRequestUserId(request);
    const { id } = await params;
    const existing = await getPlaylistById(id, userId);
    if (!existing) {
      return NextResponse.json({ error: 'Playlist not found' }, { status: 404 });
    }

    const playlist = await enablePlaylistPublicSharing(id, userId);
    if (!playlist) {
      return NextResponse.json({ error: 'Playlist not found' }, { status: 404 });
    }

    return NextResponse.json(playlist, { headers: userScopedHeaders });
  } catch (error) {
    console.error('Error publishing playlist:', error);
    return NextResponse.json(formatError(error), { status: 500 });
  }
}

export async function DELETE(
  request: NextRequest,
  { params }: { params: Promise<{ id: string }> }
) {
  try {
    const userId = resolveRequestUserId(request);
    const { id } = await params;
    const existing = await getPlaylistById(id, userId);
    if (!existing) {
      return NextResponse.json({ error: 'Playlist not found' }, { status: 404 });
    }

    await disablePlaylistPublicSharing(id, userId);
    return new NextResponse(null, { status: 204, headers: userScopedHeaders });
  } catch (error) {
    console.error('Error unpublishing playlist:', error);
    return NextResponse.json(formatError(error), { status: 500 });
  }
}
