import { beforeEach, describe, expect, it, vi } from "vitest";

vi.mock("../../../../db/queries", () => ({
  deleteVocalExercise: vi.fn(),
  getVocalExercises: vi.fn(),
  updateVocalExercise: vi.fn(),
}));

vi.mock("../../_user", () => ({
  resolveAuthenticatedRequestContext: vi.fn(),
}));

import { getVocalExercises, updateVocalExercise } from "../../../../db/queries";
import { resolveAuthenticatedRequestContext } from "../../_user";
import { PATCH } from "./route";

const exercise = {
  id: "recorded-warmup-01",
  title: "Warmup 1",
  lyricHint: "Mah",
  audioKey: "audio/warmups/01.mp3",
  audioUrl: "https://audio.example.com/audio/warmups/01.mp3",
  sourceMidiFile: "02 Track 2.mp3",
  exerciseStartBeat: 0,
  tempoBpm: 120,
  timeSignature: { numerator: 4, denominator: 4 },
  durationBeats: 0,
  events: [],
  createdAt: "2026-07-27T00:00:00.000Z",
};

describe("recorded warmup updates", () => {
  beforeEach(() => {
    vi.clearAllMocks();
    vi.mocked(resolveAuthenticatedRequestContext).mockResolvedValue({ actor: { id: "admin-1", isAdmin: true } } as never);
    vi.mocked(getVocalExercises).mockResolvedValue([exercise]);
  });

  it("saves an administrator's title and lyric hints", async () => {
    const updated = { ...exercise, title: "Lip trill", lyricHint: "Keep the lips easy." };
    vi.mocked(updateVocalExercise).mockResolvedValue(updated);
    const response = await PATCH(new Request("http://localhost/api/exercises/recorded-warmup-01", {
      method: "PATCH",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ title: updated.title, lyricHint: updated.lyricHint }),
    }) as never, { params: Promise.resolve({ id: exercise.id }) });

    expect(response.status).toBe(200);
    expect(updateVocalExercise).toHaveBeenCalledWith(expect.objectContaining({ title: "Lip trill", lyricHint: "Keep the lips easy." }));
  });

  it("rejects overly long lyric hints", async () => {
    const response = await PATCH(new Request("http://localhost/api/exercises/recorded-warmup-01", {
      method: "PATCH",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ lyricHint: "x".repeat(2_001) }),
    }) as never, { params: Promise.resolve({ id: exercise.id }) });

    expect(response.status).toBe(400);
    expect(updateVocalExercise).not.toHaveBeenCalled();
  });
});
