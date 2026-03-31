import { fireEvent, render, screen } from "@testing-library/react";
import { describe, expect, it, vi } from "vitest";
import { SegmentTimeline } from "./SegmentTimeline";
import { Segment } from "../types";

const makeSegment = (overrides: Partial<Segment>): Segment => ({
  id: "seg-1",
  songId: "song-1",
  order: 0,
  label: "Section 1",
  lyricText: "lyrics",
  startMs: 0,
  endMs: 10000,
  ...overrides,
});

describe("SegmentTimeline", () => {
  it("renders a block for each segment with proportional widths", () => {
    render(
      <SegmentTimeline
        durationMs={10000}
        segments={[
          makeSegment({ id: "seg-1", startMs: 0, endMs: 5000 }),
          makeSegment({ id: "seg-2", startMs: 5000, endMs: 10000 }),
        ]}
      />
    );

    expect(screen.getByTestId("segment-block-seg-1")).toHaveStyle({ width: "50%" });
    expect(screen.getByTestId("segment-block-seg-2")).toHaveStyle({ width: "50%" });
  });

  it("applies active styles to activeSegmentId", () => {
    render(
      <SegmentTimeline
        durationMs={10000}
        activeSegmentId="seg-2"
        segments={[
          makeSegment({ id: "seg-1", startMs: 0, endMs: 5000 }),
          makeSegment({ id: "seg-2", startMs: 5000, endMs: 10000 }),
        ]}
      />
    );

    expect(screen.getByTestId("segment-block-seg-2").className).toContain("ring-2");
  });

  it("calls onSegmentClick with clicked segment", () => {
    const onSegmentClick = vi.fn();
    const segment = makeSegment({ id: "seg-2", label: "Verse" });

    render(
      <SegmentTimeline
        durationMs={10000}
        onSegmentClick={onSegmentClick}
        segments={[segment]}
      />
    );

    fireEvent.click(screen.getByTestId("segment-block-seg-2"));
    expect(onSegmentClick).toHaveBeenCalledWith(segment);
  });

  it("shows placeholder when no audio duration", () => {
    render(<SegmentTimeline durationMs={0} segments={[]} />);
    expect(screen.getByTestId("timeline-empty-label")).toHaveTextContent("No audio loaded");
  });

  it("renders overlapping segments with half-height rows", () => {
    render(
      <SegmentTimeline
        durationMs={10000}
        segments={[
          makeSegment({ id: "seg-1", startMs: 1000, endMs: 6000 }),
          makeSegment({ id: "seg-2", startMs: 3000, endMs: 8000 }),
        ]}
      />
    );

    expect(screen.getByTestId("segment-block-seg-1")).toHaveStyle({ height: "50%" });
    expect(screen.getByTestId("segment-block-seg-2")).toHaveStyle({ height: "50%" });
  });

  it("alternates adjacent segments across lanes for edge accessibility", () => {
    render(
      <SegmentTimeline
        durationMs={12000}
        segments={[
          makeSegment({ id: "seg-1", startMs: 0, endMs: 3000 }),
          makeSegment({ id: "seg-2", startMs: 3000, endMs: 6000 }),
          makeSegment({ id: "seg-3", startMs: 6000, endMs: 9000 }),
        ]}
      />
    );

    expect(screen.getByTestId("segment-block-seg-1")).toHaveStyle({ top: "0%" });
    expect(screen.getByTestId("segment-block-seg-2")).toHaveStyle({ top: "50%" });
    expect(screen.getByTestId("segment-block-seg-3")).toHaveStyle({ top: "0%" });
  });

  it("renders drag handles when editState is provided", () => {
    const onChange = vi.fn();
    render(
      <SegmentTimeline
        durationMs={10000}
        segments={[]}
        editState={{ startMs: 1000, endMs: 5000, onChange }}
      />
    );

    expect(screen.getByTestId("handle-start")).toBeInTheDocument();
    expect(screen.getByTestId("handle-end")).toBeInTheDocument();
  });

  it("dragging start handle updates startMs", () => {
    const onChange = vi.fn();
    render(
      <SegmentTimeline
        durationMs={10000}
        segments={[]}
        editState={{ startMs: 1000, endMs: 5000, onChange }}
      />
    );

    const timeline = screen.getByTestId("segment-timeline");
    vi.spyOn(timeline, "getBoundingClientRect").mockReturnValue({
      x: 0,
      y: 0,
      width: 1000,
      height: 64,
      top: 0,
      left: 0,
      right: 1000,
      bottom: 64,
      toJSON: () => ({}),
    });

    fireEvent.pointerDown(screen.getByTestId("handle-start"), { pointerId: 1, clientX: 100 });
    fireEvent.pointerMove(timeline, { pointerId: 1, clientX: 200 });

    expect(onChange).toHaveBeenCalledWith(2000, 5000);
  });

  it("clamps start handle to endMs - 1000", () => {
    const onChange = vi.fn();
    render(
      <SegmentTimeline
        durationMs={10000}
        segments={[]}
        editState={{ startMs: 1000, endMs: 3000, onChange }}
      />
    );

    const timeline = screen.getByTestId("segment-timeline");
    vi.spyOn(timeline, "getBoundingClientRect").mockReturnValue({
      x: 0,
      y: 0,
      width: 1000,
      height: 64,
      top: 0,
      left: 0,
      right: 1000,
      bottom: 64,
      toJSON: () => ({}),
    });

    fireEvent.pointerDown(screen.getByTestId("handle-start"), { pointerId: 1, clientX: 100 });
    fireEvent.pointerMove(timeline, { pointerId: 1, clientX: 900 });

    expect(onChange).toHaveBeenCalledWith(2000, 3000);
  });

  it("stops drag updates after pointer up", () => {
    const onChange = vi.fn();
    render(
      <SegmentTimeline
        durationMs={10000}
        segments={[]}
        editState={{ startMs: 1000, endMs: 5000, onChange }}
      />
    );

    const timeline = screen.getByTestId("segment-timeline");
    vi.spyOn(timeline, "getBoundingClientRect").mockReturnValue({
      x: 0,
      y: 0,
      width: 1000,
      height: 64,
      top: 0,
      left: 0,
      right: 1000,
      bottom: 64,
      toJSON: () => ({}),
    });

    const handleStart = screen.getByTestId("handle-start");
    fireEvent.pointerDown(handleStart, { pointerId: 7, clientX: 100 });
    fireEvent.pointerMove(timeline, { pointerId: 7, clientX: 200 });
    expect(onChange).toHaveBeenCalledTimes(1);

    fireEvent.pointerUp(handleStart, { pointerId: 7, clientX: 200 });
    fireEvent.pointerMove(timeline, { pointerId: 7, clientX: 300 });

    expect(onChange).toHaveBeenCalledTimes(1);
  });

  it("ignores pointer moves from non-active pointer ids", () => {
    const onChange = vi.fn();
    render(
      <SegmentTimeline
        durationMs={10000}
        segments={[]}
        editState={{ startMs: 1000, endMs: 5000, onChange }}
      />
    );

    const timeline = screen.getByTestId("segment-timeline");
    vi.spyOn(timeline, "getBoundingClientRect").mockReturnValue({
      x: 0,
      y: 0,
      width: 1000,
      height: 64,
      top: 0,
      left: 0,
      right: 1000,
      bottom: 64,
      toJSON: () => ({}),
    });

    fireEvent.pointerDown(screen.getByTestId("handle-start"), { pointerId: 3, clientX: 100 });
    fireEvent.pointerMove(timeline, { pointerId: 4, clientX: 200 });

    expect(onChange).not.toHaveBeenCalled();
  });

  it("shows handle timestamp labels", () => {
    const onChange = vi.fn();
    render(
      <SegmentTimeline
        durationMs={10000}
        segments={[]}
        editState={{ startMs: 1000, endMs: 32000, onChange }}
      />
    );

    expect(screen.getByTestId("handle-start-label")).toHaveTextContent("0:01");
    expect(screen.getByTestId("handle-end-label")).toHaveTextContent("0:32");
  });
});
