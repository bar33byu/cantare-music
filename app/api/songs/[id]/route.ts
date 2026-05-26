import { NextRequest, NextResponse } from 'next/server';
import {
  getSongById,
  deleteSong,
  updateSong,
  getSegmentsBySongId,
  getDraftRecordingsForSong,
  getArchivedDraftRecordingsForSong,
  recordOrphanedAudioKey,
} from '../../../../db/queries';
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

    const [segments, draftRecordings, archivedDraftRecordings] = await Promise.all([
      getSegmentsBySongId(id),
      getDraftRecordingsForSong(id, userId),
      getArchivedDraftRecordingsForSong(id, userId),
    ]);

    // Construct full song object with segments
    const fullSong = {
      id: song.id,
      title: song.title,
      artist: song.artist,
      audioUrl: song.audioKey ? getPublicUrl(song.audioKey) : '',
      alternateAudioUrl: song.alternateAudioKey ? getPublicUrl(song.alternateAudioKey) : undefined,
      audioTrimStartMs: song.audioTrimStartMs ?? null,
      audioTrimEndMs: song.audioTrimEndMs ?? null,
      pitchContourNotes: [],
      draftRecordings: draftRecordings.map((draft) => ({
        ...draft,
        audioUrl: getPublicUrl(draft.audioKey),
      })),
      archivedDraftRecordings: archivedDraftRecordings.map((draft) => ({
        ...draft,
        audioUrl: getPublicUrl(draft.audioKey),
      })),
      segments: segments.map(segment => ({
        id: segment.id,
        songId: segment.songId,
        order: segment.order,
        label: segment.label,
        lyricText: segment.lyricText,
        startMs: segment.startMs,
        endMs: segment.endMs,
        pitchContourNotes: [],
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

    for (const audioKey of [song.audioKey, song.alternateAudioKey]) {
      if (!audioKey) {
        continue;
      }
      try {
        await deleteObject(audioKey);
      } catch (audioDeleteError) {
        // Remote object cleanup should not block deleting the song record.
        // Record the key so it can be retried later.
        audioCleanupFailed = true;
        console.warn('Failed to delete audio object during song delete:', {
          songId: id,
          audioKey,
          error: audioDeleteError,
        });
        try {
          await recordOrphanedAudioKey(crypto.randomUUID(), audioKey, userId);
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
    const { audioKey, alternateAudioKey, title, artist } = body;

    const existingSong = await getSongById(id, userId);
    if (!existingSong) {
      return NextResponse.json({ error: 'Song not found' }, { status: 404 });
    }

    if (audioKey !== undefined && typeof audioKey !== 'string') {
      return NextResponse.json({ error: 'Audio key must be a string' }, { status: 400 });
    }
    if (alternateAudioKey !== undefined && typeof alternateAudioKey !== 'string') {
      return NextResponse.json({ error: 'Alternate audio key must be a string' }, { status: 400 });
    }

    const updates: Partial<Pick<SongRow, 'audioKey' | 'alternateAudioKey' | 'title' | 'artist'>> = {};
    if (audioKey !== undefined) updates.audioKey = audioKey;
    if (alternateAudioKey !== undefined) updates.alternateAudioKey = alternateAudioKey;
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
    if (
      updates.alternateAudioKey !== undefined &&
      existingSong.alternateAudioKey &&
      existingSong.alternateAudioKey !== updates.alternateAudioKey
    ) {
      await deleteObject(existingSong.alternateAudioKey);
    }

    await updateSong(id, updates, userId);
    return NextResponse.json({ success: true });
  } catch (error) {
    const errorCode = (error as { code?: string })?.code;
    if (errorCode === 'SONG_PITCH_CONTOUR_MIGRATION_REQUIRED') {
      return NextResponse.json(
        { error: 'Song pitch contour saving is unavailable until migration 0008_song_timeline_contour.sql is applied.' },
        { status: 409 }
      );
    }
    if (errorCode === 'SONG_ALTERNATE_AUDIO_MIGRATION_REQUIRED') {
      return NextResponse.json(
        { error: 'Alternate audio saving is unavailable until migration 0009_alternate_audio_key.sql is applied.' },
        { status: 409 }
      );
    }
    console.error('Error updating song:', error);
    return NextResponse.json(formatError(error), { status: 500 });
  }
}
