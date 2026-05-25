import type { NextRequest } from "next/server";
import { getUserById, getUserForSessionTokenHash, logAuditEvent } from "../../db/queries";
import { AUTH_SESSION_COOKIE_NAME, hashAuthToken } from "../lib/authTokens";
import { DEFAULT_USER_ID, USER_COOKIE_NAME, USER_ID_HEADER, normalizeUserId } from "../lib/userContext";

export const IMPERSONATION_COOKIE_NAME = "cantare-impersonate-user-id";

export type RequestUser = NonNullable<Awaited<ReturnType<typeof getUserById>>> & { isAdmin: boolean };

export interface RequestActorContext {
  actor: RequestUser | null;
  effectiveUser: RequestUser | null;
  isImpersonating: boolean;
}

function resolveHeaderOrCookieUserId(request: NextRequest | Request): string {
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

export function resolveRequestUserId(request: NextRequest | Request): string {
  void logImpersonatedMutation(request);
  return resolveHeaderOrCookieUserId(request);
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

function inferAuditResource(request: NextRequest | Request): { resourceType: string; resourceId: string | null } {
  const pathname = new URL(request.url).pathname;
  const segments = pathname.split("/").filter(Boolean);
  const apiSegments = segments[0] === "api" ? segments.slice(1) : segments;
  const resourceType = apiSegments[0] ?? "api";
  const resourceId = apiSegments.find((segment) => !["songs", "playlists", "users", "admin", "api"].includes(segment)) ?? null;
  return { resourceType, resourceId };
}

async function logImpersonatedMutation(request: NextRequest | Request): Promise<void> {
  if (["GET", "HEAD", "OPTIONS"].includes(request.method.toUpperCase())) {
    return;
  }

  const impersonatedUserId = getRequestCookie(request, IMPERSONATION_COOKIE_NAME);
  const sessionToken = getRequestCookie(request, AUTH_SESSION_COOKIE_NAME);
  if (!impersonatedUserId || !sessionToken) {
    return;
  }

  try {
    const actor = await getUserForSessionTokenHash(hashAuthToken(sessionToken));
    if (!actor || actor.id === impersonatedUserId || !isEmailAdmin(actor.email)) {
      return;
    }

    const resource = inferAuditResource(request);
    await logAuditEvent({
      eventType: "impersonation.action",
      actorUserId: actor.id,
      effectiveUserId: normalizeUserId(impersonatedUserId),
      resourceType: resource.resourceType,
      resourceId: resource.resourceId,
      metadata: {
        method: request.method,
        path: new URL(request.url).pathname,
      },
    });
  } catch (error) {
    console.error("Error writing impersonation audit event:", error);
  }
}

export async function resolveRequestUser(request: NextRequest | Request) {
  const context = await resolveRequestContext(request);
  return context.effectiveUser;
}

export async function resolveRequestContext(request: NextRequest | Request): Promise<RequestActorContext> {
  const sessionToken = getRequestCookie(request, AUTH_SESSION_COOKIE_NAME);
  if (sessionToken) {
    const actor = await getUserForSessionTokenHash(hashAuthToken(sessionToken));
    if (actor) {
      const actorWithRole = {
        ...actor,
        isAdmin: isEmailAdmin(actor.email),
      };
      const impersonatedUserId = getRequestCookie(request, IMPERSONATION_COOKIE_NAME);
      if (impersonatedUserId && actorWithRole.isAdmin) {
        const effectiveUser = await getUserById(normalizeUserId(impersonatedUserId));
        if (effectiveUser) {
          return {
            actor: actorWithRole,
            effectiveUser: {
              ...effectiveUser,
              isAdmin: isEmailAdmin(effectiveUser.email),
            },
            isImpersonating: effectiveUser.id !== actorWithRole.id,
          };
        }
      }

      return {
        actor: actorWithRole,
        effectiveUser: actorWithRole,
        isImpersonating: false,
      };
    }
  }

  const userId = resolveHeaderOrCookieUserId(request);
  const user = await getUserById(userId);
  if (!user) {
    return {
      actor: null,
      effectiveUser: null,
      isImpersonating: false,
    };
  }

  const effectiveUser = {
    ...user,
    isAdmin: isEmailAdmin(user.email),
  };

  return {
    actor: effectiveUser,
    effectiveUser,
    isImpersonating: false,
  };
}
