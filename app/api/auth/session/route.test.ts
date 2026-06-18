import { beforeEach, describe, expect, it, vi } from "vitest";

vi.mock("../../../../db/queries", () => ({
  getUserById: vi.fn(),
  getUserForSessionTokenHash: vi.fn(),
  logAuditEvent: vi.fn(),
}));

vi.mock("../../../lib/authTokens", () => ({
  AUTH_SESSION_COOKIE_NAME: "cantare-session",
  hashAuthToken: vi.fn((token: string) => `hashed:${token}`),
}));

import { getUserForSessionTokenHash } from "../../../../db/queries";
import { GET } from "./route";

describe("GET /api/auth/session", () => {
  beforeEach(() => vi.clearAllMocks());

  it("returns an uncached anonymous session payload when no session cookie exists", async () => {
    const response = await GET(new Request("http://localhost/api/auth/session") as any);
    const data = await response.json();

    expect(data).toEqual({
      user: null,
      actor: null,
      effectiveUser: null,
      isImpersonating: false,
    });
    expect(response.headers.get("Cache-Control")).toBe("private, no-store");
    expect(response.headers.get("Vary")).toBe("Cookie");
  });

  it("varies signed-in session payloads by cookie", async () => {
    vi.mocked(getUserForSessionTokenHash).mockResolvedValue({
      id: "session-user",
      username: "session-user",
      name: "Session User",
      email: "session@example.com",
      profileVisibility: "private",
    } as any);

    const response = await GET(new Request("http://localhost/api/auth/session", {
      headers: {
        cookie: "cantare-session=session-token",
      },
    }) as any);
    const data = await response.json();

    expect(data.user.id).toBe("session-user");
    expect(getUserForSessionTokenHash).toHaveBeenCalledWith("hashed:session-token");
    expect(response.headers.get("Cache-Control")).toBe("private, no-store");
    expect(response.headers.get("Vary")).toBe("Cookie");
  });
});
