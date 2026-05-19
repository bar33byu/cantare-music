import { fireEvent, render, screen, waitFor } from "@testing-library/react";
import { beforeEach, describe, expect, it, vi } from "vitest";
import { MidiSetupPanel } from "./MidiSetupPanel";

describe("MidiSetupPanel", () => {
  const request = vi.fn();
  const audioPlayer = {
    isPlaying: false,
    isReady: true,
    currentMs: 2500,
    durationMs: 60000,
    play: vi.fn(),
    pause: vi.fn(),
    seek: vi.fn(),
  };

  beforeEach(() => {
    vi.clearAllMocks();
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
            { index: 0, midiPitch: 60, pitchName: "C4", midiStartSeconds: 0, movementFromPrevious: "start" },
            { index: 1, midiPitch: 62, pitchName: "D4", midiStartSeconds: 1.5, movementFromPrevious: "up" },
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
    render(<MidiSetupPanel songId="song-1" audioPlayer={audioPlayer} request={request} />);

    expect(await screen.findByText("part.mid")).toBeInTheDocument();
    expect(screen.getByText(/3 raw, 2 retained, 1 ignored/)).toBeInTheDocument();

    fireEvent.click(screen.getByText("Resume alignment"));
    fireEvent.pointerDown(await screen.findByTestId("midi-alignment-tap"));

    await waitFor(() => {
      expect(request).toHaveBeenCalledWith("/api/songs/song-1/midi/alignment", expect.objectContaining({
        method: "POST",
        body: JSON.stringify({ action: "tap", timeSeconds: 2.5 }),
      }));
    });
  });

  it("confirms restart inline without using a blocking browser dialog", async () => {
    const confirmSpy = vi.spyOn(window, "confirm");
    render(<MidiSetupPanel songId="song-1" audioPlayer={audioPlayer} request={request} />);

    expect(await screen.findByText("part.mid")).toBeInTheDocument();

    fireEvent.click(screen.getByTestId("midi-restart-alignment"));
    expect(screen.getByText("Restart MIDI alignment?")).toBeInTheDocument();
    expect(confirmSpy).not.toHaveBeenCalled();

    fireEvent.click(screen.getByTestId("midi-confirm-restart"));

    await waitFor(() => {
      expect(request).toHaveBeenCalledWith("/api/songs/song-1/midi/alignment", expect.objectContaining({
        method: "POST",
        body: JSON.stringify({ action: "restart" }),
      }));
    });

    confirmSpy.mockRestore();
  });

  it("positions the piano roll from audio time instead of note slots", async () => {
    const { rerender } = render(<MidiSetupPanel songId="song-1" audioPlayer={audioPlayer} request={request} />);

    expect(await screen.findByText("part.mid")).toBeInTheDocument();
    fireEvent.click(screen.getByText("Resume alignment"));

    const currentNote = await screen.findByTitle("2: D4 Up");
    expect(currentNote).toHaveStyle({ left: "28%" });

    rerender(
      <MidiSetupPanel
        songId="song-1"
        audioPlayer={{ ...audioPlayer, currentMs: 3000 }}
        request={request}
      />
    );

    expect(await screen.findByTitle("2: D4 Up")).toHaveStyle({ left: "22%" });
  });

  it("does not let delayed tap-save responses move the visible alignment backward", async () => {
    let resolveTapSave: ((value: Response) => void) | null = null;
    const delayedRequest = vi.fn(async (url: string, init?: RequestInit) => {
      const body = typeof init?.body === "string" ? JSON.parse(init.body) as { action?: string } : {};
      if (url.endsWith("/midi/alignment") && init?.method === "POST" && body.action === "tap") {
        return new Promise<Response>((resolve) => {
          resolveTapSave = resolve;
        });
      }
      if (url.endsWith("/midi/alignment") && init?.method === "POST") {
        return {
          ok: true,
          json: async () => ({
            alignment: {
              id: "align-1",
              tappedStartTimesSeconds: [1],
              retainedMidiNoteCount: 2,
              isComplete: false,
              updatedAt: "2026-05-18T00:01:00.000Z",
            },
          }),
        } as Response;
      }
      return request(url, init);
    });

    render(<MidiSetupPanel songId="song-1" audioPlayer={audioPlayer} request={delayedRequest} />);

    expect(await screen.findByText("part.mid")).toBeInTheDocument();
    fireEvent.click(screen.getByText("Resume alignment"));
    fireEvent.pointerDown(await screen.findByTestId("midi-alignment-tap"));

    expect(screen.getAllByText("2 / 2 notes").length).toBeGreaterThan(0);

    resolveTapSave?.({
      ok: true,
      json: async () => ({
        alignment: {
          id: "align-1",
          tappedStartTimesSeconds: [1],
          retainedMidiNoteCount: 2,
          isComplete: false,
          updatedAt: "2026-05-18T00:01:01.000Z",
        },
      }),
    } as Response);

    await waitFor(() => {
      expect(delayedRequest).toHaveBeenCalledWith("/api/songs/song-1/midi/alignment", expect.objectContaining({
        body: JSON.stringify({ action: "tap", timeSeconds: 2.5 }),
      }));
    });
    expect(screen.getAllByText("2 / 2 notes").length).toBeGreaterThan(0);
  });
});
