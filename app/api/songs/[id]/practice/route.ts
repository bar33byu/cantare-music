import { NextRequest, NextResponse } from 'next/server';
import { formatError } from "../../../_errors";
import { getSongById, markSongPracticed } from '../../../../../db/queries';
import { resolveEffectiveRequestUserId } from '../../../_user';

const userScopedHeaders = {
  'Cache-Control': 'private, no-store',
  Vary: 'X-User-ID',
};

export async function POST(
  request: NextRequest,
  { params }: { params: Promise<{ id: string }> }
) {
  try {
    const userId = await resolveEffectiveRequestUserId(request);
    const { id } = await params;
    const song = await getSongById(id, userId);

    if (!song) {
      return NextResponse.json({ error: 'Song not found' }, { status: 404 });
    }

    await markSongPracticed(id, userId, new Date());
    return new NextResponse(null, { status: 204, headers: userScopedHeaders });
  } catch (error) {
    console.error('Error updating song practice timestamp:', error);
    return NextResponse.json(formatError(error), { status: 500 });
  }
}
