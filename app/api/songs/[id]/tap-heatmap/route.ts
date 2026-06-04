import { NextRequest, NextResponse } from 'next/server';
import {
  getLatestCompleteMidiAlignmentForSource,
  getLatestMidiSourceForSong,
  getSongById,
  getSegmentsBySongId,
  listTapPracticeSessionsForSong,
} from '../../../../../db/queries';
import {
  buildMidiContourTapHeatMap,
  deriveSegmentAnswerKeys,
  deriveWholeSongAnswerKey,
  type MidiSegmentAnswerKey,
} from '../../../../lib/midiGuidedTapPractice';
import type { TapScoreResult } from '../../../../lib/enhancedTapPractice';
import { resolveEffectiveRequestUserId } from '../../../_user';

const TAP_HEAT_MAP_SESSION_LIMIT = 200;
const TAP_HEAT_MAP_ATTEMPT_LIMIT = 5;

function formatError(error: unknown) {
  const message = error instanceof Error ? error.message : 'Unknown server error';
  const shouldExpose =
    process.env.NODE_ENV === 'development' ||
    process.env.NEXT_PUBLIC_DEBUG_API_ERRORS === 'true';

  return shouldExpose ? { error: message } : { error: 'Internal server error' };
}

function isTapScoreResult(value: unknown): value is TapScoreResult {
  return Boolean(value && typeof value === 'object' && Array.isArray((value as TapScoreResult).details));
}

function hasCompletedScoreSummary(session: {
  finalizedAt?: string;
  tapCount: number;
  scoreDetails?: unknown;
}): boolean {
  return isTapScoreResult(session.scoreDetails) && (
    Boolean(session.finalizedAt) ||
    session.tapCount >= session.scoreDetails.totalTaps
  );
}

export async function GET(
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
    const segments = await getSegmentsBySongId(id);

    const sessions = await listTapPracticeSessionsForSong(id, userId, TAP_HEAT_MAP_SESSION_LIMIT);
    const scoredAttemptsBySegment = sessions
      .filter((session) => session.mode === 'practice' && session.segmentId && hasCompletedScoreSummary(session))
      .reduce<Record<string, TapScoreResult[]>>((accumulator, session) => {
        if (!session.segmentId || !isTapScoreResult(session.scoreDetails)) {
          return accumulator;
        }
        accumulator[session.segmentId] = [
          ...(accumulator[session.segmentId] ?? []),
          session.scoreDetails,
        ].slice(0, TAP_HEAT_MAP_ATTEMPT_LIMIT);
        return accumulator;
      }, {});

    const midiSource = await getLatestMidiSourceForSong(id, userId);
    const completeMidiAlignment = midiSource ? await getLatestCompleteMidiAlignmentForSource(midiSource.id, userId) : null;
    const midiWholeSongKey = midiSource && completeMidiAlignment
      ? deriveWholeSongAnswerKey(id, midiSource.id, midiSource.cleanedNotes, completeMidiAlignment)
      : null;
    const midiSegmentKeys: Record<string, MidiSegmentAnswerKey> = midiWholeSongKey
      ? deriveSegmentAnswerKeys(midiWholeSongKey, segments)
      : {};

    const heatMapBySegment = Object.fromEntries(
      segments.map((segment) => [
        segment.id,
        buildMidiContourTapHeatMap(
          midiSegmentKeys[segment.id] ?? null,
          scoredAttemptsBySegment[segment.id] ?? [],
          TAP_HEAT_MAP_ATTEMPT_LIMIT
        ),
      ])
    );

    return NextResponse.json({ heatMapBySegment });
  } catch (error) {
    console.error('Error building tap heat map:', error);
    return NextResponse.json(formatError(error), { status: 500 });
  }
}
