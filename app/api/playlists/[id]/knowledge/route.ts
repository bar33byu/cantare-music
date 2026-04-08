import { NextRequest, NextResponse } from 'next/server';
import { getPlaylistById, getRatingsForSong } from '../../../../../db/queries';
import { computePlaylistKnowledge } from '../../../../lib/knowledgeUtils';
import type { Song } from '../../../../types';
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
    const playlist = await getPlaylistById(id, userId);

    if (!playlist) {
      return NextResponse.json({ error: 'Playlist not found' }, { status: 404 });
    }

    const ratingsBySong = await Promise.all(
      playlist.songs.map((song) => getRatingsForSong(song.id, userId))
    );

    const ratings = ratingsBySong.flat();
    const normalizedSongs: Song[] = playlist.songs.map((song) => ({
      ...song,
      segments: song.segments.map((segment) => ({
        ...segment,
        lyricText: segment.lyricText ?? '',
      })),
    }));
    const score = computePlaylistKnowledge(normalizedSongs, ratings);

    return NextResponse.json({ score });
  } catch (error) {
    console.error('Error computing playlist knowledge:', error);
    return NextResponse.json(formatError(error), { status: 500 });
  }
}
