import { NextRequest, NextResponse } from "next/server";
import { getAppBaseUrl, hashAuthToken, hashMagicLinkCode } from "../../lib/authTokens";
import { getSafeAuthReturnPath } from "../../lib/authRedirects";
import { completeMagicLinkLogin, setLoginCookies } from "../../lib/magicLinkLogin";
import {
  clearLoginCodeFailures,
  getLoginCodeRateLimitKey,
  isLoginCodeRateLimited,
  recordLoginCodeFailure,
} from "../../lib/loginCodeRateLimit";

export async function GET(request: NextRequest) {
  const appBaseUrl = getAppBaseUrl(request);
  const redirectUrl = new URL(getSafeAuthReturnPath(request.nextUrl.searchParams.get("returnTo"), appBaseUrl), appBaseUrl);
  const rawToken = request.nextUrl.searchParams.get("token") ?? "";
  const email = request.nextUrl.searchParams.get("email")?.trim().toLowerCase() ?? "";

  try {
    if (!rawToken) {
      redirectUrl.searchParams.set("auth", "invalid");
      return NextResponse.redirect(redirectUrl);
    }

    // New links carry an email-bound six-digit code. The fallback keeps links
    // issued by the previous opaque-token implementation valid during rollout.
    const isSixDigitCode = /^\d{6}$/.test(rawToken);
    const rateLimitKey = isSixDigitCode && email ? getLoginCodeRateLimitKey(request, email) : null;
    if (rateLimitKey && isLoginCodeRateLimited(rateLimitKey)) {
      redirectUrl.searchParams.set("auth", "invalid");
      return NextResponse.redirect(redirectUrl);
    }
    const tokenHash = isSixDigitCode && email
      ? hashMagicLinkCode(email, rawToken)
      : hashAuthToken(rawToken);
    const login = await completeMagicLinkLogin(tokenHash, "magic_link_login");
    if (!login) {
      if (rateLimitKey) {
        recordLoginCodeFailure(rateLimitKey);
      }
      redirectUrl.searchParams.set("auth", "invalid");
      return NextResponse.redirect(redirectUrl);
    }
    if (rateLimitKey) {
      clearLoginCodeFailures(rateLimitKey);
    }

    redirectUrl.searchParams.set("auth", "signed-in");
    if (login.created) {
      redirectUrl.searchParams.set("setup", "username");
    }
    const response = NextResponse.redirect(redirectUrl);
    setLoginCookies(response, login);
    return response;
  } catch (error) {
    console.error("Error consuming magic link:", error);
    redirectUrl.searchParams.set("auth", "invalid");
    return NextResponse.redirect(redirectUrl);
  }
}
