import { NextRequest, NextResponse } from 'next/server';
import { formatError } from "../../../_errors";
import { getPlaylistById, getRatingsForSong } from '../../../../../db/queries';
import { computePlaylistKnowledge } from '../../../../lib/knowledgeUtils';
import type { Song } from '../../../../types';
import { resolveEffectiveRequestUserId } from '../../../_user';

const userScopedHeaders = {
  'Cache-Control': 'private, no-store',
  Vary: 'X-User-ID',
};

export async function GET(
  request: NextRequest,
  { params }: { params: Promise<{ id: string }> }
) {
  try {
    const userId = await resolveEffectiveRequestUserId(request);
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

    return NextResponse.json({ score }, {
      headers: userScopedHeaders,
    });
  } catch (error) {
    console.error('Error computing playlist knowledge:', error);
    return NextResponse.json(formatError(error), { status: 500 });
  }
}
