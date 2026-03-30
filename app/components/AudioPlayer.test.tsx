import { fireEvent, render, screen } from "@testing-library/react";
import { beforeEach, describe, expect, it, vi } from "vitest";
import { AudioPlayer } from "./AudioPlayer";

const mockUseAudioPlayer = vi.fn();

vi.mock("../hooks/useAudioPlayer", () => ({
  useAudioPlayer: (audioUrl: string) => mockUseAudioPlayer(audioUrl),
}));

describe("AudioPlayer", () => {
  const play = vi.fn();
  const pause = vi.fn();
  const seek = vi.fn();

  beforeEach(() => {
    vi.clearAllMocks();
    mockUseAudioPlayer.mockReturnValue({
      isPlaying: false,
      currentMs: 0,
      play,
      pause,
      seek,
    });
  });

  it("renders no-audio state when audioUrl is empty", () => {
    render(<AudioPlayer audioUrl="" startMs={0} endMs={4000} />);
    expect(screen.getByTestId("audio-player-no-audio")).toBeInTheDocument();
  });

  it("starts playback from segment start when current position is outside segment", () => {
    render(<AudioPlayer audioUrl="/song.mp3" startMs={1000} endMs={5000} />);
    fireEvent.click(screen.getByTestId("audio-play-pause"));
    expect(play).toHaveBeenCalledWith(1000, 5000);
  });

  it("resumes playback from current position when inside segment", () => {
    mockUseAudioPlayer.mockReturnValue({
      isPlaying: false,
      currentMs: 2500,
      play,
      pause,
      seek,
    });

    render(<AudioPlayer audioUrl="/song.mp3" startMs={1000} endMs={5000} />);
    fireEvent.click(screen.getByTestId("audio-play-pause"));
    expect(play).toHaveBeenCalledWith(2500, 5000);
  });

  it("pauses when already playing", () => {
    mockUseAudioPlayer.mockReturnValue({
      isPlaying: true,
      currentMs: 2500,
      play,
      pause,
      seek,
    });

    render(<AudioPlayer audioUrl="/song.mp3" startMs={1000} endMs={5000} />);
    fireEvent.click(screen.getByTestId("audio-play-pause"));
    expect(pause).toHaveBeenCalled();
  });

  it("seeks relative slider value back to absolute time", () => {
    render(<AudioPlayer audioUrl="/song.mp3" startMs={1000} endMs={5000} />);
    fireEvent.change(screen.getByTestId("audio-slider"), { target: { value: "1500" } });
    expect(seek).toHaveBeenCalledWith(2500);
  });

  it("shows relative current time and duration", () => {
    mockUseAudioPlayer.mockReturnValue({
      isPlaying: false,
      currentMs: 2500,
      play,
      pause,
      seek,
    });

    render(<AudioPlayer audioUrl="/song.mp3" startMs={1000} endMs={5000} />);
    expect(screen.getByTestId("audio-current-time")).toHaveTextContent("00:01");
    expect(screen.getByTestId("audio-duration")).toHaveTextContent("00:04");
  });

  it("resets to the new segment when boundaries change", () => {
    const { rerender } = render(<AudioPlayer audioUrl="/song.mp3" startMs={1000} endMs={5000} />);
    expect(seek).toHaveBeenCalledWith(1000);

    rerender(<AudioPlayer audioUrl="/song.mp3" startMs={5000} endMs={9000} />);
    expect(pause).toHaveBeenCalled();
    expect(seek).toHaveBeenCalledWith(5000);
  });

  it("notifies parent with current playback time", () => {
    const onTimeChange = vi.fn();
    mockUseAudioPlayer.mockReturnValue({
      isPlaying: false,
      currentMs: 3200,
      play,
      pause,
      seek,
    });

    render(
      <AudioPlayer
        audioUrl="/song.mp3"
        startMs={1000}
        endMs={5000}
        onTimeChange={onTimeChange}
      />
    );

    expect(onTimeChange).toHaveBeenCalledWith(3200);
  });
});