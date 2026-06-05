import { NextRequest, NextResponse } from 'next/server';
import { resyncPlaylistFromSource, type PlaylistSourceResyncMode } from '../../../../../db/queries';
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

function parseMode(value: unknown): PlaylistSourceResyncMode | null {
  return value === 'add_missing' || value === 'update_changed' || value === 'match_order' || value === 'full'
    ? value
    : null;
}

export async function POST(
  request: NextRequest,
  { params }: { params: Promise<{ id: string }> }
) {
  try {
    const userId = await resolveEffectiveRequestUserId(request);
    const { id } = await params;
    const body = await request.json().catch(() => ({}));
    const mode = parseMode(body?.mode);
    if (!mode) {
      return NextResponse.json({ error: 'Valid source sync mode is required' }, { status: 400, headers: userScopedHeaders });
    }

    const result = await resyncPlaylistFromSource(id, userId, mode);
    if (!result) {
      return NextResponse.json({ error: 'Playlist not found' }, { status: 404, headers: userScopedHeaders });
    }

    if (!result.diffBefore.sourceAvailable) {
      return NextResponse.json(result, { status: 409, headers: userScopedHeaders });
    }

    return NextResponse.json(result, { headers: userScopedHeaders });
  } catch (error) {
    console.error('Error syncing playlist from source:', error);
    return NextResponse.json(formatError(error), { status: 500, headers: userScopedHeaders });
  }
}
