import { beforeEach, describe, expect, it, vi } from "vitest";
import { PATCH } from "./route";

vi.mock("../../../../db/queries", () => ({
  getUserById: vi.fn(),
  logAuditEvent: vi.fn(),
  normalizePublicUsername: (value: string) => value.trim().toLowerCase().replace(/[^a-z0-9_-]/g, "-").replace(/^-+|-+$/g, "").slice(0, 32),
  updateUserProfile: vi.fn(),
}));

vi.mock("../../_user", () => ({
  isEmailAdmin: vi.fn(() => false),
  resolveRequestContext: vi.fn(),
  resolveRequestUser: vi.fn(),
}));

import { getUserById, logAuditEvent, updateUserProfile } from "../../../../db/queries";
import { resolveRequestContext } from "../../_user";

const user = {
  id: "user-1",
  username: "old-name",
  name: "Old Name",
  email: "old@example.com",
  avatarUrl: null,
  profileVisibility: "private",
};

describe("PATCH /api/users/me", () => {
  beforeEach(() => {
    vi.clearAllMocks();
    vi.mocked(resolveRequestContext).mockResolvedValue({
      actor: { ...user, isAdmin: false },
      effectiveUser: { ...user, isAdmin: false },
      isImpersonating: false,
    });
    vi.mocked(getUserById).mockResolvedValue(user);
  });

  it("updates display name and username for the current user", async () => {
    vi.mocked(updateUserProfile).mockResolvedValue({
      ...user,
      username: "new-name",
      name: "New Name",
    });

    const response = await PATCH(new Request("http://localhost/api/users/me", {
      method: "PATCH",
      body: JSON.stringify({ displayName: "New Name", username: "New Name!" }),
    }) as any);

    expect(response.status).toBe(200);
    expect(updateUserProfile).toHaveBeenCalledWith("user-1", {
      name: "New Name",
      username: "new-name",
    });
    expect(logAuditEvent).toHaveBeenCalledWith(expect.objectContaining({
      eventType: "user.username_changed",
      resourceId: "user-1",
    }));
  });

  it("returns a conflict when the username is taken", async () => {
    vi.mocked(updateUserProfile).mockRejectedValue(new Error("users_username_unique"));

    const response = await PATCH(new Request("http://localhost/api/users/me", {
      method: "PATCH",
      body: JSON.stringify({ displayName: "Old Name", username: "taken" }),
    }) as any);

    expect(response.status).toBe(409);
    await expect(response.json()).resolves.toEqual({ error: "username is already taken" });
  });
});
