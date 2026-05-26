import { NextRequest, NextResponse } from 'next/server';
import { promoteDraftRecordingToSongVersion, recordOrphanedAudioKey } from '../../../../../../../db/queries';
import { deleteObject } from '../../../../../../../lib/r2';
import { resolveRequestUserId } from '../../../../../_user';

type PromoteDraftRecordingBody = {
  trimStartMs?: unknown;
  trimEndMs?: unknown;
};

function isValidOptionalTrimMs(value: unknown): value is number | undefined {
  return value === undefined || (typeof value === 'number' && Number.isFinite(value) && value >= 0);
}

function formatError(error: unknown) {
  const message = error instanceof Error ? error.message : 'Unknown server error';
  const shouldExpose =
    process.env.NODE_ENV === 'development' ||
    process.env.NEXT_PUBLIC_DEBUG_API_ERRORS === 'true';

  return shouldExpose ? { error: message } : { error: 'Internal server error' };
}

export async function POST(
  request: NextRequest,
  { params }: { params: Promise<{ id: string; draftId: string }> }
) {
  try {
    const userId = resolveRequestUserId(request);
    const { id, draftId } = await params;
    const body = (await request.json().catch(() => ({}))) as PromoteDraftRecordingBody;

    if (!isValidOptionalTrimMs(body.trimStartMs) || !isValidOptionalTrimMs(body.trimEndMs)) {
      return NextResponse.json({ error: 'Trim values must be non-negative numbers' }, { status: 400 });
    }
    if ((body.trimStartMs === undefined) !== (body.trimEndMs === undefined)) {
      return NextResponse.json({ error: 'Trim start and end must be provided together' }, { status: 400 });
    }
    if (body.trimStartMs !== undefined && body.trimEndMs !== undefined && body.trimEndMs <= body.trimStartMs) {
      return NextResponse.json({ error: 'Trim end must be after trim start' }, { status: 400 });
    }

    const result = await promoteDraftRecordingToSongVersion(
      id,
      draftId,
      {
        trimStartMs: body.trimStartMs !== undefined ? Math.round(body.trimStartMs) : undefined,
        trimEndMs: body.trimEndMs !== undefined ? Math.round(body.trimEndMs) : undefined,
      },
      userId
    );

    if (!result) {
      return NextResponse.json({ error: 'Draft recording not found' }, { status: 404 });
    }

    if (result.previousAudioKey && result.previousAudioKey !== result.draftRecording.audioKey) {
      try {
        await deleteObject(result.previousAudioKey);
      } catch (audioDeleteError) {
        console.warn('Failed to delete replaced song audio during draft promotion:', {
          songId: id,
          audioKey: result.previousAudioKey,
          error: audioDeleteError,
        });
        try {
          await recordOrphanedAudioKey(crypto.randomUUID(), result.previousAudioKey, userId);
        } catch (recordError) {
          console.error('Failed to record orphaned audio key:', recordError);
        }
      }
    }

    return NextResponse.json({ draftRecording: result.draftRecording });
  } catch (error) {
    console.error('Error promoting draft recording:', error);
    return NextResponse.json(formatError(error), { status: 500 });
  }
}
