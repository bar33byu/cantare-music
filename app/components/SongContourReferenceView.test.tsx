import React from "react";
import { render, screen, waitFor } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import "@testing-library/jest-dom";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { SongContourReferenceView } from "./SongContourReferenceView";
import type { Song } from "../types";

const mockPlay = vi.fn();
const mockPause = vi.fn();

vi.mock("../hooks/useAudioPlayer", () => ({
  useAudioPlayer: () => ({
    isPlaying: false,
    currentMs: 0,
    play: mockPlay,
    pause: mockPause,
  }),
}));

const makeSong = (): Song => ({
  id: "song-1",
  title: "Reference Song",
  artist: "Composer",
  audioUrl: "https://example.com/audio.mp3",
  segments: [
    {
      id: "seg-1",
      songId: "song-1",
      order: 0,
      label: "Verse 1",
      lyricText: "First verse words",
      startMs: 0,
      endMs: 4000,
    },
    {
      id: "seg-2",
      songId: "song-1",
      order: 1,
      label: "Verse 2",
      lyricText: "Second verse words",
      startMs: 4000,
      endMs: 8000,
    },
  ],
  createdAt: new Date(0).toISOString(),
});

describe("SongContourReferenceView", () => {
  beforeEach(() => {
    vi.clearAllMocks();
    global.fetch = vi.fn().mockImplementation((url: string) => Promise.resolve({
      ok: true,
      json: async () => url.endsWith("/tap-heatmap") ? ({
        heatMapBySegment: {
          "seg-1": {
            "midi-contour-seg-1-1": { sessionCount: 4, missCount: 4, missRate: 1 },
          },
        },
      }) : ({
        segmentAnswerKeys: {
          "seg-1": {
            segmentId: "seg-1",
            midiSourceId: "midi-1",
            alignmentId: "alignment-1",
            taps: [],
            notes: [
              {
                sourceWholeSongNoteIndex: 1,
                segmentId: "seg-1",
                segmentLocalStartTimeSeconds: 0,
                midiPitch: 60,
                pitchName: "C4",
                movementFromPrevious: "start",
                midiDurationSeconds: 0.3,
                effectiveDurationSeconds: 0.3,
              },
              {
                sourceWholeSongNoteIndex: 2,
                segmentId: "seg-1",
                segmentLocalStartTimeSeconds: 0.5,
                midiPitch: 64,
                pitchName: "E4",
                movementFromPrevious: "up",
                midiDurationSeconds: 0.4,
                effectiveDurationSeconds: 0.4,
              },
            ],
          },
        },
      }),
    })) as unknown as typeof fetch;
  });

  afterEach(() => {
    vi.restoreAllMocks();
    vi.unstubAllGlobals();
  });

  it("renders stacked contour cards with segment titles and optional lyrics", async () => {
    render(<SongContourReferenceView song={makeSong()} userId="user-1" onBack={vi.fn()} />);

    expect(screen.getByText("Reference Song")).toBeInTheDocument();
    expect(screen.getByText("Composer")).toBeInTheDocument();

    await waitFor(() => {
      expect(screen.getByTestId("contour-reference-card-seg-1")).toBeInTheDocument();
    });

    expect(screen.getByText("Verse 1")).toBeInTheDocument();
    expect(screen.getByText("First verse words")).toBeInTheDocument();
    expect(screen.getByTestId("contour-reference-scroller-seg-1")).toHaveClass("overflow-x-auto", "snap-mandatory");
    expect(screen.getByTestId("pitch-contour-thumbnail")).toBeInTheDocument();
    expect(screen.queryByText("Verse 2")).not.toBeInTheDocument();
    expect(global.fetch).toHaveBeenCalledWith(
      "/api/songs/song-1/midi",
      expect.objectContaining({
        cache: "no-store",
        headers: expect.objectContaining({ "X-User-ID": "user-1" }),
      })
    );
    expect(global.fetch).toHaveBeenCalledWith(
      "/api/songs/song-1/tap-heatmap",
      expect.objectContaining({
        cache: "no-store",
        headers: expect.objectContaining({ "X-User-ID": "user-1" }),
      })
    );
    await waitFor(() => {
      expect(screen.getAllByTestId("pitch-contour-thumbnail-note")[0]).toHaveAttribute("fill", "rgb(239 68 68)");
    });
  });

  it("plays the selected segment when its contour is clicked", async () => {
    render(<SongContourReferenceView song={makeSong()} onBack={vi.fn()} />);

    const playButton = await screen.findByRole("button", { name: "Play Verse 1" });
    await userEvent.click(playButton);

    expect(mockPlay).toHaveBeenCalledWith(0, 4000);
  });

  it("prints the reference sheet", async () => {
    const print = vi.fn();
    vi.stubGlobal("print", print);

    render(<SongContourReferenceView song={makeSong()} onBack={vi.fn()} />);

    await userEvent.click(screen.getByRole("button", { name: "Print contour reference" }));

    expect(print).toHaveBeenCalled();
  });
});
