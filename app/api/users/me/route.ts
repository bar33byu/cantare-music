import { NextRequest, NextResponse } from "next/server";
import { logAuditEvent, updateUserProfile } from "../../../../db/queries";
import { normalizeUsername } from "../../../lib/userContext";
import { resolveRequestUser, isEmailAdmin } from "../../_user";

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
    const user = await resolveRequestUser(request);
    if (!user) {
      return NextResponse.json({ error: "Not signed in" }, { status: 401 });
    }

    const body = await request.json().catch(() => ({}));
    const displayName = typeof body?.displayName === "string" ? body.displayName.trim() : "";
    const usernameProvided = Object.prototype.hasOwnProperty.call(body ?? {}, "username");
    const username = usernameProvided ? normalizeUsername(typeof body?.username === "string" ? body.username : "") : undefined;
    if (!displayName) {
      return NextResponse.json({ error: "displayName is required" }, { status: 400 });
    }
    if (usernameProvided && !username) {
      return NextResponse.json({ error: "username is required and must contain letters or numbers" }, { status: 400 });
    }

    const updated = await updateUserProfile(user.id, { name: displayName, username });
    if (!updated) {
      return NextResponse.json({ error: "User not found" }, { status: 404 });
    }

    if (usernameProvided && user.username !== updated.username) {
      await logAuditEvent({
        eventType: "user.username_changed",
        actorUserId: user.id,
        effectiveUserId: user.id,
        resourceType: "user",
        resourceId: user.id,
        metadata: {
          previousUsername: user.username,
          newUsername: updated.username,
        },
      });
    }

    return NextResponse.json({ user: { ...updated, isAdmin: isEmailAdmin(updated.email) } });
  } catch (error) {
    if (error instanceof Error && error.message.toLowerCase().includes("users_username_unique")) {
      return NextResponse.json({ error: "username is already taken" }, { status: 409 });
    }
    console.error("Error updating current user:", error);
    return NextResponse.json(formatError(error), { status: 500 });
  }
}
