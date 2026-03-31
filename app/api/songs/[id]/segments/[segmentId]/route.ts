import { NextRequest, NextResponse } from 'next/server';
import { getSegmentsBySongId, updateSegment, deleteSegment, reorderSegments } from '../../../../../../db/queries';
import { inferTimelineOrder } from '../../../../../lib/segmentTiming';

function formatError(error: unknown) {
  const message = error instanceof Error ? error.message : 'Unknown server error';
  const shouldExpose =
    process.env.NODE_ENV === 'development' ||
    process.env.NEXT_PUBLIC_DEBUG_API_ERRORS === 'true';

  return shouldExpose ? { error: message } : { error: 'Internal server error' };
}

export async function GET(
  request: NextRequest,
  { params }: { params: Promise<{ id: string; segmentId: string }> }
) {
  try {
    const { id: songId, segmentId } = await params;

    // Get all segments for the song and find the specific one
    const segments = await getSegmentsBySongId(songId);
    const segment = segments.find(s => s.id === segmentId);

    if (!segment) {
      return NextResponse.json({ error: 'Segment not found' }, { status: 404 });
    }

    return NextResponse.json(segment);
  } catch (error) {
    console.error('Error fetching segment:', error);
    return NextResponse.json(formatError(error), { status: 500 });
  }
}

export async function PATCH(
  request: NextRequest,
  { params }: { params: Promise<{ id: string; segmentId: string }> }
) {
  try {
    const { id: songId, segmentId } = await params;
    const body = await request.json();
    const { label, startMs, endMs, lyricText } = body;

    // Validate input
    if (label !== undefined && typeof label !== 'string') {
      return NextResponse.json({ error: 'Label must be a string' }, { status: 400 });
    }
    if (startMs !== undefined && typeof startMs !== 'number') {
      return NextResponse.json({ error: 'Start time must be a number' }, { status: 400 });
    }
    if (endMs !== undefined && typeof endMs !== 'number') {
      return NextResponse.json({ error: 'End time must be a number' }, { status: 400 });
    }
    if (lyricText !== undefined && typeof lyricText !== 'string') {
      return NextResponse.json({ error: 'Lyric text must be a string' }, { status: 400 });
    }

    // Check if segment exists
    const segments = await getSegmentsBySongId(songId);
    const segmentToUpdate = segments.find(s => s.id === segmentId);
    const segmentExists = Boolean(segmentToUpdate);
    if (!segmentExists) {
      return NextResponse.json({ error: 'Segment not found' }, { status: 404 });
    }

    // Prepare updates object
    const updates: Record<string, any> = {};
    if (label !== undefined) updates.label = label;
    if (startMs !== undefined) updates.startMs = startMs;
    if (endMs !== undefined) updates.endMs = endMs;
    if (lyricText !== undefined) updates.lyricText = lyricText;

    if (Object.keys(updates).length === 0) {
      return NextResponse.json({ error: 'No valid fields to update' }, { status: 400 });
    }

    await updateSegment(segmentId, updates);

    if (startMs !== undefined || endMs !== undefined) {
      const updatedSegments = segments.map((segment) => {
        if (segment.id !== segmentId) {
          return segment;
        }

        return {
          ...segment,
          startMs: startMs ?? segment.startMs,
          endMs: endMs ?? segment.endMs,
        };
      });

      const normalized = inferTimelineOrder(updatedSegments);
      await reorderSegments(normalized.map(({ id, order }) => ({ id, order })));
    }

    return NextResponse.json({ success: true });
  } catch (error) {
    console.error('Error updating segment:', error);
    return NextResponse.json(formatError(error), { status: 500 });
  }
}

export async function DELETE(
  request: NextRequest,
  { params }: { params: Promise<{ id: string; segmentId: string }> }
) {
  try {
    const { id: songId, segmentId } = await params;

    // Check if segment exists
    const segments = await getSegmentsBySongId(songId);
    const segmentExists = segments.some(s => s.id === segmentId);
    if (!segmentExists) {
      return NextResponse.json({ error: 'Segment not found' }, { status: 404 });
    }

    await deleteSegment(segmentId);
    return NextResponse.json({ success: true });
  } catch (error) {
    console.error('Error deleting segment:', error);
    return NextResponse.json(formatError(error), { status: 500 });
  }
}