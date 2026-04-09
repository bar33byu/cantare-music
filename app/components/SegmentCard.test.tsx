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
  playbackMs: 16000,
};

describe("SegmentCard", () => {
  it("renders section label and lyric text", () => {
    render(<SegmentCard {...defaultProps} />);
    expect(screen.getByTestId("segment-label-text")).toHaveTextContent("Section 1");
    expect(screen.getByTestId("segment-lyric-text")).toHaveTextContent("Some lyrics here");
  });

  it("renders no-lyrics fallback in muted gray", () => {
    render(
      <SegmentCard
        {...defaultProps}
        segment={{ ...mockSegment, lyricText: "   " }}
      />
    );
    expect(screen.getByTestId("segment-lyric-text")).toHaveTextContent("No lyrics for this segment yet.");
    expect(screen.getByTestId("segment-lyric-text").className).toContain("text-gray-400");
  });

  it("renders first-letter hints when lyricVisibilityMode is hint", () => {
    render(<SegmentCard {...defaultProps} lyricVisibilityMode="hint" />);
    const lyric = screen.getByTestId("segment-lyric-text");
    expect(lyric).toHaveTextContent("S");
    expect(lyric).toHaveTextContent("l");
    expect(lyric).toHaveTextContent("h");
    expect(screen.getAllByTestId("segment-lyric-mask-char")).toHaveLength(11);
  });

  it("hides lyrics when lyricVisibilityMode is hidden", () => {
    render(<SegmentCard {...defaultProps} lyricVisibilityMode="hidden" />);
    const lyric = screen.getByTestId("segment-lyric-text");
    expect(lyric).toHaveTextContent("Some lyrics here");
    expect(lyric.className).toContain("text-slate-700");
    expect(screen.getAllByTestId("segment-lyric-mask-char")).toHaveLength(14);
  });

  it("renders progress bar with correct value while in range", () => {
    render(<SegmentCard {...defaultProps} playbackMs={16000} />);
    expect(screen.getByTestId("segment-progress")).toHaveAttribute("aria-valuenow", "50");
    expect(screen.getByTestId("segment-progress-fill")).toHaveStyle({ width: "50%" });
  });

  it("does not render a top mastery strip", () => {
    render(<SegmentCard {...defaultProps} masteryPercent={100} />);
    expect(screen.queryByTestId("segment-mastery-edge")).toBeNull();
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
    expect(screen.getByTestId("segment-start-time")).toHaveTextContent("0:16");
    expect(screen.getByTestId("segment-end-time")).toHaveTextContent("0:32");
  });

  it("clicking rating button calls onRate", () => {
    const onRate = vi.fn();
    render(<SegmentCard {...defaultProps} onRate={onRate} />);
    fireEvent.click(screen.getByTestId("rating-button-3"));
    expect(onRate).toHaveBeenCalledWith(3);
  });

  it("clicking progress bar seeks within current segment", () => {
    const onSeek = vi.fn();
    render(<SegmentCard {...defaultProps} onSeek={onSeek} />);

    const progressBar = screen.getByTestId("segment-progress");
    Object.defineProperty(progressBar, "getBoundingClientRect", {
      value: () => ({
        left: 10,
        top: 0,
        right: 210,
        bottom: 16,
        width: 200,
        height: 16,
        x: 10,
        y: 0,
        toJSON: () => ({}),
      }),
    });

    fireEvent.click(progressBar, { clientX: 110 });
    expect(onSeek).toHaveBeenCalledWith(16000);
  });

  it("does not throw when progress bar is clicked without onSeek", () => {
    render(<SegmentCard {...defaultProps} onSeek={undefined} />);
    const progressBar = screen.getByTestId("segment-progress");
    fireEvent.click(progressBar, { clientX: 80 });
    expect(screen.getByTestId("segment-progress")).toBeInTheDocument();
  });

  it("selected rating button has selected style", () => {
    render(<SegmentCard {...defaultProps} currentRating={4} />);
    expect(screen.getByTestId("rating-button-4").className).toContain("bg-indigo-700");
  });

  it("does not render lock toggle", () => {
    render(<SegmentCard {...defaultProps} />);
    expect(screen.queryByTestId("lock-toggle")).not.toBeInTheDocument();
  });

  it("allows very long lyrics to shrink down to 0.95rem", () => {
    const veryLongLyrics = "a".repeat(321);
    render(
      <SegmentCard
        {...defaultProps}
        segment={{ ...mockSegment, lyricText: veryLongLyrics }}
      />
    );

    expect(screen.getByTestId("segment-lyric-text")).toHaveStyle({
      fontSize: "clamp(0.95rem, 2.7vw, 1.5rem)",
    });
  });

  it("keeps lyric scrollbar visible on larger screens", () => {
    render(<SegmentCard {...defaultProps} />);
    const container = screen.getByTestId("segment-lyric-scroll-container");

    expect(container.className).toContain("[scrollbar-width:thin]");
    expect(container.className).not.toContain("[&::-webkit-scrollbar]:md:w-0");
    expect(container.className).not.toContain("md:[scrollbar-width:none]");
  });
});
