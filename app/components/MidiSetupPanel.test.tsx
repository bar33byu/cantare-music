import { fireEvent, render, screen, waitFor } from "@testing-library/react";
import { beforeEach, describe, expect, it, vi } from "vitest";
import { MidiSetupPanel } from "./MidiSetupPanel";

describe("MidiSetupPanel", () => {
  const request = vi.fn();
  const audioPlayer = {
    currentMs: 2500,
    durationMs: 60000,
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
            { index: 0, midiPitch: 60, pitchName: "C4", midiStartSeconds: 0, midiDurationSeconds: 0.75, movementFromPrevious: "start" },
            { index: 1, midiPitch: 62, pitchName: "D4", midiStartSeconds: 1.5, midiDurationSeconds: 0.5, movementFromPrevious: "up" },
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

  it("shows the simplified MIDI start setup without tap or cleanup controls", async () => {
    render(<MidiSetupPanel songId="song-1" audioPlayer={audioPlayer} request={request} />);

    expect(await screen.findByText("part.mid")).toBeInTheDocument();
    expect(screen.getByText("MIDI start setup")).toBeInTheDocument();
    expect(screen.getByText("2 notes")).toBeInTheDocument();
    expect(screen.getByText("1 / 2 notes")).toBeInTheDocument();
    expect(screen.getByTestId("midi-start-offset-slider")).toBeInTheDocument();
    expect(screen.queryByText("Play audio")).not.toBeInTheDocument();
    expect(screen.queryByText("Undo last tap")).not.toBeInTheDocument();
    expect(screen.queryByText("Re-clean MIDI")).not.toBeInTheDocument();
    expect(screen.queryByText("Full realignment")).not.toBeInTheDocument();
    expect(screen.queryByTestId("midi-short-note-threshold")).not.toBeInTheDocument();
  });

  it("sets a complete MIDI alignment from the current playhead offset", async () => {
    render(<MidiSetupPanel songId="song-1" audioPlayer={audioPlayer} request={request} />);

    expect(await screen.findByText("part.mid")).toBeInTheDocument();
    fireEvent.click(screen.getByTestId("midi-start-offset-use-playhead"));
    fireEvent.click(screen.getByTestId("midi-apply-start-offset"));

    await waitFor(() => {
      expect(request).toHaveBeenCalledWith("/api/songs/song-1/midi/alignment", expect.objectContaining({
        method: "POST",
        body: JSON.stringify({ action: "offset", firstAudioStartSeconds: 2.5 }),
      }));
    });
  });

  it("scrubs the MIDI offset before applying it", async () => {
    render(<MidiSetupPanel songId="song-1" audioPlayer={audioPlayer} request={request} />);

    expect(await screen.findByText("part.mid")).toBeInTheDocument();
    await waitFor(() => {
      expect(screen.getByTestId("midi-offset-note-1")).toHaveStyle({ left: "10%" });
    });

    fireEvent.change(screen.getByTestId("midi-start-offset-slider"), { target: { value: "2.5" } });

    expect(screen.getByText("First MIDI note at 2.50s")).toBeInTheDocument();
    expect(screen.getByTestId("midi-offset-note-1")).toHaveStyle({ left: "28%" });

    fireEvent.click(screen.getByTestId("midi-apply-start-offset"));

    await waitFor(() => {
      expect(request).toHaveBeenCalledWith("/api/songs/song-1/midi/alignment", expect.objectContaining({
        method: "POST",
        body: JSON.stringify({ action: "offset", firstAudioStartSeconds: 2.5 }),
      }));
    });
  });

  it("shows upload guidance before MIDI is uploaded", async () => {
    request.mockResolvedValueOnce({
      ok: true,
      json: async () => ({
        source: null,
        alignment: null,
        summary: {
          hasMidi: false,
          rawNoteCount: 0,
          cleanedNoteCount: 0,
          ignoredShortNoteCount: 0,
          shortNoteThresholdMs: 0,
          alignedCount: 0,
          retainedMidiNoteCount: 0,
          hasCompleteAlignment: false,
          hasDerivedAnswerKey: false,
          latestAlignmentDate: null,
        },
      }),
    });

    render(<MidiSetupPanel songId="song-1" audioPlayer={audioPlayer} request={request} />);

    expect(await screen.findByText("Upload a single-part MIDI file, then line up its first note with the audio.")).toBeInTheDocument();
    expect(screen.getByText("No MIDI")).toBeInTheDocument();
    expect(screen.queryByTestId("midi-start-offset-slider")).not.toBeInTheDocument();
  });

  it("uploads MIDI without sending short-note cleanup settings", async () => {
    const uploadedStatus = {
      source: {
        id: "midi-2",
        originalFilename: "new.mid",
        uploadedAt: "2026-05-18T00:02:00.000Z",
        parseStatus: "parsed",
        rawNoteCount: 1,
        cleanedNoteCount: 1,
        ignoredShortNoteCount: 0,
        cleanupSettings: { shortNoteThresholdMs: 0, simultaneousThresholdMs: 30 },
        cleanedNotes: [
          { index: 0, midiPitch: 60, pitchName: "C4", midiStartSeconds: 0, midiDurationSeconds: 0.75, movementFromPrevious: "start" },
        ],
      },
      alignment: null,
      summary: {
        hasMidi: true,
        rawNoteCount: 1,
        cleanedNoteCount: 1,
        ignoredShortNoteCount: 0,
        shortNoteThresholdMs: 0,
        alignedCount: 0,
        retainedMidiNoteCount: 1,
        hasCompleteAlignment: false,
        hasDerivedAnswerKey: false,
        latestAlignmentDate: null,
      },
    };
    request
      .mockResolvedValueOnce({
        ok: true,
        json: async () => ({
          source: null,
          alignment: null,
          summary: {
            hasMidi: false,
            rawNoteCount: 0,
            cleanedNoteCount: 0,
            ignoredShortNoteCount: 0,
            shortNoteThresholdMs: 0,
            alignedCount: 0,
            retainedMidiNoteCount: 0,
            hasCompleteAlignment: false,
            hasDerivedAnswerKey: false,
            latestAlignmentDate: null,
          },
        }),
      })
      .mockResolvedValueOnce({
        ok: true,
        json: async () => uploadedStatus,
      });

    render(<MidiSetupPanel songId="song-1" audioPlayer={audioPlayer} request={request} />);

    expect(await screen.findByText("Upload a single-part MIDI file, then line up its first note with the audio.")).toBeInTheDocument();
    const file = new File(["midi"], "new.mid", { type: "audio/midi" });
    fireEvent.change(screen.getByTestId("midi-upload-input"), { target: { files: [file] } });

    await waitFor(() => {
      expect(request).toHaveBeenCalledWith("/api/songs/song-1/midi", expect.objectContaining({
        method: "POST",
        body: expect.any(FormData),
      }));
    });
    const postCall = request.mock.calls.find(([url, init]) => url === "/api/songs/song-1/midi" && init?.method === "POST");
    const formData = postCall?.[1]?.body as FormData;
    expect(formData.get("file")).toBe(file);
    expect(formData.has("shortNoteThresholdMs")).toBe(false);
  });
});
