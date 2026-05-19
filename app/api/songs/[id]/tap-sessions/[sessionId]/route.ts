import { NextRequest, NextResponse } from 'next/server';
import {
  addTapPracticeTap,
  finalizeTapPracticeSession,
  getLatestCompleteMidiAlignmentForSource,
  getLatestMidiSourceForSong,
  getSegmentsBySongId,
  getSongById,
  getTapPracticeSessionDetail,
  listTapPracticeSessionsForSong,
} from '../../../../../../db/queries';
import {
  DEFAULT_CONTOUR_SAME_DEAD_ZONE,
  classifyContourDirection,
} from '../../../../../lib/contourPractice';
import {
  deriveAnswerKeyFromTakes,
  scoreTapAttempt,
  type AnswerKeyTake,
  type DirectionTap,
  type TapDirection,
} from '../../../../../lib/enhancedTapPractice';
import {
  deriveSegmentAnswerKey,
  deriveWholeSongAnswerKey,
  scoreTapAttemptAgainstMidiKey,
} from '../../../../../lib/midiGuidedTapPractice';
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

async function loadAnswerKeyTakes(songId: string, userId: string): Promise<AnswerKeyTake[]> {
  const sessions = await listTapPracticeSessionsForSong(songId, userId, 100);
  const answerKeySessions = sessions.filter((session) => session.mode === 'answer_key' && session.segmentId);
  const details = await Promise.all(answerKeySessions.map((session) => getTapPracticeSessionDetail(session.id, userId)));
  return details.flatMap((detail) => {
    if (!detail || detail.mode !== 'answer_key' || !detail.segmentId) {
      return [];
    }
    return [{
      id: detail.id,
      segmentId: detail.segmentId,
      audioVersion: detail.audioVersion,
      recordedAt: detail.completedAt ?? detail.startedAt,
      taps: directionTapsFromSession(detail),
    }];
  });
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

    await request.json().catch(() => null);

    let autoScorePercent: number | null = null;
    let scoreDetails = null;

    if (session.mode === 'practice' && session.segmentId) {
      const midiSource = await getLatestMidiSourceForSong(id, userId);
      const completeMidiAlignment = midiSource ? await getLatestCompleteMidiAlignmentForSource(midiSource.id, userId) : null;
      const midiWholeSongKey = midiSource && completeMidiAlignment
        ? deriveWholeSongAnswerKey(id, midiSource.id, midiSource.cleanedNotes, completeMidiAlignment)
        : null;
      const segment = session.segmentId ? (await getSegmentsBySongId(id)).find((item) => item.id === session.segmentId) : null;
      const midiSegmentKey = midiWholeSongKey && segment ? deriveSegmentAnswerKey(midiWholeSongKey, segment) : null;
      if (midiSegmentKey && midiSegmentKey.taps.length > 0) {
        const score = scoreTapAttemptAgainstMidiKey(midiSegmentKey, directionTapsFromSession(session), 400);
        autoScorePercent = score.scorePercent;
        scoreDetails = score;
      } else {
        const answerKeyTakes = await loadAnswerKeyTakes(id, userId);
        const derivedKey = deriveAnswerKeyFromTakes(answerKeyTakes, session.segmentId, session.audioVersion);
        if (derivedKey) {
          const score = scoreTapAttempt(derivedKey, directionTapsFromSession(session), 400);
          autoScorePercent = score.scorePercent;
          scoreDetails = score;
        }
      }
    }

    const finalized = await finalizeTapPracticeSession(sessionId, userId, {
      completedAt: new Date(),
      autoScorePercent,
      selfRating: null,
      scoreDetails,
    });

    return NextResponse.json({ session: finalized });
  } catch (error) {
    console.error('Error finalizing tap practice session:', error);
    return NextResponse.json(formatError(error), { status: 500 });
  }
}
