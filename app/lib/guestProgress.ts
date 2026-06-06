import { DEFAULT_USER_ID, isAnonymousUserId } from "./userContext";
import type { SegmentRating } from "../types";

export const GUEST_PROGRESS_STORAGE_KEY = "cantare:guest-progress:v1";
const GUEST_PROGRESS_DECLINED_PREFIX = "cantare:guest-progress-declined:";
const GUEST_RATINGS_PREFIX = "cantare:guest-ratings:v1:";

interface GuestProgressSnapshot {
  songIds?: unknown;
  guestUserId?: unknown;
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

export function getGuestProgressUserId(): string | null {
  const snapshot = readGuestProgressSnapshot();
  return typeof snapshot.guestUserId === "string" && snapshot.guestUserId.trim().length > 0
    ? snapshot.guestUserId
    : null;
}

export function markGuestSongProgress(songId: string, userId: string | undefined): void {
  const guestUserId = userId && isAnonymousUserId(userId) ? userId : DEFAULT_USER_ID;
  if (userId && userId !== DEFAULT_USER_ID && !isAnonymousUserId(userId)) {
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
      guestUserId,
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

function buildGuestRatingsKey(songId: string): string {
  return `${GUEST_RATINGS_PREFIX}${songId}`;
}

export function getGuestSongRatings(songId: string): SegmentRating[] {
  if (!songId.trim()) {
    return [];
  }

  const storage = getLocalStorage();
  if (!storage) {
    return [];
  }

  try {
    const parsed = JSON.parse(storage.getItem(buildGuestRatingsKey(songId)) ?? "[]") as unknown;
    if (!Array.isArray(parsed)) {
      return [];
    }
    return parsed.filter((rating): rating is SegmentRating => (
      Boolean(rating) &&
      typeof rating === "object" &&
      typeof (rating as SegmentRating).id === "string" &&
      typeof (rating as SegmentRating).segmentId === "string" &&
      [1, 2, 3, 4, 5].includes((rating as SegmentRating).rating) &&
      typeof (rating as SegmentRating).ratedAt === "string"
    ));
  } catch {
    return [];
  }
}

export function getGuestProgressSummary(): { songCount: number; ratingCount: number } {
  const songIds = getGuestProgressSongIds();
  return {
    songCount: songIds.length,
    ratingCount: songIds.reduce((total, songId) => total + getGuestSongRatings(songId).length, 0),
  };
}

export function saveGuestSongRatings(songId: string, ratings: SegmentRating[]): void {
  if (!songId.trim()) {
    return;
  }

  const storage = getLocalStorage();
  if (!storage) {
    return;
  }

  try {
    storage.setItem(buildGuestRatingsKey(songId), JSON.stringify(ratings));
    markGuestSongProgress(songId, DEFAULT_USER_ID);
  } catch {
    // Ratings are a convenience for guests; practice must continue if storage is unavailable.
  }
}
