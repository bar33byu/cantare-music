import { NextRequest, NextResponse } from "next/server";
import { getUserForSessionTokenHash } from "../../../../db/queries";
import { getRequestCookie, isEmailAdmin } from "../../_user";
import { AUTH_SESSION_COOKIE_NAME, hashAuthToken } from "../../../lib/authTokens";

export async function GET(request: NextRequest) {
  const token = getRequestCookie(request, AUTH_SESSION_COOKIE_NAME);
  if (!token) {
    return NextResponse.json({ user: null });
  }

  const user = await getUserForSessionTokenHash(hashAuthToken(token));
  return NextResponse.json({
    user: user ? { ...user, isAdmin: isEmailAdmin(user.email) } : null,
  });
}
