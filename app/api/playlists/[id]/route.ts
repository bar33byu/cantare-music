import { NextRequest, NextResponse } from 'next/server';
import { deletePlaylist, getPlaylistById, updatePlaylist } from '../../../../db/queries';
import { resolveRequestUserId } from '../../_user';

function formatError(error: unknown) {
  const message = error instanceof Error ? error.message : 'Unknown server error';
  const shouldExpose =
    process.env.NODE_ENV === 'development' ||
    process.env.NEXT_PUBLIC_DEBUG_API_ERRORS === 'true';

  return shouldExpose ? { error: message } : { error: 'Internal server error' };
}

export async function GET(
  request: NextRequest,
  { params }: { params: Promise<{ id: string }> }
) {
  try {
    const userId = resolveRequestUserId(request);
    const { id } = await params;
    const playlist = await getPlaylistById(id, userId);

    if (!playlist) {
      return NextResponse.json({ error: 'Playlist not found' }, { status: 404 });
    }

    return NextResponse.json(playlist, {
      headers: {
        'Cache-Control': 'max-age=300', // Cache for 5 minutes
      },
    });
  } catch (error) {
    console.error('Error fetching playlist:', error);
    return NextResponse.json(formatError(error), { status: 500 });
  }
}

export async function PATCH(
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

    const body = await request.json();
    const { name, eventDate, isRetired } = body;

    if (name !== undefined && typeof name !== 'string') {
      return NextResponse.json({ error: 'name must be a string' }, { status: 400 });
    }
    if (eventDate !== undefined && typeof eventDate !== 'string') {
      return NextResponse.json({ error: 'eventDate must be a string' }, { status: 400 });
    }
    if (isRetired !== undefined && typeof isRetired !== 'boolean') {
      return NextResponse.json({ error: 'isRetired must be a boolean' }, { status: 400 });
    }

    await updatePlaylist(id, { name, eventDate, isRetired }, userId);
    return new NextResponse(null, { status: 204 });
  } catch (error) {
    console.error('Error updating playlist:', error);
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

    await deletePlaylist(id, userId);
    return new NextResponse(null, { status: 204 });
  } catch (error) {
    console.error('Error deleting playlist:', error);
    return NextResponse.json(formatError(error), { status: 500 });
  }
}
