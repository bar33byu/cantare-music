import { NextRequest, NextResponse } from 'next/server';
import { getPlaylistById, removeSongFromPlaylist } from '../../../../../../db/queries';
import { resolveEffectiveRequestUserId } from '../../../../_user';

function formatError(error: unknown) {
  const message = error instanceof Error ? error.message : 'Unknown server error';
  const shouldExpose =
    process.env.NODE_ENV === 'development' ||
    process.env.NEXT_PUBLIC_DEBUG_API_ERRORS === 'true';

  return shouldExpose ? { error: message } : { error: 'Internal server error' };
}

export async function DELETE(
  request: NextRequest,
  { params }: { params: Promise<{ id: string; songId: string }> }
) {
  try {
    const userId = await resolveEffectiveRequestUserId(request);
    const { id, songId } = await params;
    const existing = await getPlaylistById(id, userId);
    if (!existing) {
      return NextResponse.json({ error: 'Playlist not found' }, { status: 404 });
    }

    await removeSongFromPlaylist(id, songId, userId);
    return new NextResponse(null, { status: 204 });
  } catch (error) {
    console.error('Error removing song from playlist:', error);
    return NextResponse.json(formatError(error), { status: 500 });
  }
}
