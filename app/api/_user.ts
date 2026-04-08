import type { NextRequest } from "next/server";
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
