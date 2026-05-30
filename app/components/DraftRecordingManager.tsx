"use client";

import React from "react";
import { AudioPlayer } from "./AudioPlayer";
import { useAudioPlayer } from "../hooks/useAudioPlayer";
import { toPlayableAudioUrl } from "../lib/audioUrls";
import type { DraftRecording, Song } from "../types";

const DRAFT_RECORDING_MIME_TYPES = [
  "audio/webm;codecs=opus",
  "audio/webm",
  "audio/mp4",
  "audio/ogg;codecs=opus",
  "audio/ogg",
] as const;
const MIN_DRAFT_TRIM_MS = 1000;
const DRAFT_TRIM_AUTOSAVE_DELAY_MS = 500;
const DRAFT_LABELS = {
  activeSection: "Draft recording",
  activeStatus: "Draft recording",
  archivedSection: "Archived Drafts",
  archivedStatus: "Archived draft",
  review: "Review",
  trim: "Trim",
  promote: "Promote to song version",
  discard: "Discard",
  saved: "Saved",
} as const;

type DraftRecordingStatus = "idle" | "recording" | "saving" | "saved" | "error";
type DraftTrimState = { startMs: number; endMs: number };

function formatMs(ms: number): string {
  const totalSeconds = Math.max(0, Math.floor(ms / 1000));
  const minutes = Math.floor(totalSeconds / 60);
  const seconds = totalSeconds % 60;
  return `${minutes}:${String(seconds).padStart(2, "0")}`;
}

function formatDraftRecordingCreatedAt(value: string): string {
  const date = new Date(value);
  if (Number.isNaN(date.getTime())) {
    return value;
  }

  return new Intl.DateTimeFormat(undefined, {
    dateStyle: "medium",
    timeStyle: "short",
  }).format(date);
}

function getDraftRecordingMimeType(): string {
  if (typeof MediaRecorder === "undefined" || typeof MediaRecorder.isTypeSupported !== "function") {
    return "";
  }

  return DRAFT_RECORDING_MIME_TYPES.find((type) => MediaRecorder.isTypeSupported(type)) ?? "";
}

function getDraftRecordingExtension(contentType: string): string {
  const baseType = contentType.split(";")[0].trim().toLowerCase();
  if (baseType === "audio/mp4") {
    return "m4a";
  }
  if (baseType === "audio/ogg") {
    return "ogg";
  }
  if (baseType === "audio/wav") {
    return "wav";
  }
  if (baseType === "audio/mpeg" || baseType === "audio/mp3") {
    return "mp3";
  }
  return "webm";
}

function clampTrimValue(value: number, durationMs: number): number {
  if (!Number.isFinite(value)) {
    return 0;
  }
  return Math.max(0, Math.min(Math.max(0, durationMs), Math.round(value)));
}

function normalizeDraftTrimState(draft: DraftRecording, durationMs: number): DraftTrimState {
  const safeDurationMs = Math.max(durationMs, draft.trimEndMs ?? 0, MIN_DRAFT_TRIM_MS);
  const rawStartMs = clampTrimValue(draft.trimStartMs ?? 0, safeDurationMs);
  const rawEndMs = clampTrimValue(draft.trimEndMs ?? safeDurationMs, safeDurationMs);
  const startMs = Math.min(rawStartMs, Math.max(0, safeDurationMs - MIN_DRAFT_TRIM_MS));
  const endMs = Math.min(safeDurationMs, Math.max(startMs + MIN_DRAFT_TRIM_MS, rawEndMs));
  return { startMs, endMs };
}

function normalizeDraftRecordingError(error: unknown, fallback: string): string {
  if (!(error instanceof Error)) {
    return fallback;
  }
  if (error.name === "NotAllowedError" || error.name === "SecurityError") {
    return "Microphone permission was denied.";
  }
  if (error.name === "NotFoundError" || error.name === "DevicesNotFoundError") {
    return "No microphone was found.";
  }
  if (error.name === "NotReadableError") {
    return "The microphone is already in use.";
  }
  return error.message || fallback;
}

function getAudioContextConstructor(): typeof AudioContext | undefined {
  if (typeof window === "undefined") {
    return undefined;
  }

  return window.AudioContext ?? (window as Window & { webkitAudioContext?: typeof AudioContext }).webkitAudioContext;
}

async function loadWaveformPeaks(audioUrl: string, peakCount = 180): Promise<number[]> {
  const AudioContextConstructor = getAudioContextConstructor();
  if (!AudioContextConstructor) {
    throw new Error("Waveform preview is unavailable in this browser.");
  }

  const response = await fetch(audioUrl, { cache: "force-cache" });
  if (!response.ok) {
    throw new Error("Waveform preview could not load audio.");
  }

  const arrayBuffer = await response.arrayBuffer();
  const audioContext = new AudioContextConstructor();
  try {
    const audioBuffer = await audioContext.decodeAudioData(arrayBuffer.slice(0));
    const channelData = audioBuffer.getChannelData(0);
    const samplesPerPeak = Math.max(1, Math.floor(channelData.length / peakCount));
    const peaks: number[] = [];

    for (let peakIndex = 0; peakIndex < peakCount; peakIndex += 1) {
      const start = peakIndex * samplesPerPeak;
      const end = Math.min(channelData.length, start + samplesPerPeak);
      let max = 0;
      for (let sampleIndex = start; sampleIndex < end; sampleIndex += 1) {
        max = Math.max(max, Math.abs(channelData[sampleIndex] ?? 0));
      }
      peaks.push(max);
    }

    const maxPeak = Math.max(...peaks, 0.01);
    return peaks.map((peak) => Math.max(0.04, peak / maxPeak));
  } finally {
    await audioContext.close().catch(() => undefined);
  }
}

