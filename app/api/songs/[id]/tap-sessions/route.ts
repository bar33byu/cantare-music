import { NextRequest, NextResponse } from 'next/server';
import {
  createTapPracticeSession,
  deleteExpiredTapPracticeData,
  getSongById,
  listTapPracticeSessionsForSong,
} from '../../../../../db/queries';
import { resolveRequestUserId } from '../../../_user';

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

    const song = await getSongById(id, userId);
    if (!song) {
      return NextResponse.json({ error: 'Song not found' }, { status: 404 });
    }

    const sessions = await listTapPracticeSessionsForSong(id, userId);
    return NextResponse.json({ sessions });
  } catch (error) {
    console.error('Error listing tap practice sessions:', error);
    return NextResponse.json(formatError(error), { status: 500 });
  }
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

    await deleteExpiredTapPracticeData(userId);
    const session = await createTapPracticeSession(id, userId, new Date());

    return NextResponse.json({ session }, { status: 201 });
  } catch (error) {
    console.error('Error creating tap practice session:', error);
    return NextResponse.json(formatError(error), { status: 500 });
  }
}
