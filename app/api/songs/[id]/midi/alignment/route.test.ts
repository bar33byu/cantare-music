import { beforeEach, describe, expect, it, vi } from "vitest";

vi.mock("../../../../../../db/queries", () => ({
  getLatestMidiAlignmentForSource: vi.fn(),
  getLatestMidiSourceForSong: vi.fn(),
  getSongById: vi.fn(),
  upsertMidiAlignment: vi.fn(),
}));

import { POST } from "./route";
import {
  getLatestMidiAlignmentForSource,
  getLatestMidiSourceForSong,
  getSongById,
  upsertMidiAlignment,
} from "../../../../../../db/queries";

describe("POST /api/songs/[id]/midi/alignment", () => {
  beforeEach(() => {
    vi.clearAllMocks();
    vi.mocked(getSongById).mockResolvedValue({ id: "song-1" } as any);
    vi.mocked(getLatestMidiSourceForSong).mockResolvedValue({
      id: "midi-1",
      songId: "song-1",
      cleanedNoteCount: 3,
      cleanedNotes: [
        { index: 0, midiPitch: 60, pitchName: "C4", midiStartSeconds: 0.5, midiDurationSeconds: 1, movementFromPrevious: "start" },
        { index: 1, midiPitch: 62, pitchName: "D4", midiStartSeconds: 2, midiDurationSeconds: 1, movementFromPrevious: "up" },
        { index: 2, midiPitch: 64, pitchName: "E4", midiStartSeconds: 3, midiDurationSeconds: 1, movementFromPrevious: "up" },
      ],
    } as any);
    vi.mocked(upsertMidiAlignment).mockImplementation(async (data) => ({
      id: data.id ?? "align-new",
      songId: data.songId,
      midiSourceId: data.midiSourceId,
      tappedStartTimesSeconds: data.tappedStartTimesSeconds,
      retainedMidiNoteCount: data.retainedMidiNoteCount,
      isComplete: data.tappedStartTimesSeconds.length >= data.retainedMidiNoteCount,
      status: data.tappedStartTimesSeconds.length >= data.retainedMidiNoteCount ? "complete" : "partial",
      createdAt: "2026-05-18T00:00:00.000Z",
      updatedAt: "2026-05-18T00:00:00.000Z",
    }));
  });

  it("appends an alignment tap to the next note index", async () => {
    vi.mocked(getLatestMidiAlignmentForSource).mockResolvedValue({
      id: "align-1",
      songId: "song-1",
      midiSourceId: "midi-1",
      tappedStartTimesSeconds: [1.5],
      retainedMidiNoteCount: 3,
      isComplete: false,
      status: "partial",
      createdAt: "2026-05-18T00:00:00.000Z",
      updatedAt: "2026-05-18T00:00:00.000Z",
    } as any);

    const response = await POST(new Request("http://localhost/api/songs/song-1/midi/alignment", {
      method: "POST",
      body: JSON.stringify({ action: "tap", timeSeconds: 2.5 }),
    }) as any, {
      params: Promise.resolve({ id: "song-1" }),
    });
    const data = await response.json();

    expect(response.status).toBe(200);
    expect(data.alignment.tappedStartTimesSeconds).toEqual([1.5, 2.5]);
    expect(upsertMidiAlignment).toHaveBeenCalledWith(expect.objectContaining({
      id: "align-1",
      tappedStartTimesSeconds: [1.5, 2.5],
    }), "default");
  });

  it("resumes alignment from a selected note", async () => {
    vi.mocked(getLatestMidiAlignmentForSource).mockResolvedValue({
      id: "align-1",
      songId: "song-1",
      midiSourceId: "midi-1",
      tappedStartTimesSeconds: [1, 2, 3],
      retainedMidiNoteCount: 3,
      isComplete: true,
      status: "complete",
      createdAt: "2026-05-18T00:00:00.000Z",
      updatedAt: "2026-05-18T00:00:00.000Z",
    } as any);

    const response = await POST(new Request("http://localhost/api/songs/song-1/midi/alignment", {
      method: "POST",
      body: JSON.stringify({ action: "resumeFrom", noteIndex: 1 }),
    }) as any, {
      params: Promise.resolve({ id: "song-1" }),
    });
    const data = await response.json();

    expect(response.status).toBe(200);
    expect(data.alignment.tappedStartTimesSeconds).toEqual([1]);
  });

  it("creates a complete alignment from the first audio start offset", async () => {
    vi.mocked(getLatestMidiAlignmentForSource).mockResolvedValue(null);

    const response = await POST(new Request("http://localhost/api/songs/song-1/midi/alignment", {
      method: "POST",
      body: JSON.stringify({ action: "offset", firstAudioStartSeconds: 3 }),
    }) as any, {
      params: Promise.resolve({ id: "song-1" }),
    });
    const data = await response.json();

    expect(response.status).toBe(200);
    expect(data.alignment.tappedStartTimesSeconds).toEqual([3, 4.5, 5.5]);
    expect(upsertMidiAlignment).toHaveBeenCalledWith(expect.objectContaining({
      tappedStartTimesSeconds: [3, 4.5, 5.5],
      retainedMidiNoteCount: 3,
    }), "default");
  });
});
