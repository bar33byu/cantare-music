import { NextRequest, NextResponse } from 'next/server';
import { getSongById, deleteSong, updateSong, getSegmentsBySongId } from '../../../../db/queries';
import { deleteObject, getPublicUrl } from '../../../../lib/r2';
import type { SongRow } from '../../../../db/schema';

export async function GET(
  request: NextRequest,
  { params }: { params: Promise<{ id: string }> }
) {
  try {
    const { id } = await params;
    const song = await getSongById(id);
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
      })),
      createdAt: song.createdAt,
      updatedAt: song.createdAt, // No updatedAt in schema, using createdAt
    };

    return NextResponse.json(fullSong);
  } catch (error) {
    console.error('Error fetching song:', error);
    return NextResponse.json({ error: 'Internal server error' }, { status: 500 });
  }
}

export async function DELETE(
  request: NextRequest,
  { params }: { params: Promise<{ id: string }> }
) {
  try {
    const { id } = await params;
    const song = await getSongById(id);
    if (!song) {
      return NextResponse.json({ error: 'Song not found' }, { status: 404 });
    }

    if (song.audioKey) {
      await deleteObject(song.audioKey);
    }

    await deleteSong(id);
    return new NextResponse(null, { status: 204 });
  } catch (error) {
    console.error('Error deleting song:', error);
    return NextResponse.json({ error: 'Internal server error' }, { status: 500 });
  }
}

export async function PATCH(
  request: NextRequest,
  { params }: { params: Promise<{ id: string }> }
) {
  try {
    const { id } = await params;
    const body = await request.json();
    const { audioKey, title, artist } = body;

    const updates: Partial<Pick<SongRow, 'audioKey' | 'title' | 'artist'>> = {};
    if (audioKey !== undefined) updates.audioKey = audioKey;
    if (title !== undefined) updates.title = title;
    if (artist !== undefined) updates.artist = artist;

    if (Object.keys(updates).length === 0) {
      return NextResponse.json({ error: 'No valid fields to update' }, { status: 400 });
    }

    await updateSong(id, updates);
    return NextResponse.json({ success: true });
  } catch (error) {
    console.error('Error updating song:', error);
    return NextResponse.json({ error: 'Internal server error' }, { status: 500 });
  }
}