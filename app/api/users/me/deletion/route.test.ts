import { beforeEach, describe, expect, it, vi } from "vitest";

vi.mock("../../../../../db/queries", () => ({
  cancelUserAccountDeletion: vi.fn(),
  getUserAccountDeletionStatus: vi.fn(),
  logAuditEvent: vi.fn(),
  scheduleUserAccountDeletion: vi.fn(),
}));

vi.mock("../../../../lib/accountDeletion", () => ({
  getAccountDeletionScheduleDates: vi.fn(() => ({
    requestedAt: new Date("2026-05-30T12:00:00.000Z"),
    scheduledFor: new Date("2026-06-29T12:00:00.000Z"),
  })),
}));

vi.mock("../../../_user", () => ({
  resolveRequestContext: vi.fn(),
}));

import { DELETE, GET, POST } from "./route";
import {
  cancelUserAccountDeletion,
  getUserAccountDeletionStatus,
  logAuditEvent,
  scheduleUserAccountDeletion,
} from "../../../../../db/queries";
import { resolveRequestContext } from "../../../_user";

describe("/api/users/me/deletion", () => {
  beforeEach(() => {
    vi.clearAllMocks();
  });

  it("returns 401 when not signed in", async () => {
    vi.mocked(resolveRequestContext).mockResolvedValue({
      actor: null,
      effectiveUser: null,
      isImpersonating: false,
    });

    const response = await GET(new Request("http://localhost/api/users/me/deletion") as any);
    expect(response.status).toBe(401);
  });

  it("returns deletion status for the signed-in user", async () => {
    vi.mocked(resolveRequestContext).mockResolvedValue({
      actor: { id: "user-1", email: "user@example.com", isAdmin: false },
      effectiveUser: { id: "user-1", email: "user@example.com", isAdmin: false },
      isImpersonating: false,
    } as any);
    vi.mocked(getUserAccountDeletionStatus).mockResolvedValue({
      requestedAt: "2026-05-30T12:00:00.000Z",
      scheduledFor: "2026-06-29T12:00:00.000Z",
    });

    const response = await GET(new Request("http://localhost/api/users/me/deletion") as any);
    const data = await response.json();

    expect(response.status).toBe(200);
    expect(data.deletion.scheduledFor).toBe("2026-06-29T12:00:00.000Z");
  });

  it("schedules deletion for the signed-in user", async () => {
    vi.mocked(resolveRequestContext).mockResolvedValue({
      actor: { id: "user-1", email: "user@example.com", isAdmin: false },
      effectiveUser: { id: "user-1", email: "user@example.com", isAdmin: false },
      isImpersonating: false,
    } as any);
    vi.mocked(getUserAccountDeletionStatus).mockResolvedValue(null);
    vi.mocked(scheduleUserAccountDeletion).mockResolvedValue({
      requestedAt: "2026-05-30T12:00:00.000Z",
      scheduledFor: "2026-06-29T12:00:00.000Z",
    });

    const response = await POST(new Request("http://localhost/api/users/me/deletion", { method: "POST" }) as any);
    const data = await response.json();

    expect(response.status).toBe(200);
    expect(scheduleUserAccountDeletion).toHaveBeenCalledWith(
      "user-1",
      new Date("2026-05-30T12:00:00.000Z"),
      new Date("2026-06-29T12:00:00.000Z")
    );
    expect(logAuditEvent).toHaveBeenCalled();
    expect(data.deletion.scheduledFor).toBe("2026-06-29T12:00:00.000Z");
  });

  it("cancels deletion for the signed-in user", async () => {
    vi.mocked(resolveRequestContext).mockResolvedValue({
      actor: { id: "user-1", email: "user@example.com", isAdmin: false },
      effectiveUser: { id: "user-1", email: "user@example.com", isAdmin: false },
      isImpersonating: false,
    } as any);
    vi.mocked(cancelUserAccountDeletion).mockResolvedValue({
      requestedAt: null,
      scheduledFor: null,
    });

    const response = await DELETE(new Request("http://localhost/api/users/me/deletion", { method: "DELETE" }) as any);
    const data = await response.json();

    expect(response.status).toBe(200);
    expect(cancelUserAccountDeletion).toHaveBeenCalledWith("user-1");
    expect(logAuditEvent).toHaveBeenCalled();
    expect(data.deletion.scheduledFor).toBeNull();
  });

  it("blocks impersonated account deletion changes", async () => {
    vi.mocked(resolveRequestContext).mockResolvedValue({
      actor: { id: "admin-1", email: "admin@example.com", isAdmin: true },
      effectiveUser: { id: "user-1", email: "user@example.com", isAdmin: false },
      isImpersonating: true,
    } as any);

    const response = await POST(new Request("http://localhost/api/users/me/deletion", { method: "POST" }) as any);
    expect(response.status).toBe(403);
  });
});
