import {
  getSongStorageKeys,
  getUserStorageKeys,
  purgeUserAccountData,
  recordOrphanedAudioKey,
} from "../../db/queries";
import { deleteObject } from "../../lib/r2";

export const ACCOUNT_DELETION_GRACE_DAYS = 30;

export function getAccountDeletionScheduleDates(from: Date = new Date()): {
  requestedAt: Date;
  scheduledFor: Date;
} {
  const requestedAt = new Date(from);
  const scheduledFor = new Date(from);
  scheduledFor.setDate(scheduledFor.getDate() + ACCOUNT_DELETION_GRACE_DAYS);

  return { requestedAt, scheduledFor };
}

function dedupeKeys(keys: string[]): string[] {
  return Array.from(new Set(keys.filter((value) => value.trim().length > 0)));
}

async function deleteStorageKeys(keys: string[], orphanUserId?: string): Promise<string[]> {
  const failedKeys: string[] = [];

  for (const key of dedupeKeys(keys)) {
    try {
      await deleteObject(key);
    } catch (error) {
      failedKeys.push(key);
      console.warn("Failed to delete storage object:", { key, error });
      if (orphanUserId) {
        try {
          await recordOrphanedAudioKey(crypto.randomUUID(), key, orphanUserId);
        } catch (recordError) {
          console.error("Failed to record orphaned storage key:", { key, error: recordError });
        }
      }
    }
  }

  return failedKeys;
}

export async function deleteSongStorageAssets(songId: string, userId: string): Promise<string[]> {
  const keys = await getSongStorageKeys(songId, userId);
  return deleteStorageKeys(keys, userId);
}

export async function purgeUserAccount(userId: string): Promise<{ deleted: boolean; failedStorageKeys: string[] }> {
  const storageKeys = await getUserStorageKeys(userId);
  const failedStorageKeys = await deleteStorageKeys(
    [
      ...storageKeys.songAudioKeys,
      ...storageKeys.draftAudioKeys,
      ...storageKeys.midiStorageKeys,
      ...storageKeys.orphanedAudioKeys,
    ],
    userId
  );
  const deleted = await purgeUserAccountData(userId);

  return {
    deleted,
    failedStorageKeys,
  };
}
