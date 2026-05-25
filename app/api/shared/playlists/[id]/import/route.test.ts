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
});
