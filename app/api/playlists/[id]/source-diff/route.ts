import { NextRequest, NextResponse } from 'next/server';
import { getPlaylistSourceDiff } from '../../../../../db/queries';
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

export async function GET(
  request: NextRequest,
  { params }: { params: Promise<{ id: string }> }
) {
  try {
    const userId = await resolveEffectiveRequestUserId(request);
    const { id } = await params;
    const diff = await getPlaylistSourceDiff(id, userId);
    if (!diff) {
      return NextResponse.json({ error: 'Playlist not found' }, { status: 404, headers: userScopedHeaders });
    }

    return NextResponse.json(diff, { headers: userScopedHeaders });
  } catch (error) {
    console.error('Error checking playlist source updates:', error);
    return NextResponse.json(formatError(error), { status: 500, headers: userScopedHeaders });
  }
}
