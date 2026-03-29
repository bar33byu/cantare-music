import { NextRequest, NextResponse } from 'next/server';
import { getSegmentsBySongId, upsertSegments } from '../../../../../db/queries';
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
    console.error('Error fetching segments:', error);
    return NextResponse.json({ error: 'Internal server error' }, { status: 500 });
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
    console.error('Error upserting segments:', error);
    return NextResponse.json({ error: 'Internal server error' }, { status: 500 });
  }
}