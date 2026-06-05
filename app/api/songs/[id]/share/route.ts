import { NextRequest, NextResponse } from 'next/server';
import { disableSongSharing, enableSongSharing, getSongById, rotateSongShareLink } from '../../../../../db/queries';
import { resolveEffectiveRequestUserId } from '../../../_user';

const userScopedHeaders = {
  'Cache-Control': 'private, no-store',
  Vary: 'X-User-ID',
};

function formatError(error: unknown) {
  const message = error instanceof Error ? error.message : 'Unknown server error';
  const shouldExpose =
    process.env.NODE_ENV === 'development' ||
    process.env.NEXT_PUBLIC_DEBUG_API_ERRORS === 'true';

  return shouldExpose ? { error: message } : { error: 'Internal server error' };
}

function shareUrlForRequest(request: NextRequest, token: string): string {
  return new URL(`/share/songs/${token}`, request.url).toString();
}

function parseShareAudioMode(value: unknown): 'part' | 'blend' | 'both' {
  return value === 'part' || value === 'blend' || value === 'both' ? value : 'both';
}

function withShareUrl(request: NextRequest, share: Awaited<ReturnType<typeof enableSongSharing>>) {
  if (!share?.shareToken) {
    return share;
  }
  return {
    ...share,
    shareUrl: shareUrlForRequest(request, share.shareToken),
  };
}

export async function POST(
  request: NextRequest,
  { params }: { params: Promise<{ id: string }> }
) {
  try {
    const userId = await resolveEffectiveRequestUserId(request);
    const { id } = await params;
    const existing = await getSongById(id, userId);
    if (!existing) {
      return NextResponse.json({ error: 'Song not found' }, { status: 404 });
    }

    const body = (await request.json().catch(() => ({}))) as { shareAudioMode?: unknown };
    const share = await enableSongSharing(id, userId, parseShareAudioMode(body.shareAudioMode));
    if (!share?.shareToken) {
      return NextResponse.json({ error: 'Song not found' }, { status: 404 });
    }

    return NextResponse.json(withShareUrl(request, share), { headers: userScopedHeaders });
  } catch (error) {
    console.error('Error sharing song:', error);
    return NextResponse.json(formatError(error), { status: 500 });
  }
}

export async function PATCH(
  request: NextRequest,
  { params }: { params: Promise<{ id: string }> }
) {
  try {
    const userId = await resolveEffectiveRequestUserId(request);
    const { id } = await params;
    const existing = await getSongById(id, userId);
    if (!existing) {
      return NextResponse.json({ error: 'Song not found' }, { status: 404 });
    }

    const share = await rotateSongShareLink(id, userId);
    if (!share?.shareToken) {
      return NextResponse.json({ error: 'Song not found' }, { status: 404 });
    }

    return NextResponse.json(withShareUrl(request, share), { headers: userScopedHeaders });
  } catch (error) {
    console.error('Error rotating song share link:', error);
    return NextResponse.json(formatError(error), { status: 500 });
  }
}

export async function DELETE(
  request: NextRequest,
  { params }: { params: Promise<{ id: string }> }
) {
  try {
    const userId = await resolveEffectiveRequestUserId(request);
    const { id } = await params;
    const existing = await getSongById(id, userId);
    if (!existing) {
      return NextResponse.json({ error: 'Song not found' }, { status: 404 });
    }

    await disableSongSharing(id, userId);
    return new NextResponse(null, { status: 204, headers: userScopedHeaders });
  } catch (error) {
    console.error('Error disabling song sharing:', error);
    return NextResponse.json(formatError(error), { status: 500 });
  }
}
