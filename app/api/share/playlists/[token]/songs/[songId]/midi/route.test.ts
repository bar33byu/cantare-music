import { beforeEach, describe, expect, it, vi } from "vitest";

vi.mock("../../../../../../../../db/queries", () => ({
  getSharedPlaylistByToken: vi.fn(),
}));

vi.mock("../../../../../../../lib/midiStatus", () => ({
  buildMidiStatus: vi.fn(),
}));

import { getSharedPlaylistByToken } from "../../../../../../../../db/queries";
import { buildMidiStatus } from "../../../../../../../lib/midiStatus";
import { GET } from "./route";

describe("GET /api/share/playlists/[token]/songs/[songId]/midi", () => {
  beforeEach(() => {
    vi.clearAllMocks();
    vi.mocked(getSharedPlaylistByToken).mockResolvedValue({
      id: "playlist-1",
      owner: { id: "owner-user", displayName: "Owner", username: "owner" },
      songs: [{ id: "song-1" }],
    } as any);
    vi.mocked(buildMidiStatus).mockResolvedValue({
      source: { id: "private-midi-source", rawNotes: [{ midiPitch: 60 }] },
      segmentAnswerKeys: { "segment-1": { segmentId: "segment-1", notes: [] } },
      summary: { hasMidi: true, hasDerivedAnswerKey: true },
    } as any);
  });

  it("returns derived contour data for a song in an active shared playlist", async () => {
    const response = await GET(new Request("http://localhost") as any, {
      params: Promise.resolve({ token: "share-token", songId: "song-1" }),
    });
    const payload = await response.json();

    expect(response.status).toBe(200);
    expect(buildMidiStatus).toHaveBeenCalledWith("song-1", "owner-user");
    expect(payload.segmentAnswerKeys).toBeTruthy();
    expect(payload.summary).toEqual(expect.objectContaining({ hasMidi: true }));
    expect(payload.source).toBeUndefined();
  });

  it("does not expose MIDI data for a song outside the shared playlist", async () => {
    const response = await GET(new Request("http://localhost") as any, {
      params: Promise.resolve({ token: "share-token", songId: "other-song" }),
    });

    expect(response.status).toBe(404);
    expect(buildMidiStatus).not.toHaveBeenCalled();
  });

  it("returns 404 when sharing is no longer active", async () => {
    vi.mocked(getSharedPlaylistByToken).mockResolvedValue(null);

    const response = await GET(new Request("http://localhost") as any, {
      params: Promise.resolve({ token: "inactive-token", songId: "song-1" }),
    });

    expect(response.status).toBe(404);
    expect(buildMidiStatus).not.toHaveBeenCalled();
  });
});
