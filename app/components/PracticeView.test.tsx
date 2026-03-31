import React from "react";
import { render, screen, fireEvent, waitFor, within } from "@testing-library/react";
import "@testing-library/jest-dom";
import { vi } from "vitest";
import PracticeView from "./PracticeView";
import { Song, MemoryRating } from "../types/index";
import { SessionState } from "../lib/sessionReducer";

const mockPlay = vi.fn();
const mockPause = vi.fn();
const mockSeek = vi.fn();
const mockUseAudioPlayer = vi.fn();
const mockFetch = vi.fn();

global.fetch = mockFetch;

vi.mock("./SegmentCard", () => ({
  default: ({ segment, onRate, isLocked, onToggleLock }: { segment: { id: string; label: string }; onRate: (r: MemoryRating) => void; isLocked: boolean; onToggleLock: () => void }) => (
    <div data-testid="mock-segment-card" data-segment-id={segment.id}>
      <span>{segment.label}</span>
      <button data-testid="rate-btn" onClick={() => onRate(4 as MemoryRating)}>Rate 4</button>
      <button data-testid="lock-toggle" onClick={onToggleLock}>{isLocked ? "Locked" : "Unlocked"}</button>
    </div>
  ),
}));

vi.mock("./KnowledgeBar", () => ({
  default: ({ percent, label }: { percent: number; label?: string }) => (
    <div data-testid="mock-knowledge-bar" data-percent={percent}>{label}</div>
  ),
}));

vi.mock("../hooks/useAudioPlayer", () => ({
  useAudioPlayer: (...args: unknown[]) => mockUseAudioPlayer(...args),
}));

vi.mock("./AudioPlayer", () => ({
  AudioPlayer: ({ audioUrl, currentMs, durationMs, segmentStartMs, segmentEndMs, restartLabel, onPlayPause, onRestartSegment, onSeekSong }: { audioUrl: string; currentMs: number; durationMs: number; segmentStartMs: number; segmentEndMs: number; restartLabel?: string; onPlayPause: () => void; onRestartSegment: () => void; onSeekSong: (ms: number) => void; }) => (
    <div
      data-testid="mock-audio-player"
      data-audio-url={audioUrl}
      data-current-ms={currentMs}
      data-duration-ms={durationMs}
      data-start-ms={segmentStartMs}
      data-end-ms={segmentEndMs}
      data-restart-label={restartLabel ?? ""}
    >
      <button data-testid="mock-play-toggle" onClick={onPlayPause}>toggle</button>
      <button data-testid="mock-restart" onClick={onRestartSegment}>restart</button>
      <button data-testid="mock-seek-song" onClick={() => onSeekSong(6000)}>seek song</button>
    </div>
  ),
}));

const makeSong = (numSegments = 3): Song => ({
  id: "song-1",
  title: "Amazing Grace",
  composer: "John Newton",
  audioUrl: "https://cdn.example.com/audio/song-1/audio.mp3",
  segments: Array.from({ length: numSegments }, (_, i) => ({
    id: `seg-${i}`,
    songId: "song-1",
    order: i,
    label: `Verse ${i + 1}`,
    lyricText: `Lyrics for verse ${i + 1}`,
    startMs: i * 4000,
    endMs: (i + 1) * 4000,
  })),
  createdAt: new Date().toISOString(),
  updatedAt: new Date().toISOString(),
});

const makeSession = (song: Song): SessionState => ({
  id: "session-1",
  songId: song.id,
  currentSegmentIndex: 0,
  isLocked: false,
  ratings: [],
  startedAt: new Date().toISOString(),
  completedAt: undefined,
  currentSongId: song.id,
});

