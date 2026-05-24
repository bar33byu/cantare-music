import { beforeEach, describe, expect, it, vi } from "vitest";

vi.mock("../../../../../db/queries", () => ({
  createMidiSource: vi.fn(),
  getLatestCompleteMidiAlignmentForSource: vi.fn(),
  getLatestMidiAlignmentForSource: vi.fn(),
  getLatestMidiSourceForSong: vi.fn(),
  getSegmentsBySongId: vi.fn(),
  getSongById: vi.fn(),
  updateMidiSourceCleanup: vi.fn(),
}));

vi.mock("../../../../../lib/r2", () => ({
  BUCKET: "bucket",
  generateMidiUploadKey: vi.fn(() => "midi/song-1/test.mid"),
  r2Client: { send: vi.fn() },
}));

import { GET, PATCH } from "./route";
import {
  getLatestCompleteMidiAlignmentForSource,
  getLatestMidiAlignmentForSource,
  getLatestMidiSourceForSong,
  getSongById,
  updateMidiSourceCleanup,
} from "../../../../../db/queries";

describe("/api/songs/[id]/midi", () => {
  beforeEach(() => {
    vi.clearAllMocks();
    vi.mocked(getSongById).mockResolvedValue({ id: "song-1" } as any);
  });

  it("returns MIDI status with alignment progress", async () => {
    vi.mocked(getLatestMidiSourceForSong).mockResolvedValue({
      id: "midi-1",
      songId: "song-1",
      originalFilename: "part.mid",
      uploadedAt: "2026-05-18T00:00:00.000Z",
      cleanupSettings: { shortNoteThresholdMs: 100, simultaneousThresholdMs: 30 },
      rawNotes: [],
      cleanedNotes: [],
      rawNoteCount: 10,
      cleanedNoteCount: 8,
      ignoredShortNoteCount: 2,
      parseStatus: "parsed",
    } as any);
    vi.mocked(getLatestMidiAlignmentForSource).mockResolvedValue({
      id: "align-1",
      tappedStartTimesSeconds: [1, 2, 3],
      retainedMidiNoteCount: 8,
      isComplete: false,
      updatedAt: "2026-05-18T01:00:00.000Z",
    } as any);
    vi.mocked(getLatestCompleteMidiAlignmentForSource).mockResolvedValue(null);

    const response = await GET(new Request("http://localhost/api/songs/song-1/midi") as any, {
      params: Promise.resolve({ id: "song-1" }),
    });
    const data = await response.json();

    expect(response.status).toBe(200);
    expect(data.summary).toEqual(expect.objectContaining({
      hasMidi: true,
      rawNoteCount: 10,
      cleanedNoteCount: 8,
      alignedCount: 3,
      hasDerivedAnswerKey: false,
    }));
  });

  it("defaults empty MIDI status to no short-note filtering", async () => {
    vi.mocked(getLatestMidiSourceForSong).mockResolvedValue(null);

    const response = await GET(new Request("http://localhost/api/songs/song-1/midi") as any, {
      params: Promise.resolve({ id: "song-1" }),
    });
    const data = await response.json();

    expect(response.status).toBe(200);
    expect(data.summary.shortNoteThresholdMs).toBe(0);
  });

  it("re-cleans a MIDI source when the short-note threshold changes", async () => {
    vi.mocked(getLatestMidiSourceForSong).mockResolvedValue({
      id: "midi-1",
      songId: "song-1",
      originalFilename: "part.mid",
      uploadedAt: "2026-05-18T00:00:00.000Z",
      cleanupSettings: { shortNoteThresholdMs: 100, simultaneousThresholdMs: 30 },
      rawNotes: [
        { index: 0, trackIndex: 0, midiPitch: 60, pitchName: "C4", velocity: 90, midiStartTick: 0, midiDurationTicks: 20, midiStartSeconds: 0, midiDurationSeconds: 0.05 },
        { index: 1, trackIndex: 0, midiPitch: 62, pitchName: "D4", velocity: 90, midiStartTick: 100, midiDurationTicks: 120, midiStartSeconds: 0.5, midiDurationSeconds: 0.25 },
      ],
      cleanedNotes: [],
      rawNoteCount: 2,
      cleanedNoteCount: 2,
      ignoredShortNoteCount: 0,
      parseStatus: "parsed",
    } as any);
    vi.mocked(updateMidiSourceCleanup).mockResolvedValue({} as any);

    const response = await PATCH(new Request("http://localhost/api/songs/song-1/midi", {
      method: "PATCH",
      body: JSON.stringify({ shortNoteThresholdMs: 100 }),
    }) as any, {
      params: Promise.resolve({ id: "song-1" }),
    });

    expect(response.status).toBe(200);
    expect(updateMidiSourceCleanup).toHaveBeenCalledWith("midi-1", "default", expect.objectContaining({
      cleanedNoteCount: 1,
      ignoredShortNoteCount: 1,
    }));
  });
});
