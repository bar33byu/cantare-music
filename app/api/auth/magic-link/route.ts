import { NextRequest, NextResponse } from "next/server";
import { createMagicLinkToken } from "../../../../db/queries";
import { createOpaqueToken, getAppBaseUrl, hashAuthToken, MAGIC_LINK_TTL_MS } from "../../../lib/authTokens";
import { sendMagicLinkEmail } from "../../../lib/resend";

const NEUTRAL_RESPONSE = {
  message: "If that email can sign in to Cantare, a login link is on the way.",
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

    if (isLikelyEmail(email)) {
      const token = createOpaqueToken();
      const expiresAt = new Date(Date.now() + MAGIC_LINK_TTL_MS);
      await createMagicLinkToken({
        email,
        tokenHash: hashAuthToken(token),
        expiresAt,
      });

      const loginUrl = `${getAppBaseUrl(request)}/auth/verify?token=${encodeURIComponent(token)}`;
      await sendMagicLinkEmail({ to: email, loginUrl });
    }
  } catch (error) {
    console.error("Error requesting magic link:", error);
  }

  return NextResponse.json(NEUTRAL_RESPONSE);
}
