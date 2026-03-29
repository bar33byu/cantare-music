import { NextRequest, NextResponse } from 'next/server';
import { PutObjectCommand } from '@aws-sdk/client-s3';
import { getSignedUrl } from '@aws-sdk/s3-request-presigner';
import { generateUploadKey, r2Client } from '../../../../lib/r2';

type UploadRequestBody = {
  songId?: string;
  filename?: string;
  contentType?: string;
  size?: number;
};

const MAX_FILE_SIZE = 15_000_000;
const ALLOWED_CONTENT_TYPES = new Set(['audio/mpeg', 'audio/mp3']);

export async function POST(request: NextRequest) {
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

  const bucketName = process.env.R2_BUCKET_NAME;

  if (!bucketName) {
    return NextResponse.json({ error: 'R2 bucket not configured' }, { status: 500 });
  }

  const key = generateUploadKey(body.songId, body.filename);

  const command = new PutObjectCommand({
    Bucket: bucketName,
    Key: key,
    ContentType: body.contentType,
  });

  const uploadUrl = await getSignedUrl(r2Client, command, { expiresIn: 300 });

  return NextResponse.json({ uploadUrl, key });
}