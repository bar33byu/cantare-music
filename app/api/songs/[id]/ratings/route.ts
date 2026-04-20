import { NextRequest, NextResponse } from 'next/server';
import { getRatingsForSong, getSongById, getSegmentsBySongId, saveRatings, markSongPracticed } from '../../../../../db/queries';

function formatError(error: unknown) {
  const message = error instanceof Error ? error.message : 'Unknown server error';
  const shouldExpose =
    process.env.NODE_ENV === 'development' ||
    process.env.NEXT_PUBLIC_DEBUG_API_ERRORS === 'true';

  return shouldExpose ? { error: message } : { error: 'Internal server error' };
}

function isValidRating(value: unknown): value is 1 | 2 | 3 | 4 | 5 {
  return typeof value === 'number' && Number.isInteger(value) && value >= 1 && value <= 5;
}

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

    const ratings = await getRatingsForSong(id);
    return NextResponse.json({ ratings });
  } catch (error) {
    console.error('Error fetching ratings:', error);
    return NextResponse.json(formatError(error), { status: 500 });
  }
}

export async function POST(
  request: NextRequest,
  { params }: { params: Promise<{ id: string }> }
) {
  try {
    const { id } = await params;
    const song = await getSongById(id);

    if (!song) {
      return NextResponse.json({ error: 'Song not found' }, { status: 404 });
    }

    const body = await request.json();
    const ratings = body?.ratings;

    if (!Array.isArray(ratings)) {
      return NextResponse.json({ error: 'ratings must be an array' }, { status: 400 });
    }

    const songSegments = await getSegmentsBySongId(id);
    const segmentIdSet = new Set(songSegments.map((segment) => segment.id));

    for (const item of ratings) {
      if (!item || typeof item !== 'object') {
        return NextResponse.json({ error: 'Each rating must be an object' }, { status: 400 });
      }

      if (typeof item.segmentId !== 'string' || !segmentIdSet.has(item.segmentId)) {
        return NextResponse.json(
          { error: 'Each rating segmentId must belong to this song' },
          { status: 400 }
        );
      }

      if (!isValidRating(item.rating)) {
        return NextResponse.json({ error: 'Each rating must be an integer between 1 and 5' }, { status: 400 });
      }

      if (typeof item.ratedAt !== 'string' || Number.isNaN(Date.parse(item.ratedAt))) {
        return NextResponse.json({ error: 'Each ratedAt must be a valid ISO date string' }, { status: 400 });
      }
    }

    await saveRatings(
      ratings.map((item) => ({
        segmentId: item.segmentId,
        rating: item.rating,
        ratedAt: new Date(item.ratedAt),
      }))
    );

    if (ratings.length > 0) {
      await markSongPracticed(id, new Date());
    }

    return new NextResponse(null, { status: 204 });
  } catch (error) {
    console.error('Error saving ratings:', error);
    return NextResponse.json(formatError(error), { status: 500 });
  }
}
