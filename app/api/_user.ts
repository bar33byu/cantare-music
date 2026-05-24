import type { NextRequest } from "next/server";
import { getUserById, getUserForSessionTokenHash } from "../../db/queries";
import { AUTH_SESSION_COOKIE_NAME, hashAuthToken } from "../lib/authTokens";
import { DEFAULT_USER_ID, USER_COOKIE_NAME, USER_ID_HEADER, normalizeUserId } from "../lib/userContext";

export function resolveRequestUserId(request: NextRequest | Request): string {
  const headerUserId = request.headers.get(USER_ID_HEADER);
  if (headerUserId) {
    return normalizeUserId(headerUserId);
  }

  const nextLikeRequest = request as NextRequest;
  const cookieUserId = nextLikeRequest.cookies?.get?.(USER_COOKIE_NAME)?.value;
  if (cookieUserId) {
    return normalizeUserId(cookieUserId);
  }

  const cookieHeader = request.headers.get("cookie");
  if (cookieHeader) {
    const entries = cookieHeader.split(";").map((part) => part.trim().split("="));
    for (const [name, value] of entries) {
      if (name === USER_COOKIE_NAME && value) {
        return normalizeUserId(decodeURIComponent(value));
      }
    }
  }

  return DEFAULT_USER_ID;
}

export function getRequestCookie(request: NextRequest | Request, cookieName: string): string | undefined {
  const nextLikeRequest = request as NextRequest;
  const nextCookieValue = nextLikeRequest.cookies?.get?.(cookieName)?.value;
  if (nextCookieValue) {
    return nextCookieValue;
  }

  const cookieHeader = request.headers.get("cookie");
  if (!cookieHeader) {
    return undefined;
  }

  const entries = cookieHeader.split(";").map((part) => part.trim().split("="));
  for (const [name, value] of entries) {
    if (name === cookieName && value) {
      return decodeURIComponent(value);
    }
  }

  return undefined;
}

export function getAdminEmailAllowlist(env: NodeJS.ProcessEnv = process.env): Set<string> {
  const raw = env.CANTARE_ADMIN_EMAILS ?? "";
  return new Set(
    raw
      .split(/[,\n]/)
      .map((email) => email.trim().toLowerCase())
      .filter(Boolean)
  );
}

export function isEmailAdmin(email: string | null | undefined, env: NodeJS.ProcessEnv = process.env): boolean {
  if (!email) {
    return false;
  }

  return getAdminEmailAllowlist(env).has(email.trim().toLowerCase());
}

export async function resolveRequestUser(request: NextRequest | Request) {
  const sessionToken = getRequestCookie(request, AUTH_SESSION_COOKIE_NAME);
  if (sessionToken) {
    const user = await getUserForSessionTokenHash(hashAuthToken(sessionToken));
    if (user) {
      return {
        ...user,
        isAdmin: isEmailAdmin(user.email),
      };
    }
  }

  const userId = resolveRequestUserId(request);
  const user = await getUserById(userId);
  if (!user) {
    return null;
  }

  return {
    ...user,
    isAdmin: isEmailAdmin(user.email),
  };
}
