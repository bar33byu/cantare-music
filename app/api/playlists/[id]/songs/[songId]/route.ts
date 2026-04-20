import { NextRequest, NextResponse } from 'next/server';
import { removeSongFromPlaylist } from '../../../../../../db/queries';

function formatError(error: unknown) {
  const message = error instanceof Error ? error.message : 'Unknown server error';
  const shouldExpose =
    process.env.NODE_ENV === 'development' ||
    process.env.NEXT_PUBLIC_DEBUG_API_ERRORS === 'true';

  return shouldExpose ? { error: message } : { error: 'Internal server error' };
}

export async function DELETE(
  request: NextRequest,
  { params }: { params: Promise<{ id: string; songId: string }> }
) {
  try {
    const { id, songId } = await params;
    await removeSongFromPlaylist(id, songId);
    return new NextResponse(null, { status: 204 });
  } catch (error) {
    console.error('Error removing song from playlist:', error);
    return NextResponse.json(formatError(error), { status: 500 });
  }
}
