import { NextRequest, NextResponse } from "next/server";
import { getAppBaseUrl, hashMagicLinkCode } from "../../../lib/authTokens";
import { getSafeAuthReturnPath } from "../../../lib/authRedirects";
import { completeMagicLinkLogin, setLoginCookies } from "../../../lib/magicLinkLogin";
import {
  clearLoginCodeFailures,
  getLoginCodeRateLimitKey,
  isLoginCodeRateLimited,
  recordLoginCodeFailure,
} from "../../../lib/loginCodeRateLimit";

function normalizeEmail(value: unknown): string {
  return typeof value === "string" ? value.trim().toLowerCase() : "";
}

function normalizeCode(value: unknown): string {
  return typeof value === "string" ? value.trim() : "";
}

export async function POST(request: NextRequest) {
  const body = await request.json().catch(() => ({}));
  const email = normalizeEmail(body?.email);
  const code = normalizeCode(body?.code);

  if (!/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(email) || !/^\d{6}$/.test(code)) {
    return NextResponse.json({ error: "Enter your email and the six-digit code from the email." }, { status: 400 });
  }

  const rateLimitKey = getLoginCodeRateLimitKey(request, email);
  if (isLoginCodeRateLimited(rateLimitKey)) {
    return NextResponse.json({ error: "Too many incorrect codes. Wait ten minutes before trying again." }, { status: 429 });
  }

  try {
    const login = await completeMagicLinkLogin(hashMagicLinkCode(email, code), "email_code_login");
    if (!login) {
      recordLoginCodeFailure(rateLimitKey);
      return NextResponse.json({ error: "That code is invalid, expired, or has already been used." }, { status: 401 });
    }
    clearLoginCodeFailures(rateLimitKey);

    const appBaseUrl = getAppBaseUrl(request);
    const redirectUrl = new URL(getSafeAuthReturnPath(body?.returnTo, appBaseUrl), appBaseUrl);
    redirectUrl.searchParams.set("auth", "signed-in");
    if (login.created) {
      redirectUrl.searchParams.set("setup", "username");
    }

    const response = NextResponse.json({ redirectTo: `${redirectUrl.pathname}${redirectUrl.search}${redirectUrl.hash}` });
    setLoginCookies(response, login);
    return response;
  } catch (error) {
    console.error("Error consuming email sign-in code:", error);
    return NextResponse.json({ error: "Cantare could not sign you in. Request a new code and try again." }, { status: 500 });
  }
}
