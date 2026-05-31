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

    const request = new Request("http://localhost/api/share/playlists/share-token/import", {
      method: "POST",
      headers: {
        cookie: "cantare-session=session-token",
        "Content-Type": "application/json",
      },
      body: JSON.stringify({}),
    });

    const response = await POST(request as any, { params: Promise.resolve({ token: "share-token" }) });
    const data = await response.json();

    expect(getUserForSessionTokenHash).toHaveBeenCalledWith("hashed:session-token");
    expect(importSharedPlaylist).toHaveBeenCalledWith("share-token", "user-1", { force: false });
    expect(response.status).toBe(200);
    expect(data.redirectTo).toBe("/#view=playlist_detail&playlist=imported-1");
  });

  it("passes force when importing again", async () => {
    vi.mocked(getUserForSessionTokenHash).mockResolvedValue({ id: "user-1", email: "user@example.com" } as any);
    vi.mocked(importSharedPlaylist).mockResolvedValue({
      status: "imported",
      playlist: { id: "imported-2" },
    } as any);

    const request = new Request("http://localhost/api/share/playlists/share-token/import", {
      method: "POST",
      headers: {
        cookie: "cantare-session=session-token",
        "Content-Type": "application/json",
      },
      body: JSON.stringify({ force: true }),
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
