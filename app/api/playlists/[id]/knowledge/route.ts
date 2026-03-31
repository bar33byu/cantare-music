import { NextRequest, NextResponse } from 'next/server';
import { getPlaylistById, getRatingsForSong } from '../../../../../db/queries';
import { computePlaylistKnowledge } from '../../../../lib/knowledgeUtils';

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
    const { id } = await params;
    const playlist = await getPlaylistById(id);

    if (!playlist) {
      return NextResponse.json({ error: 'Playlist not found' }, { status: 404 });
    }

    const ratingsBySong = await Promise.all(
      playlist.songs.map((song) => getRatingsForSong(song.id))
    );

    const ratings = ratingsBySong.flat();
    const score = computePlaylistKnowledge(playlist.songs, ratings);

    return NextResponse.json({ score });
  } catch (error) {
    console.error('Error computing playlist knowledge:', error);
    return NextResponse.json(formatError(error), { status: 500 });
  }
}
