"use client";

import { useCallback, useMemo, useRef, useState, type MouseEvent, type SyntheticEvent } from "react";
import type { AudioDebugInfo } from "../hooks/useAudioPlayer";
import { buildProxyAudioUrl, parseAudioKey } from "../lib/audioUrls";
import type { Segment } from "../types";
import { buildMasteryTimelineChunks, getMasteryColor } from "../lib/masteryColors";

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
  transportDebug?: {
    playToggleClicks: number;
    skipBackClicks: number;
    skipForwardClicks: number;
    prevSegmentClicks: number;
    nextSegmentClicks: number;
    seekClicks: number;
    debugPlayTestClicks: number;
    lastAction: string;
    lastActionAt: string;
  };
  onPlayPause: () => void;
  onSkipBack: () => void;
  onSkipForward: () => void;
  onSeekSong: (ms: number) => void;
  onDebugPlayTest?: () => void;
  segments?: Segment[];
  masteryBySegment?: Record<string, number>;
  currentSegmentIndex?: number;
  isLooping?: boolean;
  onToggleLoop?: () => void;
  lyricModeLabel?: string;
  onToggleLyricMode?: () => void;
}

type ReachabilityState = {
  status: "idle" | "checking" | "reachable" | "unreachable" | "error";
  key: string | null;
  message: string;
  checkedAt: string | null;
  contentType: string | null;
  contentLength: number | null;
};

type FetchProbeState = {
  status: "idle" | "checking" | "ok" | "error";
  message: string;
  httpStatus: number | null;
  contentType: string | null;
  contentRange: string | null;
  checkedAt: string | null;
};

