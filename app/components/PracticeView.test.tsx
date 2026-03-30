import React from "react";
import { render, screen, fireEvent } from "@testing-library/react";
import "@testing-library/jest-dom";
import { vi } from "vitest";
import PracticeView from "./PracticeView";
import { Song, MemoryRating } from "../types/index";
import { SessionState } from "../lib/sessionReducer";

const mockPlay = vi.fn();
const mockPause = vi.fn();
const mockSeek = vi.fn();
const mockUseAudioPlayer = vi.fn();

// Mock SegmentCard to expose onRate so we can trigger ratings
vi.mock("./SegmentCard", () => ({
  default: ({
    segment,
    onRate,
    isLocked,
    onToggleLock,
  }: {
    segment: { id: string; label: string };
    currentRating?: number;
    onRate: (r: MemoryRating) => void;
    isLocked: boolean;
    onToggleLock: () => void;
  }) => (
    <div data-testid="mock-segment-card" data-segment-id={segment.id}>
      <span>{segment.label}</span>
      <button data-testid="rate-btn" onClick={() => onRate(4 as MemoryRating)}>
        Rate 4
      </button>
      <button data-testid="lock-toggle" onClick={onToggleLock}>
        {isLocked ? "Locked" : "Unlocked"}
      </button>
    </div>
  ),
}));

// Mock KnowledgeBar to expose percent for assertions
vi.mock("./KnowledgeBar", () => ({
  default: ({ percent, label }: { percent: number; label?: string }) => (
    <div data-testid="mock-knowledge-bar" data-percent={percent}>
      {label}
    </div>
  ),
}));

vi.mock("../hooks/useAudioPlayer", () => ({
  useAudioPlayer: (...args: unknown[]) => mockUseAudioPlayer(...args),
}));

