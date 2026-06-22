import { beforeEach, describe, expect, it, vi } from "vitest";

vi.mock("../../../../../db/queries", () => ({
  getUserVocalRange: vi.fn(),
  saveUserVocalRange: vi.fn(),
}));

vi.mock("../../../_user", () => ({
  getRequestCookie: vi.fn(),
  resolveRequestContext: vi.fn(),
}));

import { getUserVocalRange, saveUserVocalRange } from "../../../../../db/queries";
import { getRequestCookie, resolveRequestContext } from "../../../_user";
import { GET, PATCH } from "./route";

describe("user vocal range route", () => {
  beforeEach(() => vi.clearAllMocks());

  it("requires a signed-in session", async () => {
    vi.mocked(getRequestCookie).mockReturnValue(undefined);
    const response = await GET(new Request("http://localhost/api/users/me/vocal-range") as never);
    expect(response.status).toBe(401);
    expect(getUserVocalRange).not.toHaveBeenCalled();
  });

  it("loads and saves the effective user's range", async () => {
    vi.mocked(getRequestCookie).mockReturnValue("session-token");
    vi.mocked(resolveRequestContext).mockResolvedValue({
      actor: { id: "user-1" },
      effectiveUser: { id: "user-1" },
      isImpersonating: false,
    } as never);
    vi.mocked(getUserVocalRange).mockResolvedValue({ low: 45, high: 64 });
    vi.mocked(saveUserVocalRange).mockResolvedValue({ low: 43, high: 65 });

    const getResponse = await GET(new Request("http://localhost/api/users/me/vocal-range") as never);
    expect(await getResponse.json()).toEqual({ range: { low: 45, high: 64 } });

    const patchResponse = await PATCH(new Request("http://localhost/api/users/me/vocal-range", {
      method: "PATCH",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ low: 43, high: 65 }),
    }) as never);
    expect(patchResponse.status).toBe(200);
    expect(saveUserVocalRange).toHaveBeenCalledWith("user-1", { low: 43, high: 65 });
  });
});