describe("PracticeView", () => {
  const renderAndWaitForRatings = async (song: Song, session: SessionState = makeSession(song)) => {
    render(<PracticeView song={song} initialSession={session} />);
    await waitFor(() => {
      expect(mockFetch).toHaveBeenCalledWith(`/api/songs/${song.id}/ratings`);
    });
    await waitFor(() => {
      expect(screen.queryByTestId("ratings-loading-skeleton")).not.toBeInTheDocument();
    });
  };

  beforeEach(() => {
    vi.clearAllMocks();
    mockFetch.mockResolvedValue({ ok: true, json: async () => ({ ratings: [] }) });
    mockUseAudioPlayer.mockReturnValue({
      isPlaying: false,
      isReady: true,
      currentMs: 0,
      durationMs: 12000,
      playbackError: null,
      debugInfo: {},
      play: mockPlay,
      pause: mockPause,
      seek: mockSeek,
    });
  });

  it("renders full-screen layout regions", async () => {
    const song = makeSong();
    await renderAndWaitForRatings(song);
    expect(screen.getByTestId("practice-layout")).toBeInTheDocument();
    expect(screen.getByTestId("practice-top-bar")).toBeInTheDocument();
    expect(screen.getByTestId("practice-main")).toBeInTheDocument();
    expect(screen.getByTestId("practice-transport")).toBeInTheDocument();
  });

  it("renders knowledge bar in the top section", async () => {
    const song = makeSong();
    await renderAndWaitForRatings(song);
    await waitFor(() => {
      const topBar = screen.getByTestId("practice-top-bar");
      expect(within(topBar).getByTestId("mock-knowledge-bar")).toBeInTheDocument();
    });
  });

  it("left arrow is disabled on first segment", async () => {
    const song = makeSong(3);
    await renderAndWaitForRatings(song);
    expect(screen.getByTestId("prev-btn")).toBeDisabled();
  });

  it("right arrow is disabled on last segment", async () => {
    const song = makeSong(2);
    const session = makeSession(song);
    await renderAndWaitForRatings(song, session);
    fireEvent.click(screen.getByTestId("next-btn"));
    expect(screen.getByTestId("next-btn")).toBeDisabled();
  });

  it("clicking right arrow advances segment", async () => {
    const song = makeSong(3);
    await renderAndWaitForRatings(song);
    fireEvent.click(screen.getByTestId("next-btn"));
    expect(screen.getByTestId("segment-counter")).toHaveTextContent("Segment 2 of 3");
  });

  it("clicking left arrow goes to previous segment", async () => {
    const song = makeSong(3);
    const session = makeSession(song);
    session.currentSegmentIndex = 1;
    await renderAndWaitForRatings(song, session);
    fireEvent.click(screen.getByTestId("prev-btn"));
    expect(screen.getByTestId("segment-counter")).toHaveTextContent("Segment 1 of 3");
  });

  it("renders audio player in bottom transport section", async () => {
    const song = makeSong(3);
    await renderAndWaitForRatings(song);
    const transport = screen.getByTestId("practice-transport");
    expect(within(transport).getByTestId("mock-audio-player")).toBeInTheDocument();
  });

  it("fetches historical ratings on mount", async () => {
    const song = makeSong(2);
    render(<PracticeView song={song} initialSession={makeSession(song)} />);
    await waitFor(() => {
      expect(mockFetch).toHaveBeenCalledWith(`/api/songs/${song.id}/ratings`);
    });
  });

  it("shows loading skeleton while ratings request is in flight", () => {
    mockFetch.mockImplementation(() => new Promise(() => undefined));
    const song = makeSong(2);
    render(<PracticeView song={song} initialSession={makeSession(song)} />);
    expect(screen.getByTestId("ratings-loading-skeleton")).toBeInTheDocument();
  });

  it("shows ratings load error and still renders knowledge bar", async () => {
    mockFetch.mockRejectedValue(new Error("network"));
    const song = makeSong(2);
    render(<PracticeView song={song} initialSession={makeSession(song)} />);

    await waitFor(() => {
      expect(screen.getByTestId("ratings-load-error")).toBeInTheDocument();
      expect(screen.getByTestId("mock-knowledge-bar")).toHaveAttribute("data-percent", "0");
    });
  });

  it("plays full piece when toggling play", async () => {
    const song = makeSong(3);
    await renderAndWaitForRatings(song);
    fireEvent.click(screen.getByTestId("mock-play-toggle"));
    expect(mockPlay).toHaveBeenCalledWith(0, 12000);
  });

  it("restarts current segment on restart action", async () => {
    const song = makeSong(3);
    await renderAndWaitForRatings(song);
    fireEvent.click(screen.getByTestId("mock-restart"));
    expect(mockPlay).toHaveBeenCalledWith(0, 4000);
  });

  it("shows no-segments fallback and full-piece restart label", async () => {
    const song = makeSong(0);
    await renderAndWaitForRatings(song);
    expect(screen.getByTestId("segment-counter")).toHaveTextContent("Full piece playback");
    expect(screen.getByTestId("no-segments")).toBeInTheDocument();
    expect(screen.getByTestId("mock-audio-player")).toHaveAttribute("data-restart-label", "Restart Piece");
  });
});
