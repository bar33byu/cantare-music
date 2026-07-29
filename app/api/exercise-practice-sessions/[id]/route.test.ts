import { beforeEach, describe, expect, it, vi } from "vitest";

vi.mock("../../../../db/queries", () => ({
  finishVocalExercisePracticeSession: vi.fn(),
}));

vi.mock("../../_user", () => ({
  resolveAuthenticatedRequestContext: vi.fn(),
}));

import { finishVocalExercisePracticeSession } from "../../../../db/queries";
import { resolveAuthenticatedRequestContext } from "../../_user";
import { PATCH } from "./route";

describe("warmup practice session completion", () => {
  beforeEach(() => vi.clearAllMocks());

  it("requires an authenticated session", async () => {
    vi.mocked(resolveAuthenticatedRequestContext).mockResolvedValue(null);
    const response = await PATCH(
      new Request("http://localhost/api/exercise-practice-sessions/session-1", { method: "PATCH" }) as never,
      { params: Promise.resolve({ id: "session-1" }) }
    );
    expect(response.status).toBe(401);
    expect(finishVocalExercisePracticeSession).not.toHaveBeenCalled();
  });

  it("stores playback duration, mixed mode, result, and completed set status", async () => {
    vi.mocked(resolveAuthenticatedRequestContext).mockResolvedValue({
      actor: { id: "user-1" },
      effectiveUser: { id: "user-1" },
      isImpersonating: false,
    } as never);
    vi.mocked(finishVocalExercisePracticeSession).mockResolvedValue({ id: "session-1" } as never);
    const response = await PATCH(new Request("http://localhost/api/exercise-practice-sessions/session-1", {
      method: "PATCH",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({
        completedAt: "2026-07-28T12:01:00.000Z",
        durationSeconds: 42.5,
        audioVersion: "mixed",
        completionStatus: "completed",
        routineCompleted: true,
      }),
    }) as never, { params: Promise.resolve({ id: "session-1" }) });

    expect(response.status).toBe(200);
    expect(finishVocalExercisePracticeSession).toHaveBeenCalledWith(expect.objectContaining({
      id: "session-1",
      userId: "user-1",
      durationSeconds: 42.5,
      audioVersion: "mixed",
      completionStatus: "completed",
      routineCompleted: true,
    }));
  });
});
