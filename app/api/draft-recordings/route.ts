import { NextRequest, NextResponse } from 'next/server';
import { formatError } from "../_errors";
import { createDraftRecording, getUnassignedDraftRecordings } from '../../../db/queries';
import { getPublicUrl } from '../../../lib/r2';
import { resolveEffectiveRequestUserId } from '../_user';

type CreateDraftRecordingBody = {
  audioKey?: string;
  title?: string | null;
};

export async function GET(request: NextRequest) {
  try {
    const userId = await resolveEffectiveRequestUserId(request);
    const draftRecordings = await getUnassignedDraftRecordings(userId);

    return NextResponse.json({
      draftRecordings: draftRecordings.map((draft) => ({
        ...draft,
        audioUrl: getPublicUrl(draft.audioKey),
      })),
    });
  } catch (error) {
    console.error('Error fetching unassigned draft recordings:', error);
    return NextResponse.json(formatError(error), { status: 500 });
  }
}

export async function POST(request: NextRequest) {
  try {
    const userId = await resolveEffectiveRequestUserId(request);
    const body = (await request.json().catch(() => null)) as CreateDraftRecordingBody | null;

    if (!body || typeof body.audioKey !== 'string' || body.audioKey.trim().length === 0) {
      return NextResponse.json({ error: 'Audio key is required' }, { status: 400 });
    }

    const draftRecording = await createDraftRecording({
      songId: null,
      audioKey: body.audioKey.trim(),
      title: typeof body.title === 'string' ? body.title.trim() || null : null,
    }, userId);

    return NextResponse.json({
      draftRecording: {
        ...draftRecording,
        audioUrl: getPublicUrl(draftRecording.audioKey),
      },
    }, { status: 201 });
  } catch (error) {
    console.error('Error creating unassigned draft recording:', error);
    return NextResponse.json(formatError(error), { status: 500 });
  }
}