function getDraftRecordingCreatedAtMs(draft: DraftRecording): number {
  const createdAtMs = new Date(draft.createdAt).getTime();
  return Number.isFinite(createdAtMs) ? createdAtMs : 0;
}

function getDraftRecordingSequence(draft: DraftRecording, drafts: DraftRecording[]): number {
  const orderedDrafts = [...drafts].sort((a, b) => {
    const createdAtDifference = getDraftRecordingCreatedAtMs(a) - getDraftRecordingCreatedAtMs(b);
    return createdAtDifference !== 0 ? createdAtDifference : a.id.localeCompare(b.id);
  });
  const index = orderedDrafts.findIndex((item) => item.id === draft.id);
  return index >= 0 ? index + 1 : drafts.indexOf(draft) + 1;
}

function getDraftRecordingFallbackTitle(draft: DraftRecording, sequence: number): string {
  const safeSequence = Math.max(1, sequence);
  return draft.title?.trim() || (draft.status === "archived" ? `Archived draft ${safeSequence}` : `Draft recording ${safeSequence}`);
}

function DraftWaveformTrim({
  audioUrl,
  currentMs,
  durationMs,
  trimStartMs,
  trimEndMs,
  isArchived,
  onSeek,
  onTrimStartChange,
  onTrimEndChange,
}: {
  audioUrl: string;
  currentMs: number;
  durationMs: number;
  trimStartMs: number;
  trimEndMs: number;
  isArchived: boolean;
  onSeek: (ms: number) => void;
  onTrimStartChange: (ms: number) => void;
  onTrimEndChange: (ms: number) => void;
}) {
  const [peaks, setPeaks] = React.useState<number[] | null>(null);
  const [waveformStatus, setWaveformStatus] = React.useState<"loading" | "ready" | "fallback">("loading");
  const [zoom, setZoom] = React.useState(1);
  const timelineRef = React.useRef<HTMLDivElement | null>(null);
  const safeDurationMs = Math.max(durationMs, trimEndMs, MIN_DRAFT_TRIM_MS);
  const trimStartPct = safeDurationMs > 0 ? (trimStartMs / safeDurationMs) * 100 : 0;
  const trimEndPct = safeDurationMs > 0 ? (trimEndMs / safeDurationMs) * 100 : 100;
  const trimWidthPct = Math.max(0, trimEndPct - trimStartPct);
  const currentPct = safeDurationMs > 0 ? (Math.min(currentMs, safeDurationMs) / safeDurationMs) * 100 : 0;
  const fallbackPeaks = React.useMemo(
    () => Array.from({ length: 80 }, (_, index) => 0.18 + ((index * 17) % 23) / 100),
    []
  );
  const displayedPeaks = peaks ?? fallbackPeaks;

  React.useEffect(() => {
    let cancelled = false;
    setPeaks(null);
    setWaveformStatus(audioUrl ? "loading" : "fallback");

    if (!audioUrl) {
      return;
    }

    void loadWaveformPeaks(audioUrl)
      .then((nextPeaks) => {
        if (cancelled) {
          return;
        }
        setPeaks(nextPeaks);
        setWaveformStatus("ready");
      })
      .catch(() => {
        if (cancelled) {
          return;
        }
        setPeaks(null);
        setWaveformStatus("fallback");
      });

    return () => {
      cancelled = true;
    };
  }, [audioUrl]);

  const handleTimelineClick = (event: React.MouseEvent<HTMLDivElement>) => {
    const target = event.target as HTMLElement;
    if (target.closest("input")) {
      return;
    }

    const rect = event.currentTarget.getBoundingClientRect();
    if (rect.width <= 0) {
      return;
    }

    const pct = Math.min(1, Math.max(0, (event.clientX - rect.left) / rect.width));
    onSeek(pct * safeDurationMs);
  };

  const updateTrimFromClientX = React.useCallback((clientX: number, handle: "start" | "end") => {
    const timeline = timelineRef.current;
    if (!timeline) {
      return;
    }

    const rect = timeline.getBoundingClientRect();
    if (rect.width <= 0) {
      return;
    }

    const pct = Math.min(1, Math.max(0, (clientX - rect.left) / rect.width));
    const nextMs = pct * safeDurationMs;
    if (handle === "start") {
      onTrimStartChange(nextMs);
    } else {
      onTrimEndChange(nextMs);
    }
  }, [onTrimEndChange, onTrimStartChange, safeDurationMs]);

  const handleTrimPointerDown = (handle: "start" | "end") => (event: React.PointerEvent<HTMLButtonElement>) => {
    if (isArchived) {
      return;
    }

    event.preventDefault();
    event.stopPropagation();
    updateTrimFromClientX(event.clientX, handle);

    const handlePointerMove = (moveEvent: PointerEvent) => {
      updateTrimFromClientX(moveEvent.clientX, handle);
    };
    const handlePointerUp = () => {
      window.removeEventListener("pointermove", handlePointerMove);
      window.removeEventListener("pointerup", handlePointerUp);
    };

    window.addEventListener("pointermove", handlePointerMove);
    window.addEventListener("pointerup", handlePointerUp, { once: true });
  };

  return (
    <div className="space-y-3">
      <div className="overflow-x-auto rounded-xl border border-indigo-200 bg-white p-2" data-testid="draft-waveform-scroll">
        <div
          ref={timelineRef}
          className="relative h-28 min-w-full touch-pan-x"
          style={{ width: `${zoom * 100}%` }}
          data-testid="draft-trim-bar"
          onClick={handleTimelineClick}
        >
          <div className="absolute inset-0 flex items-center gap-px px-2">
            {displayedPeaks.map((peak, index) => (
              <div
                key={index}
                className={`flex-1 rounded-full ${waveformStatus === "ready" ? "bg-indigo-300" : "bg-slate-200"}`}
                style={{ height: `${Math.max(8, peak * 88)}px` }}
              />
            ))}
          </div>
          <div className="absolute inset-y-0 left-0 bg-slate-100/75" style={{ width: `${trimStartPct}%` }} />
          <div className="absolute inset-y-0 right-0 bg-slate-100/75" style={{ left: `${trimEndPct}%` }} />
          <div
            className="absolute inset-y-1 rounded-lg border-2 border-indigo-700 bg-indigo-400/20"
            style={{ left: `${trimStartPct}%`, width: `${trimWidthPct}%` }}
          />
          <div
            className="absolute inset-y-0 w-0.5 rounded-full bg-slate-950"
            style={{ left: `calc(${currentPct}% - 1px)` }}
          />
          <button
            type="button"
            aria-label="Trim start"
            disabled={isArchived}
            onPointerDown={handleTrimPointerDown("start")}
            className="absolute top-1/2 z-20 flex h-20 w-8 -translate-x-1/2 -translate-y-1/2 touch-none items-center justify-center rounded-full border border-indigo-800 bg-white shadow-sm disabled:opacity-50"
            style={{ left: `${trimStartPct}%` }}
          >
            <span className="h-14 w-1.5 rounded-full bg-indigo-700" />
          </button>
          <button
            type="button"
            aria-label="Trim end"
            disabled={isArchived}
            onPointerDown={handleTrimPointerDown("end")}
            className="absolute top-1/2 z-20 flex h-20 w-8 -translate-x-1/2 -translate-y-1/2 touch-none items-center justify-center rounded-full border border-indigo-950 bg-white shadow-sm disabled:opacity-50"
            style={{ left: `${trimEndPct}%` }}
          >
            <span className="h-14 w-1.5 rounded-full bg-indigo-950" />
          </button>
          <input
            type="range"
            min={0}
            max={Math.max(0, trimEndMs - MIN_DRAFT_TRIM_MS)}
            step={50}
            value={trimStartMs}
            onChange={(event) => onTrimStartChange(Number(event.currentTarget.value))}
            disabled={isArchived}
            aria-label="Trim start"
            className="sr-only"
            data-testid="draft-trim-start"
          />
          <input
            type="range"
            min={Math.min(safeDurationMs, trimStartMs + MIN_DRAFT_TRIM_MS)}
            max={safeDurationMs}
            step={50}
            value={trimEndMs}
            onChange={(event) => onTrimEndChange(Number(event.currentTarget.value))}
            disabled={isArchived}
            aria-label="Trim end"
            className="sr-only"
            data-testid="draft-trim-end"
          />
        </div>
      </div>
      <div className="flex flex-col gap-2 sm:flex-row sm:items-center sm:justify-between">
        <p className="text-xs text-slate-600">
          {waveformStatus === "loading" ? "Loading waveform..." : waveformStatus === "fallback" ? "Waveform preview unavailable." : "Drag handles on the waveform."}
        </p>
        <label className="flex items-center gap-2 text-xs font-medium text-slate-700">
          Zoom
          <input
            type="range"
            min={1}
            max={8}
            step={0.5}
            value={zoom}
            onChange={(event) => setZoom(Number(event.currentTarget.value))}
            className="w-36 accent-indigo-700"
            data-testid="draft-waveform-zoom"
          />
        </label>
      </div>
    </div>
  );
}

