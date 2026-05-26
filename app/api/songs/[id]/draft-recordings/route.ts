import { NextRequest, NextResponse } from 'next/server';
import { createDraftRecording, getSongById } from '../../../../../db/queries';
import { resolveRequestUserId } from '../../../_user';

type CreateDraftRecordingBody = {
  audioKey?: string;
  title?: string | null;
};

function formatError(error: unknown) {
  const message = error instanceof Error ? error.message : 'Unknown server error';
  const shouldExpose =
    process.env.NODE_ENV === 'development' ||
    process.env.NEXT_PUBLIC_DEBUG_API_ERRORS === 'true';

  return shouldExpose ? { error: message } : { error: 'Internal server error' };
}

export async function POST(
  request: NextRequest,
  { params }: { params: Promise<{ id: string }> }
) {
  try {
    const userId = resolveRequestUserId(request);
    const { id } = await params;
    const body = (await request.json().catch(() => null)) as CreateDraftRecordingBody | null;

    if (!body || typeof body.audioKey !== 'string' || body.audioKey.trim().length === 0) {
      return NextResponse.json({ error: 'Audio key is required' }, { status: 400 });
    }

    const song = await getSongById(id, userId);
    if (!song) {
      return NextResponse.json({ error: 'Song not found' }, { status: 404 });
    }

    const draftRecording = await createDraftRecording({
      songId: id,
      audioKey: body.audioKey.trim(),
      title: typeof body.title === 'string' ? body.title.trim() || null : null,
    }, userId);

    return NextResponse.json({ draftRecording }, { status: 201 });
  } catch (error) {
    console.error('Error creating draft recording:', error);
    return NextResponse.json(formatError(error), { status: 500 });
  }
}
