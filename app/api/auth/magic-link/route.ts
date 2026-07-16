import { NextRequest, NextResponse } from "next/server";
import { createMagicLinkToken } from "../../../../db/queries";
import { createSixDigitCode, getAppBaseUrl, hashMagicLinkCode, MAGIC_LINK_TTL_MS } from "../../../lib/authTokens";
import { getSafeAuthReturnPath } from "../../../lib/authRedirects";
import { sendMagicLinkEmail } from "../../../lib/resend";

const NEUTRAL_RESPONSE = {
  message: "If that email can sign in to Cantare, a six-digit code and login link are on the way.",
};

function normalizeEmail(value: unknown): string {
  return typeof value === "string" ? value.trim().toLowerCase() : "";
}

function isLikelyEmail(value: string): boolean {
  return /^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(value);
}

export async function POST(request: NextRequest) {
  try {
    const body = await request.json().catch(() => ({}));
    const email = normalizeEmail(body?.email);
    const appBaseUrl = getAppBaseUrl(request);
    const returnTo = getSafeAuthReturnPath(body?.returnTo, appBaseUrl);

    if (isLikelyEmail(email)) {
      const code = createSixDigitCode();
      const expiresAt = new Date(Date.now() + MAGIC_LINK_TTL_MS);
      await createMagicLinkToken({
        email,
        tokenHash: hashMagicLinkCode(email, code),
        expiresAt,
      });

      const loginUrl = new URL("/auth/verify", appBaseUrl);
      loginUrl.searchParams.set("token", code);
      loginUrl.searchParams.set("email", email);
      if (returnTo !== "/") {
        loginUrl.searchParams.set("returnTo", returnTo);
      }
      await sendMagicLinkEmail({ to: email, code, loginUrl: loginUrl.toString() });
    }
  } catch (error) {
    console.error("Error requesting magic link:", error);
  }

  return NextResponse.json(NEUTRAL_RESPONSE);
}
