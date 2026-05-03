import { NextRequest, NextResponse } from 'next/server';
import { PutObjectCommand } from '@aws-sdk/client-s3';
import { getSignedUrl } from '@aws-sdk/s3-request-presigner';
import { generateUploadKey, r2Client, BUCKET } from '../../../../lib/r2';
import { resolveRequestUserId } from '../../_user';
import { getSongById } from '../../../../db/queries';

type UploadRequestBody = {
  songId?: string;
  filename?: string;
  contentType?: string;
  size?: number;
};

const MAX_FILE_SIZE = 15_000_000;
const ALLOWED_CONTENT_TYPES = new Set(['audio/mpeg', 'audio/mp3']);

export async function POST(request: NextRequest) {
  try {
    const userId = resolveRequestUserId(request);
    const body = (await request.json().catch(() => null)) as UploadRequestBody | null;

    if (
      !body ||
      typeof body.songId !== 'string' ||
      typeof body.filename !== 'string' ||
      typeof body.contentType !== 'string' ||
      typeof body.size !== 'number'
    ) {
      return NextResponse.json({ error: 'Missing required fields' }, { status: 400 });
    }

    if (body.size > MAX_FILE_SIZE) {
      return NextResponse.json({ error: 'File too large' }, { status: 400 });
    }

    if (!ALLOWED_CONTENT_TYPES.has(body.contentType)) {
      return NextResponse.json({ error: 'Invalid file type' }, { status: 400 });
    }

    const song = await getSongById(body.songId, userId);
    if (!song) {
      return NextResponse.json({ error: 'Song not found' }, { status: 404 });
    }

    const key = generateUploadKey(body.songId, body.filename);

    const command = new PutObjectCommand({
      Bucket: BUCKET,
      Key: key,
      ContentType: body.contentType,
    });

    const uploadUrl = await getSignedUrl(r2Client, command, { expiresIn: 3600 });

    return NextResponse.json({ uploadUrl, key }, { status: 200 });
  } catch (error) {
    const errorMsg = error instanceof Error ? error.message : String(error);
    console.error('[Upload] Error generating presigned URL:', errorMsg);
    return NextResponse.json(
      { error: errorMsg },
      { status: 500 }
    );
  }
}
