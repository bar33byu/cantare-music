import { NextRequest, NextResponse } from 'next/server';
import { formatError } from "../../../_errors";
import { disablePlaylistSharing, enablePlaylistSharing, getPlaylistById } from '../../../../../db/queries';
import { resolveEffectiveRequestUserId } from '../../../_user';

const userScopedHeaders = {
  'Cache-Control': 'private, no-store',
  Vary: 'X-User-ID',
};

function shareUrlForRequest(request: NextRequest, token: string): string {
  return new URL(`/share/playlists/${token}`, request.url).toString();
}

function parseShareAudioMode(value: unknown): 'part' | 'blend' | 'both' {
  return value === 'part' || value === 'blend' || value === 'both' ? value : 'both';
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
    const body = (await request.json().catch(() => ({}))) as { shareAudioMode?: unknown };

    const playlist = await enablePlaylistSharing(id, userId, parseShareAudioMode(body.shareAudioMode));
    if (!playlist?.shareToken) {
      return NextResponse.json({ error: 'Playlist not found' }, { status: 404 });
    }

    return NextResponse.json(
      {
        ...playlist,
        shareUrl: shareUrlForRequest(request, playlist.shareToken),
      },
      { headers: userScopedHeaders }
    );
  } catch (error) {
    console.error('Error sharing playlist:', error);
    return NextResponse.json(formatError(error), { status: 500 });
  }
}

export async function DELETE(
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

    await disablePlaylistSharing(id, userId);
    return new NextResponse(null, { status: 204, headers: userScopedHeaders });
  } catch (error) {
    console.error('Error unsharing playlist:', error);
    return NextResponse.json(formatError(error), { status: 500 });
  }
}
