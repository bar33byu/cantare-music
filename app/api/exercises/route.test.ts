import { beforeEach, describe, expect, it, vi } from "vitest";

vi.mock("../../../db/queries", () => ({
  createVocalExercise: vi.fn(),
  getVocalExercises: vi.fn(),
}));

vi.mock("../_user", () => ({
  getRequestCookie: vi.fn(),
  resolveRequestContext: vi.fn(),
}));

vi.mock("../../lib/vocalExercise", () => ({
  parseVocalExerciseMidi: vi.fn(),
}));

import { createVocalExercise, getVocalExercises } from "../../../db/queries";
import { getRequestCookie, resolveRequestContext } from "../_user";
import { parseVocalExerciseMidi } from "../../lib/vocalExercise";
import { GET, POST } from "./route";

const exercise = {
  id: "exercise-1",
  title: "Triad",
  sourceMidiFile: "triad.mid",
  exerciseStartBeat: 1,
  tempoBpm: 90,
  timeSignature: { numerator: 4, denominator: 4 },
  durationBeats: 4,
  events: [],
  createdAt: "2026-06-21T00:00:00.000Z",
};

describe("exercise catalog route", () => {
  beforeEach(() => vi.clearAllMocks());

  it("returns the shared catalog without authentication", async () => {
    vi.mocked(getVocalExercises).mockResolvedValue([exercise]);
    const response = await GET();
    expect(response.status).toBe(200);
    expect(await response.json()).toEqual({ exercises: [exercise] });
  });

  it("rejects exercise uploads without an admin session", async () => {
    vi.mocked(getRequestCookie).mockReturnValue(undefined);
    const response = await POST(new Request("http://localhost/api/exercises", { method: "POST" }) as never);
    expect(response.status).toBe(403);
    expect(createVocalExercise).not.toHaveBeenCalled();
  });

  it("stores parsed MIDI for an authenticated admin", async () => {
    vi.mocked(getRequestCookie).mockReturnValue("session-token");
    vi.mocked(resolveRequestContext).mockResolvedValue({
      actor: { id: "admin-1", isAdmin: true },
      effectiveUser: { id: "admin-1", isAdmin: true },
      isImpersonating: false,
    } as never);
    vi.mocked(parseVocalExerciseMidi).mockReturnValue(exercise);
    vi.mocked(createVocalExercise).mockResolvedValue(exercise);
    const formData = new FormData();
    formData.set("file", new File([new Uint8Array([1])], "triad.mid"));
    formData.set("exerciseStartBeat", "1");
    const response = await POST({ formData: async () => formData } as never);
    expect(response.status).toBe(201);
    expect(createVocalExercise).toHaveBeenCalledWith(exercise, "admin-1");
  });
});