function DraftRecordingListItem({
  draft,
  sequence,
  archived = false,
  onReview,
  onDiscard,
}: {
  draft: DraftRecording;
  sequence: number;
  archived?: boolean;
  onReview: (draftId: string) => void;
  onDiscard?: (draftId: string) => void;
}) {
  const title = getDraftRecordingFallbackTitle(draft, sequence);
  const secondaryText = archived && draft.archivedAt
    ? `Archived ${formatDraftRecordingCreatedAt(draft.archivedAt)}`
    : formatDraftRecordingCreatedAt(draft.createdAt);

  return (
    <li className="flex items-center justify-between gap-3 py-2">
      <div className="min-w-0">
        <p className={`truncate text-sm font-medium ${archived ? "text-slate-800" : "text-slate-900"}`}>
          {title}
        </p>
        <p className="text-xs text-slate-500">{secondaryText}</p>
      </div>
      <div className="flex shrink-0 items-center gap-2">
        {!archived && onDiscard ? (
          <button
            type="button"
            onClick={() => onDiscard(draft.id)}
            className="rounded-md border border-slate-300 bg-white px-3 py-1.5 text-sm font-semibold text-slate-700 hover:bg-slate-100"
          >
            {DRAFT_LABELS.discard}
          </button>
        ) : null}
        <button
          type="button"
          onClick={() => onReview(draft.id)}
          className={
            archived
              ? "rounded-md border border-slate-300 bg-white px-3 py-1.5 text-sm font-semibold text-slate-700 hover:bg-slate-100"
              : "rounded-md bg-indigo-600 px-3 py-1.5 text-sm font-semibold text-white hover:bg-indigo-700"
          }
        >
          {DRAFT_LABELS.review}
        </button>
      </div>
    </li>
  );
}

