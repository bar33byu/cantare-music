import { NextRequest, NextResponse } from 'next/server';
import { getSongById, deleteSong, updateSong, getSegmentsBySongId, recordOrphanedAudioKey } from '../../../../db/queries';
import { deleteObject, getPublicUrl } from '../../../../lib/r2';
import type { SongRow } from '../../../../db/schema';
import { resolveRequestUserId } from '../../_user';

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
    const song = await getSongById(id, userId);
    if (!song) {
      return NextResponse.json({ error: 'Song not found' }, { status: 404 });
    }

    const segments = await getSegmentsBySongId(id);

    // Construct full song object with segments
    const fullSong = {
      id: song.id,
      title: song.title,
      artist: song.artist,
      audioUrl: song.audioKey ? getPublicUrl(song.audioKey) : '',
      segments: segments.map(segment => ({
        id: segment.id,
        songId: segment.songId,
        order: segment.order,
        label: segment.label,
        lyricText: segment.lyricText,
        startMs: segment.startMs,
        endMs: segment.endMs,
        pitchContourNotes: segment.pitchContourNotes ?? [],
      })),
      createdAt: song.createdAt,
      lastPracticedAt: song.lastPracticedAt,
      updatedAt: song.createdAt, // No updatedAt in schema, using createdAt
    };

    return NextResponse.json(fullSong);
  } catch (error) {
    console.error('Error fetching song:', error);
    return NextResponse.json(formatError(error), { status: 500 });
  }
}

export async function DELETE(
  request: NextRequest,
  { params }: { params: Promise<{ id: string }> }
) {
  try {
    const userId = resolveRequestUserId(request);
    const { id } = await params;
    const song = await getSongById(id, userId);
    let audioCleanupFailed = false;
    if (!song) {
      return NextResponse.json({ error: 'Song not found' }, { status: 404 });
    }

    if (song.audioKey) {
      try {
        await deleteObject(song.audioKey);
      } catch (audioDeleteError) {
        // Remote object cleanup should not block deleting the song record.
        // Record the key so it can be retried later.
        audioCleanupFailed = true;
        console.warn('Failed to delete audio object during song delete:', {
          songId: id,
          audioKey: song.audioKey,
          error: audioDeleteError,
        });
        try {
          await recordOrphanedAudioKey(crypto.randomUUID(), song.audioKey, userId);
        } catch (recordError) {
          console.error('Failed to record orphaned audio key:', recordError);
        }
      }
    }

    await deleteSong(id, userId);
    return new NextResponse(null, {
      status: 204,
      headers: audioCleanupFailed ? { 'x-audio-cleanup-warning': 'true' } : undefined,
    });
  } catch (error) {
    console.error('Error deleting song:', error);
    return NextResponse.json(formatError(error), { status: 500 });
  }
}

export async function PATCH(
  request: NextRequest,
  { params }: { params: Promise<{ id: string }> }
) {
  try {
    const userId = resolveRequestUserId(request);
    const { id } = await params;
    const body = await request.json();
    const { audioKey, title, artist } = body;

    const existingSong = await getSongById(id, userId);
    if (!existingSong) {
      return NextResponse.json({ error: 'Song not found' }, { status: 404 });
    }

    const updates: Partial<Pick<SongRow, 'audioKey' | 'title' | 'artist'>> = {};
    if (audioKey !== undefined) updates.audioKey = audioKey;
    if (title !== undefined) updates.title = title;
    if (artist !== undefined) updates.artist = artist;

    if (Object.keys(updates).length === 0) {
      return NextResponse.json({ error: 'No valid fields to update' }, { status: 400 });
    }

    if (
      updates.audioKey !== undefined &&
      existingSong.audioKey &&
      existingSong.audioKey !== updates.audioKey
    ) {
      await deleteObject(existingSong.audioKey);
    }

    await updateSong(id, updates, userId);
    return NextResponse.json({ success: true });
  } catch (error) {
    console.error('Error updating song:', error);
    return NextResponse.json(formatError(error), { status: 500 });
  }
}