import { describe, expect, it, vi, beforeEach } from "vitest";

vi.mock("../../../../../../db/queries", () => ({
  getUserById: vi.fn(),
  getUserForSessionTokenHash: vi.fn(),
  importSharedPlaylist: vi.fn(),
}));

vi.mock("../../../../../lib/authTokens", () => ({
  AUTH_SESSION_COOKIE_NAME: "cantare-session",
  hashAuthToken: vi.fn((token: string) => `hashed:${token}`),
}));

import { getUserForSessionTokenHash, importSharedPlaylist } from "../../../../../../db/queries";
import { POST } from "./route";

describe("POST /api/share/playlists/[token]/import", () => {
  beforeEach(() => {
    vi.clearAllMocks();
  });

  it("imports a shared playlist for the signed-in user", async () => {
    vi.mocked(getUserForSessionTokenHash).mockResolvedValue({ id: "user-1", email: "user@example.com" } as any);
    vi.mocked(importSharedPlaylist).mockResolvedValue({
      status: "imported",
      playlist: { id: "imported-1" },
    } as any);

    const body = new FormData();
    const request = new Request("http://localhost/api/share/playlists/share-token/import", {
      method: "POST",
      body,
      headers: { cookie: "cantare-session=session-token" },
    });

    const response = await POST(request as any, { params: Promise.resolve({ token: "share-token" }) });

    expect(getUserForSessionTokenHash).toHaveBeenCalledWith("hashed:session-token");
    expect(importSharedPlaylist).toHaveBeenCalledWith("share-token", "user-1", { force: false });
    expect(response.status).toBe(303);
    expect(response.headers.get("location")).toBe("http://localhost/#view=playlist_detail&playlist=imported-1");
  });

  it("passes force when importing again", async () => {
    vi.mocked(getUserForSessionTokenHash).mockResolvedValue({ id: "user-1", email: "user@example.com" } as any);
    vi.mocked(importSharedPlaylist).mockResolvedValue({
      status: "imported",
      playlist: { id: "imported-2" },
    } as any);

    const body = new FormData();
    body.set("force", "true");
    const request = new Request("http://localhost/api/share/playlists/share-token/import", {
      method: "POST",
      body,
      headers: { cookie: "cantare-session=session-token" },
    });

    await POST(request as any, { params: Promise.resolve({ token: "share-token" }) });

    expect(importSharedPlaylist).toHaveBeenCalledWith("share-token", "user-1", { force: true });
  });

  it("requires a signed-in session", async () => {
    const request = new Request("http://localhost/api/share/playlists/share-token/import", {
      method: "POST",
    });

    const response = await POST(request as any, { params: Promise.resolve({ token: "share-token" }) });
    const data = await response.json();

    expect(response.status).toBe(401);
    expect(data.error).toMatch(/sign in/i);
    expect(importSharedPlaylist).not.toHaveBeenCalled();
  });
});
