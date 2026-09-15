import { NextRequest, NextResponse } from 'next/server';
import { formatError } from "../../../_errors";
import { getPublicPlaylistById } from '../../../../../db/queries';
import { resolveRequestContext } from '../../../_user';

const sharedHeaders = {
  'Cache-Control': 'private, no-store',
};

export async function GET(
  request: NextRequest,
  { params }: { params: Promise<{ id: string }> }
) {
  try {
    const context = await resolveRequestContext(request);
    if (!context.actor || !(context.actor.email ?? '').trim()) {
      return NextResponse.json({ error: 'Sign in to open shared playlists.' }, { status: 401, headers: sharedHeaders });
    }

    const { id } = await params;
    const playlist = await getPublicPlaylistById(id, context.effectiveUser?.id);
    if (!playlist) {
      return NextResponse.json({ error: 'Shared playlist not found.' }, { status: 404, headers: sharedHeaders });
    }

    return NextResponse.json(playlist, { headers: sharedHeaders });
  } catch (error) {
    console.error('Error fetching shared playlist:', error);
    return NextResponse.json(formatError(error), { status: 500, headers: sharedHeaders });
  }
}