vi.mock("./AudioPlayer", () => ({
  AudioPlayer: ({
    audioUrl,
    currentMs,
    durationMs,
    segmentStartMs,
    segmentEndMs,
    playbackError,
    debugInfo,
    restartLabel,
    onPlayPause,
    onRestartSegment,
    onSeekSong,
  }: {
    audioUrl: string;
    currentMs: number;
    durationMs: number;
    segmentStartMs: number;
    segmentEndMs: number;
    playbackError?: string | null;
    debugInfo?: { lastEvent?: string; src?: string };
    restartLabel?: string;
    onPlayPause: () => void;
    onRestartSegment: () => void;
    onSeekSong: (ms: number) => void;
  }) => (
    <div
      data-testid="mock-audio-player"
      data-audio-url={audioUrl}
      data-current-ms={currentMs}
      data-duration-ms={durationMs}
      data-start-ms={segmentStartMs}
      data-end-ms={segmentEndMs}
      data-playback-error={playbackError ?? ""}
      data-debug-last-event={debugInfo?.lastEvent ?? ""}
      data-debug-src={debugInfo?.src ?? ""}
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
  beforeEach(() => {
    vi.clearAllMocks();
    mockUseAudioPlayer.mockReturnValue({
      isPlaying: false,
      isReady: true,
      currentMs: 0,
      durationMs: 12000,
      playbackError: null,
      debugInfo: {
        src: "http://example.com/audio.mp3",
        currentSrc: "",
        readyState: 0,
        networkState: 0,
        preload: "none",
        hasUserPlayIntent: false,
        pendingSeekMs: null,
        pendingEndMs: 0,
        lastEvent: "init",
        lastEventAt: "2026-03-30T00:00:00.000Z",
        playAttempts: 0,
        errorCode: null,
        errorMessage: null,
      },
      play: mockPlay,
      pause: mockPause,
      seek: mockSeek,
    });
  });

  it("renders song title", () => {
    const song = makeSong();
    render(<PracticeView song={song} initialSession={makeSession(song)} />);
    expect(screen.getByTestId("song-title")).toHaveTextContent("Amazing Grace");
  });

  it("renders segment counter '1 / N'", () => {
    const song = makeSong(3);
    render(<PracticeView song={song} initialSession={makeSession(song)} />);
    expect(screen.getByTestId("segment-counter")).toHaveTextContent("Segment 1 of 3");
  });

  it("Next button advances to next segment", () => {
    const song = makeSong(3);
    render(<PracticeView song={song} initialSession={makeSession(song)} />);
    expect(screen.getByTestId("segment-counter")).toHaveTextContent("Segment 1 of 3");
    fireEvent.click(screen.getByTestId("next-btn"));
    expect(screen.getByTestId("segment-counter")).toHaveTextContent("Segment 2 of 3");
  });

  it("Prev button is disabled on first segment", () => {
    const song = makeSong(3);
    render(<PracticeView song={song} initialSession={makeSession(song)} />);
    expect(screen.getByTestId("prev-btn")).toBeDisabled();
  });

  it("Rating a segment updates the KnowledgeBar", () => {
    const song = makeSong(3);
    render(<PracticeView song={song} initialSession={makeSession(song)} />);
    const bar = screen.getByTestId("mock-knowledge-bar");
    expect(bar).toHaveAttribute("data-percent", "0");
    fireEvent.click(screen.getByTestId("rate-btn"));
    expect(screen.getByTestId("mock-knowledge-bar")).not.toHaveAttribute(
      "data-percent",
      "0"
    );
  });

  it("Next button is disabled on last segment", () => {
    const song = makeSong(2);
    const session = makeSession(song);
    render(<PracticeView song={song} initialSession={session} />);
    // Navigate to last segment
    fireEvent.click(screen.getByTestId("next-btn"));
    expect(screen.getByTestId("next-btn")).toBeDisabled();
  });

  it("renders audio player for the current segment", () => {
    const song = makeSong(3);
    render(<PracticeView song={song} initialSession={makeSession(song)} />);

    expect(mockUseAudioPlayer).toHaveBeenCalledWith("/api/audio/audio/song-1/audio.mp3");
    expect(screen.getByTestId("mock-audio-player")).toHaveAttribute(
      "data-audio-url",
      "https://cdn.example.com/audio/song-1/audio.mp3"
    );
    expect(screen.getByTestId("mock-audio-player")).toHaveAttribute("data-duration-ms", "12000");
    expect(screen.getByTestId("mock-audio-player")).toHaveAttribute("data-start-ms", "0");
    expect(screen.getByTestId("mock-audio-player")).toHaveAttribute("data-end-ms", "4000");
  });

  it("updates audio player boundaries when moving to the next segment", () => {
    const song = makeSong(3);
    render(<PracticeView song={song} initialSession={makeSession(song)} />);

    fireEvent.click(screen.getByTestId("next-btn"));

    expect(screen.getByTestId("mock-audio-player")).toHaveAttribute("data-start-ms", "4000");
    expect(screen.getByTestId("mock-audio-player")).toHaveAttribute("data-end-ms", "8000");
  });

  it("renders practice layout container sections", () => {
    const song = makeSong(3);
    render(<PracticeView song={song} initialSession={makeSession(song)} />);

    expect(screen.getByTestId("practice-layout")).toBeInTheDocument();
    expect(screen.getByTestId("practice-header")).toBeInTheDocument();
    expect(screen.getByTestId("practice-top-bar")).toBeInTheDocument();
    expect(screen.getByTestId("practice-main")).toBeInTheDocument();
    expect(screen.getByTestId("practice-focus")).toBeInTheDocument();
    expect(screen.getByTestId("practice-queue")).toBeInTheDocument();
    expect(screen.getByTestId("practice-transport")).toBeInTheDocument();
  });

  it("renders clickable segment strip and updates active segment on navigation", () => {
    const song = makeSong(3);
    render(<PracticeView song={song} initialSession={makeSession(song)} />);

    expect(screen.getByTestId("practice-segment-strip")).toBeInTheDocument();
    fireEvent.click(screen.getByTestId("next-btn"));

    expect(screen.getByTestId("segment-counter")).toHaveTextContent("Segment 2 of 3");
  });

  it("highlights the active queue segment based on playback position", () => {
    const song = makeSong(3);
    const { rerender } = render(<PracticeView song={song} initialSession={makeSession(song)} />);

    expect(screen.getByTestId("queue-segment-seg-0")).toHaveAttribute("data-highlighted", "true");
    expect(screen.getByTestId("queue-segment-seg-1")).toHaveAttribute("data-highlighted", "false");

    mockUseAudioPlayer.mockReturnValue({
      isPlaying: false,
      isReady: true,
      currentMs: 6000,
      durationMs: 12000,
      playbackError: null,
      debugInfo: {
        src: "http://example.com/audio.mp3",
        currentSrc: "",
        readyState: 3,
        networkState: 1,
        preload: "none",
        hasUserPlayIntent: true,
        pendingSeekMs: 6000,
        pendingEndMs: 0,
        lastEvent: "timeupdate",
        lastEventAt: "2026-03-30T00:00:00.000Z",
        playAttempts: 1,
        errorCode: null,
        errorMessage: null,
      },
      play: mockPlay,
      pause: mockPause,
      seek: mockSeek,
    });

    rerender(<PracticeView song={song} initialSession={makeSession(song)} />);

    expect(screen.getByTestId("queue-segment-seg-0")).toHaveAttribute("data-highlighted", "false");
    expect(screen.getByTestId("queue-segment-seg-1")).toHaveAttribute("data-highlighted", "true");
  });

  it("clicking a segment chip jumps directly to that segment", () => {
    const song = makeSong(3);
    render(<PracticeView song={song} initialSession={makeSession(song)} />);

    fireEvent.click(screen.getByTestId("jump-segment-seg-2"));

    expect(screen.getByTestId("segment-counter")).toHaveTextContent("Segment 3 of 3");
    expect(mockSeek).toHaveBeenCalledWith(8000);
  });

  it("play toggle and restart call into shared audio controls", () => {
    const song = makeSong(3);
    render(<PracticeView song={song} initialSession={makeSession(song)} />);

    fireEvent.click(screen.getByTestId("mock-play-toggle"));
    fireEvent.click(screen.getByTestId("mock-restart"));

    expect(mockPlay).toHaveBeenNthCalledWith(1, 0, 12000);
    expect(mockPlay).toHaveBeenNthCalledWith(2, 0, 4000);
  });

  it("uses unbounded full-piece play when duration metadata is not ready", () => {
    mockUseAudioPlayer.mockReturnValue({
      isPlaying: false,
      isReady: false,
      currentMs: 0,
      durationMs: 0,
      playbackError: null,
      debugInfo: {
        src: "http://example.com/audio.mp3",
        currentSrc: "",
        readyState: 0,
        networkState: 0,
        preload: "none",
        hasUserPlayIntent: false,
        pendingSeekMs: null,
        pendingEndMs: 0,
        lastEvent: "init",
        lastEventAt: "2026-03-30T00:00:00.000Z",
        playAttempts: 0,
        errorCode: null,
        errorMessage: null,
      },
      play: mockPlay,
      pause: mockPause,
      seek: mockSeek,
    });

    const song = makeSong(2);
    render(<PracticeView song={song} initialSession={makeSession(song)} />);

    fireEvent.click(screen.getByTestId("mock-play-toggle"));
    expect(mockPlay).toHaveBeenCalledWith(0, Number.POSITIVE_INFINITY);
  });

  it("whole-song transport seeks the playhead", () => {
    const song = makeSong(3);
    render(<PracticeView song={song} initialSession={makeSession(song)} />);

    fireEvent.click(screen.getByTestId("mock-seek-song"));
    expect(mockSeek).toHaveBeenCalledWith(6000);
  });

  it("keeps full-piece transport available when there are no segments", () => {
    const song = makeSong(0);
    render(<PracticeView song={song} initialSession={makeSession(song)} />);

    expect(screen.getByTestId("segment-counter")).toHaveTextContent("Full piece playback");
    expect(screen.getByTestId("no-segments")).toBeInTheDocument();
    expect(screen.getByTestId("mock-audio-player")).toHaveAttribute("data-start-ms", "0");
    expect(screen.getByTestId("mock-audio-player")).toHaveAttribute("data-end-ms", "12000");
    expect(screen.getByTestId("mock-audio-player")).toHaveAttribute("data-restart-label", "Restart Piece");
  });
});
