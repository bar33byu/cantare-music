import { fireEvent, render, screen, waitFor } from "@testing-library/react";
import { describe, expect, it, vi } from "vitest";
import { AudioPlayer } from "./AudioPlayer";

describe("AudioPlayer", () => {
  const defaultProps = {
    audioUrl: "/audio/song.mp3",
    currentMs: 2500,
    durationMs: 12000,
    segmentStartMs: 1000,
    segmentEndMs: 5000,
    isPlaying: false,
    isReady: true,
    playbackError: null,
    debugInfo: {
      src: "/song.mp3",
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
    onPlayPause: vi.fn(),
    onSkipBack: vi.fn(),
    onSkipForward: vi.fn(),
    onSeekSong: vi.fn(),
    isLooping: false,
    onToggleLoop: vi.fn(),
  };

  it("hides debug panel by default", () => {
    delete process.env.NEXT_PUBLIC_SHOW_AUDIO_DEBUG;
    render(<AudioPlayer {...defaultProps} />);
    expect(screen.queryByTestId("audio-debug-panel")).not.toBeInTheDocument();
  });

  it("renders no-audio state when audioUrl is empty", () => {
    render(<AudioPlayer {...defaultProps} audioUrl="" />);
    expect(screen.getByTestId("audio-player-no-audio")).toBeInTheDocument();
  });

  it("calls play/pause callback", () => {
    render(<AudioPlayer {...defaultProps} />);
    fireEvent.click(screen.getByTestId("audio-play-pause"));
    expect(defaultProps.onPlayPause).toHaveBeenCalledTimes(1);
  });

  it("does not render segment navigation controls in transport", () => {
    render(<AudioPlayer {...defaultProps} />);
    expect(screen.queryByTestId("audio-prev-segment")).not.toBeInTheDocument();
    expect(screen.queryByTestId("audio-next-segment")).not.toBeInTheDocument();
  });

  it("calls skip callbacks", () => {
    render(<AudioPlayer {...defaultProps} />);
    fireEvent.click(screen.getByTestId("audio-skip-back"));
    fireEvent.click(screen.getByTestId("audio-skip-forward"));
    expect(defaultProps.onSkipBack).toHaveBeenCalledTimes(1);
    expect(defaultProps.onSkipForward).toHaveBeenCalledTimes(1);
  });

  it("shows -5 and +5 labels on skip controls", () => {
    render(<AudioPlayer {...defaultProps} />);
    expect(screen.getByTestId("audio-skip-back")).toHaveTextContent("-5");
    expect(screen.getByTestId("audio-skip-forward")).toHaveTextContent("+5");
  });

  it("renders loop toggle button and calls onToggleLoop", () => {
    render(<AudioPlayer {...defaultProps} />);
    const btn = screen.getByTestId("audio-loop-toggle");
    expect(btn).toBeInTheDocument();
    fireEvent.click(btn);
    expect(defaultProps.onToggleLoop).toHaveBeenCalledTimes(1);
  });

  it("styles loop button as active when isLooping is true", () => {
    render(<AudioPlayer {...defaultProps} isLooping={true} />);
    expect(screen.getByTestId("audio-loop-toggle")).toHaveClass("bg-indigo-600");
  });

  it("seeks full piece slider position", () => {
    render(<AudioPlayer {...defaultProps} />);
    fireEvent.change(screen.getByTestId("audio-slider"), { target: { value: "1500" } });
    expect(defaultProps.onSeekSong).toHaveBeenCalledWith(1500);
  });

  it("shows full duration", () => {
    render(<AudioPlayer {...defaultProps} />);
    expect(screen.getByTestId("audio-current-time")).toHaveTextContent("00:02");
    expect(screen.getByTestId("audio-duration")).toHaveTextContent("00:12");
  });

  it("renders segment window marker over the full piece track", () => {
    render(<AudioPlayer {...defaultProps} />);
    expect(screen.getByTestId("audio-segment-window")).toBeInTheDocument();
  });

  it("renders all segment markers and highlights the active one", () => {
    render(
      <AudioPlayer
        {...defaultProps}
        durationMs={12000}
        segmentStartMs={4000}
        segmentEndMs={8000}
        currentSegmentIndex={1}
        segments={[
          { id: "s0", songId: "song", order: 0, label: "A", lyricText: "", startMs: 0, endMs: 4000 },
          { id: "s1", songId: "song", order: 1, label: "B", lyricText: "", startMs: 4000, endMs: 8000 },
          { id: "s2", songId: "song", order: 2, label: "C", lyricText: "", startMs: 8000, endMs: 12000 },
        ]}
      />
    );

    // Active segment gets the audio-segment-window testid
    expect(screen.getByTestId("audio-segment-window")).toBeInTheDocument();
    // Non-active segments get indexed testids
    expect(screen.getByTestId("audio-segment-item-0")).toBeInTheDocument();
    expect(screen.getByTestId("audio-segment-item-2")).toBeInTheDocument();
  });

  it("renders full-piece mastery chunks and uses fuller color on overlap", () => {
    render(
      <AudioPlayer
        {...defaultProps}
        durationMs={6000}
        segmentStartMs={0}
        segmentEndMs={6000}
        segments={[
          { id: "seg-1", songId: "song-1", order: 0, label: "A", lyricText: "", startMs: 0, endMs: 4000 },
          { id: "seg-2", songId: "song-1", order: 1, label: "B", lyricText: "", startMs: 2000, endMs: 6000 },
        ]}
        masteryBySegment={{ "seg-1": 20, "seg-2": 80 }}
      />
    );

    expect(screen.getByTestId("audio-piece-mastery-bar")).toBeInTheDocument();
    expect(screen.getByTestId("audio-piece-mastery-chunk-1")).toHaveStyle({
      backgroundColor: "rgb(114, 107, 234)",
    });
  });

  it("shows playback diagnostics", () => {
    process.env.NEXT_PUBLIC_SHOW_AUDIO_DEBUG = "true";
    render(<AudioPlayer {...defaultProps} playbackError="Playback failed" />);
    expect(screen.getByTestId("audio-debug-panel")).toBeInTheDocument();
    expect(screen.getByTestId("audio-debug-last-event")).toHaveTextContent("init");
    expect(screen.getByTestId("audio-native-probe-direct")).toBeInTheDocument();
    expect(screen.getByTestId("audio-native-probe-proxy")).toBeInTheDocument();
    delete process.env.NEXT_PUBLIC_SHOW_AUDIO_DEBUG;
  });

  it("disables controls while audio is loading", () => {
    render(<AudioPlayer {...defaultProps} isReady={false} />);
    expect(screen.getByTestId("audio-play-pause")).not.toBeDisabled();
    expect(screen.getByTestId("audio-skip-back")).toBeDisabled();
    expect(screen.getByTestId("audio-skip-forward")).toBeDisabled();
    expect(screen.getByTestId("audio-play-pause").querySelector("svg")).toBeTruthy();
    expect(screen.getByTestId("audio-slider")).toBeDisabled();
  });

  it("runs reachability check when debug panel opens", async () => {
    process.env.NEXT_PUBLIC_SHOW_AUDIO_DEBUG = "true";
    const fetchMock = vi.fn().mockResolvedValue({
      ok: true,
      json: async () => ({ ok: true, meta: { ContentType: "audio/mpeg", ContentLength: 1234 } }),
    });
    vi.stubGlobal("fetch", fetchMock);

    render(<AudioPlayer {...defaultProps} />);
    fireEvent.click(screen.getByText("Audio Debug"));

    await waitFor(() => {
      expect(fetchMock).toHaveBeenCalledWith(
        "/api/debug/r2?key=audio%2Fsong.mp3",
        expect.objectContaining({ cache: "no-store" })
      );
    });

    await screen.findByText(/reachability: reachable/i);
    vi.unstubAllGlobals();
    delete process.env.NEXT_PUBLIC_SHOW_AUDIO_DEBUG;
  });
});