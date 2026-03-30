"use client";

import { useCallback, useMemo, useState, type SyntheticEvent } from "react";
import type { AudioDebugInfo } from "../hooks/useAudioPlayer";

interface AudioPlayerProps {
  audioUrl: string;
  currentMs: number;
  durationMs: number;
  segmentStartMs: number;
  segmentEndMs: number;
  isPlaying: boolean;
  isReady: boolean;
  playbackError?: string | null;
  debugInfo?: AudioDebugInfo;
  restartLabel?: string;
  onPlayPause: () => void;
  onRestartSegment: () => void;
  onSeekSong: (ms: number) => void;
}

type ReachabilityState = {
  status: "idle" | "checking" | "reachable" | "unreachable" | "error";
  key: string | null;
  message: string;
  checkedAt: string | null;
  contentType: string | null;
  contentLength: number | null;
};

function parseAudioKey(audioUrl: string): string | null {
  if (!audioUrl || audioUrl.trim().length === 0) {
    return null;
  }

  try {
    const normalized = new URL(audioUrl, "http://localhost");
    const path = normalized.pathname;
    const proxyPrefix = "/api/audio/";

    if (path.startsWith(proxyPrefix)) {
      const rawKey = path.slice(proxyPrefix.length);
      if (!rawKey) {
        return null;
      }
      return rawKey
        .split("/")
        .map((segment) => decodeURIComponent(segment))
        .join("/");
    }

    const trimmedPath = path.replace(/^\/+/, "");
    if (trimmedPath.startsWith("audio/")) {
      return trimmedPath
        .split("/")
        .map((segment) => decodeURIComponent(segment))
        .join("/");
    }

    return null;
  } catch {
    return null;
  }
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
  playbackError,
  debugInfo,
  restartLabel = "Restart Segment",
  onPlayPause,
  onRestartSegment,
  onSeekSong,
}: AudioPlayerProps) {
  const [reachability, setReachability] = useState<ReachabilityState>({
    status: "idle",
    key: null,
    message: "Not checked yet",
    checkedAt: null,
    contentType: null,
    contentLength: null,
  });
  const [isDebugOpen, setIsDebugOpen] = useState(false);

  const audioKey = useMemo(() => parseAudioKey(audioUrl), [audioUrl]);

  const checkReachability = useCallback(async () => {
    if (!audioKey) {
      setReachability({
        status: "error",
        key: null,
        message: "Could not derive storage key from audio URL",
        checkedAt: new Date().toISOString(),
        contentType: null,
        contentLength: null,
      });
      return;
    }

    setReachability((previous) => ({
      ...previous,
      status: "checking",
      key: audioKey,
      message: "Checking object visibility from server...",
      checkedAt: null,
      contentType: null,
      contentLength: null,
    }));

    try {
      const response = await fetch(`/api/debug/r2?key=${encodeURIComponent(audioKey)}`, {
        cache: "no-store",
      });
      const payload = (await response.json().catch(() => ({}))) as {
        ok?: boolean;
        error?: string;
        meta?: { ContentLength?: number; ContentType?: string };
      };

      if (response.ok && payload.ok) {
        setReachability({
          status: "reachable",
          key: audioKey,
          message: "Server can access this object in R2",
          checkedAt: new Date().toISOString(),
          contentType: payload.meta?.ContentType ?? null,
          contentLength: payload.meta?.ContentLength ?? null,
        });
        return;
      }

      const errorMessage = payload.error ?? `Server check failed (HTTP ${response.status})`;
      const unreachableStatus = /NoSuchKey|NotFound|404/i.test(errorMessage) ? "unreachable" : "error";
      setReachability({
        status: unreachableStatus,
        key: audioKey,
        message: errorMessage,
        checkedAt: new Date().toISOString(),
        contentType: null,
        contentLength: null,
      });
    } catch (error) {
      const message = error instanceof Error ? error.message : "Reachability check failed";
      setReachability({
        status: "error",
        key: audioKey,
        message,
        checkedAt: new Date().toISOString(),
        contentType: null,
        contentLength: null,
      });
    }
  }, [audioKey]);

  const handleDebugToggle = useCallback((event: SyntheticEvent<HTMLDetailsElement>) => {
    const details = event.currentTarget;
    const opened = details.open;
    setIsDebugOpen(opened);
    if (opened) {
      void checkReachability();
    }
  }, [checkReachability]);

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
          {restartLabel}
        </button>
        <button
          type="button"
          onClick={onPlayPause}
          data-testid="audio-play-pause"
          className="rounded-full bg-indigo-600 px-5 py-3 text-sm font-semibold text-white hover:bg-indigo-700 disabled:opacity-50"
        >
          {isPlaying ? "Pause" : "Play"}
        </button>
      </div>

      <div className="rounded-2xl border border-gray-200 bg-white px-4 py-4 shadow-sm">
        <div className="mb-3 flex items-center justify-between text-sm text-gray-600">
          <span>Full Piece Audio</span>
          <span data-testid="audio-current-time">{formatMs(currentMs)}</span>
        </div>

        <div className="mb-3 flex items-center justify-between text-xs text-gray-500">
          <span data-testid="audio-cache-status">Caching uses the browser HTTP cache for this file.</span>
          <span data-testid="audio-status-message">
            {playbackError ? playbackError : isReady ? "Ready to play" : "Loading audio source... you can tap Play"}
          </span>
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
          disabled={!isReady}
          className="w-full"
        />

        <div className="mt-2 flex justify-between text-sm text-gray-500">
          <span>00:00</span>
          <span data-testid="audio-duration">{formatMs(safeDurationMs)}</span>
        </div>

        <details
          data-testid="audio-debug-panel"
          className="mt-4 rounded-lg border border-slate-200 bg-slate-50 p-3 text-xs text-slate-700"
          onToggle={handleDebugToggle}
        >
          <summary className="cursor-pointer font-semibold text-slate-800">Audio Debug</summary>
          <div className="mt-2 space-y-1" data-testid="audio-debug-content">
            <p data-testid="audio-debug-reachability">reachability: {reachability.status}</p>
            <p data-testid="audio-debug-reachability-message" className="break-all">reachabilityMessage: {reachability.message}</p>
            <p data-testid="audio-debug-reachability-key" className="break-all">reachabilityKey: {reachability.key ?? "n/a"}</p>
            <p data-testid="audio-debug-reachability-content-type">reachabilityContentType: {reachability.contentType ?? "n/a"}</p>
            <p data-testid="audio-debug-reachability-content-length">reachabilityContentLength: {reachability.contentLength ?? "n/a"}</p>
            <p data-testid="audio-debug-reachability-checked-at">reachabilityCheckedAt: {reachability.checkedAt ?? "n/a"}</p>
            <p data-testid="audio-debug-open">debugOpen: {String(isDebugOpen)}</p>
            <p data-testid="audio-debug-ready-state">readyState: {debugInfo?.readyState ?? -1}</p>
            <p data-testid="audio-debug-network-state">networkState: {debugInfo?.networkState ?? -1}</p>
            <p data-testid="audio-debug-last-event">lastEvent: {debugInfo?.lastEvent ?? "n/a"}</p>
            <p data-testid="audio-debug-last-event-at">lastEventAt: {debugInfo?.lastEventAt ?? "n/a"}</p>
            <p data-testid="audio-debug-play-attempts">playAttempts: {debugInfo?.playAttempts ?? 0}</p>
            <p data-testid="audio-debug-user-intent">hasUserPlayIntent: {String(debugInfo?.hasUserPlayIntent ?? false)}</p>
            <p data-testid="audio-debug-pending-seek">pendingSeekMs: {debugInfo?.pendingSeekMs ?? "null"}</p>
            <p data-testid="audio-debug-pending-end">pendingEndMs: {debugInfo?.pendingEndMs ?? 0}</p>
            <p data-testid="audio-debug-error-code">errorCode: {debugInfo?.errorCode ?? "null"}</p>
            <p data-testid="audio-debug-error-message">errorMessage: {debugInfo?.errorMessage ?? "null"}</p>
            <p data-testid="audio-debug-src" className="break-all">src: {debugInfo?.src ?? audioUrl}</p>
            <p data-testid="audio-debug-current-src" className="break-all">currentSrc: {debugInfo?.currentSrc ?? ""}</p>
          </div>
        </details>
      </div>
    </div>
  );
}