export const DEFAULT_USER_ID = "default";
export const USER_ID_HEADER = "x-user-id";
export const USER_COOKIE_NAME = "cantare-user-id";

export interface KnownUser {
  id: string;
  name: string;
}

export function normalizeUserId(value: string | null | undefined): string {
  if (!value) {
    return DEFAULT_USER_ID;
  }

  const normalized = value.trim().toLowerCase().replace(/[^a-z0-9_-]/g, "-").slice(0, 48);
  return normalized.length > 0 ? normalized : DEFAULT_USER_ID;
}

export function createUserIdFromName(name: string): string {
  const base = normalizeUserId(name);
  if (base !== DEFAULT_USER_ID) {
    return `${base}-${Math.random().toString(36).slice(2, 8)}`;
  }
  return `user-${Math.random().toString(36).slice(2, 8)}`;
}
