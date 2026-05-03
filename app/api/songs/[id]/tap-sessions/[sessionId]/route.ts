import { NextRequest, NextResponse } from 'next/server';
import {
  addTapPracticeTap,
  getSegmentsBySongId,
  getSongById,
  getTapPracticeSessionDetail,
} from '../../../../../../db/queries';
import { resolveRequestUserId } from '../../../../_user';

function formatError(error: unknown) {
  const message = error instanceof Error ? error.message : 'Unknown server error';
  const shouldExpose =
    process.env.NODE_ENV === 'development' ||
    process.env.NEXT_PUBLIC_DEBUG_API_ERRORS === 'true';

  return shouldExpose ? { error: message } : { error: 'Internal server error' };
}

function isFiniteNumber(value: unknown): value is number {
  return typeof value === 'number' && Number.isFinite(value);
}

export async function GET(
  request: NextRequest,
  { params }: { params: Promise<{ id: string; sessionId: string }> }
) {
  try {
    const userId = resolveRequestUserId(request);
    const { id, sessionId } = await params;

    const song = await getSongById(id, userId);
    if (!song) {
      return NextResponse.json({ error: 'Song not found' }, { status: 404 });
    }

    const session = await getTapPracticeSessionDetail(sessionId, userId);
    if (!session || session.songId !== id) {
      return NextResponse.json({ error: 'Tap session not found' }, { status: 404 });
    }

    return NextResponse.json({ session });
  } catch (error) {
    console.error('Error fetching tap practice session detail:', error);
    return NextResponse.json(formatError(error), { status: 500 });
  }
}

export async function POST(
  request: NextRequest,
  { params }: { params: Promise<{ id: string; sessionId: string }> }
) {
  try {
    const userId = resolveRequestUserId(request);
    const { id, sessionId } = await params;

    const song = await getSongById(id, userId);
    if (!song) {
      return NextResponse.json({ error: 'Song not found' }, { status: 404 });
    }

    const session = await getTapPracticeSessionDetail(sessionId, userId);
    if (!session || session.songId !== id) {
      return NextResponse.json({ error: 'Tap session not found' }, { status: 404 });
    }

    const body = await request.json();

    if (!body || typeof body !== 'object') {
      return NextResponse.json({ error: 'Request body must be an object' }, { status: 400 });
    }

    const segmentId = body.segmentId;
    const noteId = body.noteId;
    const timeOffsetMs = body.timeOffsetMs;
    const durationMs = body.durationMs;
    const lane = body.lane;

    if (typeof segmentId !== 'string' || segmentId.length === 0) {
      return NextResponse.json({ error: 'segmentId is required' }, { status: 400 });
    }

    if (typeof noteId !== 'string' || noteId.length === 0) {
      return NextResponse.json({ error: 'noteId is required' }, { status: 400 });
    }

    if (!isFiniteNumber(timeOffsetMs) || timeOffsetMs < 0 || !Number.isInteger(timeOffsetMs)) {
      return NextResponse.json({ error: 'timeOffsetMs must be a non-negative integer' }, { status: 400 });
    }

    if (!isFiniteNumber(durationMs) || durationMs <= 0 || !Number.isInteger(durationMs)) {
      return NextResponse.json({ error: 'durationMs must be a positive integer' }, { status: 400 });
    }

    if (!isFiniteNumber(lane) || lane < 0 || lane > 1) {
      return NextResponse.json({ error: 'lane must be a number between 0 and 1' }, { status: 400 });
    }

    const songSegments = await getSegmentsBySongId(id);
    const segmentIdSet = new Set(songSegments.map((segment) => segment.id));
    if (!segmentIdSet.has(segmentId)) {
      return NextResponse.json({ error: 'segmentId must belong to this song' }, { status: 400 });
    }

    await addTapPracticeTap(sessionId, {
      segmentId,
      noteId,
      timeOffsetMs,
      durationMs,
      lane,
    });

    return new NextResponse(null, { status: 204 });
  } catch (error) {
    console.error('Error appending tap practice data:', error);
    return NextResponse.json(formatError(error), { status: 500 });
  }
}
