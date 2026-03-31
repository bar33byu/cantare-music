import { NextRequest, NextResponse } from 'next/server';
import { addSongToPlaylist, getPlaylistById, reorderPlaylistSongs } from '../../../../../db/queries';

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
    const { id } = await params;
    const existing = await getPlaylistById(id);
    if (!existing) {
      return NextResponse.json({ error: 'Playlist not found' }, { status: 404 });
    }

    const body = await request.json();
    const { songId, position } = body;

    if (!songId || typeof songId !== 'string') {
      return NextResponse.json({ error: 'songId is required and must be a string' }, { status: 400 });
    }

    if (position !== undefined && typeof position !== 'number') {
      return NextResponse.json({ error: 'position must be a number' }, { status: 400 });
    }

    await addSongToPlaylist(id, songId, position);
    return new NextResponse(null, { status: 204 });
  } catch (error) {
    console.error('Error adding song to playlist:', error);
    return NextResponse.json(formatError(error), { status: 500 });
  }
}

export async function PATCH(
  request: NextRequest,
  { params }: { params: Promise<{ id: string }> }
) {
  try {
    const { id } = await params;
    const existing = await getPlaylistById(id);
    if (!existing) {
      return NextResponse.json({ error: 'Playlist not found' }, { status: 404 });
    }

    const body = await request.json();
    const { orderedSongIds } = body;

    if (!Array.isArray(orderedSongIds) || orderedSongIds.some((item) => typeof item !== 'string')) {
      return NextResponse.json({ error: 'orderedSongIds must be a string array' }, { status: 400 });
    }

    await reorderPlaylistSongs(id, orderedSongIds);
    return new NextResponse(null, { status: 204 });
  } catch (error) {
    console.error('Error reordering playlist songs:', error);
    return NextResponse.json(formatError(error), { status: 500 });
  }
}
