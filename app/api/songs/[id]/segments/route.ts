import { NextRequest, NextResponse } from 'next/server';
import { getSegmentsBySongId, upsertSegments, createSegment } from '../../../../../db/queries';
import type { SegmentRow } from '../../../../../db/schema';

export async function GET(
  request: NextRequest,
  { params }: { params: Promise<{ id: string }> }
) {
  try {
    const { id } = await params;
    const segments = await getSegmentsBySongId(id);
    return NextResponse.json(segments);
  } catch (error) {
    const message = error instanceof Error ? error.message : 'Unknown server error';
    console.error('Error fetching segments:', error);
    const errorResponse =
      process.env.NODE_ENV === 'development'
        ? { error: message }
        : { error: 'Internal server error' };
    return NextResponse.json(errorResponse, { status: 500 });
  }
}

export async function POST(
  request: NextRequest,
  { params }: { params: Promise<{ id: string }> }
) {
  try {
    const { id: songId } = await params;
    const body = await request.json();
    const { id, label, order, startMs, endMs, lyricText } = body;

    // Validate required fields
    if (!id || typeof id !== 'string') {
      return NextResponse.json({ error: 'Segment ID is required and must be a string' }, { status: 400 });
    }
    if (!label || typeof label !== 'string') {
      return NextResponse.json({ error: 'Label is required and must be a string' }, { status: 400 });
    }
    if (order === undefined || typeof order !== 'number') {
      return NextResponse.json({ error: 'Order is required and must be a number' }, { status: 400 });
    }
    if (startMs === undefined || typeof startMs !== 'number') {
      return NextResponse.json({ error: 'Start time is required and must be a number' }, { status: 400 });
    }
    if (endMs === undefined || typeof endMs !== 'number') {
      return NextResponse.json({ error: 'End time is required and must be a number' }, { status: 400 });
    }
    if (lyricText === undefined || typeof lyricText !== 'string') {
      return NextResponse.json({ error: 'Lyric text is required and must be a string' }, { status: 400 });
    }

    const segment = await createSegment({
      id,
      songId,
      label,
      order,
      startMs,
      endMs,
      lyricText,
    });

    return NextResponse.json(segment, { status: 201 });
  } catch (error) {
    const message = error instanceof Error ? error.message : 'Unknown server error';
    console.error('Error creating segment:', error);
    const errorResponse =
      process.env.NODE_ENV === 'development'
        ? { error: message }
        : { error: 'Internal server error' };
    return NextResponse.json(errorResponse, { status: 500 });
  }
}

export async function PUT(
  request: NextRequest,
  { params }: { params: Promise<{ id: string }> }
) {
  try {
    const { id } = await params;
    const body = await request.json();
    const { segments } = body;

    if (!Array.isArray(segments)) {
      return NextResponse.json({ error: 'Segments must be an array' }, { status: 400 });
    }

    // Basic validation for segment structure
    for (const segment of segments) {
      if (
        typeof segment.id !== 'string' ||
        typeof segment.label !== 'string' ||
        typeof segment.order !== 'number' ||
        typeof segment.startMs !== 'number' ||
        typeof segment.endMs !== 'number' ||
        typeof segment.lyricText !== 'string'
      ) {
        return NextResponse.json({ error: 'Invalid segment structure' }, { status: 400 });
      }
    }

    await upsertSegments(id, segments);
    return NextResponse.json({ success: true });
  } catch (error) {
    const message = error instanceof Error ? error.message : 'Unknown server error';
    console.error('Error upserting segments:', error);
    const errorResponse =
      process.env.NODE_ENV === 'development'
        ? { error: message }
        : { error: 'Internal server error' };
    return NextResponse.json(errorResponse, { status: 500 });
  }
}