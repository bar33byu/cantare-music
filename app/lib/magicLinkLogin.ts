import { NextResponse } from "next/server";
import {
  consumeMagicLinkToken,
  createUserSession,
  getOrCreateUserForEmailWithStatus,
  logAuditEvent,
} from "../../db/queries";
import { isEmailAdmin } from "../api/_user";
import {
  AUTH_SESSION_COOKIE_NAME,
  createOpaqueToken,
  hashAuthToken,
  SESSION_TTL_MS,
} from "./authTokens";
import { USER_COOKIE_NAME } from "./userContext";

export interface MagicLinkLoginResult {
  created: boolean;
  sessionToken: string;
  user: Awaited<ReturnType<typeof getOrCreateUserForEmailWithStatus>>["user"];
}

function cookieOptions(maxAgeSeconds: number, httpOnly: boolean) {
  return {
    httpOnly,
    sameSite: "lax" as const,
    secure: process.env.NODE_ENV === "production",
    path: "/",
    maxAge: maxAgeSeconds,
  };
}

export async function completeMagicLinkLogin(
  tokenHash: string,
  source: "magic_link_login" | "email_code_login"
): Promise<MagicLinkLoginResult | null> {
  const consumedToken = await consumeMagicLinkToken(tokenHash);
  if (!consumedToken) {
    return null;
  }

  const { user, created } = await getOrCreateUserForEmailWithStatus(consumedToken.email);
  const sessionToken = createOpaqueToken();
  await createUserSession({
    userId: user.id,
    tokenHash: hashAuthToken(sessionToken),
    expiresAt: new Date(Date.now() + SESSION_TTL_MS),
  });
  await logAuditEvent({
    eventType: "auth.admin_status_resolved",
    actorUserId: user.id,
    effectiveUserId: user.id,
    resourceType: "user",
    resourceId: user.id,
    metadata: {
      email: user.email,
      isAdmin: isEmailAdmin(user.email),
      source,
    },
  });

  return { created, sessionToken, user };
}

export function setLoginCookies(response: NextResponse, result: MagicLinkLoginResult): void {
  const maxAgeSeconds = Math.floor(SESSION_TTL_MS / 1000);
  response.cookies.set(AUTH_SESSION_COOKIE_NAME, result.sessionToken, cookieOptions(maxAgeSeconds, true));
  response.cookies.set(USER_COOKIE_NAME, result.user.id, cookieOptions(maxAgeSeconds, false));
}
