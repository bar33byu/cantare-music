import { beforeEach, describe, expect, it, vi } from "vitest";

vi.mock("../../../../db/queries", () => ({
  getUserById: vi.fn(),
  logAuditEvent: vi.fn(),
}));

vi.mock("../../_user", () => ({
  IMPERSONATION_COOKIE_NAME: "cantare-impersonate-user-id",
  resolveRequestContext: vi.fn(),
}));

vi.mock("../../../lib/authTokens", () => ({
  SESSION_TTL_MS: 90 * 24 * 60 * 60 * 1000,
}));

vi.mock("../../../lib/userContext", () => ({
  USER_COOKIE_NAME: "cantare-user-id",
  normalizeUserId: (value: string) => value.trim().toLowerCase(),
}));

import { getUserById, logAuditEvent } from "../../../../db/queries";
import { resolveRequestContext } from "../../_user";
import { DELETE, POST } from "./route";

const admin = {
  id: "admin-1",
  username: "admin",
  name: "Admin",
  email: "admin@example.com",
  profileVisibility: "private",
  isAdmin: true,
};

describe("admin impersonation route", () => {
  beforeEach(() => {
    vi.clearAllMocks();
  });

  it("requires an admin actor to start impersonation", async () => {
    vi.mocked(resolveRequestContext).mockResolvedValue({
      actor: { ...admin, isAdmin: false },
      effectiveUser: { ...admin, isAdmin: false },
      isImpersonating: false,
    } as any);

    const response = await POST(new Request("http://localhost/api/admin/impersonation", {
      method: "POST",
      body: JSON.stringify({ userId: "user-1" }),
    }) as any);

    expect(response.status).toBe(403);
    expect(getUserById).not.toHaveBeenCalled();
  });

  it("sets impersonation and readable user cookies for an admin", async () => {
    vi.mocked(resolveRequestContext).mockResolvedValue({
      actor: admin,
      effectiveUser: admin,
      isImpersonating: false,
    } as any);
    vi.mocked(getUserById).mockResolvedValue({
      id: "user-1",
      username: "singer",
      name: "Singer",
      email: "singer@example.com",
      profileVisibility: "private",
    } as any);

    const response = await POST(new Request("http://localhost/api/admin/impersonation", {
      method: "POST",
      body: JSON.stringify({ userId: "USER-1" }),
    }) as any);
    const payload = await response.json();
    const setCookie = response.headers.get("set-cookie") ?? "";

    expect(response.status).toBe(200);
    expect(payload.actor.id).toBe("admin-1");
    expect(payload.effectiveUser.id).toBe("user-1");
    expect(payload.isImpersonating).toBe(true);
    expect(setCookie).toContain("cantare-impersonate-user-id=user-1");
    expect(setCookie).toContain("cantare-user-id=user-1");
    expect(logAuditEvent).toHaveBeenCalledWith(expect.objectContaining({
      eventType: "impersonation.started",
      actorUserId: "admin-1",
      effectiveUserId: "user-1",
    }));
  });

  it("clears impersonation back to the admin actor", async () => {
    vi.mocked(resolveRequestContext).mockResolvedValue({
      actor: admin,
      effectiveUser: { ...admin, id: "user-1" },
      isImpersonating: true,
    } as any);

    const response = await DELETE(new Request("http://localhost/api/admin/impersonation", { method: "DELETE" }) as any);
    const payload = await response.json();
    const setCookie = response.headers.get("set-cookie") ?? "";

    expect(response.status).toBe(200);
    expect(payload.effectiveUser.id).toBe("admin-1");
    expect(payload.isImpersonating).toBe(false);
    expect(setCookie).toContain("cantare-impersonate-user-id=");
    expect(setCookie).toContain("cantare-user-id=admin-1");
    expect(logAuditEvent).toHaveBeenCalledWith(expect.objectContaining({
      eventType: "impersonation.stopped",
      actorUserId: "admin-1",
      effectiveUserId: "user-1",
    }));
  });
});
