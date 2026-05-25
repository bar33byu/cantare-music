import { NextRequest, NextResponse } from "next/server";
import { revokeUserSession } from "../../../../db/queries";
import { IMPERSONATION_COOKIE_NAME, getRequestCookie } from "../../_user";
import { AUTH_SESSION_COOKIE_NAME, hashAuthToken } from "../../../lib/authTokens";
import { USER_COOKIE_NAME } from "../../../lib/userContext";

export async function POST(request: NextRequest) {
  const token = getRequestCookie(request, AUTH_SESSION_COOKIE_NAME);
  if (token) {
    await revokeUserSession(hashAuthToken(token));
  }

  const response = NextResponse.json({ ok: true });
  response.cookies.set(AUTH_SESSION_COOKIE_NAME, "", { path: "/", maxAge: 0 });
  response.cookies.set(IMPERSONATION_COOKIE_NAME, "", { path: "/", maxAge: 0 });
  response.cookies.set(USER_COOKIE_NAME, "", { path: "/", maxAge: 0 });
  return response;
}
