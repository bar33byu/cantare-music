import { beforeEach, describe, expect, it, vi } from "vitest";
import { NextRequest } from "next/server";

vi.mock("../../../db/queries", () => ({
  consumeMagicLinkToken: vi.fn(),
  createUserSession: vi.fn(),
  getOrCreateUserForEmailWithStatus: vi.fn(),
  logAuditEvent: vi.fn(),
}));

vi.mock("../../lib/authTokens", () => ({
  AUTH_SESSION_COOKIE_NAME: "cantare-session",
  createOpaqueToken: vi.fn(() => "session-token"),
  getAppBaseUrl: vi.fn(() => "http://localhost"),
  hashAuthToken: vi.fn((token: string) => `hashed:${token}`),
  hashMagicLinkCode: vi.fn((email: string, code: string) => `hashed:${email}:${code}`),
  SESSION_TTL_MS: 60 * 60 * 1000,
}));

vi.mock("../../api/_user", () => ({
  isEmailAdmin: vi.fn(() => false),
}));

import { consumeMagicLinkToken, createUserSession, getOrCreateUserForEmailWithStatus } from "../../../db/queries";
import { GET } from "./route";

describe("GET /auth/verify", () => {
  beforeEach(() => {
    vi.clearAllMocks();
  });

  it("adds setup=username when a magic link creates a new user", async () => {
    vi.mocked(consumeMagicLinkToken).mockResolvedValue({
      id: "token-1",
      email: "singer@example.com",
      tokenHash: "hashed:magic-token",
      createdAt: new Date(),
      expiresAt: new Date(Date.now() + 60_000),
      consumedAt: new Date(),
    });
    vi.mocked(getOrCreateUserForEmailWithStatus).mockResolvedValue({
      created: true,
      user: {
        id: "user-1",
        username: "singer",
        name: "singer",
        email: "singer@example.com",
        avatarUrl: null,
        profileVisibility: "private",
      },
    });
    vi.mocked(createUserSession).mockResolvedValue({
      id: "session-1",
      userId: "user-1",
      tokenHash: "hashed:session-token",
      createdAt: new Date(),
      expiresAt: new Date(Date.now() + 60_000),
      revokedAt: null,
    });

    const response = await GET(new NextRequest("http://localhost/auth/verify?token=magic-token"));

    expect(response.status).toBe(307);
    expect(response.headers.get("location")).toBe("http://localhost/?auth=signed-in&setup=username");
  });

  it("uses an email-bound hash for a six-digit login link", async () => {
    vi.mocked(consumeMagicLinkToken).mockResolvedValue({
      id: "token-2",
      email: "singer@example.com",
      tokenHash: "hashed:singer@example.com:042137",
      createdAt: new Date(),
      expiresAt: new Date(Date.now() + 60_000),
      consumedAt: new Date(),
    });
    vi.mocked(getOrCreateUserForEmailWithStatus).mockResolvedValue({
      created: false,
      user: {
        id: "user-1",
        username: "singer",
        name: "Singer",
        email: "singer@example.com",
        avatarUrl: null,
        profileVisibility: "private",
      },
    });
    vi.mocked(createUserSession).mockResolvedValue({
      id: "session-2",
      userId: "user-1",
      tokenHash: "hashed:session-token",
      createdAt: new Date(),
      expiresAt: new Date(Date.now() + 60_000),
      revokedAt: null,
    });

    const response = await GET(new NextRequest("http://localhost/auth/verify?token=042137&email=SINGER%40example.com"));

    expect(consumeMagicLinkToken).toHaveBeenCalledWith("hashed:singer@example.com:042137");
    expect(response.headers.get("location")).toBe("http://localhost/?auth=signed-in");
  });
});
