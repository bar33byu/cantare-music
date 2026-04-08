import { NextRequest, NextResponse } from 'next/server';
import { getSongById, markSongPracticed } from '../../../../../db/queries';
import { resolveRequestUserId } from '../../../_user';

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
    const userId = resolveRequestUserId(request);
    const { id } = await params;
    const song = await getSongById(id, userId);

    if (!song) {
      return NextResponse.json({ error: 'Song not found' }, { status: 404 });
    }

    await markSongPracticed(id, userId, new Date());
    return new NextResponse(null, { status: 204 });
  } catch (error) {
    console.error('Error updating song practice timestamp:', error);
    return NextResponse.json(formatError(error), { status: 500 });
  }
}
