import { createHmac, randomBytes, timingSafeEqual } from "crypto";

export const AUTH_SESSION_COOKIE_NAME = "cantare-session";
export const MAGIC_LINK_TTL_MS = 15 * 60 * 1000;
export const SESSION_TTL_MS = 90 * 24 * 60 * 60 * 1000;

export function createOpaqueToken(): string {
  return randomBytes(32).toString("base64url");
}

export function getAuthSecret(): string {
  const secret = process.env.CANTARE_AUTH_SECRET;
  if (!secret) {
    throw new Error("CANTARE_AUTH_SECRET environment variable is required for passwordless auth");
  }
  return secret;
}

export function hashAuthToken(token: string, secret = getAuthSecret()): string {
  return createHmac("sha256", secret).update(token).digest("hex");
}

export function constantTimeEquals(a: string, b: string): boolean {
  const left = Buffer.from(a);
  const right = Buffer.from(b);
  return left.length === right.length && timingSafeEqual(left, right);
}

export function getAppBaseUrl(request?: Request): string {
  const configured = process.env.CANTARE_APP_URL || process.env.NEXT_PUBLIC_APP_URL;
  if (configured) {
    return configured.replace(/\/$/, "");
  }

  if (request) {
    const url = new URL(request.url);
    return `${url.protocol}//${url.host}`;
  }

  return "http://localhost:3000";
}
