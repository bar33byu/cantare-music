import { fireEvent, render, screen, waitFor } from "@testing-library/react";
import { beforeEach, describe, expect, it, vi } from "vitest";
import { MidiSetupPanel } from "./MidiSetupPanel";
import { useAudioPlayer } from "../hooks/useAudioPlayer";

vi.mock("../hooks/useAudioPlayer", () => ({
  useAudioPlayer: vi.fn(),
}));

describe("MidiSetupPanel", () => {
  const request = vi.fn();

  beforeEach(() => {
    vi.clearAllMocks();
    vi.mocked(useAudioPlayer).mockReturnValue({
      isPlaying: false,
      isReady: true,
      currentMs: 2500,
      durationMs: 60000,
      playbackError: null,
      debugInfo: {} as any,
      play: vi.fn(),
      pause: vi.fn(),
      seek: vi.fn(),
      setPlaybackEndMs: vi.fn(),
    });
    request.mockResolvedValue({
      ok: true,
      json: async () => ({
        source: {
          id: "midi-1",
          originalFilename: "part.mid",
          uploadedAt: "2026-05-18T00:00:00.000Z",
          parseStatus: "parsed",
          rawNoteCount: 3,
          cleanedNoteCount: 2,
          ignoredShortNoteCount: 1,
          cleanupSettings: { shortNoteThresholdMs: 100, simultaneousThresholdMs: 30 },
          cleanedNotes: [
            { index: 0, midiPitch: 60, pitchName: "C4", movementFromPrevious: "start" },
            { index: 1, midiPitch: 62, pitchName: "D4", movementFromPrevious: "up" },
          ],
        },
        alignment: {
          id: "align-1",
          tappedStartTimesSeconds: [1],
          retainedMidiNoteCount: 2,
          isComplete: false,
          updatedAt: "2026-05-18T00:01:00.000Z",
        },
        summary: {
          hasMidi: true,
          rawNoteCount: 3,
          cleanedNoteCount: 2,
          ignoredShortNoteCount: 1,
          shortNoteThresholdMs: 100,
          alignedCount: 1,
          retainedMidiNoteCount: 2,
          hasCompleteAlignment: false,
          hasDerivedAnswerKey: false,
          latestAlignmentDate: "2026-05-18T00:01:00.000Z",
        },
      }),
    });
  });

  it("shows MIDI status and records alignment taps", async () => {
    render(<MidiSetupPanel songId="song-1" audioUrl="/song.mp3" request={request} />);

    expect(await screen.findByText("part.mid")).toBeInTheDocument();
    expect(screen.getByText(/3 raw, 2 retained, 1 ignored/)).toBeInTheDocument();

    fireEvent.click(screen.getByText("Resume alignment"));
    fireEvent.click(await screen.findByTestId("midi-alignment-tap"));

    await waitFor(() => {
      expect(request).toHaveBeenCalledWith("/api/songs/song-1/midi/alignment", expect.objectContaining({
        method: "POST",
        body: JSON.stringify({ action: "tap", timeSeconds: 2.5 }),
      }));
    });
  });
});
