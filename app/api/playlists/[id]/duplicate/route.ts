import { NextRequest, NextResponse } from 'next/server';
import { duplicatePlaylist, getPlaylistById } from '../../../../../db/queries';
import { resolveEffectiveRequestUserId } from '../../../_user';

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
    const userId = await resolveEffectiveRequestUserId(request);
    const { id } = await params;
    const existing = await getPlaylistById(id, userId);
    if (!existing) {
      return NextResponse.json({ error: 'Playlist not found' }, { status: 404 });
    }

    const playlist = await duplicatePlaylist(id, userId);
    if (!playlist) {
      return NextResponse.json({ error: 'Playlist not found' }, { status: 404 });
    }

    return NextResponse.json(playlist, { status: 201 });
  } catch (error) {
    console.error('Error duplicating playlist:', error);
    return NextResponse.json(formatError(error), { status: 500 });
  }
}
