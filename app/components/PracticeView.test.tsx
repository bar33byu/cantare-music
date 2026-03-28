import React from "react";
import { render, screen, fireEvent } from "@testing-library/react";
import "@testing-library/jest-dom";
import { vi } from "vitest";
import PracticeView from "./PracticeView";
import { Song, PracticeSession, MemoryRating } from "../types/index";

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

const makeSession = (song: Song): PracticeSession => ({
  id: "session-1",
  songId: song.id,
  currentSegmentIndex: 0,
  isLocked: false,
  ratings: [],
  startedAt: new Date().toISOString(),
  completedAt: undefined,
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
    expect(screen.getByTestId("segment-counter")).toHaveTextContent("1 / 3");
  });

  it("Next button advances to next segment", () => {
    const song = makeSong(3);
    render(<PracticeView song={song} initialSession={makeSession(song)} />);
    expect(screen.getByTestId("segment-counter")).toHaveTextContent("1 / 3");
    fireEvent.click(screen.getByTestId("next-btn"));
    expect(screen.getByTestId("segment-counter")).toHaveTextContent("2 / 3");
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
});
