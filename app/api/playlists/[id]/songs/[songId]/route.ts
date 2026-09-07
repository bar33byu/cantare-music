import { NextRequest, NextResponse } from 'next/server';
import { formatError } from "../../../../_errors";
import { getPlaylistById, removeSongFromPlaylist } from '../../../../../../db/queries';
import { resolveEffectiveRequestUserId } from '../../../../_user';

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
