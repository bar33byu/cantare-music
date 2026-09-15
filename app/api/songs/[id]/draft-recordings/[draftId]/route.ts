import { NextRequest, NextResponse } from 'next/server';
import { formatError } from "../../../../_errors";
import { discardDraftRecording, updateDraftRecordingTrim } from '../../../../../../db/queries';
import { resolveEffectiveRequestUserId } from '../../../../_user';

type UpdateDraftRecordingBody = {
  trimStartMs?: unknown;
  trimEndMs?: unknown;
};

function isValidTrimMs(value: unknown): value is number {
  return typeof value === 'number' && Number.isFinite(value) && value >= 0;
}

export async function PATCH(
  request: NextRequest,
  { params }: { params: Promise<{ id: string; draftId: string }> }
) {
  try {
    const userId = await resolveEffectiveRequestUserId(request);
    const { id, draftId } = await params;
    const body = (await request.json().catch(() => null)) as UpdateDraftRecordingBody | null;

    if (!body || !isValidTrimMs(body.trimStartMs) || !isValidTrimMs(body.trimEndMs)) {
      return NextResponse.json({ error: 'Trim start and end are required' }, { status: 400 });
    }

    const trimStartMs = Math.round(body.trimStartMs);
    const trimEndMs = Math.round(body.trimEndMs);
    if (trimEndMs <= trimStartMs) {
      return NextResponse.json({ error: 'Trim end must be after trim start' }, { status: 400 });
    }

    const draftRecording = await updateDraftRecordingTrim(id, draftId, { trimStartMs, trimEndMs }, userId);
    if (!draftRecording) {
      return NextResponse.json({ error: 'Draft recording not found' }, { status: 404 });
    }

    return NextResponse.json({ draftRecording });
  } catch (error) {
    console.error('Error updating draft recording:', error);
    return NextResponse.json(formatError(error), { status: 500 });
  }
}

export async function DELETE(
  request: NextRequest,
  { params }: { params: Promise<{ id: string; draftId: string }> }
) {
  try {
    const userId = await resolveEffectiveRequestUserId(request);
    const { id, draftId } = await params;
    const draftRecording = await discardDraftRecording(id, draftId, userId);
    if (!draftRecording) {
      return NextResponse.json({ error: 'Draft recording not found' }, { status: 404 });
    }

    return NextResponse.json({ draftRecording });
  } catch (error) {
    console.error('Error discarding draft recording:', error);
    return NextResponse.json(formatError(error), { status: 500 });
  }
}
