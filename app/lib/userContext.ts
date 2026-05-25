export const DEFAULT_USER_ID = "default";
export const USER_ID_HEADER = "x-user-id";
export const USER_COOKIE_NAME = "cantare-user-id";

export interface KnownUser {
  id: string;
  username: string;
  name: string;
  email?: string;
  avatarUrl?: string | null;
  profileVisibility?: "private" | string;
  isAdmin?: boolean;
}

export function normalizeUserId(value: string | null | undefined): string {
  if (!value) {
    return DEFAULT_USER_ID;
  }

  const normalized = value.trim().toLowerCase().replace(/[^a-z0-9_-]/g, "-").slice(0, 48);
  return normalized.length > 0 ? normalized : DEFAULT_USER_ID;
}

export function normalizeUsername(value: string | null | undefined): string {
  if (!value) {
    return "";
  }

  return value.trim().toLowerCase().replace(/[^a-z0-9_-]/g, "-").replace(/^-+|-+$/g, "").slice(0, 32);
}

export function createPublicUsernameFromName(name: string): string {
  const normalized = normalizeUsername(name);
  if (normalized) {
    return normalized;
  }
  return `user-${Math.random().toString(36).slice(2, 8)}`;
}

export function createUserIdFromName(name: string): string {
  if (typeof crypto !== "undefined" && "randomUUID" in crypto) {
    return crypto.randomUUID();
  }
  return `${normalizeUserId(name)}-${Math.random().toString(36).slice(2, 12)}`;
}
