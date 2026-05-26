import { beforeEach, describe, expect, it, vi } from "vitest";

vi.mock("../../../../../../db/queries", () => ({
  getPublicPlaylistById: vi.fn(),
  importSharedPlaylist: vi.fn(),
}));

vi.mock("../../../../_user", () => ({
  resolveRequestContext: vi.fn(),
}));

import { getPublicPlaylistById, importSharedPlaylist } from "../../../../../../db/queries";
import { resolveRequestContext } from "../../../../_user";
import { POST } from "./route";

describe("POST /api/shared/playlists/[id]/import", () => {
  beforeEach(() => {
    vi.clearAllMocks();
  });

  it("does not copy the effective user's own shared playlist", async () => {
    vi.mocked(resolveRequestContext).mockResolvedValue({
      actor: { id: "admin-1", email: "admin@example.com" },
      effectiveUser: { id: "user-1", email: "" },
      isImpersonating: true,
    } as any);
    vi.mocked(getPublicPlaylistById).mockResolvedValue(null);

    const request = new Request("http://localhost/api/shared/playlists/pl-1/import", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({}),
    });
    const response = await POST(request as any, { params: Promise.resolve({ id: "pl-1" }) });
    const data = await response.json();

    expect(response.status).toBe(404);
    expect(data.error).toMatch(/not found/i);
    expect(getPublicPlaylistById).toHaveBeenCalledWith("pl-1", "user-1");
    expect(importSharedPlaylist).not.toHaveBeenCalled();
  });

  it("copies public playlists using the public audio mode", async () => {
    vi.mocked(resolveRequestContext).mockResolvedValue({
      actor: { id: "user-1", email: "user@example.com" },
      effectiveUser: { id: "user-1", email: "user@example.com" },
      isImpersonating: false,
    } as any);
    vi.mocked(getPublicPlaylistById).mockResolvedValue({
      id: "pl-1",
      name: "Shared Set",
      isRetired: false,
      isPublic: true,
      shareToken: "share-token-1",
      shareAudioMode: "part",
      publicShareAudioMode: "blend",
      createdAt: "2026-01-01T00:00:00.000Z",
      songs: [],
      owner: { id: "owner-1", displayName: "Owner", username: "owner" },
    } as any);
    vi.mocked(importSharedPlaylist).mockResolvedValue({
      status: "imported",
      playlist: {
        id: "copy-1",
        name: "Shared Set",
        isRetired: false,
        createdAt: "2026-01-01T00:00:00.000Z",
        songCount: 0,
      },
    } as any);

    const request = new Request("http://localhost/api/shared/playlists/pl-1/import", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({}),
    });
    const response = await POST(request as any, { params: Promise.resolve({ id: "pl-1" }) });

    expect(response.status).toBe(200);
    expect(importSharedPlaylist).toHaveBeenCalledWith("share-token-1", "user-1", {
      force: false,
      shareAudioMode: "blend",
    });
  });
});
