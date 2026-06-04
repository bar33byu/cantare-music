import { NextRequest, NextResponse } from 'next/server';
import {
  addTapPracticeTap,
  finalizeTapPracticeSession,
  getLatestCompleteMidiAlignmentForSource,
  getLatestMidiSourceForSong,
  getSegmentsBySongId,
  getSongById,
  getTapPracticeSessionDetail,
  updateTapPracticeSessionProgress,
} from '../../../../../../db/queries';
import {
  DEFAULT_CONTOUR_SAME_DEAD_ZONE,
  classifyContourDirection,
} from '../../../../../lib/contourPractice';
import {
  type DirectionTap,
  type TapDirection,
} from '../../../../../lib/enhancedTapPractice';
import {
  deriveSegmentAnswerKey,
  deriveWholeSongAnswerKey,
  scoreTapAttemptAgainstMidiKey,
} from '../../../../../lib/midiGuidedTapPractice';
import { DEFAULT_TAP_TIMING_TOLERANCE_MS } from '../../../../../lib/tapPracticeConstants';
import { resolveEffectiveRequestUserId } from '../../../../_user';

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

function normalizeTapDirection(value: unknown): TapDirection | undefined {
  return value === 'up' || value === 'down' || value === 'same' ? value : undefined;
}

function directionTapsFromSession(session: Awaited<ReturnType<typeof getTapPracticeSessionDetail>>): DirectionTap[] {
  if (!session) {
    return [];
  }

  const sorted = [...session.taps].sort((a, b) => a.timeOffsetMs - b.timeOffsetMs);
  return sorted.map((tap, index) => ({
    id: tap.id,
    timeOffsetMs: tap.timeOffsetMs,
    direction: tap.direction ?? (index === 0 ? 'same' : classifyContourDirection(tap.lane - sorted[index - 1].lane, DEFAULT_CONTOUR_SAME_DEAD_ZONE)),
  }));
}

async function scoreTapPracticeSession(songId: string, userId: string, sessionId: string) {
  const session = await getTapPracticeSessionDetail(sessionId, userId);
  if (!session || session.songId !== songId || session.mode !== 'practice' || !session.segmentId) {
    return { autoScorePercent: null, scoreDetails: null };
  }

  const midiSource = await getLatestMidiSourceForSong(songId, userId);
  const completeMidiAlignment = midiSource ? await getLatestCompleteMidiAlignmentForSource(midiSource.id, userId) : null;
  const midiWholeSongKey = midiSource && completeMidiAlignment
    ? deriveWholeSongAnswerKey(songId, midiSource.id, midiSource.cleanedNotes, completeMidiAlignment)
    : null;
  const segment = (await getSegmentsBySongId(songId)).find((item) => item.id === session.segmentId) ?? null;
  const midiSegmentKey = midiWholeSongKey && segment ? deriveSegmentAnswerKey(midiWholeSongKey, segment) : null;
  if (!midiSegmentKey || midiSegmentKey.taps.length === 0) {
    return { autoScorePercent: null, scoreDetails: null };
  }

  const score = scoreTapAttemptAgainstMidiKey(
    midiSegmentKey,
    directionTapsFromSession(session),
    DEFAULT_TAP_TIMING_TOLERANCE_MS
  );
  return { autoScorePercent: score.scorePercent, scoreDetails: score };
}

export async function GET(
  request: NextRequest,
  { params }: { params: Promise<{ id: string; sessionId: string }> }
) {
  try {
    const userId = await resolveEffectiveRequestUserId(request);
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
    const userId = await resolveEffectiveRequestUserId(request);
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
    const direction = normalizeTapDirection(body.direction);

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
      direction,
    });

    const score = await scoreTapPracticeSession(id, userId, sessionId);
    await updateTapPracticeSessionProgress(sessionId, userId, {
      completedAt: new Date(),
      autoScorePercent: score.autoScorePercent,
      scoreDetails: score.scoreDetails,
    });

    return new NextResponse(null, { status: 204 });
  } catch (error) {
    console.error('Error appending tap practice data:', error);
    return NextResponse.json(formatError(error), { status: 500 });
  }
}

export async function PATCH(
  request: NextRequest,
  { params }: { params: Promise<{ id: string; sessionId: string }> }
) {
  try {
    const userId = await resolveEffectiveRequestUserId(request);
    const { id, sessionId } = await params;

    const song = await getSongById(id, userId);
    if (!song) {
      return NextResponse.json({ error: 'Song not found' }, { status: 404 });
    }

    const session = await getTapPracticeSessionDetail(sessionId, userId);
    if (!session || session.songId !== id) {
      return NextResponse.json({ error: 'Tap session not found' }, { status: 404 });
    }

    await request.json().catch(() => null);

    const score = await scoreTapPracticeSession(id, userId, sessionId);

    const finalized = await finalizeTapPracticeSession(sessionId, userId, {
      completedAt: new Date(),
      autoScorePercent: score.autoScorePercent,
      selfRating: null,
      scoreDetails: score.scoreDetails,
    });

    return NextResponse.json({ session: finalized });
  } catch (error) {
    console.error('Error finalizing tap practice session:', error);
    return NextResponse.json(formatError(error), { status: 500 });
  }
}
