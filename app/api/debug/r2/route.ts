import { HeadObjectCommand } from '@aws-sdk/client-s3';
import { NextRequest, NextResponse } from 'next/server';
import { BUCKET, r2Client } from '../../../../lib/r2';

export const runtime = 'nodejs';

export async function GET(request: NextRequest) {
  try {
    const url = new URL(request.url);
    const key = url.searchParams.get('key') ?? undefined;

    const rawEnv = {
      R2_ACCOUNT_ID: process.env.R2_ACCOUNT_ID,
      R2_ACCESS_KEY_ID: process.env.R2_ACCESS_KEY_ID,
      R2_SECRET_ACCESS_KEY: process.env.R2_SECRET_ACCESS_KEY,
      R2_BUCKET_NAME: process.env.R2_BUCKET_NAME ?? process.env.R2_BUCKET,
      R2_PUBLIC_URL: process.env.R2_PUBLIC_URL,
      R2_PUBLIC_BASE_URL: process.env.R2_PUBLIC_BASE_URL,
      R2_PUBLIC_BASE_UR: process.env.R2_PUBLIC_BASE_UR,
      R2_ENDPOINT: process.env.R2_ENDPOINT,
    };

    const envPresence = Object.fromEntries(
      Object.entries(rawEnv).map(([k, v]) => [k, typeof v === 'string' && v.trim().length > 0 ? 'present' : 'missing'])
    );

    function mask(value: string | undefined | null) {
      if (!value) return null;
      if (value.length <= 8) return '••••' + value.slice(-2);
      return `${value.slice(0, 4)}…${value.slice(-4)}`;
    }

    // Compute chosen endpoint similar to lib/r2.ts
    const accountId = rawEnv.R2_ACCOUNT_ID;
    const computedEndpoint = rawEnv.R2_ENDPOINT ?? (accountId ? `https://${accountId}.r2.cloudflarestorage.com` : undefined);
    const bucket = rawEnv.R2_BUCKET_NAME ?? rawEnv.R2_BUCKET ?? BUCKET;

    const publicCandidates = [rawEnv.R2_PUBLIC_URL, rawEnv.R2_PUBLIC_BASE_URL, rawEnv.R2_PUBLIC_BASE_UR, rawEnv.R2_ENDPOINT]
      .filter((v) => typeof v === 'string' && v && v !== 'undefined');
    const chosenPublic = publicCandidates.length > 0 ? publicCandidates[0] : undefined;

    console.info('R2 debug endpoint called. Env presence:', envPresence, 'keyProvided:', !!key);

    if (!key) {
      const sampleKey = 'audio/sample.mp3';
      const encodedSampleKey = sampleKey.split('/').map((s) => encodeURIComponent(s)).join('/');
      const samplePublicUrl = chosenPublic ? `${String(chosenPublic).replace(/\/$/, '')}/${encodedSampleKey}` : `/api/audio/${encodedSampleKey}`;

      return NextResponse.json({
        ok: true,
        envPresence,
        envMasked: Object.fromEntries(Object.entries(rawEnv).map(([k, v]) => [k, mask(v)])),
        computedEndpoint: computedEndpoint ?? null,
        bucket: bucket ?? null,
        publicCandidates: publicCandidates,
        chosenPublic: chosenPublic ?? null,
        samplePublicUrl,
      });
    }

    // Try a HEAD-like check using HeadObjectCommand to avoid transferring the body
    const head = await r2Client.send(new HeadObjectCommand({ Bucket: BUCKET, Key: key }));

    console.info('HeadObject success for key:', key, {
      ContentLength: head.ContentLength,
      ContentType: head.ContentType,
      ETag: head.ETag,
    });

    return NextResponse.json({
      ok: true,
      meta: { ContentLength: head.ContentLength, ContentType: head.ContentType, ETag: head.ETag },
      envPresence,
      envMasked: Object.fromEntries(Object.entries(rawEnv).map(([k, v]) => [k, mask(v)])),
      computedEndpoint: computedEndpoint ?? null,
    });
  } catch (error) {
    const message = error instanceof Error ? error.message : String(error);
    console.error('R2 debug error:', message);
    const notFound = /NoSuchKey|NotFound|404/.test(message);
    return NextResponse.json({ ok: false, error: message, notFound }, { status: 500 });
  }
}
