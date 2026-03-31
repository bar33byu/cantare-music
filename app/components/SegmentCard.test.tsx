import React from "react";
import { render, screen, fireEvent } from "@testing-library/react";
import "@testing-library/jest-dom";
import { vi } from "vitest";
import SegmentCard from "./SegmentCard";
import { Segment } from "../types/index";

const mockSegment: Segment = {
  id: "seg-1",
  songId: "song-1",
  order: 1,
  label: "Section 1",
  lyricText: "Some lyrics here",
  startMs: 0,
  endMs: 32000,
};

const defaultProps = {
  segment: mockSegment,
  onRate: vi.fn(),
  isLocked: false,
  onToggleLock: vi.fn(),
  playbackMs: 16000,
};

describe("SegmentCard", () => {
  it("renders section label and lyric text", () => {
    render(<SegmentCard {...defaultProps} />);
    expect(screen.getByTestId("segment-label-text")).toHaveTextContent("Section 1");
    expect(screen.getByTestId("segment-lyric-text")).toHaveTextContent("Some lyrics here");
  });

  it("renders progress bar with correct value while in range", () => {
    render(<SegmentCard {...defaultProps} playbackMs={16000} />);
    expect(screen.getByTestId("segment-progress")).toHaveAttribute("aria-valuenow", "50");
    expect(screen.getByTestId("segment-progress-fill")).toHaveStyle({ width: "50%" });
  });

  it("clamps progress to 0 before segment start", () => {
    render(<SegmentCard {...defaultProps} playbackMs={-500} />);
    expect(screen.getByTestId("segment-progress")).toHaveAttribute("aria-valuenow", "0");
  });

  it("clamps progress to 100 after segment end", () => {
    render(<SegmentCard {...defaultProps} playbackMs={40000} />);
    expect(screen.getByTestId("segment-progress")).toHaveAttribute("aria-valuenow", "100");
  });

  it("shows duration label as M:SS", () => {
    render(<SegmentCard {...defaultProps} />);
    expect(screen.getByTestId("segment-end-time")).toHaveTextContent("0:32");
  });

  it("clicking rating button calls onRate", () => {
    const onRate = vi.fn();
    render(<SegmentCard {...defaultProps} onRate={onRate} />);
    fireEvent.click(screen.getByTestId("rating-button-3"));
    expect(onRate).toHaveBeenCalledWith(3);
  });

  it("selected rating button has selected style", () => {
    render(<SegmentCard {...defaultProps} currentRating={4} />);
    expect(screen.getByTestId("rating-button-4").className).toContain("bg-indigo-600");
  });

  it("lock button toggles lock callback", () => {
    const onToggleLock = vi.fn();
    render(<SegmentCard {...defaultProps} onToggleLock={onToggleLock} />);
    fireEvent.click(screen.getByTestId("lock-toggle"));
    expect(onToggleLock).toHaveBeenCalledTimes(1);
  });
});
