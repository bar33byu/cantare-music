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
const mockSetPlaybackEndMs = vi.fn();
const mockUseAudioPlayer = vi.fn();
const mockFetch = vi.fn();

global.fetch = mockFetch;

vi.mock("./SegmentCard", () => ({
  default: ({
    segment,
    onRate,
    currentRating,
    lyricVisibilityMode,
  }: {
    segment: { id: string; label: string };
    onRate: (r: MemoryRating) => void;
    currentRating?: MemoryRating;
    lyricVisibilityMode?: "full" | "hint" | "hidden";
  }) => (
    <div data-testid="mock-segment-card" data-segment-id={segment.id} data-lyric-mode={lyricVisibilityMode}>
      <span>{segment.label}</span>
      <span data-testid="mock-current-rating">{currentRating ?? "none"}</span>
      <button data-testid="rate-btn" onClick={() => onRate(4 as MemoryRating)}>Rate 4</button>
      <button data-testid="rate-1-btn" onClick={() => onRate(1 as MemoryRating)}>Rate 1</button>
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
  AudioPlayer: ({ audioUrl, currentMs, durationMs, segmentStartMs, segmentEndMs, onPlayPause, onSkipBack, onSkipForward, onSeekSong, isLooping, onToggleLoop, lyricModeLabel, onToggleLyricMode }: { audioUrl: string; currentMs: number; durationMs: number; segmentStartMs: number; segmentEndMs: number; onPlayPause: () => void; onSkipBack: () => void; onSkipForward: () => void; onSeekSong: (ms: number) => void; isLooping?: boolean; onToggleLoop?: () => void; lyricModeLabel?: string; onToggleLyricMode?: () => void; }) => (
    <div
      data-testid="mock-audio-player"
      data-audio-url={audioUrl}
      data-current-ms={currentMs}
      data-duration-ms={durationMs}
      data-start-ms={segmentStartMs}
      data-end-ms={segmentEndMs}
    >
      <button data-testid="mock-play-toggle" onClick={onPlayPause}>toggle</button>
      <button data-testid="mock-skip-back" onClick={onSkipBack}>skip back</button>
      <button data-testid="mock-skip-forward" onClick={onSkipForward}>skip forward</button>
      <button data-testid="mock-loop-toggle" data-looping={isLooping} onClick={onToggleLoop}>loop</button>
      <button data-testid="lyric-visibility-toggle" onClick={onToggleLyricMode}>Lyrics: {lyricModeLabel}</button>
      <button data-testid="mock-seek-song" onClick={() => onSeekSong(6000)}>seek song</button>
    </div>
  ),
}));

const makeSong = (numSegments = 3): Song => ({
  id: "song-1",
  title: "Amazing Grace",
  artist: "John Newton",
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
  const renderAndWaitForRatings = async (
    song: Song,
    session: SessionState = makeSession(song),
    segmentPrerollMs = 500
  ) => {
    render(<PracticeView song={song} initialSession={session} segmentPrerollMs={segmentPrerollMs} />);
    await waitFor(() => {
      expect(mockFetch).toHaveBeenCalledWith(`/api/songs/${song.id}/ratings`);
    });
    await waitFor(() => {
      expect(screen.queryByTestId("ratings-loading-skeleton")).not.toBeInTheDocument();
    });
    mockPlay.mockClear();
    mockPause.mockClear();
    mockSeek.mockClear();
    mockSetPlaybackEndMs.mockClear();
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
      setPlaybackEndMs: mockSetPlaybackEndMs,
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

  it("cycles lyric visibility mode between full, hints, and hidden", async () => {
    const song = makeSong();
    await renderAndWaitForRatings(song);

    const toggle = screen.getByTestId("lyric-visibility-toggle");
    expect(toggle).toHaveTextContent("Lyrics: Full");
    expect(screen.getByTestId("mock-segment-card")).toHaveAttribute("data-lyric-mode", "full");

    fireEvent.click(toggle);
    expect(toggle).toHaveTextContent("Lyrics: Hints");
    expect(screen.getByTestId("mock-segment-card")).toHaveAttribute("data-lyric-mode", "hint");

    fireEvent.click(toggle);
    expect(toggle).toHaveTextContent("Lyrics: Hidden");
    expect(screen.getByTestId("mock-segment-card")).toHaveAttribute("data-lyric-mode", "hidden");

    fireEvent.click(toggle);
    expect(toggle).toHaveTextContent("Lyrics: Full");
    expect(screen.getByTestId("mock-segment-card")).toHaveAttribute("data-lyric-mode", "full");
  });

  it("renders breadcrumb in the title position when provided", async () => {
    const song = makeSong();
    const onBreadcrumbRootClick = vi.fn();
    render(
      <PracticeView
        song={song}
        initialSession={makeSession(song)}
        breadcrumbRootLabel="Songs"
        onBreadcrumbRootClick={onBreadcrumbRootClick}
      />
    );

    await waitFor(() => {
      expect(mockFetch).toHaveBeenCalledWith(`/api/songs/${song.id}/ratings`);
    });
    expect(screen.getByTestId("practice-breadcrumb")).toBeInTheDocument();
    expect(screen.getByTestId("song-title")).toHaveTextContent("Amazing Grace");

    fireEvent.click(screen.getByRole("button", { name: "Songs" }));
    expect(onBreadcrumbRootClick).toHaveBeenCalledTimes(1);
  });

  it("disables previous segment transport action on first segment", async () => {
    const song = makeSong(3);
    await renderAndWaitForRatings(song);
    fireEvent.click(screen.getByTestId("practice-prev-segment"));
    expect(screen.getByTestId("segment-counter")).toHaveTextContent("Segment 1 of 3");
  });

  it("does not advance past last segment via transport next", async () => {
    const song = makeSong(2);
    const session = makeSession(song);
    await renderAndWaitForRatings(song, session);
    fireEvent.click(screen.getByTestId("practice-next-segment"));
    fireEvent.click(screen.getByTestId("practice-next-segment"));
    expect(screen.getByTestId("segment-counter")).toHaveTextContent("Segment 2 of 2");
  });

  it("clicking transport next advances segment", async () => {
    const song = makeSong(3);
    await renderAndWaitForRatings(song);
    fireEvent.click(screen.getByTestId("practice-next-segment"));
    expect(screen.getByTestId("segment-counter")).toHaveTextContent("Segment 2 of 3");
  });

  it("clicking transport next before section 1 starts jumps to section 1 start", async () => {
    const song = makeSong(3);
    song.segments = song.segments.map((segment, index) => ({
      ...segment,
      startMs: 1000 + index * 4000,
      endMs: 1000 + (index + 1) * 4000,
    }));

    await renderAndWaitForRatings(song);
    fireEvent.click(screen.getByTestId("practice-next-segment"));

    expect(screen.getByTestId("segment-counter")).toHaveTextContent("Segment 1 of 3");
    expect(mockSeek).toHaveBeenCalledWith(1000);
  });

  it("clicking transport previous goes to prior segment", async () => {
    const song = makeSong(3);
    const session = makeSession(song);
    session.currentSegmentIndex = 1;
    await renderAndWaitForRatings(song, session);
    fireEvent.click(screen.getByTestId("practice-prev-segment"));
    expect(screen.getByTestId("segment-counter")).toHaveTextContent("Segment 1 of 3");
  });

  it("clicking transport previous after 3 seconds restarts current segment", async () => {
    mockUseAudioPlayer.mockReturnValue({
      isPlaying: false,
      isReady: true,
      currentMs: 8200,
      durationMs: 12000,
      playbackError: null,
      debugInfo: {},
      play: mockPlay,
      pause: mockPause,
      seek: mockSeek,
      setPlaybackEndMs: mockSetPlaybackEndMs,
    });

    const song = makeSong(3);
    const session = makeSession(song);
    session.currentSegmentIndex = 1;
    await renderAndWaitForRatings(song, session);

    fireEvent.click(screen.getByTestId("practice-prev-segment"));

    expect(screen.getByTestId("segment-counter")).toHaveTextContent("Segment 2 of 3");
    expect(mockSeek).toHaveBeenCalledWith(4000);
  });

  it("renders audio player in bottom transport section", async () => {
    const song = makeSong(3);
    await renderAndWaitForRatings(song);
    const transport = screen.getByTestId("practice-transport");
    expect(within(transport).getByTestId("mock-audio-player")).toBeInTheDocument();
  });

  it("hides segment arrows and shows tap bar in tap practice mode", async () => {
    const song = makeSong(3);
    await renderAndWaitForRatings(song);

    fireEvent.click(screen.getByTestId("practice-tap-mode-toggle"));

    expect(screen.queryByTestId("practice-prev-segment")).not.toBeInTheDocument();
    expect(screen.queryByTestId("practice-next-segment")).not.toBeInTheDocument();
    expect(screen.getByTestId("practice-tap-bar")).toBeInTheDocument();
    expect(screen.getByTestId("practice-overlay-toggle")).toBeInTheDocument();
  });

  it("updates contour feedback as user taps in tap practice mode", async () => {
    mockUseAudioPlayer.mockReturnValue({
      isPlaying: true,
      isReady: true,
      currentMs: 100,
      durationMs: 12000,
      playbackError: null,
      debugInfo: {},
      play: mockPlay,
      pause: mockPause,
      seek: mockSeek,
      setPlaybackEndMs: mockSetPlaybackEndMs,
    });

    const song = makeSong(1);
    song.segments[0] = {
      ...song.segments[0],
      pitchContourNotes: [
        { id: "k1", timeOffsetMs: 0, durationMs: 100, lane: 0.2 },
        { id: "k2", timeOffsetMs: 10, durationMs: 100, lane: 0.8 },
      ],
    };

    await renderAndWaitForRatings(song);
    fireEvent.click(screen.getByTestId("practice-tap-mode-toggle"));

    const tapBar = screen.getByTestId("practice-tap-bar");
    vi.spyOn(tapBar, "getBoundingClientRect").mockReturnValue({
      x: 0,
      y: 0,
      width: 64,
      height: 200,
      top: 0,
      left: 0,
      right: 64,
      bottom: 200,
      toJSON: () => ({}),
    });

    fireEvent.pointerDown(tapBar, { pointerId: 1, clientY: 180 });
    fireEvent.pointerUp(tapBar, { pointerId: 1, clientY: 180 });
    fireEvent.pointerDown(tapBar, { pointerId: 2, clientY: 20 });
    fireEvent.pointerUp(tapBar, { pointerId: 2, clientY: 20 });

    await waitFor(() => {
      expect(screen.getByTestId("practice-tap-feedback")).toHaveTextContent("100%");
      expect(screen.getByTestId("practice-piano-roll-overlay")).toBeInTheDocument();
    });
  });

  it("can hide translucent contour overlay in tap mode", async () => {
    const song = makeSong(1);
    await renderAndWaitForRatings(song);

    fireEvent.click(screen.getByTestId("practice-tap-mode-toggle"));
    expect(screen.getByTestId("practice-piano-roll-overlay")).toBeInTheDocument();

    fireEvent.click(screen.getByTestId("practice-overlay-toggle"));
    expect(screen.queryByTestId("practice-piano-roll-overlay")).not.toBeInTheDocument();
  });

  it("triggers haptic feedback when a tap is classified as a miss", async () => {
    const vibrate = vi.fn();
    Object.defineProperty(window.navigator, "vibrate", {
      configurable: true,
      value: vibrate,
    });

    mockUseAudioPlayer.mockReturnValue({
      isPlaying: true,
      isReady: true,
      currentMs: 200,
      durationMs: 12000,
      playbackError: null,
      debugInfo: {},
      play: mockPlay,
      pause: mockPause,
      seek: mockSeek,
      setPlaybackEndMs: mockSetPlaybackEndMs,
    });

    const song = makeSong(1);
    song.segments[0] = {
      ...song.segments[0],
      pitchContourNotes: [
        { id: "k1", timeOffsetMs: 0, durationMs: 120, lane: 0.2 },
        { id: "k2", timeOffsetMs: 100, durationMs: 120, lane: 0.8 },
      ],
    };

    await renderAndWaitForRatings(song);
    fireEvent.click(screen.getByTestId("practice-tap-mode-toggle"));

    const tapBar = screen.getByTestId("practice-tap-bar");
    vi.spyOn(tapBar, "getBoundingClientRect").mockReturnValue({
      x: 0,
      y: 0,
      width: 64,
      height: 200,
      top: 0,
      left: 0,
      right: 64,
      bottom: 200,
      toJSON: () => ({}),
    });

    // First tap high, second tap low => down contour against an up answer key.
    fireEvent.pointerDown(tapBar, { pointerId: 11, clientY: 20 });
    fireEvent.pointerUp(tapBar, { pointerId: 11, clientY: 20 });
    fireEvent.pointerDown(tapBar, { pointerId: 12, clientY: 180 });
    fireEvent.pointerUp(tapBar, { pointerId: 12, clientY: 180 });

    await waitFor(() => {
      expect(vibrate).toHaveBeenCalled();
    });
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

  it("uses proxy audio URL immediately when audio key can be parsed", async () => {
    const song = makeSong(2);
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
      setPlaybackEndMs: mockSetPlaybackEndMs,
    });

    render(<PracticeView song={song} initialSession={makeSession(song)} />);

    await waitFor(() => {
      expect(mockUseAudioPlayer).toHaveBeenCalled();
      const args = mockUseAudioPlayer.mock.calls.map((call) => String(call[0]));
      expect(args).toContain("/api/audio/audio/song-1/audio.mp3");
    });
  });

  it("plays full piece when toggling play", async () => {
    const song = makeSong(3);
    await renderAndWaitForRatings(song);
    fireEvent.click(screen.getByTestId("mock-play-toggle"));
    expect(mockPlay).toHaveBeenCalledWith(0, 12000);
  });

  it("skips backward 5 seconds", async () => {
    const song = makeSong(3);
    mockUseAudioPlayer.mockReturnValue({
      isPlaying: false,
      isReady: true,
      currentMs: 7000,
      durationMs: 12000,
      playbackError: null,
      debugInfo: {},
      play: mockPlay,
      pause: mockPause,
      seek: mockSeek,
      setPlaybackEndMs: mockSetPlaybackEndMs,
    });
    await renderAndWaitForRatings(song);
    fireEvent.click(screen.getByTestId("mock-skip-back"));
    expect(mockSeek).toHaveBeenCalledWith(2000);
  });

  it("shows no-segments fallback", async () => {
    const song = makeSong(0);
    await renderAndWaitForRatings(song);
    expect(screen.getByTestId("segment-counter")).toHaveTextContent("Full piece playback");
    expect(screen.getByTestId("no-segments")).toBeInTheDocument();
  });

  it("navigates to next segment while playing without issuing pause", async () => {
    mockUseAudioPlayer.mockReturnValue({
      isPlaying: true,
      isReady: true,
      currentMs: 1200,
      durationMs: 12000,
      playbackError: null,
      debugInfo: {},
      play: mockPlay,
      pause: mockPause,
      seek: mockSeek,
      setPlaybackEndMs: mockSetPlaybackEndMs,
    });

    const song = makeSong(3);
    await renderAndWaitForRatings(song);

    fireEvent.click(screen.getByTestId("practice-next-segment"));

    expect(mockPlay).toHaveBeenCalledWith(3500, 12000);
    expect(mockPause).not.toHaveBeenCalled();
  });

  it("applies custom segment preroll when jumping segments while playing", async () => {
    mockUseAudioPlayer.mockReturnValue({
      isPlaying: true,
      isReady: true,
      currentMs: 1200,
      durationMs: 12000,
      playbackError: null,
      debugInfo: {},
      play: mockPlay,
      pause: mockPause,
      seek: mockSeek,
      setPlaybackEndMs: mockSetPlaybackEndMs,
    });

    const song = makeSong(3);
    await renderAndWaitForRatings(song, makeSession(song), 1000);

    fireEvent.click(screen.getByTestId("practice-next-segment"));

    expect(mockPlay).toHaveBeenCalledWith(3000, 12000);
  });

  it("next click in an overlap jumps to the later segment", async () => {
    mockUseAudioPlayer.mockReturnValue({
      isPlaying: true,
      isReady: true,
      currentMs: 3400,
      durationMs: 12000,
      playbackError: null,
      debugInfo: {},
      play: mockPlay,
      pause: mockPause,
      seek: mockSeek,
      setPlaybackEndMs: mockSetPlaybackEndMs,
    });

    const song = makeSong(3);
    song.segments = [
      { ...song.segments[0], startMs: 0, endMs: 4000 },
      { ...song.segments[1], startMs: 3300, endMs: 8000 },
      { ...song.segments[2], startMs: 7600, endMs: 12000 },
    ];

    await renderAndWaitForRatings(song);

    fireEvent.click(screen.getByTestId("practice-next-segment"));

    expect(mockPlay).toHaveBeenCalledTimes(1);
    expect(mockPlay).toHaveBeenCalledWith(7100, 12000);
    expect(mockPause).not.toHaveBeenCalled();
  });

  it("next click in overlap prefers the later segment and does not move backward", async () => {
    mockUseAudioPlayer.mockReturnValue({
      isPlaying: true,
      isReady: true,
      currentMs: 3900,
      durationMs: 12000,
      playbackError: null,
      debugInfo: {},
      play: mockPlay,
      pause: mockPause,
      seek: mockSeek,
      setPlaybackEndMs: mockSetPlaybackEndMs,
    });

    const song = makeSong(3);
    song.segments = [
      { ...song.segments[0], startMs: 0, endMs: 4000 },
      { ...song.segments[1], startMs: 3300, endMs: 8000 },
      { ...song.segments[2], startMs: 7600, endMs: 12000 },
    ];

    await renderAndWaitForRatings(song);

    fireEvent.click(screen.getByTestId("practice-next-segment"));

    expect(mockPlay).toHaveBeenCalledTimes(1);
    expect(mockPlay).toHaveBeenCalledWith(7100, 12000);
  });

  it("rapid double-next clicks advance to later segments in order", async () => {
    mockUseAudioPlayer.mockReturnValue({
      isPlaying: true,
      isReady: true,
      currentMs: 1200,
      durationMs: 12000,
      playbackError: null,
      debugInfo: {},
      play: mockPlay,
      pause: mockPause,
      seek: mockSeek,
      setPlaybackEndMs: mockSetPlaybackEndMs,
    });

    const song = makeSong(3);
    await renderAndWaitForRatings(song);

    fireEvent.click(screen.getByTestId("practice-next-segment"));
    fireEvent.click(screen.getByTestId("practice-next-segment"));

    expect(mockPlay).toHaveBeenCalledTimes(2);
    expect(mockPlay).toHaveBeenNthCalledWith(1, 3500, 12000);
    expect(mockPlay).toHaveBeenNthCalledWith(2, 7500, 12000);
  });

  it("keeps next segment card selected during preroll window", async () => {
    const playbackState = {
      isPlaying: true,
      isReady: true,
      currentMs: 1200,
      durationMs: 12000,
      playbackError: null,
      debugInfo: {},
      play: mockPlay,
      pause: mockPause,
      seek: mockSeek,
      setPlaybackEndMs: mockSetPlaybackEndMs,
    };

    mockUseAudioPlayer.mockImplementation(() => playbackState);

    const song = makeSong(3);
    const view = render(<PracticeView song={song} initialSession={makeSession(song)} segmentPrerollMs={500} />);

    await waitFor(() => {
      expect(mockFetch).toHaveBeenCalledWith(`/api/songs/${song.id}/ratings`);
    });

    fireEvent.click(screen.getByTestId("practice-next-segment"));
    expect(screen.getByTestId("segment-counter")).toHaveTextContent("Segment 2 of 3");

    // 3600ms is after preroll start (3500ms) but before segment start (4000ms).
    playbackState.currentMs = 3600;
    view.rerender(<PracticeView song={song} initialSession={makeSession(song)} segmentPrerollMs={500} />);

    await waitFor(() => {
      expect(screen.getByTestId("segment-counter")).toHaveTextContent("Segment 2 of 3");
    });
  });

  it("does not reset playhead to segment start after pause", async () => {
    const playbackState = {
      isPlaying: false,
      isReady: true,
      currentMs: 1500,
      durationMs: 12000,
      playbackError: null,
      debugInfo: {},
      play: mockPlay,
      pause: mockPause,
      seek: mockSeek,
      setPlaybackEndMs: mockSetPlaybackEndMs,
    };

    mockUseAudioPlayer.mockImplementation(() => playbackState);

    const song = makeSong(2);
    const view = render(<PracticeView song={song} initialSession={makeSession(song)} />);
    await waitFor(() => {
      expect(mockFetch).toHaveBeenCalledWith(`/api/songs/${song.id}/ratings`);
    });

    mockSeek.mockClear();
    playbackState.isPlaying = true;
    playbackState.currentMs = 2300;
    view.rerender(<PracticeView song={song} initialSession={makeSession(song)} />);

    playbackState.isPlaying = false;
    playbackState.currentMs = 2300;
    view.rerender(<PracticeView song={song} initialSession={makeSession(song)} />);

    expect(mockSeek).not.toHaveBeenCalled();
  });

  it("auto-advances visible segment when playback crosses boundary", async () => {
    const playbackState = {
      isPlaying: true,
      isReady: true,
      currentMs: 3500,
      durationMs: 12000,
      playbackError: null,
      debugInfo: {},
      play: mockPlay,
      pause: mockPause,
      seek: mockSeek,
      setPlaybackEndMs: mockSetPlaybackEndMs,
    };

    mockUseAudioPlayer.mockImplementation(() => playbackState);

    const song = makeSong(3);
    const view = render(<PracticeView song={song} initialSession={makeSession(song)} />);
    await waitFor(() => {
      expect(mockFetch).toHaveBeenCalledWith(`/api/songs/${song.id}/ratings`);
    });

    expect(screen.getByTestId("segment-counter")).toHaveTextContent("Segment 1 of 3");

    playbackState.currentMs = 4500;
    view.rerender(<PracticeView song={song} initialSession={makeSession(song)} />);

    await waitFor(() => {
      expect(screen.getByTestId("segment-counter")).toHaveTextContent("Segment 2 of 3");
    });
  });

  it("shows prior segment in first half of gap and next segment in second half", async () => {
    const playbackState = {
      isPlaying: true,
      isReady: true,
      currentMs: 0,
      durationMs: 14000,
      playbackError: null,
      debugInfo: {},
      play: mockPlay,
      pause: mockPause,
      seek: mockSeek,
      setPlaybackEndMs: mockSetPlaybackEndMs,
    };

    mockUseAudioPlayer.mockImplementation(() => playbackState);

    // Segments with a 2000ms gap: seg0 0-4000, seg1 6000-10000
    const gappedSong: Song = {
      id: "gapped-song",
      title: "Gapped",
      audioUrl: "https://cdn.example.com/audio.mp3",
      segments: [
        { id: "g0", songId: "gapped-song", order: 0, label: "A", lyricText: "", startMs: 0, endMs: 4000 },
        { id: "g1", songId: "gapped-song", order: 1, label: "B", lyricText: "", startMs: 6000, endMs: 10000 },
      ],
      createdAt: new Date().toISOString(),
    };
    const gapSession = makeSession(gappedSong);

    const view = render(<PracticeView song={gappedSong} initialSession={gapSession} />);
    await waitFor(() => {
      expect(mockFetch).toHaveBeenCalledWith(`/api/songs/${gappedSong.id}/ratings`);
    });

    // During seg0 — segment 1 of 2
    playbackState.currentMs = 2000;
    view.rerender(<PracticeView song={gappedSong} initialSession={gapSession} />);
    await waitFor(() =>
      expect(screen.getByTestId("segment-counter")).toHaveTextContent("Segment 1 of 2")
    );

    // First half of gap (4000-5000 out of 4000-6000) — still seg 1
    playbackState.currentMs = 4500;
    view.rerender(<PracticeView song={gappedSong} initialSession={gapSession} />);
    await waitFor(() =>
      expect(screen.getByTestId("segment-counter")).toHaveTextContent("Segment 1 of 2")
    );

    // Second half of gap (5000-6000) — switches to seg 2
    playbackState.currentMs = 5500;
    view.rerender(<PracticeView song={gappedSong} initialSession={gapSession} />);
    await waitFor(() =>
      expect(screen.getByTestId("segment-counter")).toHaveTextContent("Segment 2 of 2")
    );
  });

  it("clicking rating 1 twice toggles back to unrated", async () => {
    const song = makeSong(1);
    await renderAndWaitForRatings(song);

    expect(screen.getByTestId("mock-current-rating")).toHaveTextContent("none");

    fireEvent.click(screen.getByTestId("rate-1-btn"));
    expect(screen.getByTestId("mock-current-rating")).toHaveTextContent("1");

    fireEvent.click(screen.getByTestId("rate-1-btn"));
    expect(screen.getByTestId("mock-current-rating")).toHaveTextContent("none");
  });

  it("supports keyboard transport and rating shortcuts", async () => {
    mockUseAudioPlayer.mockReturnValue({
      isPlaying: false,
      isReady: true,
      currentMs: 7000,
      durationMs: 12000,
      playbackError: null,
      debugInfo: {},
      play: mockPlay,
      pause: mockPause,
      seek: mockSeek,
      setPlaybackEndMs: mockSetPlaybackEndMs,
    });

    const song = makeSong(3);
    await renderAndWaitForRatings(song);

    fireEvent.keyDown(window, { key: "ArrowLeft" });
    expect(mockSeek).toHaveBeenCalledWith(2000);

    fireEvent.keyDown(window, { key: "ArrowRight" });
    expect(mockSeek).toHaveBeenCalledWith(12000);

    fireEvent.keyDown(window, { key: " " });
    expect(mockPlay).toHaveBeenCalledWith(7000, 12000);

    fireEvent.keyDown(window, { key: "PageDown" });
    expect(screen.getByTestId("segment-counter")).toHaveTextContent("Segment 2 of 3");

    fireEvent.keyDown(window, { key: "PageUp" });
    expect(screen.getByTestId("segment-counter")).toHaveTextContent("Segment 1 of 3");

    // J/K/L shuttle controls
    fireEvent.keyDown(window, { key: "j" });
    expect(mockSeek).toHaveBeenCalledWith(2000); // 7000 - 5000

    fireEvent.keyDown(window, { key: "l" });
    expect(mockSeek).toHaveBeenCalledWith(12000); // 7000 + 5000

    fireEvent.keyDown(window, { key: "J", shiftKey: true });
    expect(mockSeek).toHaveBeenCalledWith(0); // 7000 - 15000, clamped to 0

    fireEvent.keyDown(window, { key: "L", shiftKey: true });
    expect(mockSeek).toHaveBeenCalledWith(12000); // 7000 + 15000, clamped to durationMs

    fireEvent.keyDown(window, { key: "k" });
    expect(mockPlay).toHaveBeenCalledTimes(2); // spacebar + k

    fireEvent.keyDown(window, { key: "o" });
    expect(screen.getByTestId("segment-counter")).toHaveTextContent("Segment 2 of 3");

    fireEvent.keyDown(window, { key: "u" });
    expect(screen.getByTestId("segment-counter")).toHaveTextContent("Segment 1 of 3");

    fireEvent.keyDown(window, { key: "4" });
    expect(screen.getByTestId("mock-current-rating")).toHaveTextContent("4");

    fireEvent.keyDown(window, { key: "1" });
    expect(screen.getByTestId("mock-current-rating")).toHaveTextContent("1");

    fireEvent.keyDown(window, { key: "1" });
    expect(screen.getByTestId("mock-current-rating")).toHaveTextContent("none");

    // R toggles loop on/off
    fireEvent.keyDown(window, { key: "r" });
    expect(screen.getByTestId("mock-loop-toggle")).toHaveAttribute("data-looping", "true");
    fireEvent.keyDown(window, { key: "r" });
    expect(screen.getByTestId("mock-loop-toggle")).toHaveAttribute("data-looping", "false");
  });

  it("pause button works while looping (does not immediately restart)", async () => {
    const playbackState = {
      isPlaying: true,
      isReady: true,
      currentMs: 2000,
      durationMs: 12000,
      playbackError: null,
      debugInfo: {},
      play: mockPlay,
      pause: mockPause,
      seek: mockSeek,
      setPlaybackEndMs: mockSetPlaybackEndMs,
    };
    mockUseAudioPlayer.mockImplementation(() => playbackState);

    const song = makeSong(3);
    const view = render(<PracticeView song={song} initialSession={makeSession(song)} />);
    await waitFor(() => expect(mockFetch).toHaveBeenCalledWith(`/api/songs/${song.id}/ratings`));

    // Enable loop
    fireEvent.click(screen.getByTestId("mock-loop-toggle"));

    // Pause while looping — capture how many play calls happened up to this point
    const playCallsBeforePause = mockPlay.mock.calls.length;
    fireEvent.click(screen.getByTestId("mock-play-toggle"));
    expect(mockPause).toHaveBeenCalledTimes(1);

    // Simulate isPlaying going false (user paused) with currentMs unchanged
    playbackState.isPlaying = false;
    playbackState.currentMs = 2000;
    view.rerender(<PracticeView song={song} initialSession={makeSession(song)} />);

    // play should NOT have been called again after the user pause (no loop restart)
    expect(mockPlay.mock.calls.length).toBe(playCallsBeforePause);
  });

  it("toggling loop while playing keeps the playhead in place", async () => {
    const playbackState = {
      isPlaying: true,
      isReady: true,
      currentMs: 4500,
      durationMs: 12000,
      playbackError: null,
      debugInfo: {},
      play: mockPlay,
      pause: mockPause,
      seek: mockSeek,
      setPlaybackEndMs: mockSetPlaybackEndMs,
    };
    mockUseAudioPlayer.mockImplementation(() => playbackState);

    const song = makeSong(3);
    await renderAndWaitForRatings(song);

    fireEvent.click(screen.getByTestId("mock-loop-toggle"));

    expect(mockPlay).not.toHaveBeenCalled();
    expect(mockSeek).not.toHaveBeenCalled();
    expect(mockSetPlaybackEndMs).toHaveBeenCalledWith(8000);
  });

  it("auto-saves ratings to the server after a rating change but not during initial load", async () => {
    const song = makeSong(1);
    mockFetch.mockResolvedValue({ ok: true, json: async () => ({ ratings: [] }) });

    render(<PracticeView song={song} initialSession={makeSession(song)} />);

    // Wait for initial GET — only that one call should exist
    await waitFor(() => expect(mockFetch).toHaveBeenCalledWith(`/api/songs/${song.id}/ratings`));
    const callsAfterLoad = mockFetch.mock.calls.length;

    // Rate a segment
    fireEvent.click(screen.getByTestId("rate-btn")); // rate 4

    // Wait for the debounced POST (debounce is 400ms)
    await waitFor(() => {
      expect(mockFetch.mock.calls.length).toBeGreaterThan(callsAfterLoad);
    }, { timeout: 2000 });

    expect(mockFetch).toHaveBeenLastCalledWith(
      `/api/songs/${song.id}/ratings`,
      expect.objectContaining({
        method: "POST",
        body: expect.stringContaining(`"rating":4`),
      })
    );
  });
});
