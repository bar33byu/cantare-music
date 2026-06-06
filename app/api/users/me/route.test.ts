import { beforeEach, describe, expect, it, vi } from "vitest";

vi.mock("../../../../db/queries", () => ({
  logAuditEvent: vi.fn(),
  updateUserProfile: vi.fn(),
}));

vi.mock("../../_user", () => ({
  isEmailAdmin: vi.fn(() => false),
  resolveRequestUser: vi.fn(),
}));

import { logAuditEvent, updateUserProfile } from "../../../../db/queries";
import { resolveRequestUser } from "../../_user";
import { PATCH } from "./route";

describe("/api/users/me", () => {
  beforeEach(() => {
    vi.clearAllMocks();
  });

  it("updates the signed-in user's display name and username", async () => {
    vi.mocked(resolveRequestUser).mockResolvedValue({
      id: "user-1",
      username: "old-name",
      name: "Old Name",
      email: "user@example.com",
      avatarUrl: null,
      profileVisibility: "private",
      isAdmin: false,
    });
    vi.mocked(updateUserProfile).mockResolvedValue({
      id: "user-1",
      username: "new-name",
      name: "New Name",
      email: "user@example.com",
      avatarUrl: null,
      profileVisibility: "private",
    });

    const response = await PATCH(new Request("http://localhost/api/users/me", {
      method: "PATCH",
      body: JSON.stringify({ displayName: "New Name", username: "New Name!" }),
    }) as any);
    const data = await response.json();

    expect(response.status).toBe(200);
    expect(updateUserProfile).toHaveBeenCalledWith("user-1", {
      name: "New Name",
      username: "new-name",
    });
    expect(logAuditEvent).toHaveBeenCalledWith(expect.objectContaining({
      eventType: "user.username_changed",
      metadata: {
        previousUsername: "old-name",
        newUsername: "new-name",
      },
    }));
    expect(data.user.username).toBe("new-name");
  });

  it("rejects empty usernames when provided", async () => {
    vi.mocked(resolveRequestUser).mockResolvedValue({
      id: "user-1",
      username: "old-name",
      name: "Old Name",
      email: "user@example.com",
      avatarUrl: null,
      profileVisibility: "private",
      isAdmin: false,
    });

    const response = await PATCH(new Request("http://localhost/api/users/me", {
      method: "PATCH",
      body: JSON.stringify({ displayName: "New Name", username: "!!!" }),
    }) as any);
    const data = await response.json();

    expect(response.status).toBe(400);
    expect(data.error).toMatch(/username/i);
    expect(updateUserProfile).not.toHaveBeenCalled();
  });
});
