import { NextRequest, NextResponse } from 'next/server';
import { getAllUsers, upsertUser } from '../../../db/queries';
import { DEFAULT_USER_ID, normalizeUserId } from '../../lib/userContext';

function formatError(error: unknown) {
  const message = error instanceof Error ? error.message : 'Unknown server error';
  const shouldExpose =
    process.env.NODE_ENV === 'development' ||
    process.env.NEXT_PUBLIC_DEBUG_API_ERRORS === 'true';

  return shouldExpose ? { error: message } : { error: 'Internal server error' };
}

export async function GET() {
  try {
    const users = await getAllUsers();
    return NextResponse.json({ users });
  } catch (error) {
    console.error('Error fetching users:', error);
    return NextResponse.json(formatError(error), { status: 500 });
  }
}

export async function POST(request: NextRequest) {
  try {
    const body = await request.json();
    const name = typeof body?.name === 'string' ? body.name.trim() : '';
    const requestedId = typeof body?.id === 'string' ? body.id : undefined;

    if (!name) {
      return NextResponse.json({ error: 'name is required and must be a string' }, { status: 400 });
    }

    const id = normalizeUserId(requestedId ?? name) || DEFAULT_USER_ID;
    const user = await upsertUser({ id, name });
    return NextResponse.json(user, { status: 200 });
  } catch (error) {
    console.error('Error upserting user:', error);
    return NextResponse.json(formatError(error), { status: 500 });
  }
}
