import { beforeEach, describe, expect, it, vi } from "vitest";

vi.mock("../../../../db/queries", () => ({
  createMagicLinkToken: vi.fn(),
}));

vi.mock("../../../lib/authTokens", () => ({
  createOpaqueToken: vi.fn(() => "magic-token"),
  getAppBaseUrl: vi.fn(() => "http://localhost"),
  hashAuthToken: vi.fn((token: string) => `hashed:${token}`),
  MAGIC_LINK_TTL_MS: 15 * 60 * 1000,
}));

vi.mock("../../../lib/resend", () => ({
  sendMagicLinkEmail: vi.fn(),
}));

import { createMagicLinkToken } from "../../../../db/queries";
import { sendMagicLinkEmail } from "../../../lib/resend";
import { POST } from "./route";

describe("POST /api/auth/magic-link", () => {
  beforeEach(() => {
    vi.clearAllMocks();
  });

  it("includes a safe return path in the emailed login link", async () => {
    const request = new Request("http://localhost/api/auth/magic-link", {
      method: "POST",
      body: JSON.stringify({
        email: "singer@example.com",
        returnTo: "/share/playlists/share-token",
      }),
    });

    const response = await POST(request as any);

    expect(response.status).toBe(200);
    expect(createMagicLinkToken).toHaveBeenCalledWith(expect.objectContaining({
      email: "singer@example.com",
      tokenHash: "hashed:magic-token",
    }));
    expect(sendMagicLinkEmail).toHaveBeenCalledWith({
      to: "singer@example.com",
      loginUrl: "http://localhost/auth/verify?token=magic-token&returnTo=%2Fshare%2Fplaylists%2Fshare-token",
    });
  });

  it("drops unsafe external return paths", async () => {
    const request = new Request("http://localhost/api/auth/magic-link", {
      method: "POST",
      body: JSON.stringify({
        email: "singer@example.com",
        returnTo: "https://example.net/steal",
      }),
    });

    await POST(request as any);

    expect(sendMagicLinkEmail).toHaveBeenCalledWith({
      to: "singer@example.com",
      loginUrl: "http://localhost/auth/verify?token=magic-token",
    });
  });
});
