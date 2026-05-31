export const DEFAULT_USER_ID = "default";
export const ANONYMOUS_USER_ID_PREFIX = "guest-";
export const ANONYMOUS_USER_STORAGE_KEY = "cantare:anonymous-user-id";
export const USER_ID_HEADER = "x-user-id";
export const USER_COOKIE_NAME = "cantare-user-id";

export interface KnownUser {
  id: string;
  username: string;
  name: string;
  email?: string;
  avatarUrl?: string | null;
  profileVisibility?: "private" | string;
  accountDeletionRequestedAt?: string | null;
  accountDeletionScheduledFor?: string | null;
  isAdmin?: boolean;
}

export function normalizeUserId(value: string | null | undefined): string {
  if (!value) {
    return DEFAULT_USER_ID;
  }

  const normalized = value.trim().toLowerCase().replace(/[^a-z0-9_-]/g, "-").slice(0, 48);
  return normalized.length > 0 ? normalized : DEFAULT_USER_ID;
}

export function isAnonymousUserId(value: string | null | undefined): boolean {
  return Boolean(value && normalizeUserId(value).startsWith(ANONYMOUS_USER_ID_PREFIX));
}

export function createAnonymousUserId(): string {
  const randomPart =
    typeof crypto !== "undefined" && "randomUUID" in crypto
      ? crypto.randomUUID()
      : Math.random().toString(36).slice(2, 14);
  return normalizeUserId(`${ANONYMOUS_USER_ID_PREFIX}${randomPart}`);
}

export function getOrCreateAnonymousUserId(storage?: Pick<Storage, "getItem" | "setItem"> | null): string {
  const stored = storage?.getItem(ANONYMOUS_USER_STORAGE_KEY);
  if (isAnonymousUserId(stored)) {
    return normalizeUserId(stored);
  }

  const next = createAnonymousUserId();
  try {
    storage?.setItem(ANONYMOUS_USER_STORAGE_KEY, next);
  } catch {
    // Anonymous isolation is best-effort when storage is unavailable.
  }
  return next;
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
