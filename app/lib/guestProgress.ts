import { DEFAULT_USER_ID } from "./userContext";

export const GUEST_PROGRESS_STORAGE_KEY = "cantare:guest-progress:v1";
const GUEST_PROGRESS_DECLINED_PREFIX = "cantare:guest-progress-declined:";

interface GuestProgressSnapshot {
  songIds?: unknown;
  updatedAt?: unknown;
}

function getLocalStorage(): Storage | null {
  if (typeof window === "undefined") {
    return null;
  }
  return window.localStorage;
}

function readGuestProgressSnapshot(): GuestProgressSnapshot {
  const storage = getLocalStorage();
  if (!storage) {
    return {};
  }

  try {
    return JSON.parse(storage.getItem(GUEST_PROGRESS_STORAGE_KEY) ?? "{}") as GuestProgressSnapshot;
  } catch {
    return {};
  }
}

export function getGuestProgressSongIds(): string[] {
  const snapshot = readGuestProgressSnapshot();
  if (!Array.isArray(snapshot.songIds)) {
    return [];
  }
  return Array.from(new Set(snapshot.songIds.filter((id): id is string => typeof id === "string" && id.trim().length > 0)));
}

export function hasGuestProgress(): boolean {
  return getGuestProgressSongIds().length > 0;
}

export function markGuestSongProgress(songId: string, userId: string | undefined): void {
  if (userId && userId !== DEFAULT_USER_ID) {
    return;
  }
  if (!songId.trim()) {
    return;
  }

  const storage = getLocalStorage();
  if (!storage) {
    return;
  }

  try {
    const songIds = new Set(getGuestProgressSongIds());
    songIds.add(songId);
    storage.setItem(GUEST_PROGRESS_STORAGE_KEY, JSON.stringify({
      songIds: Array.from(songIds),
      updatedAt: new Date().toISOString(),
    }));
  } catch {
    // Progress claiming is a convenience layer; practice must continue even if storage is full.
  }
}

export function clearGuestProgress(): void {
  const storage = getLocalStorage();
  if (!storage) {
    return;
  }
  try {
    storage.removeItem(GUEST_PROGRESS_STORAGE_KEY);
  } catch {
    // Ignore cleanup failures.
  }
}

export function hasDeclinedGuestProgressClaim(userId: string): boolean {
  const storage = getLocalStorage();
  if (!storage) {
    return false;
  }
  try {
    return storage.getItem(`${GUEST_PROGRESS_DECLINED_PREFIX}${userId}`) === "1";
  } catch {
    return false;
  }
}

export function markGuestProgressClaimDeclined(userId: string): void {
  const storage = getLocalStorage();
  if (!storage) {
    return;
  }
  try {
    storage.setItem(`${GUEST_PROGRESS_DECLINED_PREFIX}${userId}`, "1");
  } catch {
    // Ignore persistence failures.
  }
}
