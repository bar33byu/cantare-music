import { beforeEach, describe, expect, it, vi } from "vitest";

vi.mock("../../../../../../db/queries", () => ({
  getSharedSongByToken: vi.fn(),
  importSharedSong: vi.fn(),
}));

vi.mock("../../../../_user", () => ({
  resolveRequestContext: vi.fn(),
}));

import { getSharedSongByToken, importSharedSong } from "../../../../../../db/queries";
import { resolveRequestContext } from "../../../../_user";
import { POST } from "./route";

describe("POST /api/share/songs/[token]/import", () => {
  beforeEach(() => {
    vi.clearAllMocks();
    vi.mocked(resolveRequestContext).mockResolvedValue({
      actor: { id: "user-1", email: "user@example.com" },
      effectiveUser: { id: "user-1", email: "user@example.com" },
      isImpersonating: false,
    } as any);
    vi.mocked(getSharedSongByToken).mockResolvedValue({
      id: "song-1",
      owner: { id: "owner-1", displayName: "Owner", username: "owner" },
      shareAudioMode: "both",
    } as any);
  });

  it("imports a shared song for the signed-in user", async () => {
    vi.mocked(importSharedSong).mockResolvedValue({
      status: "imported",
      song: { id: "imported-song", title: "Imported Song", createdAt: "2026-06-05T12:00:00.000Z" },
    });

    const request = new Request("http://localhost/api/share/songs/song-token/import", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({}),
    });
    const response = await POST(request as any, { params: Promise.resolve({ token: "song-token" }) });
    const data = await response.json();

    expect(response.status).toBe(200);
    expect(importSharedSong).toHaveBeenCalledWith("song-token", "user-1", { force: false });
    expect(data.song.id).toBe("imported-song");
  });

  it("passes force when importing another snapshot", async () => {
    vi.mocked(importSharedSong).mockResolvedValue({
      status: "imported",
      song: { id: "imported-song-2", title: "Imported Song", createdAt: "2026-06-05T12:00:00.000Z" },
    });

    const request = new Request("http://localhost/api/share/songs/song-token/import", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ force: true }),
    });
    await POST(request as any, { params: Promise.resolve({ token: "song-token" }) });

    expect(importSharedSong).toHaveBeenCalledWith("song-token", "user-1", { force: true });
  });

  it("does not import the effective user's own song", async () => {
    vi.mocked(getSharedSongByToken).mockResolvedValue({
      id: "song-1",
      owner: { id: "user-1", displayName: "User", username: "user" },
    } as any);

    const response = await POST(new Request("http://localhost/api/share/songs/song-token/import", { method: "POST" }) as any, {
      params: Promise.resolve({ token: "song-token" }),
    });

    expect(response.status).toBe(409);
    expect(importSharedSong).not.toHaveBeenCalled();
  });

  it("requires sign-in", async () => {
    vi.mocked(resolveRequestContext).mockResolvedValue({
      actor: null,
      effectiveUser: null,
      isImpersonating: false,
    });

    const response = await POST(new Request("http://localhost/api/share/songs/song-token/import", { method: "POST" }) as any, {
      params: Promise.resolve({ token: "song-token" }),
    });

    expect(response.status).toBe(401);
    expect(importSharedSong).not.toHaveBeenCalled();
  });
});
