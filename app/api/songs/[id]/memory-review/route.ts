import { NextRequest, NextResponse } from 'next/server';
import { getMemoryReviewStatus, updateMemoryReview } from '../../../../../db/queries';
import { resolveEffectiveRequestUserId } from '../../../_user';
import { formatError } from '../../../_errors';

const headers = { 'Cache-Control': 'private, no-store', Vary: 'X-User-ID' };
type Context = { params: Promise<{ id: string }> };
async function handle(request: NextRequest, context: Context, action: 'read' | 'start' | 'undo') {
  try {
    const userId = await resolveEffectiveRequestUserId(request);
    const { id } = await context.params;
    const result = action === 'read' ? await getMemoryReviewStatus(id, userId)
      : await updateMemoryReview(id, userId, action === 'undo');
    if (!result) return NextResponse.json({ error: 'Song not found' }, { status: 404, headers });
    return NextResponse.json(result, { headers });
  } catch (error) {
    return NextResponse.json(formatError(error), { status: 500, headers });
  }
}
export async function GET(request: NextRequest, context: Context) { return handle(request, context, 'read'); }
export async function POST(request: NextRequest, context: Context) { return handle(request, context, 'start'); }
export async function DELETE(request: NextRequest, context: Context) { return handle(request, context, 'undo'); }
