import { NextRequest, NextResponse } from "next/server";
import { consumeEmailChangeToken, getUserById, logAuditEvent, updateUserEmail } from "../../../db/queries";
import { getAppBaseUrl, hashAuthToken } from "../../lib/authTokens";
import { isEmailAdmin } from "../../api/_user";

export async function GET(request: NextRequest) {
  const appBaseUrl = getAppBaseUrl(request);
  const redirectUrl = new URL("/", appBaseUrl);
  const rawToken = request.nextUrl.searchParams.get("token") ?? "";

  try {
    if (!rawToken) {
      redirectUrl.searchParams.set("emailChange", "invalid");
      return NextResponse.redirect(redirectUrl);
    }

    const consumedToken = await consumeEmailChangeToken(hashAuthToken(rawToken));
    if (!consumedToken) {
      redirectUrl.searchParams.set("emailChange", "invalid");
      return NextResponse.redirect(redirectUrl);
    }

    const existing = await getUserById(consumedToken.userId);
    if (!existing) {
      redirectUrl.searchParams.set("emailChange", "invalid");
      return NextResponse.redirect(redirectUrl);
    }

    const updated = await updateUserEmail(consumedToken.userId, consumedToken.email);
    if (!updated) {
      redirectUrl.searchParams.set("emailChange", "invalid");
      return NextResponse.redirect(redirectUrl);
    }

    if (existing.email !== updated.email) {
      await logAuditEvent({
        eventType: "user.email_changed",
        actorUserId: updated.id,
        effectiveUserId: updated.id,
        resourceType: "user",
        resourceId: updated.id,
        metadata: {
          previousEmail: existing.email,
          newEmail: updated.email,
          isAdmin: isEmailAdmin(updated.email),
          source: "email_change_confirmation",
        },
      });
    }

    redirectUrl.searchParams.set("emailChange", "confirmed");
    return NextResponse.redirect(redirectUrl);
  } catch (error) {
    const message = error instanceof Error ? error.message.toLowerCase() : "";
    if (message.includes("users_email_unique")) {
      redirectUrl.searchParams.set("emailChange", "taken");
      return NextResponse.redirect(redirectUrl);
    }
    console.error("Error verifying email change:", error);
    redirectUrl.searchParams.set("emailChange", "invalid");
    return NextResponse.redirect(redirectUrl);
  }
}
