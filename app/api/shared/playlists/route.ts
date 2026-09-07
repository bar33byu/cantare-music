import { NextRequest, NextResponse } from 'next/server';
import { formatError } from "../../_errors";
import { getPublicSharedPlaylists } from '../../../../db/queries';
import { resolveRequestContext } from '../../_user';

const sharedHeaders = {
  'Cache-Control': 'private, no-store',
};

export async function GET(request: NextRequest) {
  try {
    const context = await resolveRequestContext(request);
    if (!context.actor || !(context.actor.email ?? '').trim()) {
      return NextResponse.json({ error: 'Sign in to browse shared playlists.' }, { status: 401, headers: sharedHeaders });
    }

    const playlists = await getPublicSharedPlaylists(context.effectiveUser?.id);
    return NextResponse.json({ playlists }, { headers: sharedHeaders });
  } catch (error) {
    console.error('Error fetching shared playlists:', error);
    return NextResponse.json(formatError(error), { status: 500, headers: sharedHeaders });
  }
}
