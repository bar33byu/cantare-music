import { NextRequest, NextResponse } from "next/server";
import { getUserById, logAuditEvent, normalizePublicUsername, updateUserProfile } from "../../../../db/queries";
import { resolveRequestContext, resolveRequestUser, isEmailAdmin } from "../../_user";

function formatError(error: unknown) {
  const message = error instanceof Error ? error.message : "Unknown server error";
  const shouldExpose =
    process.env.NODE_ENV === "development" ||
    process.env.NEXT_PUBLIC_DEBUG_API_ERRORS === "true";

  return shouldExpose ? { error: message } : { error: "Internal server error" };
}

export async function GET(request: NextRequest) {
  const user = await resolveRequestUser(request);
  return NextResponse.json({
    user: user ? { ...user, isAdmin: isEmailAdmin(user.email) } : null,
  });
}

export async function PATCH(request: NextRequest) {
  try {
    const context = await resolveRequestContext(request);
    const user = context.effectiveUser;
    if (!user) {
      return NextResponse.json({ error: "Not signed in" }, { status: 401 });
    }

    const body = await request.json().catch(() => ({}));
    const hasDisplayName = typeof body?.displayName === "string";
    const hasUsername = typeof body?.username === "string";
    const displayName = hasDisplayName ? body.displayName.trim() : undefined;
    const username = hasUsername ? normalizePublicUsername(body.username) : undefined;

    if (hasDisplayName && !displayName) {
      return NextResponse.json({ error: "displayName is required" }, { status: 400 });
    }

    if (hasUsername && !username) {
      return NextResponse.json({ error: "username is required and must contain letters or numbers" }, { status: 400 });
    }

    if (!hasDisplayName && !hasUsername) {
      return NextResponse.json({ error: "displayName or username is required" }, { status: 400 });
    }

    const existing = await getUserById(user.id);
    const updated = await updateUserProfile(user.id, {
      ...(displayName !== undefined ? { name: displayName } : {}),
      ...(username !== undefined ? { username } : {}),
    });
    if (!updated) {
      return NextResponse.json({ error: "User not found" }, { status: 404 });
    }

    if (existing && existing.username !== updated.username) {
      await logAuditEvent({
        eventType: "user.username_changed",
        actorUserId: context.actor?.id ?? updated.id,
        effectiveUserId: updated.id,
        resourceType: "user",
        resourceId: updated.id,
        metadata: {
          previousUsername: existing.username,
          newUsername: updated.username,
        },
      });
    }

    return NextResponse.json({ user: { ...updated, isAdmin: isEmailAdmin(updated.email) } });
  } catch (error) {
    const message = error instanceof Error ? error.message.toLowerCase() : "";
    if (message.includes("users_username_unique")) {
      return NextResponse.json({ error: "username is already taken" }, { status: 409 });
    }
    console.error("Error updating current user:", error);
    return NextResponse.json(formatError(error), { status: 500 });
  }
}
