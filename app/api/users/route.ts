import { NextRequest, NextResponse } from 'next/server';
import { getAllUsers, getUserById, logAuditEvent, upsertUser } from '../../../db/queries';
import { isEmailAdmin, resolveRequestContext } from '../_user';
import { createPublicUsernameFromName, DEFAULT_USER_ID, normalizeUserId, normalizeUsername } from '../../lib/userContext';

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
    return NextResponse.json({
      users: users.map((user) => ({ ...user, isAdmin: isEmailAdmin(user.email) })),
    });
  } catch (error) {
    console.error('Error fetching users:', error);
    return NextResponse.json(formatError(error), { status: 500 });
  }
}

export async function POST(request: NextRequest) {
  try {
    const body = await request.json();
    const name = typeof body?.displayName === 'string'
      ? body.displayName.trim()
      : typeof body?.name === 'string'
        ? body.name.trim()
        : '';
    const username = normalizeUsername(
      typeof body?.username === 'string' ? body.username : name ? createPublicUsernameFromName(name) : ''
    );
    const email = typeof body?.email === 'string' ? body.email.trim().toLowerCase() : '';
    const requestedId = typeof body?.id === 'string' ? body.id : undefined;
    const avatarUrl = typeof body?.avatarUrl === 'string' && body.avatarUrl.trim() ? body.avatarUrl.trim() : null;
    const profileVisibility = body?.profileVisibility === 'public' ? 'public' : 'private';

    if (!name) {
      return NextResponse.json({ error: 'display name is required and must be a string' }, { status: 400 });
    }

    if (!username) {
      return NextResponse.json({ error: 'username is required and must contain letters or numbers' }, { status: 400 });
    }

    const id = normalizeUserId(requestedId ?? name) || DEFAULT_USER_ID;
    const context = await resolveRequestContext(request);
    const existing = await getUserById(id);
    const user = await upsertUser({ id, username, name, email, avatarUrl, profileVisibility });

    const actorUserId = context.actor?.id ?? user.id;
    const effectiveUserId = context.effectiveUser?.id ?? user.id;
    if (existing && existing.email !== user.email) {
      await logAuditEvent({
        eventType: 'user.email_changed',
        actorUserId,
        effectiveUserId,
        resourceType: 'user',
        resourceId: user.id,
        metadata: {
          previousEmail: existing.email,
          newEmail: user.email,
        },
      });
    }

    if (existing && existing.username !== user.username) {
      await logAuditEvent({
        eventType: 'user.username_changed',
        actorUserId,
        effectiveUserId,
        resourceType: 'user',
        resourceId: user.id,
        metadata: {
          previousUsername: existing.username,
          newUsername: user.username,
        },
      });
    }

    return NextResponse.json({ ...user, isAdmin: isEmailAdmin(user.email) }, { status: 200 });
  } catch (error) {
    if (error instanceof Error && error.message.toLowerCase().includes('users_username_unique')) {
      return NextResponse.json({ error: 'username is already taken' }, { status: 409 });
    }
    console.error('Error upserting user:', error);
    return NextResponse.json(formatError(error), { status: 500 });
  }
}
