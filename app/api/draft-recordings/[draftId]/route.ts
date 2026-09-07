import { NextRequest, NextResponse } from 'next/server';
import { formatError } from "../../_errors";
import { assignDraftRecordingToSong, discardUnassignedDraftRecording } from '../../../../db/queries';
import { getPublicUrl } from '../../../../lib/r2';
import { resolveEffectiveRequestUserId } from '../../_user';

type UpdateDraftRecordingBody = {
  songId?: string;
};

export async function PATCH(
  request: NextRequest,
  { params }: { params: Promise<{ draftId: string }> }
) {
  try {
    const userId = await resolveEffectiveRequestUserId(request);
    const { draftId } = await params;
    const body = (await request.json().catch(() => null)) as UpdateDraftRecordingBody | null;
    const songId = typeof body?.songId === 'string' ? body.songId.trim() : '';

    if (!songId) {
      return NextResponse.json({ error: 'Song is required' }, { status: 400 });
    }

    const draftRecording = await assignDraftRecordingToSong(draftId, songId, userId);
    if (!draftRecording) {
      return NextResponse.json({ error: 'Draft recording not found' }, { status: 404 });
    }

    return NextResponse.json({
      draftRecording: {
        ...draftRecording,
        audioUrl: getPublicUrl(draftRecording.audioKey),
      },
    });
  } catch (error) {
    console.error('Error assigning draft recording:', error);
    return NextResponse.json(formatError(error), { status: 500 });
  }
}

export async function DELETE(
  request: NextRequest,
  { params }: { params: Promise<{ draftId: string }> }
) {
  try {
    const userId = await resolveEffectiveRequestUserId(request);
    const { draftId } = await params;
    const draftRecording = await discardUnassignedDraftRecording(draftId, userId);
    if (!draftRecording) {
      return NextResponse.json({ error: 'Draft recording not found' }, { status: 404 });
    }

    return NextResponse.json({ draftRecording });
  } catch (error) {
    console.error('Error discarding unassigned draft recording:', error);
    return NextResponse.json(formatError(error), { status: 500 });
  }
}
