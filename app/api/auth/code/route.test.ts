import { beforeEach, describe, expect, it, vi } from "vitest";
import { NextRequest, NextResponse } from "next/server";

vi.mock("../../../lib/authTokens", () => ({
  getAppBaseUrl: vi.fn(() => "http://localhost"),
  hashMagicLinkCode: vi.fn((email: string, code: string) => `hashed:${email}:${code}`),
}));

vi.mock("../../../lib/magicLinkLogin", () => ({
  completeMagicLinkLogin: vi.fn(),
  setLoginCookies: vi.fn((response: NextResponse) => {
    response.cookies.set("cantare-session", "session-token");
  }),
}));

import { completeMagicLinkLogin } from "../../../lib/magicLinkLogin";
import { resetLoginCodeRateLimitsForTests } from "../../../lib/loginCodeRateLimit";
import { POST } from "./route";

describe("POST /api/auth/code", () => {
  beforeEach(() => {
    vi.clearAllMocks();
    resetLoginCodeRateLimitsForTests();
  });

  it("signs in with an email-bound six-digit code and preserves a safe return path", async () => {
    vi.mocked(completeMagicLinkLogin).mockResolvedValue({
      created: false,
      sessionToken: "session-token",
      user: { id: "user-1", email: "singer@example.com" } as any,
    });
    const request = new NextRequest("http://localhost/api/auth/code", {
      method: "POST",
      body: JSON.stringify({
        email: " Singer@Example.com ",
        code: "042137",
        returnTo: "/share/playlists/share-token",
      }),
    });

    const response = await POST(request);

    expect(response.status).toBe(200);
    expect(completeMagicLinkLogin).toHaveBeenCalledWith(
      "hashed:singer@example.com:042137",
      "email_code_login"
    );
    await expect(response.json()).resolves.toEqual({
      redirectTo: "/share/playlists/share-token?auth=signed-in",
    });
    expect(response.cookies.get("cantare-session")?.value).toBe("session-token");
  });

  it("rejects malformed and invalid codes", async () => {
    const malformed = await POST(new NextRequest("http://localhost/api/auth/code", {
      method: "POST",
      body: JSON.stringify({ email: "singer@example.com", code: "12345" }),
    }));
    expect(malformed.status).toBe(400);

    vi.mocked(completeMagicLinkLogin).mockResolvedValue(null);
    const invalid = await POST(new NextRequest("http://localhost/api/auth/code", {
      method: "POST",
      body: JSON.stringify({ email: "singer@example.com", code: "123456" }),
    }));
    expect(invalid.status).toBe(401);
  });

  it("drops unsafe external return paths and prompts new users for setup", async () => {
    vi.mocked(completeMagicLinkLogin).mockResolvedValue({
      created: true,
      sessionToken: "session-token",
      user: { id: "user-1", email: "singer@example.com" } as any,
    });
    const response = await POST(new NextRequest("http://localhost/api/auth/code", {
      method: "POST",
      body: JSON.stringify({
        email: "singer@example.com",
        code: "123456",
        returnTo: "https://example.net/steal",
      }),
    }));

    await expect(response.json()).resolves.toEqual({ redirectTo: "/?auth=signed-in&setup=username" });
  });

  it("temporarily throttles repeated incorrect guesses for an email and client", async () => {
    vi.mocked(completeMagicLinkLogin).mockResolvedValue(null);

    for (let attempt = 0; attempt < 10; attempt += 1) {
      const response = await POST(new NextRequest("http://localhost/api/auth/code", {
        method: "POST",
        headers: { "x-forwarded-for": "192.0.2.10" },
        body: JSON.stringify({ email: "singer@example.com", code: "123456" }),
      }));
      expect(response.status).toBe(401);
    }

    const throttled = await POST(new NextRequest("http://localhost/api/auth/code", {
      method: "POST",
      headers: { "x-forwarded-for": "192.0.2.10" },
      body: JSON.stringify({ email: "singer@example.com", code: "123456" }),
    }));
    expect(throttled.status).toBe(429);
  });
});