let audioPlayerMountCounter = 0;

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
  transportDebug,
  onPlayPause,
  onSkipBack,
  onSkipForward,
  onSeekSong,
  onDebugPlayTest,
  segments = [],
  masteryBySegment = {},
  currentSegmentIndex,
  isLooping = false,
  onToggleLoop,
  lyricModeLabel,
  onToggleLyricMode,
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
  const [fetchProbe, setFetchProbe] = useState<FetchProbeState>({
    status: "idle",
    message: "Not checked yet",
    httpStatus: null,
    contentType: null,
    contentRange: null,
    checkedAt: null,
  });
  const mountIdRef = useRef(0);
  if (mountIdRef.current === 0) {
    audioPlayerMountCounter += 1;
    mountIdRef.current = audioPlayerMountCounter;
  }
  const [localClickAck, setLocalClickAck] = useState({
    playButtonClicks: 0,
    debugPlayButtonClicks: 0,
    fetchProbeButtonClicks: 0,
    lastAck: "none",
    lastAckAt: "n/a",
  });

  const audioKey = useMemo(() => parseAudioKey(audioUrl), [audioUrl]);
  const proxyAudioUrl = useMemo(() => buildProxyAudioUrl(audioKey), [audioKey]);

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

  const runProxyFetchProbe = useCallback(async () => {
    if (!proxyAudioUrl) {
      setFetchProbe({
        status: "error",
        message: "Proxy URL unavailable",
        httpStatus: null,
        contentType: null,
        contentRange: null,
        checkedAt: new Date().toISOString(),
      });
      return;
    }

    setFetchProbe({
      status: "checking",
      message: "Requesting first bytes from proxy...",
      httpStatus: null,
      contentType: null,
      contentRange: null,
      checkedAt: null,
    });

    try {
      const response = await fetch(proxyAudioUrl, {
        cache: "no-store",
        headers: {
          Range: "bytes=0-1023",
        },
      });

      const statusOk = response.status === 200 || response.status === 206;
      setFetchProbe({
        status: statusOk ? "ok" : "error",
        message: statusOk ? "Proxy responded with audio bytes" : `Unexpected status ${response.status}`,
        httpStatus: response.status,
        contentType: response.headers.get("content-type"),
        contentRange: response.headers.get("content-range"),
        checkedAt: new Date().toISOString(),
      });
    } catch (error) {
      const message = error instanceof Error ? error.message : "Proxy fetch probe failed";
      setFetchProbe({
        status: "error",
        message,
        httpStatus: null,
        contentType: null,
        contentRange: null,
        checkedAt: new Date().toISOString(),
      });
    }
  }, [proxyAudioUrl]);

  const handleDebugToggle = useCallback((event: SyntheticEvent<HTMLDetailsElement>) => {
    const details = event.currentTarget;
    const opened = details.open;
    setIsDebugOpen(opened);
    if (opened) {
      void checkReachability();
      void runProxyFetchProbe();
    }
  }, [checkReachability, runProxyFetchProbe]);

  const handlePlayPauseClick = useCallback((event: MouseEvent<HTMLButtonElement>) => {
    event.preventDefault();
    event.stopPropagation();
    setLocalClickAck((previous) => ({
      ...previous,
      playButtonClicks: previous.playButtonClicks + 1,
      lastAck: "play-button",
      lastAckAt: new Date().toISOString(),
    }));
    onPlayPause();
  }, [onPlayPause]);

  const handleDebugPlayTestClick = useCallback((event: MouseEvent<HTMLButtonElement>) => {
    event.preventDefault();
    event.stopPropagation();
    setLocalClickAck((previous) => ({
      ...previous,
      debugPlayButtonClicks: previous.debugPlayButtonClicks + 1,
      lastAck: "debug-play-test-button",
      lastAckAt: new Date().toISOString(),
    }));
    onDebugPlayTest?.();
  }, [onDebugPlayTest]);

  const handleFetchProbeClick = useCallback((event: MouseEvent<HTMLButtonElement>) => {
    event.preventDefault();
    event.stopPropagation();
    setLocalClickAck((previous) => ({
      ...previous,
      fetchProbeButtonClicks: previous.fetchProbeButtonClicks + 1,
      lastAck: "fetch-probe-button",
      lastAckAt: new Date().toISOString(),
    }));
    void runProxyFetchProbe();
  }, [runProxyFetchProbe]);

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
  const clampedCurrentMs = Math.min(currentMs, safeDurationMs);
  const playheadOffset = safeDurationMs > 0 ? (clampedCurrentMs / safeDurationMs) * 100 : 0;
  const masteryChunks = useMemo(
    () => buildMasteryTimelineChunks(segments, masteryBySegment, safeDurationMs),
    [segments, masteryBySegment, safeDurationMs]
  );
  const showAudioDebug = process.env.NEXT_PUBLIC_SHOW_AUDIO_DEBUG === "true";
  const handleUnifiedTimelineSeek = useCallback((event: MouseEvent<HTMLDivElement>) => {
    const rect = event.currentTarget.getBoundingClientRect();
    if (rect.width <= 0 || safeDurationMs <= 0) {
      return;
    }
    const ratio = Math.min(1, Math.max(0, (event.clientX - rect.left) / rect.width));
    onSeekSong(Math.round(ratio * safeDurationMs));
  }, [onSeekSong, safeDurationMs]);

  return (
    <div data-testid="audio-player" className="space-y-2">
      <div className="flex items-center justify-center gap-2">
        <button
          type="button"
          aria-label="Skip backward 5 seconds"
          onClick={onSkipBack}
          data-testid="audio-skip-back"
          disabled={!isReady}
          className="flex h-9 w-[84px] items-center justify-center rounded-xl border border-indigo-300 text-indigo-700 hover:bg-indigo-50 disabled:opacity-40"
        >
          <span className="inline-flex items-center gap-1 text-sm font-semibold">
            <svg aria-hidden="true" viewBox="0 0 24 24" className="h-4 w-4" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
              <path d="M9 8H5v4" />
              <path d="M5 12a7 7 0 1 0 2-5" />
            </svg>
            <span>-5</span>
          </span>
        </button>
        <button
          type="button"
          onClick={handlePlayPauseClick}
          aria-label={isPlaying ? "Pause" : "Play"}
          data-testid="audio-play-pause"
          className="h-9 w-[72px] rounded-xl bg-indigo-600 text-lg text-white hover:bg-indigo-700 disabled:opacity-50"
        >
          {isPlaying ? "⏸" : "▶"}
        </button>
        <button
          type="button"
          aria-label="Skip forward 5 seconds"
          onClick={onSkipForward}
          data-testid="audio-skip-forward"
          disabled={!isReady}
          className="flex h-9 w-[84px] items-center justify-center rounded-xl border border-indigo-300 text-indigo-700 hover:bg-indigo-50 disabled:opacity-40"
        >
          <span className="inline-flex items-center gap-1 text-sm font-semibold">
            <svg aria-hidden="true" viewBox="0 0 24 24" className="h-4 w-4" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
              <path d="M15 8h4v4" />
              <path d="M19 12a7 7 0 1 1-2-5" />
            </svg>
            <span>+5</span>
          </span>
        </button>
        <button
          type="button"
          aria-label={isLooping ? "Stop looping" : "Loop segment"}
          onClick={onToggleLoop}
          data-testid="audio-loop-toggle"
          title={isLooping ? "Loop: on (R to toggle)" : "Loop: off (R to toggle)"}
          className={`flex h-9 w-[84px] items-center justify-center rounded-xl border text-sm transition ${
            isLooping
              ? "border-indigo-500 bg-indigo-600 text-white hover:bg-indigo-700"
              : "border-indigo-300 text-indigo-700 hover:bg-indigo-50"
          }`}
        >
          <svg aria-hidden="true" viewBox="0 0 24 24" className="h-4 w-4" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
            <path d="M17 2l4 4-4 4" />
            <path d="M3 11V9a4 4 0 0 1 4-4h14" />
            <path d="M7 22l-4-4 4-4" />
            <path d="M21 13v2a4 4 0 0 1-4 4H3" />
          </svg>
        </button>
        {onToggleLyricMode ? (
          <div className="ml-1 flex items-center border-l border-slate-300 pl-2">
            <button
              type="button"
              data-testid="audio-lyric-visibility-toggle"
              aria-label="Toggle lyric visibility"
              onClick={onToggleLyricMode}
              className="h-9 rounded-xl border border-slate-300 bg-slate-50 px-3 text-xs font-semibold text-slate-700 hover:bg-slate-100"
            >
              Lyrics: {lyricModeLabel ?? "Full"}
            </button>
          </div>
        ) : null}
      </div>

      <div className="rounded-2xl border border-gray-200 bg-white px-3 py-2 shadow-sm">
        <div
          data-testid="audio-unified-timeline"
          className="relative mb-2 h-5 cursor-pointer"
          onClick={handleUnifiedTimelineSeek}
        >
          <div
            data-testid="audio-piece-mastery-bar"
            className="pointer-events-none absolute inset-x-0 top-0 h-1 overflow-hidden rounded-full border border-emerald-200"
            style={{ backgroundColor: getMasteryColor(0) }}
          >
            {masteryChunks.map((chunk, index) => {
              const widthPercent = safeDurationMs > 0
                ? ((chunk.endMs - chunk.startMs) / safeDurationMs) * 100
                : 0;
              const leftPercent = safeDurationMs > 0
                ? (chunk.startMs / safeDurationMs) * 100
                : 0;

              return (
                <div
                  key={`mastery-chunk-${index}-${chunk.startMs}-${chunk.endMs}`}
                  data-testid={`audio-piece-mastery-chunk-${index}`}
                  className="absolute inset-y-0"
                  style={{
                    left: `${leftPercent}%`,
                    width: `${widthPercent}%`,
                    backgroundColor: getMasteryColor(chunk.percent),
                  }}
                />
              );
            })}
          </div>

          <div className="pointer-events-none absolute inset-x-0 top-1/2 h-2.5 -translate-y-1/2 overflow-hidden rounded-full bg-gray-200">
            {segments.length > 0 ? (
              segments.map((segment, index) => {
                const segWidth = safeDurationMs > 0
                  ? ((segment.endMs - segment.startMs) / safeDurationMs) * 100
                  : 0;
                const segLeft = safeDurationMs > 0
                  ? (segment.startMs / safeDurationMs) * 100
                  : 0;
                const isActive = index === currentSegmentIndex;
                return (
                  <div
                    key={segment.id}
                    data-testid={isActive ? "audio-segment-window" : `audio-segment-item-${index}`}
                    className={`absolute inset-y-0 ${isActive ? "bg-amber-400" : "bg-amber-200/70"}`}
                    style={{ left: `${segLeft}%`, width: `${segWidth}%` }}
                  />
                );
              })
            ) : (
              <div
                data-testid="audio-segment-window"
                className="absolute top-0 h-2.5 rounded-full bg-amber-300/90"
                style={{ left: `${segmentOffset}%`, width: `${segmentWidth}%` }}
              />
            )}
          </div>

          <div
            data-testid="audio-playhead-marker"
            className="pointer-events-none absolute inset-y-0 w-0.5 rounded-full bg-indigo-700"
            style={{ left: `calc(${playheadOffset}% - 1px)` }}
          />

          <input
            type="range"
            min={0}
            max={safeDurationMs}
            value={clampedCurrentMs}
            onChange={(event) => onSeekSong(Number(event.target.value))}
            data-testid="audio-slider"
            disabled={!isReady}
            className="sr-only"
          />
        </div>

        <div className="mt-1 flex justify-between text-xs text-gray-500">
          <span data-testid="audio-current-time">{formatMs(clampedCurrentMs)}</span>
          <span data-testid="audio-duration">{formatMs(safeDurationMs)}</span>
        </div>

        {showAudioDebug ? (
          <details
            data-testid="audio-debug-panel"
            className="mt-4 rounded-lg border border-slate-200 bg-slate-50 p-3 text-xs text-slate-700"
            onToggle={handleDebugToggle}
          >
            <summary className="cursor-pointer font-semibold text-slate-800">Audio Debug</summary>
            <div className="mt-2 max-h-80 space-y-1 overflow-y-auto pr-1" data-testid="audio-debug-content">
            <div className="mb-2 flex gap-2" data-testid="audio-debug-actions-top">
              <button
                type="button"
                data-testid="audio-debug-run-play-test"
                onClick={handleDebugPlayTestClick}
                className="rounded border border-indigo-300 px-2 py-1 text-xs text-indigo-700 hover:bg-indigo-50"
              >
                Run Hook Play Test
              </button>
              <button
                type="button"
                data-testid="audio-debug-run-fetch-probe"
                onClick={handleFetchProbeClick}
                className="rounded border border-indigo-300 px-2 py-1 text-xs text-indigo-700 hover:bg-indigo-50"
              >
                Run Proxy Fetch Probe
              </button>
            </div>
            <p data-testid="audio-debug-reachability">reachability: {reachability.status}</p>
            <p data-testid="audio-debug-reachability-message" className="break-all">reachabilityMessage: {reachability.message}</p>
            <p data-testid="audio-debug-reachability-key" className="break-all">reachabilityKey: {reachability.key ?? "n/a"}</p>
            <p data-testid="audio-debug-reachability-content-type">reachabilityContentType: {reachability.contentType ?? "n/a"}</p>
            <p data-testid="audio-debug-reachability-content-length">reachabilityContentLength: {reachability.contentLength ?? "n/a"}</p>
            <p data-testid="audio-debug-reachability-checked-at">reachabilityCheckedAt: {reachability.checkedAt ?? "n/a"}</p>
            <p data-testid="audio-debug-fetch-probe-status">proxyFetchProbe: {fetchProbe.status}</p>
            <p data-testid="audio-debug-fetch-probe-message" className="break-all">proxyFetchProbeMessage: {fetchProbe.message}</p>
            <p data-testid="audio-debug-fetch-probe-http-status">proxyFetchHttpStatus: {fetchProbe.httpStatus ?? "n/a"}</p>
            <p data-testid="audio-debug-fetch-probe-content-type">proxyFetchContentType: {fetchProbe.contentType ?? "n/a"}</p>
            <p data-testid="audio-debug-fetch-probe-content-range">proxyFetchContentRange: {fetchProbe.contentRange ?? "n/a"}</p>
            <p data-testid="audio-debug-fetch-probe-checked-at">proxyFetchCheckedAt: {fetchProbe.checkedAt ?? "n/a"}</p>
            <p data-testid="audio-debug-open">debugOpen: {String(isDebugOpen)}</p>
            <p data-testid="audio-debug-audio-url" className="break-all">audioUrl: {audioUrl}</p>
            <p data-testid="audio-debug-proxy-url" className="break-all">proxyAudioUrl: {proxyAudioUrl ?? "n/a"}</p>
            <p data-testid="audio-debug-mount-id">audioPlayerMountId: {mountIdRef.current}</p>
            <p data-testid="audio-debug-local-play-clicks">localPlayButtonClicks: {localClickAck.playButtonClicks}</p>
            <p data-testid="audio-debug-local-debug-play-clicks">localDebugPlayButtonClicks: {localClickAck.debugPlayButtonClicks}</p>
            <p data-testid="audio-debug-local-fetch-clicks">localFetchProbeButtonClicks: {localClickAck.fetchProbeButtonClicks}</p>
            <p data-testid="audio-debug-local-last-ack" className="break-all">localLastAck: {localClickAck.lastAck}</p>
            <p data-testid="audio-debug-local-last-ack-at">localLastAckAt: {localClickAck.lastAckAt}</p>
            <p data-testid="audio-debug-ui-play-toggle-clicks">uiPlayToggleClicks: {transportDebug?.playToggleClicks ?? 0}</p>
            <p data-testid="audio-debug-ui-skip-back-clicks">uiSkipBackClicks: {transportDebug?.skipBackClicks ?? 0}</p>
            <p data-testid="audio-debug-ui-skip-forward-clicks">uiSkipForwardClicks: {transportDebug?.skipForwardClicks ?? 0}</p>
            <p data-testid="audio-debug-ui-prev-segment-clicks">uiPrevSegmentClicks: {transportDebug?.prevSegmentClicks ?? 0}</p>
            <p data-testid="audio-debug-ui-next-segment-clicks">uiNextSegmentClicks: {transportDebug?.nextSegmentClicks ?? 0}</p>
            <p data-testid="audio-debug-ui-seek-clicks">uiSeekClicks: {transportDebug?.seekClicks ?? 0}</p>
            <p data-testid="audio-debug-ui-debug-play-test-clicks">uiDebugPlayTestClicks: {transportDebug?.debugPlayTestClicks ?? 0}</p>
            <p data-testid="audio-debug-ui-last-action" className="break-all">uiLastAction: {transportDebug?.lastAction ?? "none"}</p>
            <p data-testid="audio-debug-ui-last-action-at">uiLastActionAt: {transportDebug?.lastActionAt ?? "n/a"}</p>
            <p data-testid="audio-debug-audio-instance-id">audioInstanceId: {debugInfo?.audioInstanceId ?? "n/a"}</p>
            <p data-testid="audio-debug-audio-instances-created">audioInstancesCreated: {debugInfo?.audioInstancesCreated ?? "n/a"}</p>
            <p data-testid="audio-debug-audio-init-runs">audioInitRuns: {debugInfo?.audioInitRuns ?? "n/a"}</p>
            <p data-testid="audio-debug-audio-url-changes">audioUrlChanges: {debugInfo?.audioUrlChanges ?? "n/a"}</p>
            <p data-testid="audio-debug-current-src-changes">currentSrcChanges: {debugInfo?.currentSrcChanges ?? 0}</p>
            <p data-testid="audio-debug-ready-state">readyState: {debugInfo?.readyState ?? -1}</p>
            <p data-testid="audio-debug-network-state">networkState: {debugInfo?.networkState ?? -1}</p>
            <p data-testid="audio-debug-last-event">lastEvent: {debugInfo?.lastEvent ?? "n/a"}</p>
            <p data-testid="audio-debug-last-event-at">lastEventAt: {debugInfo?.lastEventAt ?? "n/a"}</p>
            <p data-testid="audio-debug-play-attempts">playAttempts: {debugInfo?.playAttempts ?? 0}</p>
            <p data-testid="audio-debug-play-calls">playCalls: {debugInfo?.playCalls ?? 0}</p>
            <p data-testid="audio-debug-play-resolved">playResolved: {debugInfo?.playResolved ?? 0}</p>
            <p data-testid="audio-debug-play-rejected">playRejected: {debugInfo?.playRejected ?? 0}</p>
            <p data-testid="audio-debug-last-play-request" className="break-all">lastPlayRequest: {debugInfo?.lastPlayRequest ?? ""}</p>
            <p data-testid="audio-debug-last-play-outcome">lastPlayOutcome: {debugInfo?.lastPlayOutcome ?? "none"}</p>
            <p data-testid="audio-debug-last-play-error" className="break-all">lastPlayError: {debugInfo?.lastPlayError ?? "null"}</p>
            <p data-testid="audio-debug-user-intent">hasUserPlayIntent: {String(debugInfo?.hasUserPlayIntent ?? false)}</p>
            <p data-testid="audio-debug-pending-seek">pendingSeekMs: {debugInfo?.pendingSeekMs ?? "null"}</p>
            <p data-testid="audio-debug-pending-end">pendingEndMs: {debugInfo?.pendingEndMs ?? 0}</p>
            <p data-testid="audio-debug-error-code">errorCode: {debugInfo?.errorCode ?? "null"}</p>
            <p data-testid="audio-debug-error-message">errorMessage: {debugInfo?.errorMessage ?? "null"}</p>
            <p data-testid="audio-debug-src" className="break-all">src: {debugInfo?.src ?? audioUrl}</p>
            <p data-testid="audio-debug-element-src" className="break-all">elementSrc: {debugInfo?.elementSrc ?? ""}</p>
            <p data-testid="audio-debug-current-src-length">currentSrcLength: {(debugInfo?.currentSrc ?? "").length}</p>
            <div className="mt-3 rounded border border-slate-200 bg-white p-2" data-testid="audio-debug-current-src-history-wrap">
              <p className="font-semibold text-slate-800">currentSrcHistory</p>
              {(debugInfo?.currentSrcHistory ?? []).length === 0 ? (
                <p data-testid="audio-debug-current-src-history-empty">(empty)</p>
              ) : (
                <ul className="space-y-1" data-testid="audio-debug-current-src-history-list">
                  {(debugInfo?.currentSrcHistory ?? []).map((entry, index) => (
                    <li key={`${entry}-${index}`} className="break-all">{entry}</li>
                  ))}
                </ul>
              )}
            </div>
            <div className="mt-3 rounded border border-slate-200 bg-white p-2" data-testid="audio-native-probe-wrap">
              <p className="font-semibold text-slate-800">Native Audio Probe (Direct URL)</p>
              <audio data-testid="audio-native-probe-direct" className="mt-2 w-full" controls preload="metadata" src={audioUrl} />
              <p className="mt-2 font-semibold text-slate-800">Native Audio Probe (Proxy URL)</p>
              {proxyAudioUrl ? (
                <audio data-testid="audio-native-probe-proxy" className="mt-2 w-full" controls preload="metadata" src={proxyAudioUrl} />
              ) : (
                <p data-testid="audio-native-probe-proxy-unavailable">Proxy probe unavailable: could not derive audio key.</p>
              )}
            </div>
            </div>
          </details>
        ) : null}
      </div>
    </div>
  );
}