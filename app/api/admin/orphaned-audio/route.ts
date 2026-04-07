import { NextResponse } from 'next/server';
import { getOrphanedAudioKeys, deleteOrphanedAudioKey } from '../../../../db/queries';
import { deleteObject } from '../../../../lib/r2';

export async function GET() {
  try {
    const rows = await getOrphanedAudioKeys();
    return NextResponse.json(rows);
  } catch (error) {
    const message = error instanceof Error ? error.message : 'Unknown error';
    return NextResponse.json({ error: message }, { status: 500 });
  }
}

export async function POST() {
  try {
    const rows = await getOrphanedAudioKeys();
    const results: { id: string; audioKey: string; status: 'deleted' | 'failed'; error?: string }[] = [];

    for (const row of rows) {
      try {
        await deleteObject(row.audioKey);
        await deleteOrphanedAudioKey(row.id);
        results.push({ id: row.id, audioKey: row.audioKey, status: 'deleted' });
      } catch (err) {
        results.push({
          id: row.id,
          audioKey: row.audioKey,
          status: 'failed',
          error: err instanceof Error ? err.message : 'Unknown error',
        });
      }
    }

    return NextResponse.json({ results });
  } catch (error) {
    const message = error instanceof Error ? error.message : 'Unknown error';
    return NextResponse.json({ error: message }, { status: 500 });
  }
}
