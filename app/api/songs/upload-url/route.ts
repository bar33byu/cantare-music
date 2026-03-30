import { NextRequest, NextResponse } from 'next/server';
import { PutObjectCommand } from '@aws-sdk/client-s3';
import { generateUploadKey, r2Client, BUCKET } from '../../../../lib/r2';

const MAX_FILE_SIZE = 15_000_000;
const ALLOWED_CONTENT_TYPES = new Set(['audio/mpeg', 'audio/mp3']);

export async function POST(request: NextRequest) {
  try {
    const formData = await request.formData();
    const file = formData.get('file') as File | null;
    const songId = formData.get('songId') as string | null;

    if (!file || !songId) {
      return NextResponse.json({ error: 'Missing file or songId' }, { status: 400 });
    }

    if (file.size > MAX_FILE_SIZE) {
      return NextResponse.json({ error: 'File too large' }, { status: 400 });
    }

    if (!ALLOWED_CONTENT_TYPES.has(file.type)) {
      return NextResponse.json({ error: 'Invalid file type' }, { status: 400 });
    }

    const key = generateUploadKey(songId, file.name);
    const buffer = await file.arrayBuffer();

    const command = new PutObjectCommand({
      Bucket: BUCKET,
      Key: key,
      ContentType: file.type,
      Body: new Uint8Array(buffer),
    });

    await r2Client.send(command);

    return NextResponse.json({ key }, { status: 200 });
  } catch (error) {
    console.error('Error uploading to R2:', error);
    return NextResponse.json(
      { error: 'Failed to upload file' },
      { status: 500 }
    );
  }
}