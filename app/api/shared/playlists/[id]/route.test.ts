import { beforeEach, describe, expect, it, vi } from "vitest";

vi.mock("../../../../../db/queries", () => ({
  getPublicPlaylistById: vi.fn(),
}));

vi.mock("../../../_user", () => ({
  resolveRequestContext: vi.fn(),
}));

import { getPublicPlaylistById } from "../../../../../db/queries";
import { resolveRequestContext } from "../../../_user";
import { GET } from "./route";

describe("GET /api/shared/playlists/[id]", () => {
  beforeEach(() => {
    vi.clearAllMocks();
  });

  it("does not open the effective user's own shared playlist", async () => {
    vi.mocked(resolveRequestContext).mockResolvedValue({
      actor: { id: "admin-1", email: "admin@example.com" },
      effectiveUser: { id: "user-1", email: "" },
      isImpersonating: true,
    } as any);
    vi.mocked(getPublicPlaylistById).mockResolvedValue(null);

    const response = await GET(new Request("http://localhost/api/shared/playlists/pl-1") as any, {
      params: Promise.resolve({ id: "pl-1" }),
    });
    const data = await response.json();

    expect(response.status).toBe(404);
    expect(data.error).toMatch(/not found/i);
    expect(getPublicPlaylistById).toHaveBeenCalledWith("pl-1", "user-1");
  });
});
