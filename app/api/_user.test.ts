import { beforeEach, describe, expect, it, vi } from "vitest";

vi.mock("../../db/queries", () => ({
  getUserById: vi.fn(),
  getUserForSessionTokenHash: vi.fn(),
  logAuditEvent: vi.fn(),
}));

vi.mock("../lib/authTokens", () => ({
  AUTH_SESSION_COOKIE_NAME: "cantare-session",
  hashAuthToken: vi.fn((token: string) => `hashed:${token}`),
}));

import { getUserById, getUserForSessionTokenHash, logAuditEvent } from "../../db/queries";
import { USER_ID_HEADER } from "../lib/userContext";
import { getAdminEmailAllowlist, isEmailAdmin, resolveEffectiveRequestUserId } from "./_user";

const originalAdminEmails = process.env.CANTARE_ADMIN_EMAILS;

beforeEach(() => {
  vi.clearAllMocks();
  if (originalAdminEmails === undefined) {
    delete process.env.CANTARE_ADMIN_EMAILS;
  } else {
    process.env.CANTARE_ADMIN_EMAILS = originalAdminEmails;
  }
});

describe("admin email allowlist", () => {
  it("reads admin emails from environment configuration", () => {
    const env = { CANTARE_ADMIN_EMAILS: "lead@example.com, admin@example.com\nOWNER@example.com" } as unknown as NodeJS.ProcessEnv;

    expect(Array.from(getAdminEmailAllowlist(env))).toEqual([
      "lead@example.com",
      "admin@example.com",
      "owner@example.com",
    ]);
    expect(isEmailAdmin("Admin@Example.com", env)).toBe(true);
    expect(isEmailAdmin("singer@example.com", env)).toBe(false);
  });
});

describe("resolveEffectiveRequestUserId", () => {
  it("prefers the signed-in session over a spoofed user header", async () => {
    vi.mocked(getUserForSessionTokenHash).mockResolvedValue({
      id: "signed-in-user",
      username: "signed-in",
      name: "Signed In",
      email: "singer@example.com",
      profileVisibility: "private",
    } as Awaited<ReturnType<typeof getUserForSessionTokenHash>>);

    const request = new Request("http://localhost/api/songs", {
      headers: {
        cookie: "cantare-session=session-token",
        [USER_ID_HEADER]: "other-user",
      },
    });

    await expect(resolveEffectiveRequestUserId(request)).resolves.toBe("signed-in-user");
    expect(getUserForSessionTokenHash).toHaveBeenCalledWith("hashed:session-token");
    expect(getUserById).not.toHaveBeenCalled();
  });

  it("allows anonymous guest ids when no valid session exists", async () => {
    vi.mocked(getUserForSessionTokenHash).mockResolvedValue(null);
    const request = new Request("http://localhost/api/songs", {
      headers: {
        [USER_ID_HEADER]: "guest-abc123",
      },
    });

    await expect(resolveEffectiveRequestUserId(request)).resolves.toBe("guest-abc123");
    expect(getUserById).not.toHaveBeenCalled();
  });

  it("ignores non-guest client ids when no valid session exists", async () => {
    const request = new Request("http://localhost/api/songs", {
      headers: {
        [USER_ID_HEADER]: "other-user",
      },
    });

    await expect(resolveEffectiveRequestUserId(request)).resolves.toBe("default");
    expect(getUserById).not.toHaveBeenCalled();
  });

  it("logs impersonated mutations without looking up the session twice", async () => {
    process.env.CANTARE_ADMIN_EMAILS = "admin@example.com";
    vi.mocked(getUserForSessionTokenHash).mockResolvedValue({
      id: "admin-user",
      username: "admin",
      name: "Admin",
      email: "admin@example.com",
      profileVisibility: "private",
    } as Awaited<ReturnType<typeof getUserForSessionTokenHash>>);
    vi.mocked(getUserById).mockResolvedValue({
      id: "target-user",
      username: "target",
      name: "Target",
      email: "target@example.com",
      profileVisibility: "private",
    } as Awaited<ReturnType<typeof getUserById>>);

    const request = new Request("http://localhost/api/songs/song-1/ratings", {
      method: "POST",
      headers: {
        cookie: "cantare-session=session-token; cantare-impersonate-user-id=target-user",
      },
    });

    await expect(resolveEffectiveRequestUserId(request)).resolves.toBe("target-user");
    expect(getUserForSessionTokenHash).toHaveBeenCalledTimes(1);
    expect(logAuditEvent).toHaveBeenCalledWith(expect.objectContaining({
      eventType: "impersonation.action",
      actorUserId: "admin-user",
      effectiveUserId: "target-user",
      resourceType: "songs",
      resourceId: "song-1",
    }));
  });

  it("does not log impersonation audits for reads", async () => {
    process.env.CANTARE_ADMIN_EMAILS = "admin@example.com";
    vi.mocked(getUserForSessionTokenHash).mockResolvedValue({
      id: "admin-user",
      username: "admin",
      name: "Admin",
      email: "admin@example.com",
      profileVisibility: "private",
    } as Awaited<ReturnType<typeof getUserForSessionTokenHash>>);
    vi.mocked(getUserById).mockResolvedValue({
      id: "target-user",
      username: "target",
      name: "Target",
      email: "target@example.com",
      profileVisibility: "private",
    } as Awaited<ReturnType<typeof getUserById>>);

    const request = new Request("http://localhost/api/songs/song-1", {
      headers: {
        cookie: "cantare-session=session-token; cantare-impersonate-user-id=target-user",
      },
    });

    await expect(resolveEffectiveRequestUserId(request)).resolves.toBe("target-user");
    expect(logAuditEvent).not.toHaveBeenCalled();
  });
});