function DraftRecordingReview({
  draft,
  fallbackTitle,
  request,
  onTrimSaved,
  onPromoted,
  onDiscard,
  onBack,
}: {
  draft: DraftRecording;
  fallbackTitle: string;
  request: (url: string, init?: RequestInit) => Promise<Response>;
  onTrimSaved?: () => void | Promise<void>;
  onPromoted?: () => void | Promise<void>;
  onDiscard?: (draftId: string) => void;
  onBack: () => void;
}) {
  const isArchived = draft.status === "archived";
  const audioUrl = React.useMemo(() => toPlayableAudioUrl(draft.audioUrl ?? ""), [draft.audioUrl]);
  const hasAudio = audioUrl.trim().length > 0;
  const { isPlaying, isReady, currentMs, durationMs, playbackError, debugInfo, play, pause, seek } = useAudioPlayer(audioUrl);
  const title = draft.title?.trim() || fallbackTitle;
  const safeDurationMs = Math.max(durationMs, currentMs, 0);
  const trimDurationMs = Math.max(durationMs, draft.trimEndMs ?? 0, MIN_DRAFT_TRIM_MS);
  const [trimStartMs, setTrimStartMs] = React.useState(() => normalizeDraftTrimState(draft, trimDurationMs).startMs);
  const [trimEndMs, setTrimEndMs] = React.useState(() => normalizeDraftTrimState(draft, trimDurationMs).endMs);
  const [trimStatus, setTrimStatus] = React.useState<"idle" | "saving" | "saved" | "error">("idle");
  const [trimMessage, setTrimMessage] = React.useState<string | null>(null);
  const [promoteStatus, setPromoteStatus] = React.useState<"idle" | "promoting" | "error">("idle");
  const [promoteMessage, setPromoteMessage] = React.useState<string | null>(null);
  const trimSaveTimerRef = React.useRef<number | null>(null);
  const trimSaveRequestRef = React.useRef(0);
  const hasEditedTrimRef = React.useRef(false);
  const lastSavedTrimRef = React.useRef({
    trimStartMs: normalizeDraftTrimState(draft, trimDurationMs).startMs,
    trimEndMs: normalizeDraftTrimState(draft, trimDurationMs).endMs,
  });

  React.useEffect(() => {
    const nextDurationMs = Math.max(durationMs, draft.trimEndMs ?? 0, MIN_DRAFT_TRIM_MS);
    const nextTrim = normalizeDraftTrimState(draft, nextDurationMs);
    setTrimStartMs(nextTrim.startMs);
    setTrimEndMs(nextTrim.endMs);
    lastSavedTrimRef.current = {
      trimStartMs: nextTrim.startMs,
      trimEndMs: nextTrim.endMs,
    };
    hasEditedTrimRef.current = false;
    setTrimStatus("idle");
    setTrimMessage(null);
    if (trimSaveTimerRef.current !== null) {
      window.clearTimeout(trimSaveTimerRef.current);
      trimSaveTimerRef.current = null;
    }
  }, [draft.id, durationMs, draft.trimEndMs, draft.trimStartMs]);

  React.useEffect(() => {
    if (isArchived || !hasEditedTrimRef.current || trimDurationMs <= 0) {
      return;
    }

    const nextTrim = { trimStartMs, trimEndMs };
    if (
      nextTrim.trimStartMs === lastSavedTrimRef.current.trimStartMs &&
      nextTrim.trimEndMs === lastSavedTrimRef.current.trimEndMs
    ) {
      setTrimStatus("saved");
      setTrimMessage(DRAFT_LABELS.saved);
      return;
    }

    setTrimStatus("saving");
    setTrimMessage("Saving...");
    if (trimSaveTimerRef.current !== null) {
      window.clearTimeout(trimSaveTimerRef.current);
    }

    const requestId = trimSaveRequestRef.current + 1;
    trimSaveRequestRef.current = requestId;
    trimSaveTimerRef.current = window.setTimeout(() => {
      void (async () => {
        try {
          const response = await request(`/api/songs/${draft.songId}/draft-recordings/${draft.id}`, {
            method: "PATCH",
            headers: { "Content-Type": "application/json" },
            body: JSON.stringify(nextTrim),
          });
          if (!response.ok) {
            const payload = await response.json().catch(() => ({ error: "Failed to save trim" }));
            throw new Error(payload.error ?? `Failed to save trim (${response.status})`);
          }
          if (trimSaveRequestRef.current !== requestId) {
            return;
          }
          lastSavedTrimRef.current = nextTrim;
          await onTrimSaved?.();
          setTrimStatus("saved");
          setTrimMessage(DRAFT_LABELS.saved);
        } catch (error) {
          if (trimSaveRequestRef.current !== requestId) {
            return;
          }
          setTrimStatus("error");
          setTrimMessage(error instanceof Error ? error.message : "Failed to save trim.");
        }
      })();
    }, DRAFT_TRIM_AUTOSAVE_DELAY_MS);

    return () => {
      if (trimSaveTimerRef.current !== null) {
        window.clearTimeout(trimSaveTimerRef.current);
        trimSaveTimerRef.current = null;
      }
    };
  }, [draft.id, draft.songId, isArchived, onTrimSaved, request, trimDurationMs, trimEndMs, trimStartMs]);

  React.useEffect(() => {
    return () => {
      if (trimSaveTimerRef.current !== null) {
        window.clearTimeout(trimSaveTimerRef.current);
      }
      trimSaveRequestRef.current += 1;
    };
  }, []);

  const handlePlayPause = () => {
    if (!hasAudio) {
      return;
    }
    if (isPlaying) {
      pause();
      return;
    }
    const playStartMs = currentMs < trimStartMs || currentMs >= trimEndMs ? trimStartMs : currentMs;
    play(playStartMs, trimEndMs);
  };

  const handleSkip = (deltaMs: number) => {
    seek(Math.max(0, Math.min(safeDurationMs || currentMs + deltaMs, currentMs + deltaMs)));
  };

  const handleTrimStartChange = (value: number) => {
    hasEditedTrimRef.current = true;
    const nextStart = Math.min(
      clampTrimValue(value, trimDurationMs),
      Math.max(0, trimEndMs - MIN_DRAFT_TRIM_MS)
    );
    setTrimStartMs(nextStart);
    if (currentMs < nextStart) {
      seek(nextStart);
    }
  };

  const handleTrimEndChange = (value: number) => {
    hasEditedTrimRef.current = true;
    const nextEnd = Math.max(
      Math.min(trimDurationMs, clampTrimValue(value, trimDurationMs)),
      Math.min(trimDurationMs, trimStartMs + MIN_DRAFT_TRIM_MS)
    );
    setTrimEndMs(nextEnd);
    if (currentMs > nextEnd) {
      seek(nextEnd);
    }
  };

  const handlePromote = async () => {
    if (!hasAudio) {
      setPromoteStatus("error");
      setPromoteMessage("Draft recording audio is unavailable.");
      return;
    }
    setPromoteStatus("promoting");
    setPromoteMessage(null);
    try {
      const response = await request(`/api/songs/${draft.songId}/draft-recordings/${draft.id}/promote`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ trimStartMs, trimEndMs }),
      });
      if (!response.ok) {
        const payload = await response.json().catch(() => ({ error: "Failed to promote draft recording" }));
        throw new Error(payload.error ?? `Failed to promote draft recording (${response.status})`);
      }
      await onPromoted?.();
      onBack();
    } catch (error) {
      setPromoteStatus("error");
      setPromoteMessage(error instanceof Error ? error.message : "Failed to promote draft recording.");
    }
  };

  return (
    <section
      data-testid="draft-review-screen"
      className="mx-auto flex w-full max-w-2xl flex-col gap-4 rounded-lg border border-slate-200 bg-white p-4 shadow-sm"
    >
      <div className="flex items-start justify-between gap-3">
        <div className="min-w-0">
          <p className="text-xs font-semibold uppercase tracking-wide text-slate-500">{DRAFT_LABELS.activeSection}</p>
          <h2 className="mt-1 truncate text-xl font-bold text-slate-950">{title}</h2>
          <dl className="mt-3 grid grid-cols-[auto_1fr] gap-x-3 gap-y-1 text-sm text-slate-600">
            <dt className="font-medium text-slate-700">Created</dt>
            <dd>{formatDraftRecordingCreatedAt(draft.createdAt)}</dd>
            <dt className="font-medium text-slate-700">Status</dt>
            <dd>{isArchived ? DRAFT_LABELS.archivedStatus : DRAFT_LABELS.activeStatus}</dd>
            {draft.archivedAt ? (
              <>
                <dt className="font-medium text-slate-700">Archived</dt>
                <dd>{formatDraftRecordingCreatedAt(draft.archivedAt)}</dd>
              </>
            ) : null}
          </dl>
        </div>
        <button
          type="button"
          onClick={onBack}
          className="shrink-0 rounded-md border border-slate-300 px-3 py-1.5 text-sm font-semibold text-slate-700 hover:bg-slate-50"
        >
          Back
        </button>
      </div>

      <AudioPlayer
        audioUrl={draft.audioUrl ?? ""}
        currentMs={currentMs}
        durationMs={safeDurationMs}
        segmentStartMs={0}
        segmentEndMs={safeDurationMs}
        isPlaying={isPlaying}
        isReady={isReady}
        playbackError={playbackError}
        debugInfo={debugInfo}
        onPlayPause={handlePlayPause}
        onSkipBack={() => handleSkip(-5000)}
        onSkipForward={() => handleSkip(5000)}
        onSeekSong={seek}
      />
      {!hasAudio ? (
        <p className="rounded-md border border-amber-200 bg-amber-50 px-3 py-2 text-sm text-amber-800" role="alert" data-testid="draft-missing-audio">
          Draft recording audio is unavailable.
        </p>
      ) : null}

      <section data-testid="draft-trim-panel" className="rounded-lg border border-indigo-200 bg-indigo-50/50 p-3">
        <div className="mb-3 flex items-center justify-between gap-3">
          <h3 className="text-sm font-semibold text-indigo-950">{DRAFT_LABELS.trim}</h3>
          <span className="text-xs font-medium text-indigo-800">
            {formatMs(trimStartMs)} - {formatMs(trimEndMs)}
          </span>
        </div>
        <DraftWaveformTrim
          audioUrl={audioUrl}
          currentMs={currentMs}
          durationMs={trimDurationMs}
          trimStartMs={trimStartMs}
          trimEndMs={trimEndMs}
          isArchived={isArchived}
          onSeek={seek}
          onTrimStartChange={handleTrimStartChange}
          onTrimEndChange={handleTrimEndChange}
        />
        <div className="mt-3 flex flex-wrap items-center justify-between gap-2">
          <span
            className={`text-xs ${
              trimStatus === "error" ? "text-red-700" : trimStatus === "saved" ? "text-emerald-700" : "text-slate-600"
            }`}
            data-testid="draft-trim-status"
          >
            {trimMessage}
          </span>
          {!isArchived ? (
            <div className="flex flex-wrap items-center gap-2">
              {onDiscard ? (
                <button
                  type="button"
                  onClick={() => onDiscard(draft.id)}
                  className="rounded-md border border-slate-300 bg-white px-3 py-1.5 text-sm font-semibold text-slate-700 hover:bg-slate-100"
                >
                  {DRAFT_LABELS.discard}
                </button>
              ) : null}
              <button
                type="button"
                data-testid="draft-promote"
                disabled={!hasAudio || promoteStatus === "promoting"}
                onClick={() => void handlePromote()}
                className="rounded-md bg-indigo-600 px-3 py-1.5 text-sm font-semibold text-white hover:bg-indigo-700 disabled:opacity-60"
              >
                {promoteStatus === "promoting" ? "Promoting..." : DRAFT_LABELS.promote}
              </button>
            </div>
          ) : null}
        </div>
        {promoteMessage ? (
          <p
            data-testid="draft-promote-status"
            className={`mt-2 text-sm ${promoteStatus === "error" ? "text-red-700" : "text-slate-600"}`}
          >
            {promoteMessage}
          </p>
        ) : null}
      </section>
    </section>
  );
}

