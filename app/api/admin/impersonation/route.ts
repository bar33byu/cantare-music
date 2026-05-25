import { NextRequest, NextResponse } from "next/server";
import { getUserById, logAuditEvent } from "../../../../db/queries";
import { SESSION_TTL_MS } from "../../../lib/authTokens";
import { USER_COOKIE_NAME, normalizeUserId } from "../../../lib/userContext";
import { IMPERSONATION_COOKIE_NAME, resolveRequestContext } from "../../_user";

function cookieOptions(maxAgeSeconds: number) {
  return {
    httpOnly: true,
    sameSite: "lax" as const,
    secure: process.env.NODE_ENV === "production",
    path: "/",
    maxAge: maxAgeSeconds,
  };
}

function readableCookieOptions(maxAgeSeconds: number) {
  return {
    httpOnly: false,
    sameSite: "lax" as const,
    secure: process.env.NODE_ENV === "production",
    path: "/",
    maxAge: maxAgeSeconds,
  };
}

function clearCookieOptions() {
  return {
    path: "/",
    maxAge: 0,
  };
}

function formatError(error: unknown) {
  const message = error instanceof Error ? error.message : "Unknown server error";
  const shouldExpose =
    process.env.NODE_ENV === "development" ||
    process.env.NEXT_PUBLIC_DEBUG_API_ERRORS === "true";

  return shouldExpose ? { error: message } : { error: "Internal server error" };
}

export async function POST(request: NextRequest) {
  try {
    const context = await resolveRequestContext(request);
    if (!context.actor?.isAdmin) {
      return NextResponse.json({ error: "Forbidden" }, { status: 403 });
    }

    const body = await request.json().catch(() => ({}));
    const userId = normalizeUserId(typeof body?.userId === "string" ? body.userId : "");
    const targetUser = await getUserById(userId);
    if (!targetUser) {
      return NextResponse.json({ error: "User not found" }, { status: 404 });
    }

    const maxAgeSeconds = Math.floor(SESSION_TTL_MS / 1000);
    await logAuditEvent({
      eventType: "impersonation.started",
      actorUserId: context.actor.id,
      effectiveUserId: targetUser.id,
      resourceType: "user",
      resourceId: targetUser.id,
      metadata: {
        targetEmail: targetUser.email,
        targetUsername: targetUser.username,
      },
    });

    const response = NextResponse.json({
      actor: context.actor,
      effectiveUser: targetUser,
      isImpersonating: targetUser.id !== context.actor.id,
    });
    response.cookies.set(IMPERSONATION_COOKIE_NAME, targetUser.id, cookieOptions(maxAgeSeconds));
    response.cookies.set(USER_COOKIE_NAME, targetUser.id, readableCookieOptions(maxAgeSeconds));
    return response;
  } catch (error) {
    console.error("Error starting impersonation:", error);
    return NextResponse.json(formatError(error), { status: 500 });
  }
}

export async function DELETE(request: NextRequest) {
  try {
    const context = await resolveRequestContext(request);
    if (!context.actor?.isAdmin) {
      return NextResponse.json({ error: "Forbidden" }, { status: 403 });
    }

    await logAuditEvent({
      eventType: "impersonation.stopped",
      actorUserId: context.actor.id,
      effectiveUserId: context.effectiveUser?.id ?? context.actor.id,
      resourceType: "user",
      resourceId: context.effectiveUser?.id ?? context.actor.id,
      metadata: {
        wasImpersonating: context.isImpersonating,
      },
    });

    const response = NextResponse.json({
      actor: context.actor,
      effectiveUser: context.actor,
      isImpersonating: false,
    });
    response.cookies.set(IMPERSONATION_COOKIE_NAME, "", clearCookieOptions());
    response.cookies.set(USER_COOKIE_NAME, context.actor.id, readableCookieOptions(Math.floor(SESSION_TTL_MS / 1000)));
    return response;
  } catch (error) {
    console.error("Error stopping impersonation:", error);
    return NextResponse.json(formatError(error), { status: 500 });
  }
}
