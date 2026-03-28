import React from "react";
import { render, screen, fireEvent } from "@testing-library/react";
import "@testing-library/jest-dom";
import { vi } from "vitest";
import SegmentCard from "./SegmentCard";
import { Segment } from "../types/index";

vi.mock("./RatingBar", () => ({
  default: ({ currentRating, onRate, disabled }: { currentRating?: number; onRate: (r: number) => void; disabled: boolean }) => (
    <div
      data-testid="mock-rating-bar"
      data-disabled={String(disabled)}
      data-current-rating={currentRating ?? ""}
    >
      <button onClick={() => onRate(3)}>Rate</button>
    </div>
  ),
}));

vi.mock("./KnowledgeBar", () => ({
  default: ({ percent, label }: { percent: number; label?: string }) => (
    <div data-testid="mock-knowledge-bar" data-percent={percent}>
      {label}
    </div>
  ),
}));

vi.mock("../lib/knowledgeUtils", () => ({
  getSegmentKnowledgePercent: (rating: number) => rating * 20,
}));

const mockSegment: Segment = {
  id: "seg-1",
  songId: "song-1",
  order: 1,
  label: "Verse 1",
  lyricText: "Some lyrics here",
  startMs: 0,
  endMs: 4000,
};

const defaultProps = {
  segment: mockSegment,
  onRate: vi.fn(),
  isLocked: false,
  onToggleLock: vi.fn(),
};

describe("SegmentCard", () => {
  it("renders the segment label", () => {
    render(<SegmentCard {...defaultProps} />);
    expect(screen.getByRole("heading", { name: "Verse 1" })).toBeInTheDocument();
  });

  it("renders RatingBar and KnowledgeBar", () => {
    render(<SegmentCard {...defaultProps} />);
    expect(screen.getByTestId("mock-rating-bar")).toBeInTheDocument();
    expect(screen.getByTestId("mock-knowledge-bar")).toBeInTheDocument();
  });

  it("clicking lock toggle calls onToggleLock", () => {
    const onToggleLock = vi.fn();
    render(<SegmentCard {...defaultProps} onToggleLock={onToggleLock} />);
    fireEvent.click(screen.getByTestId("lock-toggle"));
    expect(onToggleLock).toHaveBeenCalledTimes(1);
  });

  it("RatingBar is disabled when isLocked=true", () => {
    render(<SegmentCard {...defaultProps} isLocked={true} />);
    expect(screen.getByTestId("mock-rating-bar")).toHaveAttribute("data-disabled", "true");
  });

  it("KnowledgeBar shows 0 when no currentRating", () => {
    render(<SegmentCard {...defaultProps} />);
    expect(screen.getByTestId("mock-knowledge-bar")).toHaveAttribute("data-percent", "0");
  });

  it("KnowledgeBar shows 80 when currentRating=4", () => {
    render(<SegmentCard {...defaultProps} currentRating={4} />);
    expect(screen.getByTestId("mock-knowledge-bar")).toHaveAttribute("data-percent", "80");
  });
});
