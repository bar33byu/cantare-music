import { fireEvent, render, screen } from "@testing-library/react";
import { describe, expect, it, vi } from "vitest";
import { AudioPlayer } from "./AudioPlayer";

describe("AudioPlayer", () => {
  const defaultProps = {
    audioUrl: "/song.mp3",
    currentMs: 2500,
    durationMs: 12000,
    segmentStartMs: 1000,
    segmentEndMs: 5000,
    isPlaying: false,
    isReady: true,
    onPlayPause: vi.fn(),
    onRestartSegment: vi.fn(),
    onSeekSong: vi.fn(),
  };

  it("renders no-audio state when audioUrl is empty", () => {
    render(<AudioPlayer {...defaultProps} audioUrl="" />);
    expect(screen.getByTestId("audio-player-no-audio")).toBeInTheDocument();
  });

  it("calls play/pause callback", () => {
    render(<AudioPlayer {...defaultProps} />);
    fireEvent.click(screen.getByTestId("audio-play-pause"));
    expect(defaultProps.onPlayPause).toHaveBeenCalledTimes(1);
  });

  it("calls restart callback", () => {
    render(<AudioPlayer {...defaultProps} />);
    fireEvent.click(screen.getByTestId("audio-restart"));
    expect(defaultProps.onRestartSegment).toHaveBeenCalledTimes(1);
  });

  it("seeks full piece slider position", () => {
    render(<AudioPlayer {...defaultProps} />);
    fireEvent.change(screen.getByTestId("audio-slider"), { target: { value: "1500" } });
    expect(defaultProps.onSeekSong).toHaveBeenCalledWith(1500);
  });

  it("shows absolute current time and full duration", () => {
    render(<AudioPlayer {...defaultProps} />);
    expect(screen.getByTestId("audio-current-time")).toHaveTextContent("00:02");
    expect(screen.getByTestId("audio-duration")).toHaveTextContent("00:12");
  });

  it("renders segment window marker over the full piece track", () => {
    render(<AudioPlayer {...defaultProps} />);
    expect(screen.getByTestId("audio-segment-window")).toBeInTheDocument();
  });

  it("disables controls while audio is loading", () => {
    render(<AudioPlayer {...defaultProps} isReady={false} />);
    expect(screen.getByTestId("audio-play-pause")).toBeDisabled();
    expect(screen.getByTestId("audio-restart")).toBeDisabled();
    expect(screen.getByTestId("audio-play-pause")).toHaveTextContent("Loading Audio...");
  });
});