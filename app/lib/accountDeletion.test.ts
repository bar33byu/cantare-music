import { beforeEach, describe, expect, it, vi } from "vitest";

vi.mock("../../db/queries", () => ({
  getSongStorageKeys: vi.fn(),
  getUserStorageKeys: vi.fn(),
  isStorageKeyReferenced: vi.fn(),
  purgeUserAccountData: vi.fn(),
  recordOrphanedAudioKey: vi.fn(),
}));

vi.mock("../../lib/r2", () => ({
  deleteObject: vi.fn(),
}));

import {
  getSongStorageKeys,
  getUserStorageKeys,
  isStorageKeyReferenced,
  purgeUserAccountData,
} from "../../db/queries";
import { deleteObject } from "../../lib/r2";
import { deleteSongStorageAssets, purgeUserAccount } from "./accountDeletion";

describe("storage cleanup", () => {
  beforeEach(() => {
    vi.clearAllMocks();
    vi.mocked(isStorageKeyReferenced).mockResolvedValue(false);
  });

  it("keeps a song asset referenced by another song", async () => {
    vi.mocked(getSongStorageKeys).mockResolvedValue(["audio/shared/part.mp3"]);
    vi.mocked(isStorageKeyReferenced).mockResolvedValue(true);

    await deleteSongStorageAssets("song-1", "user-1");

    expect(isStorageKeyReferenced).toHaveBeenCalledWith("audio/shared/part.mp3", { songId: "song-1" });
    expect(deleteObject).not.toHaveBeenCalled();
  });

  it("keeps account assets referenced outside the deleted account", async () => {
    vi.mocked(getUserStorageKeys).mockResolvedValue({
      songAudioKeys: ["audio/shared/part.mp3"],
      draftAudioKeys: [],
      midiStorageKeys: [],
      orphanedAudioKeys: [],
    });
    vi.mocked(isStorageKeyReferenced).mockResolvedValue(true);
    vi.mocked(purgeUserAccountData).mockResolvedValue(true);

    await purgeUserAccount("test-user");

    expect(isStorageKeyReferenced).toHaveBeenCalledWith("audio/shared/part.mp3", { userId: "test-user" });
    expect(deleteObject).not.toHaveBeenCalled();
    expect(purgeUserAccountData).toHaveBeenCalledWith("test-user");
  });
});
