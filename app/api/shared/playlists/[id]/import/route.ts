import { NextRequest, NextResponse } from 'next/server';
import { getPublicPlaylistById, importPublicPlaylist } from '../../../../../../db/queries';
import { resolveRequestContext } from '../../../../_user';

const sharedHeaders = {
  'Cache-Control': 'private, no-store',
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
    const context = await resolveRequestContext(request);
    const user = context.effectiveUser;
    if (!context.actor || !user || !(context.actor.email ?? '').trim()) {
      return NextResponse.json({ error: 'Sign in to copy shared playlists.' }, { status: 401, headers: sharedHeaders });
    }

    const { id } = await params;
    const playlist = await getPublicPlaylistById(id, user.id);
    if (!playlist) {
      return NextResponse.json({ error: 'Shared playlist not found.' }, { status: 404, headers: sharedHeaders });
    }

    const body = await request.json().catch(() => ({})) as { force?: unknown };
    const result = await importPublicPlaylist(id, user.id, {
      force: body.force === true,
      shareAudioMode: playlist.publicShareAudioMode,
    });
    return NextResponse.json(result, { headers: sharedHeaders });
  } catch (error) {
    const code = error instanceof Error ? (error as Error & { code?: string }).code : undefined;
    if (code === 'SHARED_PLAYLIST_NOT_FOUND') {
      return NextResponse.json({ error: 'Shared playlist not found.' }, { status: 404, headers: sharedHeaders });
    }
    console.error('Error importing public shared playlist:', error);
    return NextResponse.json(formatError(error), { status: 500, headers: sharedHeaders });
  }
}