interface DraftRecordingManagerProps {
  song: Pick<Song, "id" | "draftRecordings" | "archivedDraftRecordings">;
  userId?: string;
  onDraftRecordingSaved?: () => void | Promise<void>;
}

export function DraftRecordingManager({ song, userId, onDraftRecordingSaved }: DraftRecordingManagerProps) {
  const [draftRecordingStatus, setDraftRecordingStatus] = React.useState<DraftRecordingStatus>("idle");
  const [draftRecordingMessage, setDraftRecordingMessage] = React.useState<string | null>(null);
  const [draftRecordingLevel, setDraftRecordingLevel] = React.useState(0);
  const [reviewingDraftId, setReviewingDraftId] = React.useState<string | null>(null);
  const [draftDiscardMessage, setDraftDiscardMessage] = React.useState<string | null>(null);
  const draftRecorderRef = React.useRef<MediaRecorder | null>(null);
  const draftRecordingStreamRef = React.useRef<MediaStream | null>(null);
  const draftRecordingChunksRef = React.useRef<Blob[]>([]);
  const draftRecordingAudioContextRef = React.useRef<AudioContext | null>(null);
  const draftRecordingAnalyserRef = React.useRef<AnalyserNode | null>(null);
  const draftRecordingSourceRef = React.useRef<MediaStreamAudioSourceNode | null>(null);
  const draftRecordingLevelFrameRef = React.useRef<number | null>(null);

  const withUserHeader = React.useCallback((init?: RequestInit): RequestInit | undefined => {
    if (!userId) {
      return init;
    }

    const headers = new Headers(init?.headers);
    headers.set("X-User-ID", userId);
    return {
      ...init,
      headers,
    };
  }, [userId]);

  const request = React.useCallback((url: string, init?: RequestInit) => {
    return fetch(url, withUserHeader(init));
  }, [withUserHeader]);

  const draftRecordings = song.draftRecordings ?? [];
  const archivedDraftRecordings = song.archivedDraftRecordings ?? [];
  const allReviewableDraftRecordings = [...draftRecordings, ...archivedDraftRecordings];
  const reviewingDraft = allReviewableDraftRecordings.find((draft) => draft.id === reviewingDraftId) ?? null;

  const stopDraftRecordingLevelMeter = React.useCallback(() => {
    if (draftRecordingLevelFrameRef.current !== null) {
      window.cancelAnimationFrame(draftRecordingLevelFrameRef.current);
      draftRecordingLevelFrameRef.current = null;
    }
    void draftRecordingAudioContextRef.current?.close().catch(() => undefined);
    draftRecordingAudioContextRef.current = null;
    draftRecordingAnalyserRef.current = null;
    draftRecordingSourceRef.current = null;
    setDraftRecordingLevel(0);
  }, []);

  const stopDraftRecordingStream = React.useCallback(() => {
    stopDraftRecordingLevelMeter();
    draftRecordingStreamRef.current?.getTracks().forEach((track) => track.stop());
    draftRecordingStreamRef.current = null;
  }, [stopDraftRecordingLevelMeter]);

  const startDraftRecordingLevelMeter = React.useCallback((stream: MediaStream) => {
    const AudioContextConstructor = getAudioContextConstructor();
    if (!AudioContextConstructor) {
      setDraftRecordingLevel(0);
      return;
    }

    try {
      const audioContext = new AudioContextConstructor();
      const analyser = audioContext.createAnalyser();
      analyser.fftSize = 256;
      const source = audioContext.createMediaStreamSource(stream);
      source.connect(analyser);
      const samples = new Uint8Array(analyser.frequencyBinCount);
      draftRecordingAudioContextRef.current = audioContext;
      draftRecordingAnalyserRef.current = analyser;
      draftRecordingSourceRef.current = source;

      const updateLevel = () => {
        analyser.getByteTimeDomainData(samples);
        let total = 0;
        for (const sample of samples) {
          const centered = sample - 128;
          total += centered * centered;
        }
        const rms = Math.sqrt(total / samples.length);
        setDraftRecordingLevel(Math.min(1, rms / 36));
        draftRecordingLevelFrameRef.current = window.requestAnimationFrame(updateLevel);
      };
      updateLevel();
    } catch {
      setDraftRecordingLevel(0);
    }
  }, []);

  const saveDraftRecordingBlob = React.useCallback(async (blob: Blob) => {
    const contentType = blob.type || "audio/webm";
    const extension = getDraftRecordingExtension(contentType);
    const timestamp = new Date().toISOString().replace(/[:.]/g, "-");
    const filename = `draft-recording-${timestamp}.${extension}`;

    const uploadUrlResponse = await request("/api/songs/upload-url", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({
        songId: song.id,
        filename,
        contentType,
        size: blob.size,
        audioVersion: "draft",
      }),
    });

    if (!uploadUrlResponse.ok) {
      const payload = await uploadUrlResponse.json().catch(() => ({ error: "Failed to prepare draft upload" }));
      throw new Error(payload.error ?? `Failed to prepare draft upload (${uploadUrlResponse.status})`);
    }

    const { uploadUrl, key } = await uploadUrlResponse.json() as { uploadUrl?: string; key?: string };
    if (!uploadUrl || !key) {
      throw new Error("Draft upload response did not include an upload URL.");
    }

    const uploadResponse = await fetch(uploadUrl, {
      method: "PUT",
      headers: { "Content-Type": contentType },
      body: blob,
    });
    if (!uploadResponse.ok) {
      throw new Error(`Draft upload failed (${uploadResponse.status})`);
    }

    const saveResponse = await request(`/api/songs/${song.id}/draft-recordings`, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ audioKey: key }),
    });
    if (!saveResponse.ok) {
      const payload = await saveResponse.json().catch(() => ({ error: "Failed to save draft recording" }));
      throw new Error(payload.error ?? `Failed to save draft recording (${saveResponse.status})`);
    }

    await onDraftRecordingSaved?.();
  }, [onDraftRecordingSaved, request, song.id]);

  const handleStartDraftRecording = React.useCallback(async () => {
    if (typeof navigator === "undefined" || !navigator.mediaDevices?.getUserMedia) {
      setDraftRecordingStatus("error");
      setDraftRecordingMessage("Recording is not available in this browser.");
      return;
    }
    if (typeof MediaRecorder === "undefined") {
      setDraftRecordingStatus("error");
      setDraftRecordingMessage("Recording is not available in this browser.");
      return;
    }

    try {
      setDraftRecordingMessage(null);
      const stream = await navigator.mediaDevices.getUserMedia({ audio: true });
      const mimeType = getDraftRecordingMimeType();
      const recorder = mimeType ? new MediaRecorder(stream, { mimeType }) : new MediaRecorder(stream);
      draftRecordingStreamRef.current = stream;
      draftRecordingChunksRef.current = [];
      startDraftRecordingLevelMeter(stream);

      recorder.addEventListener("dataavailable", (event) => {
        if (event.data.size > 0) {
          draftRecordingChunksRef.current.push(event.data);
        }
      });

      recorder.addEventListener("stop", () => {
        const recordedType = recorder.mimeType || mimeType || "audio/webm";
        stopDraftRecordingStream();
        draftRecorderRef.current = null;

        window.setTimeout(() => void (async () => {
          const chunks = [...draftRecordingChunksRef.current];
          draftRecordingChunksRef.current = [];
          try {
            if (chunks.length === 0) {
              throw new Error("No audio was captured.");
            }
            const blob = new Blob(chunks, { type: recordedType });
            if (blob.size === 0) {
              throw new Error("No audio was captured.");
            }
            await saveDraftRecordingBlob(blob);
            setDraftRecordingStatus("saved");
            setDraftRecordingMessage("Draft recording saved.");
          } catch (error) {
            setDraftRecordingStatus("error");
            setDraftRecordingMessage(normalizeDraftRecordingError(error, "Failed to save draft recording."));
          }
        })(), 0);
      });

      draftRecorderRef.current = recorder;
      recorder.start();
      setDraftRecordingStatus("recording");
      setDraftRecordingMessage("Recording...");
    } catch (error) {
      stopDraftRecordingStream();
      draftRecorderRef.current = null;
      setDraftRecordingStatus("error");
      setDraftRecordingMessage(normalizeDraftRecordingError(error, "Could not start recording."));
    }
  }, [saveDraftRecordingBlob, startDraftRecordingLevelMeter, stopDraftRecordingStream]);

  const handleStopDraftRecording = React.useCallback(() => {
    const recorder = draftRecorderRef.current;
    if (!recorder || recorder.state === "inactive") {
      return;
    }
    setDraftRecordingStatus("saving");
    setDraftRecordingMessage("Saving draft recording...");
    recorder.stop();
  }, []);

  const handleDiscardDraftRecording = React.useCallback(async (draftId: string) => {
    setDraftDiscardMessage(null);
    try {
      const response = await request(`/api/songs/${song.id}/draft-recordings/${draftId}`, {
        method: "DELETE",
      });
      if (!response.ok) {
        const payload = await response.json().catch(() => ({ error: "Failed to discard draft recording" }));
        throw new Error(payload.error ?? `Failed to discard draft recording (${response.status})`);
      }
      if (reviewingDraftId === draftId) {
        setReviewingDraftId(null);
      }
      setDraftDiscardMessage("Draft recording discarded.");
      await onDraftRecordingSaved?.();
    } catch (error) {
      setDraftDiscardMessage(error instanceof Error ? error.message : "Failed to discard draft recording.");
    }
  }, [onDraftRecordingSaved, request, reviewingDraftId, song.id]);

  React.useEffect(() => {
    return () => {
      if (draftRecorderRef.current && draftRecorderRef.current.state !== "inactive") {
        draftRecorderRef.current.stop();
      }
      stopDraftRecordingStream();
      draftRecorderRef.current = null;
      draftRecordingChunksRef.current = [];
      setDraftRecordingStatus("idle");
      setDraftRecordingMessage(null);
      setDraftRecordingLevel(0);
    };
  }, [stopDraftRecordingStream]);

  if (reviewingDraft) {
    return (
      <div className="mt-4" data-testid="segment-editor-draft-review">
        <DraftRecordingReview
          draft={reviewingDraft}
          fallbackTitle={
            reviewingDraft.status === "archived"
              ? getDraftRecordingFallbackTitle(reviewingDraft, getDraftRecordingSequence(reviewingDraft, archivedDraftRecordings))
              : getDraftRecordingFallbackTitle(reviewingDraft, getDraftRecordingSequence(reviewingDraft, draftRecordings))
          }
          request={request}
          onTrimSaved={onDraftRecordingSaved}
          onPromoted={onDraftRecordingSaved}
          onDiscard={(draftId) => void handleDiscardDraftRecording(draftId)}
          onBack={() => setReviewingDraftId(null)}
        />
      </div>
    );
  }

  return (
    <section className="mt-4 border-t border-slate-100 pt-4" data-testid="segment-editor-draft-recordings">
      <div className="flex flex-col gap-3 sm:flex-row sm:items-start sm:justify-between">
        <div>
          <h4 className="text-base font-semibold text-slate-900">{DRAFT_LABELS.activeSection}</h4>
          <p className="mt-1 text-sm text-slate-600">
            Capture reference takes while you are editing the song, then trim and promote the best one into a song version.
          </p>
        </div>
        <div className="flex min-w-0 flex-wrap items-center gap-2">
          <button
            type="button"
            data-testid="draft-recording-toggle"
            aria-pressed={draftRecordingStatus === "recording"}
            onClick={() => {
              if (draftRecordingStatus === "recording") {
                handleStopDraftRecording();
              } else {
                void handleStartDraftRecording();
              }
            }}
            disabled={draftRecordingStatus === "saving"}
            className={`rounded-full border px-3 py-1.5 text-sm font-semibold transition disabled:cursor-not-allowed disabled:opacity-60 ${
              draftRecordingStatus === "recording"
                ? "border-red-600 bg-red-600 text-white hover:bg-red-700"
                : "border-indigo-300 bg-white text-indigo-700 hover:bg-indigo-50"
            }`}
          >
            {draftRecordingStatus === "recording"
              ? "Stop"
              : draftRecordingStatus === "saving"
                ? "Saving..."
                : "Record"}
          </button>
          {draftRecordingStatus === "recording" ? (
            <div className="flex min-w-[96px] items-center gap-2" aria-label="Microphone input level" data-testid="draft-recording-level">
              <div className="h-2 w-24 overflow-hidden rounded-full bg-slate-200">
                <div
                  className="h-full rounded-full bg-emerald-500 transition-[width] duration-75"
                  style={{ width: `${Math.max(4, Math.round(draftRecordingLevel * 100))}%` }}
                />
              </div>
              <span className="text-xs text-slate-500">Input</span>
            </div>
          ) : null}
        </div>
      </div>

      {draftRecordingMessage ? (
        <p
          data-testid="draft-recording-status"
          role={draftRecordingStatus === "error" ? "alert" : "status"}
          className={`mt-2 text-xs ${
            draftRecordingStatus === "error"
              ? "text-red-700"
              : draftRecordingStatus === "saved"
                ? "text-emerald-700"
                : "text-slate-600"
          }`}
        >
          {draftRecordingMessage}
        </p>
      ) : null}

      {draftRecordings.length > 0 ? (
        <section
          data-testid="draft-recordings"
          className="mt-4 rounded-lg border border-slate-200 bg-white px-3 py-3 shadow-sm"
        >
          <div className="mb-2 flex items-center justify-between gap-3">
            <h2 className="text-sm font-semibold text-slate-900">{DRAFT_LABELS.activeSection}</h2>
            <span className="rounded-full bg-slate-100 px-2 py-0.5 text-xs font-medium text-slate-600">
              {draftRecordings.length}
            </span>
          </div>
          <ul className="divide-y divide-slate-100">
            {draftRecordings.map((draft) => (
              <DraftRecordingListItem
                key={draft.id}
                draft={draft}
                sequence={getDraftRecordingSequence(draft, draftRecordings)}
                onReview={setReviewingDraftId}
                onDiscard={(draftId) => void handleDiscardDraftRecording(draftId)}
              />
            ))}
          </ul>
          {draftDiscardMessage ? (
            <p
              className={`mt-2 text-xs ${draftDiscardMessage.includes("discarded") ? "text-emerald-700" : "text-red-700"}`}
              role={draftDiscardMessage.includes("discarded") ? "status" : "alert"}
              data-testid="draft-discard-status"
            >
              {draftDiscardMessage}
            </p>
          ) : null}
        </section>
      ) : null}

      {archivedDraftRecordings.length > 0 ? (
        <details
          data-testid="archived-drafts"
          className="group mt-4 rounded-lg border border-slate-200 bg-slate-50/70 text-slate-700"
        >
          <summary
            data-testid="archived-drafts-toggle"
            className="flex cursor-pointer list-none items-center justify-between gap-3 px-3 py-3 text-sm font-semibold"
          >
            <span>{DRAFT_LABELS.archivedSection}</span>
            <span className="flex items-center gap-2">
              <span className="rounded-full bg-slate-200 px-2 py-0.5 text-xs font-medium text-slate-600">
                {archivedDraftRecordings.length}
              </span>
              <span aria-hidden="true" className="transition-transform group-open:rotate-90">
                &gt;
              </span>
            </span>
          </summary>
          <ul className="divide-y divide-slate-200 border-t border-slate-200 px-3 py-1">
            {archivedDraftRecordings.map((draft) => (
              <DraftRecordingListItem
                key={draft.id}
                draft={draft}
                sequence={getDraftRecordingSequence(draft, archivedDraftRecordings)}
                archived
                onReview={setReviewingDraftId}
              />
            ))}
          </ul>
        </details>
      ) : null}
    </section>
  );
}
