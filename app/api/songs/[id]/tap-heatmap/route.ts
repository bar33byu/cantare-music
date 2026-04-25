import { NextRequest, NextResponse } from 'next/server';
import {
  getSongById,
  getSegmentsBySongId,
  getTapPracticeSessionDetail,
  listTapPracticeSessionsForSong,
} from '../../../../../db/queries';
import { computeContourNoteHeatMap } from '../../../../lib/contourPractice';
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
    const segments = await getSegmentsBySongId(id);

    const sessions = await listTapPracticeSessionsForSong(id, userId);
    const sessionDetails = await Promise.all(
      sessions.map(async (session) => getTapPracticeSessionDetail(session.id, userId))
    );

    const heatMapBySegment = Object.fromEntries(
      segments.map((segment) => {
        const attempts = sessionDetails
          .flatMap((detail) => (detail ? [detail] : []))
          .map((detail) =>
            detail.taps
              .filter((tap) => tap.segmentId === segment.id)
              .map((tap) => ({
                id: tap.id,
                timeOffsetMs: tap.timeOffsetMs,
                durationMs: tap.durationMs,
                lane: tap.lane,
              }))
          );

        return [
          segment.id,
          computeContourNoteHeatMap(segment.pitchContourNotes ?? [], attempts, {
            timeToleranceMs: 400,
            sameDeadZone: 0.05,
            durationToleranceRatio: 0.6,
          }),
        ];
      })
    );

    return NextResponse.json({ heatMapBySegment });
  } catch (error) {
    console.error('Error building tap heat map:', error);
    return NextResponse.json(formatError(error), { status: 500 });
  }
}
