"use client";

interface AudioPlayerProps {
  audioUrl: string;
  currentMs: number;
  durationMs: number;
  segmentStartMs: number;
  segmentEndMs: number;
  isPlaying: boolean;
  isReady: boolean;
  onPlayPause: () => void;
  onRestartSegment: () => void;
  onSeekSong: (ms: number) => void;
}

function formatMs(ms: number): string {
  const totalSeconds = Math.max(0, Math.floor(ms / 1000));
  const minutes = Math.floor(totalSeconds / 60);
  const seconds = totalSeconds % 60;
  return `${String(minutes).padStart(2, "0")}:${String(seconds).padStart(2, "0")}`;
}

export function AudioPlayer({
  audioUrl,
  currentMs,
  durationMs,
  segmentStartMs,
  segmentEndMs,
  isPlaying,
  isReady,
  onPlayPause,
  onRestartSegment,
  onSeekSong,
}: AudioPlayerProps) {

  if (!audioUrl) {
    return (
      <div
        data-testid="audio-player-no-audio"
        className="rounded-xl border border-amber-200 bg-amber-50 px-4 py-3 text-sm text-amber-800"
      >
        This song does not have an audio file yet.
      </div>
    );
  }

  const safeDurationMs = Math.max(durationMs, segmentEndMs);
  const segmentWidth = safeDurationMs > 0 ? ((segmentEndMs - segmentStartMs) / safeDurationMs) * 100 : 0;
  const segmentOffset = safeDurationMs > 0 ? (segmentStartMs / safeDurationMs) * 100 : 0;

  return (
    <div data-testid="audio-player" className="space-y-4">
      <div className="flex items-center justify-center gap-3">
        <button
          type="button"
          onClick={onRestartSegment}
          data-testid="audio-restart"
          disabled={!isReady}
          className="rounded-full border border-indigo-300 px-4 py-2 text-sm font-medium text-indigo-700 hover:bg-indigo-50"
        >
          Restart Segment
        </button>
        <button
          type="button"
          onClick={onPlayPause}
          data-testid="audio-play-pause"
          disabled={!isReady}
          className="rounded-full bg-indigo-600 px-5 py-3 text-sm font-semibold text-white hover:bg-indigo-700 disabled:opacity-50"
        >
          {!isReady ? "Loading Audio..." : isPlaying ? "Pause" : "Play"}
        </button>
      </div>

      <div className="rounded-2xl border border-gray-200 bg-white px-4 py-4 shadow-sm">
        <div className="mb-3 flex items-center justify-between text-sm text-gray-600">
          <span>Full Piece Audio</span>
          <span data-testid="audio-current-time">{formatMs(currentMs)}</span>
        </div>

        <div className="relative mb-2 h-3 rounded-full bg-indigo-100">
          <div
            data-testid="audio-segment-window"
            className="absolute top-0 h-3 rounded-full bg-amber-300/90"
            style={{ left: `${segmentOffset}%`, width: `${segmentWidth}%` }}
          />
        </div>

        <input
          type="range"
          min={0}
          max={safeDurationMs}
          value={Math.min(currentMs, safeDurationMs)}
          onChange={(event) => onSeekSong(Number(event.target.value))}
          data-testid="audio-slider"
          className="w-full"
        />

        <div className="mt-2 flex justify-between text-sm text-gray-500">
          <span>00:00</span>
          <span data-testid="audio-duration">{formatMs(safeDurationMs)}</span>
        </div>
      </div>
    </div>
  );
}