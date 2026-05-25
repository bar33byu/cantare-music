import { beforeEach, describe, expect, it, vi } from "vitest";

vi.mock("../../../../db/queries", () => ({
  getPublicSharedPlaylists: vi.fn(),
}));

vi.mock("../../_user", () => ({
  resolveRequestContext: vi.fn(),
}));

import { getPublicSharedPlaylists } from "../../../../db/queries";
import { resolveRequestContext } from "../../_user";
import { GET } from "./route";

describe("GET /api/shared/playlists", () => {
  beforeEach(() => {
    vi.clearAllMocks();
  });

  it("lists public playlists excluding the effective user", async () => {
    vi.mocked(resolveRequestContext).mockResolvedValue({
      actor: { id: "admin-1", email: "admin@example.com" },
      effectiveUser: { id: "user-1", email: "" },
      isImpersonating: true,
    } as any);
    vi.mocked(getPublicSharedPlaylists).mockResolvedValue([
      { id: "pl-2", name: "Other Set", owner: { id: "user-2", displayName: "Singer Two", username: "singer-two" } },
    ] as any);

    const response = await GET(new Request("http://localhost/api/shared/playlists") as any);
    const data = await response.json();

    expect(response.status).toBe(200);
    expect(getPublicSharedPlaylists).toHaveBeenCalledWith("user-1");
    expect(data.playlists).toHaveLength(1);
  });

  it("requires an authenticated actor", async () => {
    vi.mocked(resolveRequestContext).mockResolvedValue({
      actor: null,
      effectiveUser: null,
      isImpersonating: false,
    } as any);

    const response = await GET(new Request("http://localhost/api/shared/playlists") as any);
    const data = await response.json();

    expect(response.status).toBe(401);
    expect(data.error).toMatch(/sign in/i);
    expect(getPublicSharedPlaylists).not.toHaveBeenCalled();
  });
});
