import { NextRequest, NextResponse } from "next/server";
import { consumeMagicLinkToken, createUserSession, getOrCreateUserForEmail } from "../../../db/queries";
import { AUTH_SESSION_COOKIE_NAME, createOpaqueToken, getAppBaseUrl, hashAuthToken, SESSION_TTL_MS } from "../../lib/authTokens";
import { USER_COOKIE_NAME } from "../../lib/userContext";

function cookieOptions(maxAgeSeconds: number, httpOnly: boolean) {
  return {
    httpOnly,
    sameSite: "lax" as const,
    secure: process.env.NODE_ENV === "production",
    path: "/",
    maxAge: maxAgeSeconds,
  };
}

export async function GET(request: NextRequest) {
  const redirectUrl = new URL("/", getAppBaseUrl(request));
  const rawToken = request.nextUrl.searchParams.get("token") ?? "";

  try {
    if (!rawToken) {
      redirectUrl.searchParams.set("auth", "invalid");
      return NextResponse.redirect(redirectUrl);
    }

    // Magic links are one-time use and expire after MAGIC_LINK_TTL_MS.
    const consumedToken = await consumeMagicLinkToken(hashAuthToken(rawToken));
    if (!consumedToken) {
      redirectUrl.searchParams.set("auth", "invalid");
      return NextResponse.redirect(redirectUrl);
    }

    const user = await getOrCreateUserForEmail(consumedToken.email);
    const sessionToken = createOpaqueToken();
    const maxAgeSeconds = Math.floor(SESSION_TTL_MS / 1000);
    await createUserSession({
      userId: user.id,
      tokenHash: hashAuthToken(sessionToken),
      expiresAt: new Date(Date.now() + SESSION_TTL_MS),
    });

    redirectUrl.searchParams.set("auth", "signed-in");
    const response = NextResponse.redirect(redirectUrl);
    response.cookies.set(AUTH_SESSION_COOKIE_NAME, sessionToken, cookieOptions(maxAgeSeconds, true));
    response.cookies.set(USER_COOKIE_NAME, user.id, cookieOptions(maxAgeSeconds, false));
    return response;
  } catch (error) {
    console.error("Error consuming magic link:", error);
    redirectUrl.searchParams.set("auth", "invalid");
    return NextResponse.redirect(redirectUrl);
  }
}
