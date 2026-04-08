import { NextRequest, NextResponse } from 'next/server';
import { PutObjectCommand } from '@aws-sdk/client-s3';
import { BUCKET, generateUploadKey, r2Client } from '../../../../lib/r2';
import { resolveRequestUserId } from '../../_user';
import { getSongById } from '../../../../db/queries';

const MAX_FILE_SIZE = 15_000_000;
const ALLOWED_CONTENT_TYPES = new Set(['audio/mpeg', 'audio/mp3']);

export async function POST(request: NextRequest) {
  try {
    const userId = resolveRequestUserId(request);
    const formData = await request.formData();
    const file = formData.get('file');
    const songId = formData.get('songId');
    const requestedKey = formData.get('key');

    if (!(file instanceof File) || typeof songId !== 'string') {
      return NextResponse.json({ error: 'Missing required fields' }, { status: 400 });
    }

    if (file.size > MAX_FILE_SIZE) {
      return NextResponse.json({ error: 'File too large' }, { status: 400 });
    }

    if (!ALLOWED_CONTENT_TYPES.has(file.type)) {
      return NextResponse.json({ error: 'Invalid file type' }, { status: 400 });
    }

    const song = await getSongById(songId, userId);
    if (!song) {
      return NextResponse.json({ error: 'Song not found' }, { status: 404 });
    }

    const key =
      typeof requestedKey === 'string' && requestedKey.length > 0
        ? requestedKey
        : generateUploadKey(userId, songId, file.name);

    if (!key.startsWith(`users/${userId}/`)) {
      return NextResponse.json({ error: 'Invalid upload key namespace' }, { status: 400 });
    }

    const buffer = Buffer.from(await file.arrayBuffer());

    await r2Client.send(
      new PutObjectCommand({
        Bucket: BUCKET,
        Key: key,
        Body: buffer,
        ContentType: file.type,
        CacheControl: 'public, max-age=31536000, immutable',
      }),
    );

    return NextResponse.json({ key }, { status: 200 });
  } catch (error) {
    const rawMsg = error instanceof Error ? error.message : String(error);
    const errorMsg = rawMsg.includes('SignatureDoesNotMatch')
      ? 'R2 signature mismatch. Verify R2_ACCOUNT_ID, R2_ACCESS_KEY_ID, R2_SECRET_ACCESS_KEY, and bucket settings in this environment.'
      : rawMsg;
    console.error('[Upload] Error uploading via server fallback:', rawMsg);
    return NextResponse.json({ error: errorMsg }, { status: 500 });
  }
}