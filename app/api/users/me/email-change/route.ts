import { NextRequest, NextResponse } from "next/server";
import { createEmailChangeToken, getUserByEmail } from "../../../../../db/queries";
import { createOpaqueToken, getAppBaseUrl, hashAuthToken, MAGIC_LINK_TTL_MS } from "../../../../lib/authTokens";
import { sendEmailChangeConfirmationEmail } from "../../../../lib/resend";
import { resolveRequestUser } from "../../../_user";

const NEUTRAL_RESPONSE = {
  message: "If that email can be used for Cantare, a confirmation link is on the way.",
};

function normalizeEmail(value: unknown): string {
  return typeof value === "string" ? value.trim().toLowerCase() : "";
}

function isLikelyEmail(value: string): boolean {
  return /^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(value);
}

export async function POST(request: NextRequest) {
  try {
    const user = await resolveRequestUser(request);
    if (!user) {
      return NextResponse.json({ error: "Not signed in" }, { status: 401 });
    }

    const body = await request.json().catch(() => ({}));
    const email = normalizeEmail(body?.email);
    if (!isLikelyEmail(email)) {
      return NextResponse.json({ error: "Enter a valid email address." }, { status: 400 });
    }

    if (email === (user.email ?? "").trim().toLowerCase()) {
      return NextResponse.json({ error: "That is already your account email." }, { status: 400 });
    }

    const existing = await getUserByEmail(email);
    if (existing && existing.id !== user.id) {
      return NextResponse.json({ error: "That email is already used by another account." }, { status: 409 });
    }

    const token = createOpaqueToken();
    const appBaseUrl = getAppBaseUrl(request);
    const confirmationUrl = new URL("/auth/verify-email-change", appBaseUrl);
    confirmationUrl.searchParams.set("token", token);

    await createEmailChangeToken({
      userId: user.id,
      email,
      tokenHash: hashAuthToken(token),
      expiresAt: new Date(Date.now() + MAGIC_LINK_TTL_MS),
    });

    await sendEmailChangeConfirmationEmail({
      to: email,
      confirmationUrl: confirmationUrl.toString(),
    });
  } catch (error) {
    console.error("Error requesting email change:", error);
  }

  return NextResponse.json(NEUTRAL_RESPONSE);
}
