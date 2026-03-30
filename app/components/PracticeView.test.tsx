import React from "react";
import { render, screen, fireEvent } from "@testing-library/react";
import "@testing-library/jest-dom";
import { vi } from "vitest";
import PracticeView from "./PracticeView";
import { Song, MemoryRating } from "../types/index";
import { SessionState } from "../lib/sessionReducer";

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

vi.mock("./AudioPlayer", () => ({
  AudioPlayer: ({
    audioUrl,
    startMs,
    endMs,
    onTimeChange,
  }: {
    audioUrl: string;
    startMs: number;
    endMs: number;
    onTimeChange?: (ms: number) => void;
  }) => (
    <div
      data-testid="mock-audio-player"
      data-audio-url={audioUrl}
      data-start-ms={startMs}
      data-end-ms={endMs}
    >
      <button data-testid="mock-time-2000" onClick={() => onTimeChange?.(2000)}>
        time 2000
      </button>
      <button data-testid="mock-time-6000" onClick={() => onTimeChange?.(6000)}>
        time 6000
      </button>
    </div>
  ),
}));

const makeSong = (numSegments = 3): Song => ({
  id: "song-1",
  title: "Amazing Grace",
  composer: "John Newton",
  audioUrl: "http://example.com/audio.mp3",
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

    expect(screen.getByTestId("mock-audio-player")).toHaveAttribute(
      "data-audio-url",
      "http://example.com/audio.mp3"
    );
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
    expect(screen.getByTestId("practice-main")).toBeInTheDocument();
    expect(screen.getByTestId("practice-focus")).toBeInTheDocument();
    expect(screen.getByTestId("practice-queue")).toBeInTheDocument();
  });

  it("shows previous/current/next segment previews and updates them on navigation", () => {
    const song = makeSong(3);
    render(<PracticeView song={song} initialSession={makeSession(song)} />);

    expect(screen.getByTestId("prev-segment-preview")).toHaveTextContent("Start of song");
    expect(screen.getByTestId("current-segment-preview")).toHaveTextContent("Verse 1");
    expect(screen.getByTestId("next-segment-preview")).toHaveTextContent("Verse 2");

    fireEvent.click(screen.getByTestId("next-btn"));

    expect(screen.getByTestId("prev-segment-preview")).toHaveTextContent("Verse 1");
    expect(screen.getByTestId("current-segment-preview")).toHaveTextContent("Verse 2");
    expect(screen.getByTestId("next-segment-preview")).toHaveTextContent("Verse 3");
  });

  it("highlights the active segment row based on playback time", () => {
    const song = makeSong(3);
    render(<PracticeView song={song} initialSession={makeSession(song)} />);

    expect(screen.getByTestId("queue-segment-seg-0")).toHaveAttribute("data-highlighted", "true");
    expect(screen.getByTestId("queue-segment-seg-1")).toHaveAttribute("data-highlighted", "false");

    fireEvent.click(screen.getByTestId("mock-time-6000"));

    expect(screen.getByTestId("queue-segment-seg-0")).toHaveAttribute("data-highlighted", "false");
    expect(screen.getByTestId("queue-segment-seg-1")).toHaveAttribute("data-highlighted", "true");
    expect(screen.getByTestId("current-segment-preview")).toHaveTextContent("Verse 2");
  });

  it("queue prev/next controls navigate segments", () => {
    const song = makeSong(3);
    render(<PracticeView song={song} initialSession={makeSession(song)} />);

    expect(screen.getByTestId("queue-prev-btn")).toBeDisabled();
    fireEvent.click(screen.getByTestId("queue-next-btn"));
    expect(screen.getByTestId("segment-counter")).toHaveTextContent("Segment 2 of 3");

    fireEvent.click(screen.getByTestId("queue-prev-btn"));
    expect(screen.getByTestId("segment-counter")).toHaveTextContent("Segment 1 of 3");
  });

  it("clicking a queue segment jumps directly to that segment", () => {
    const song = makeSong(3);
    render(<PracticeView song={song} initialSession={makeSession(song)} />);

    fireEvent.click(screen.getByTestId("jump-segment-seg-2"));

    expect(screen.getByTestId("segment-counter")).toHaveTextContent("Segment 3 of 3");
    expect(screen.getByTestId("current-segment-preview")).toHaveTextContent("Verse 3");
    expect(screen.getByTestId("next-segment-preview")).toHaveTextContent("End of song");
  });
});
