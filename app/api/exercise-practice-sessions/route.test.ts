import { beforeEach, describe, expect, it, vi } from "vitest";

vi.mock("../../../db/queries", () => ({
  createVocalExercisePracticeSession: vi.fn(),
}));

vi.mock("../_user", () => ({
  resolveAuthenticatedRequestContext: vi.fn(),
}));

import { createVocalExercisePracticeSession } from "../../../db/queries";
import { resolveAuthenticatedRequestContext } from "../_user";
import { POST } from "./route";

describe("warmup practice session creation", () => {
  beforeEach(() => vi.clearAllMocks());

  it("requires an authenticated session", async () => {
    vi.mocked(resolveAuthenticatedRequestContext).mockResolvedValue(null);
    const response = await POST(new Request("http://localhost/api/exercise-practice-sessions", { method: "POST" }) as never);
    expect(response.status).toBe(401);
    expect(createVocalExercisePracticeSession).not.toHaveBeenCalled();
  });

  it("stores the recorded warmup mode and set identity", async () => {
    vi.mocked(resolveAuthenticatedRequestContext).mockResolvedValue({
      actor: { id: "user-1" },
      effectiveUser: { id: "user-1" },
      isImpersonating: false,
    } as never);
    vi.mocked(createVocalExercisePracticeSession).mockResolvedValue({ id: "session-1" } as never);
    const response = await POST(new Request("http://localhost/api/exercise-practice-sessions", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({
        id: "session-1",
        exerciseId: "recorded-warmup-01",
        startedAt: "2026-07-28T12:00:00.000Z",
        audioVersion: "part",
        practiceMode: "set",
        routineId: "set-1",
      }),
    }) as never);

    expect(response.status).toBe(201);
    expect(createVocalExercisePracticeSession).toHaveBeenCalledWith(expect.objectContaining({
      id: "session-1",
      userId: "user-1",
      exerciseId: "recorded-warmup-01",
      audioVersion: "part",
      practiceMode: "set",
      routineId: "set-1",
    }));
  });
});
