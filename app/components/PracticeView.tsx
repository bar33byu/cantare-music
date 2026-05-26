"use client";

import React, { useEffect, useMemo, useReducer } from "react";
import { Song, MemoryRating, PitchContourNote, ContourNoteHeatStat, DraftRecording } from "../types/index";
import { sessionReducer, SessionState } from "../lib/sessionReducer";
import { computeKnowledgeScore } from "../lib/knowledgeUtils";
import SegmentCard from "./SegmentCard";
import KnowledgeBar from "./KnowledgeBar";
import { AudioPlayer } from "./AudioPlayer";
import { useAudioPlayer } from "../hooks/useAudioPlayer";
import { toPlayableAudioUrl, type PreferredAudioVersion } from "../lib/audioUrls";
import { getMasteryPercent } from "../lib/masteryColors";
import { getGuestSongRatings, markGuestSongProgress, saveGuestSongRatings } from "../lib/guestProgress";
import {
  DEFAULT_CONTOUR_SAME_DEAD_ZONE,
  buildContourDirectionEvents,
  classifyContourDirection,
  compareContourAttemptDetailed,
} from "../lib/contourPractice";
import type { AttemptNoteStatus } from "../lib/contourPractice";
import {
  type DirectionTap,
  type TapAudioVersion,
  type TapDirection,
  type TapPracticeMode,
  type TapScoreResult,
} from "../lib/enhancedTapPractice";
import {
  buildMidiContourTapHeatMap,
  scoreTapAttemptAgainstMidiKey,
  type MidiSegmentAnswerKey,
} from "../lib/midiGuidedTapPractice";

interface TransportDebugState {
  playToggleClicks: number;
  skipBackClicks: number;
  skipForwardClicks: number;
  prevSegmentClicks: number;
  nextSegmentClicks: number;
  seekClicks: number;
  debugPlayTestClicks: number;
  lastAction: string;
  lastActionAt: string;
}

interface PracticeViewProps {
  song: Song;
  userId?: string;
  persistProgress?: boolean;
  progressStorage?: ProgressStorageMode;
  initialSession: SessionState;
  onSessionChange?: (session: SessionState) => void;
  onRatingsSaved?: (ratings: SessionState["ratings"]) => void;
  onDraftRecordingSaved?: () => void | Promise<void>;
  breadcrumbRootLabel?: string;
  onBreadcrumbRootClick?: () => void;
  onEditSongClick?: () => void;
  segmentPrerollMs?: number;
  preferredAudioVersion?: PreferredAudioVersion;
  onPreferredAudioVersionChange?: (version: PreferredAudioVersion) => void;
  collapseLyricLineBreaks?: boolean;
  defaultLooping?: boolean;
  playScope?: "song" | "segment";
  autoPlayOnMount?: boolean;
  autoPlayToken?: number;
  reducedControls?: boolean;
  showSegmentNavigationControls?: boolean;
  ratingKeysEnabled?: boolean;
  onSegmentPlaybackComplete?: () => void;
  onRatingSubmitted?: (rating: MemoryRating) => void;
  onAutoPlayBlocked?: (message: string | null) => void;
  onPrevSegment?: (options?: { wasPlaying: boolean }) => void;
  onNextSegment?: (options?: { wasPlaying: boolean }) => void;
  canUsePrevSegment?: boolean;
  canUseNextSegment?: boolean;
}

type LyricVisibilityMode = "full" | "hint" | "hidden";
type AudioVersion = TapAudioVersion;
export type ProgressStorageMode = "account" | "local" | "none";
type DraftRecordingStatus = "idle" | "recording" | "saving" | "saved" | "error";
type DraftTrimState = { startMs: number; endMs: number };

const LYRIC_MODE_LABELS: Record<LyricVisibilityMode, string> = {
  full: "Full",
  hint: "Hints",
  hidden: "Hidden",
};

const PRACTICED_PLAYBACK_THRESHOLD_MS = 10_000;
const PREV_SEGMENT_GO_BACK_THRESHOLD_MS = 3_000;
const OFFLINE_RATING_QUEUE_PREFIX = "cantare:offline-ratings:";
const MIN_TAP_DURATION_MS = 80;
const ROLL_WINDOW_MS = 6000;
const TAP_PERSISTENCE_WARNING_MS = 3500;
const TAP_PRACTICE_COUNT_IN_MS = 2000;
const TAP_CONTOUR_HEAT_MAP_ATTEMPT_LIMIT = 5;
// TODO: If we do not restore these debugging controls, remove the supporting
// code paths instead of keeping them hidden indefinitely.
const SHOW_AUXILIARY_TAP_DEBUG_CONTROLS = false;
const TAP_MATCH_OPTIONS = {
  timeToleranceMs: 400,
  sameDeadZone: DEFAULT_CONTOUR_SAME_DEAD_ZONE,
  durationToleranceRatio: 0.6,
} as const;
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

function formatMs(ms: number): string {
  const totalSeconds = Math.max(0, Math.floor(ms / 1000));
  const minutes = Math.floor(totalSeconds / 60);
  const seconds = totalSeconds % 60;
  return `${minutes}:${String(seconds).padStart(2, "0")}`;
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

function toDirectionLetter(direction: "up" | "down" | "same"): "U" | "D" | "S" {
  if (direction === "up") {
    return "U";
  }
  if (direction === "down") {
    return "D";
  }
  return "S";
}

interface ActiveTapCapture {
  id: string;
  startOffsetMs: number;
  lane: number;
  pointerId: number;
}

interface PersistedTapPayload {
  segmentId: string;
  noteId: string;
  timeOffsetMs: number;
  durationMs: number;
  lane: number;
  direction: TapDirection;
}

interface TapSessionSummaryPayload {
  id: string;
  songId: string;
  segmentId?: string;
  audioVersion: TapAudioVersion;
  mode: TapPracticeMode;
  startedAt: string;
  completedAt?: string;
  finalizedAt?: string;
  autoScorePercent?: number;
  scoreDetails?: TapScoreResult;
  tapCount: number;
}

function DraftRecordingListItem({
  draft,
  sequence,
  archived = false,
  isPlaying,
  onPause,
  onReview,
  onDiscard,
}: {
  draft: DraftRecording;
  sequence: number;
  archived?: boolean;
  isPlaying: boolean;
  onPause: () => void;
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
          onClick={() => {
            if (isPlaying) {
              onPause();
            }
            onReview(draft.id);
          }}
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
  const audioUrl = useMemo(() => toPlayableAudioUrl(draft.audioUrl ?? ""), [draft.audioUrl]);
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
  }, [draft.id, durationMs]);

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
        {trimMessage ? (
          <p
            className={`mt-2 text-xs ${trimStatus === "error" ? "text-red-700" : trimStatus === "saved" ? "text-emerald-700" : "text-slate-600"}`}
            role={trimStatus === "error" ? "alert" : "status"}
            data-testid="draft-trim-status"
          >
            {trimMessage}
          </p>
        ) : null}
      </section>

      {isArchived ? (
        <p className="border-t border-slate-200 pt-3 text-xs text-slate-500">
          Archived drafts are review-only.
        </p>
      ) : (
        <>
          <div className="flex flex-col gap-2 border-t border-slate-200 pt-3 sm:flex-row sm:items-center sm:justify-between">
            <p className="text-xs text-slate-500">Uses the current trim and archives this draft.</p>
            <div className="flex w-full flex-col gap-2 sm:w-auto sm:flex-row">
              {onDiscard ? (
                <button
                  type="button"
                  onClick={() => onDiscard(draft.id)}
                  className="rounded-md border border-slate-300 bg-white px-4 py-2 text-sm font-semibold text-slate-700 hover:bg-slate-100"
                  data-testid="draft-discard"
                >
                  {DRAFT_LABELS.discard}
                </button>
              ) : null}
              <button
                type="button"
                onClick={() => void handlePromote()}
                disabled={promoteStatus === "promoting" || !hasAudio}
                className="rounded-md bg-indigo-600 px-4 py-2 text-sm font-semibold text-white hover:bg-indigo-700 disabled:cursor-not-allowed disabled:opacity-60"
                data-testid="draft-promote"
              >
                {promoteStatus === "promoting" ? "Promoting..." : DRAFT_LABELS.promote}
              </button>
            </div>
          </div>
          {promoteMessage ? (
            <p className="text-sm text-red-700" role="alert" data-testid="draft-promote-status">
              {promoteMessage}
            </p>
          ) : null}
        </>
      )}
    </section>
  );
}

function getNextLyricMode(mode: LyricVisibilityMode): LyricVisibilityMode {
  if (mode === "full") {
    return "hint";
  }
  if (mode === "hint") {
    return "hidden";
  }
  return "full";
}

function buildOfflineRatingsQueueKey(songId: string): string {
  return `${OFFLINE_RATING_QUEUE_PREFIX}${songId}`;
}

function toDirectionTaps(notes: PitchContourNote[]): DirectionTap[] {
  const sorted = [...notes].sort((a, b) => a.timeOffsetMs - b.timeOffsetMs);
  return sorted.map((note, index) => ({
    id: note.id,
    timeOffsetMs: note.timeOffsetMs,
    direction: index === 0 ? "same" : classifyContourDirection(note.lane - sorted[index - 1].lane, TAP_MATCH_OPTIONS.sameDeadZone),
  }));
}

function isTapScoreResult(value: unknown): value is TapScoreResult {
  return Boolean(value && typeof value === "object" && Array.isArray((value as TapScoreResult).details));
}

function hasCompletedScoreSummary(summary: TapSessionSummaryPayload): boolean {
  return isTapScoreResult(summary.scoreDetails) && (
    Boolean(summary.finalizedAt) ||
    summary.tapCount >= summary.scoreDetails.totalTaps
  );
}

const PracticeView: React.FC<PracticeViewProps> = ({
  song,
  userId,
  persistProgress = true,
  progressStorage: progressStorageOverride,
  initialSession,
  onSessionChange,
  onRatingsSaved,
  onDraftRecordingSaved,
  breadcrumbRootLabel,
  onBreadcrumbRootClick,
  onEditSongClick,
  segmentPrerollMs = 500,
  preferredAudioVersion = "part",
  onPreferredAudioVersionChange,
  collapseLyricLineBreaks = false,
  defaultLooping = false,
  playScope = "song",
  autoPlayOnMount = false,
  autoPlayToken = 0,
  reducedControls = false,
  showSegmentNavigationControls = !reducedControls,
  ratingKeysEnabled = true,
  onSegmentPlaybackComplete,
  onRatingSubmitted,
  onAutoPlayBlocked,
  onPrevSegment,
  onNextSegment,
  canUsePrevSegment: canUsePrevSegmentOverride,
  canUseNextSegment: canUseNextSegmentOverride,
}) => {
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
    const scopedInit = withUserHeader(init);
    return scopedInit ? fetch(url, scopedInit) : fetch(url);
  }, [withUserHeader]);

  const effectiveSegmentPrerollMs = Math.max(0, segmentPrerollMs);
  const [session, dispatch] = useReducer(sessionReducer, initialSession);
  const progressStorage = progressStorageOverride ?? (persistProgress ? "account" : "none");
  const accountProgressEnabled = progressStorage === "account";
  const localProgressEnabled = progressStorage === "local";
  const ratingsEnabled = progressStorage !== "none";
  const initialSegmentId = song.segments[initialSession.currentSegmentIndex]?.id ?? null;
  const segmentIndexRef = React.useRef(initialSession.currentSegmentIndex);
  const syncedInitialSegmentIndexRef = React.useRef(initialSession.currentSegmentIndex);
  const lastSyncedSegmentIdRef = React.useRef<string | null>(initialSegmentId);
  const previousSegmentIndexRef = React.useRef(initialSession.currentSegmentIndex);
  const lastSavedRatingsRef = React.useRef<string>("unloaded");
  const [transitionDirection, setTransitionDirection] = React.useState<"forward" | "backward">("forward");
  const [transitionToken, setTransitionToken] = React.useState(0);
  const [ratingsLoading, setRatingsLoading] = React.useState(true);
  const [ratingsError, setRatingsError] = React.useState<string | null>(null);
  const [draftRecordingStatus, setDraftRecordingStatus] = React.useState<DraftRecordingStatus>("idle");
  const [draftRecordingMessage, setDraftRecordingMessage] = React.useState<string | null>(null);
  const [draftRecordingLevel, setDraftRecordingLevel] = React.useState(0);
  const [draftDiscardMessage, setDraftDiscardMessage] = React.useState<string | null>(null);
  const [reviewingDraftId, setReviewingDraftId] = React.useState<string | null>(null);
  const [lyricVisibilityMode, setLyricVisibilityMode] = React.useState<LyricVisibilityMode>("full");
  const [isLooping, setIsLooping] = React.useState(defaultLooping);
  const [isTapPracticeMode, setIsTapPracticeMode] = React.useState(false);
  const [showCardContourMap, setShowCardContourMap] = React.useState(false);
  const [showTapOverlay, setShowTapOverlay] = React.useState(true);
  const [showSameLaneGuides, setShowSameLaneGuides] = React.useState(false);
  const [tapSessionSummaries, setTapSessionSummaries] = React.useState<TapSessionSummaryPayload[]>([]);
  const [midiSegmentAnswerKeys, setMidiSegmentAnswerKeys] = React.useState<Record<string, MidiSegmentAnswerKey>>({});
  const [localMidiScoreAttemptsBySegment, setLocalMidiScoreAttemptsBySegment] = React.useState<Record<string, TapScoreResult[]>>({});
  const [tapAttemptsBySegment, setTapAttemptsBySegment] = React.useState<Record<string, PitchContourNote[]>>({});
  const [, setTapHeatMapBySegment] = React.useState<Record<string, Record<string, ContourNoteHeatStat>>>({});
  const [tapHeatMapRefreshToken, setTapHeatMapRefreshToken] = React.useState(0);
  const [tapSessionResetToken, setTapSessionResetToken] = React.useState(0);
  const [tapPracticeCountIn, setTapPracticeCountIn] = React.useState<number | null>(null);
  const [accuracyToast, setAccuracyToast] = React.useState<{ text: string; visible: boolean } | null>(null);
  const [tapPersistenceWarning, setTapPersistenceWarning] = React.useState<string | null>(null);
  const songTitleRef = React.useRef<HTMLSpanElement | null>(null);
  const [isSongTitleTruncated, setIsSongTitleTruncated] = React.useState(false);
  const practicedRecordedRef = React.useRef(false);
  const accumulatedPlaybackMsRef = React.useRef(0);
  const playbackStartedAtRef = React.useRef<number | null>(null);
  // True after the user explicitly pauses; cleared when playback restarts.
  // Used to distinguish a user pause from the hook stopping at a natural segment end.
  const pausedByUserRef = React.useRef(false);
  // Skip the isLooping-change effect on the initial mount.
  const loopEffectMountedRef = React.useRef(false);
  // Snapshot of the current playback state readable in effects without adding each
  // value as a dep (used by the isLooping-change effect).
  const playbackStateRef = React.useRef({ isPlaying: false, currentMs: 0, currentSegment: null as typeof currentSegment, durationMs: 0 });
  const [audioVersion, setAudioVersion] = React.useState<AudioVersion>(
    preferredAudioVersion === "blend" ? "blend" : "straight"
  );
  const hasStraightAudio = Boolean(song.audioUrl?.trim());
  const hasBlendAudio = Boolean(song.alternateAudioUrl?.trim());
  const hasBothAudioVersions = hasStraightAudio && hasBlendAudio;
  const activeAudioVersion: AudioVersion = hasBothAudioVersions ? audioVersion : hasBlendAudio ? "blend" : "straight";
  const activeAudioUrl = activeAudioVersion === "blend" ? (song.alternateAudioUrl ?? "") : song.audioUrl;
  const directPlaybackAudioUrl = useMemo(() => toPlayableAudioUrl(activeAudioUrl), [activeAudioUrl]);
  const pendingAudioVersionSwitchRef = React.useRef<{
    currentMs: number;
    endMs: number;
    wasPlaying: boolean;
  } | null>(null);
  const onSegmentPlaybackCompleteRef = React.useRef(onSegmentPlaybackComplete);
  const playScopeRef = React.useRef(playScope);
  const { isPlaying, isReady, currentMs, durationMs, endedCount = 0, playbackError, debugInfo, play, pause, seek, setPlaybackEndMs } = useAudioPlayer(directPlaybackAudioUrl, undefined, {
    onRangeEnd: () => {
      if (playScopeRef.current === "segment") {
        onSegmentPlaybackCompleteRef.current?.();
      }
    },
  });
  const [transportDebug, setTransportDebug] = React.useState<TransportDebugState>({
    playToggleClicks: 0,
    skipBackClicks: 0,
    skipForwardClicks: 0,
    prevSegmentClicks: 0,
    nextSegmentClicks: 0,
    seekClicks: 0,
    debugPlayTestClicks: 0,
    lastAction: "init",
    lastActionAt: new Date().toISOString(),
  });
  const hasSegments = song.segments.length > 0;
  const segmentTimingSignature = useMemo(
    () => song.segments.map((segment) => `${segment.id}:${segment.startMs}-${segment.endMs}`).join("|"),
    [song.segments]
  );
  const hasMidiTapAnswers = accountProgressEnabled && (
    Object.values(midiSegmentAnswerKeys).some((key) => key.taps.length > 0) ||
    (song.pitchContourNotes?.length ?? 0) > 0
  );
  const currentSegment = hasSegments ? song.segments[session.currentSegmentIndex] : null;
  const tapBarRef = React.useRef<HTMLDivElement | null>(null);
  const activeTapCaptureRef = React.useRef<ActiveTapCapture | null>(null);
  const toastTimerRef = React.useRef<number | null>(null);
  const tapWarningTimerRef = React.useRef<number | null>(null);
  const tapCountInIntervalRef = React.useRef<number | null>(null);
  const tapCountInTimeoutRef = React.useRef<number | null>(null);
  const draftRecorderRef = React.useRef<MediaRecorder | null>(null);
  const draftRecordingStreamRef = React.useRef<MediaStream | null>(null);
  const draftRecordingChunksRef = React.useRef<Blob[]>([]);
  const draftRecordingAudioContextRef = React.useRef<AudioContext | null>(null);
  const draftRecordingAnalyserRef = React.useRef<AnalyserNode | null>(null);
  const draftRecordingSourceRef = React.useRef<MediaStreamAudioSourceNode | null>(null);
  const draftRecordingLevelFrameRef = React.useRef<number | null>(null);
  const loopHandledRef = React.useRef<string | null>(null);
  const autoPlayHandledKeyRef = React.useRef<string | null>(null);
  const autoPlayTokenHandledRef = React.useRef<number>(0);
  const playbackCompleteNotifiedRef = React.useRef<string | null>(null);
  const lastHandledEndedCountRef = React.useRef(endedCount);
  const tapAttemptsRef = React.useRef<Record<string, PitchContourNote[]>>({});
  const [tapSessionId, setTapSessionId] = React.useState<string | null>(null);
  const tapSessionIdRef = React.useRef<string | null>(null);
  const tapSessionGenerationRef = React.useRef(0);
  const pendingPersistedTapsRef = React.useRef<PersistedTapPayload[]>([]);
  const persistTapChainRef = React.useRef<Promise<void>>(Promise.resolve());
  const isLast = !hasSegments || session.currentSegmentIndex === song.segments.length - 1;
  const isFirst = !hasSegments || session.currentSegmentIndex === 0;
  const canRestartCurrentSegment = currentSegment
    ? currentMs > currentSegment.startMs + PREV_SEGMENT_GO_BACK_THRESHOLD_MS
    : false;
  const canUsePrevSegment = canUsePrevSegmentOverride ?? (hasSegments && (!isFirst || canRestartCurrentSegment));
  const canUseNextSegment = canUseNextSegmentOverride ?? (hasSegments && !isLast);
  const tapDebugHref = React.useMemo(() => {
    const params = new URLSearchParams({ songId: song.id });
    if (tapSessionId) {
      params.set("sessionId", tapSessionId);
    }
    return `/debug-tap-practice?${params.toString()}`;
  }, [song.id, tapSessionId]);
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
    const AudioContextCtor = window.AudioContext ?? (window as Window & typeof globalThis & { webkitAudioContext?: typeof AudioContext }).webkitAudioContext;
    if (!AudioContextCtor) {
      setDraftRecordingLevel(0);
      return;
    }

    try {
      const audioContext = new AudioContextCtor();
      const analyser = audioContext.createAnalyser();
      analyser.fftSize = 256;
      const source = audioContext.createMediaStreamSource(stream);
      source.connect(analyser);
      const samples = new Uint8Array(analyser.fftSize);
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
      if (isPlaying) {
        pause();
      }
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
            console.error("Failed to save draft recording:", error);
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
  }, [isPlaying, pause, saveDraftRecordingBlob, startDraftRecordingLevelMeter, stopDraftRecordingStream]);

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
    onSegmentPlaybackCompleteRef.current = onSegmentPlaybackComplete;
  }, [onSegmentPlaybackComplete]);

  React.useEffect(() => {
    playScopeRef.current = playScope;
  }, [playScope]);
  const totalDurationMs = Math.max(durationMs, ...song.segments.map((segment) => segment.endMs), 0);
  const activeStartMs = currentSegment?.startMs ?? 0;
  const activeEndMs = currentSegment?.endMs ?? totalDurationMs;
  const currentAttemptNotes = currentSegment ? (tapAttemptsBySegment[currentSegment.id] ?? []) : [];
  const currentMidiSegmentAnswerKey = useMemo(
    () => currentSegment ? (midiSegmentAnswerKeys[currentSegment.id] ?? null) : null,
    [currentSegment, midiSegmentAnswerKeys]
  );
  const currentMidiPitchContourNotes = useMemo<PitchContourNote[]>(() => {
    if (!currentMidiSegmentAnswerKey || currentMidiSegmentAnswerKey.notes.length === 0) {
      return [];
    }

    const pitches = currentMidiSegmentAnswerKey.notes.map((note) => note.midiPitch);
    const minPitch = Math.min(...pitches);
    const maxPitch = Math.max(...pitches);
    const pitchRange = Math.max(1, maxPitch - minPitch);

    return currentMidiSegmentAnswerKey.notes.map((note) => ({
      id: `midi-contour-${currentMidiSegmentAnswerKey.segmentId}-${note.sourceWholeSongNoteIndex}`,
      timeOffsetMs: Math.max(0, Math.round(note.segmentLocalStartTimeSeconds * 1000)),
      durationMs: Math.max(MIN_TAP_DURATION_MS, Math.round(note.effectiveDurationSeconds * 1000)),
      lane: Math.min(1, Math.max(0, (note.midiPitch - minPitch) / pitchRange)),
    }));
  }, [currentMidiSegmentAnswerKey]);
  const currentCardContourNotes = currentMidiPitchContourNotes;
  const hasCardContourData = currentCardContourNotes.length > 0;
  const currentSegmentMatch = useMemo(() => {
    if (!currentSegment) {
      return null;
    }

    return compareContourAttemptDetailed(
      currentCardContourNotes,
      currentAttemptNotes,
      TAP_MATCH_OPTIONS
    );
  }, [currentAttemptNotes, currentCardContourNotes, currentSegment]);
  const currentDerivedAnswerKey = useMemo(
    () => {
      if (!currentSegment) {
        return null;
      }
      if (currentMidiSegmentAnswerKey && currentMidiSegmentAnswerKey.taps.length > 0) {
        return {
          segmentId: currentSegment.id,
          audioVersion: activeAudioVersion,
          sourceTakeIds: [currentMidiSegmentAnswerKey.alignmentId],
          taps: currentMidiSegmentAnswerKey.taps,
        };
      }
      return null;
    },
    [activeAudioVersion, currentMidiSegmentAnswerKey, currentSegment]
  );
  const enhancedTapScore = useMemo(
    () => {
      if (currentMidiSegmentAnswerKey && currentMidiSegmentAnswerKey.taps.length > 0) {
        return scoreTapAttemptAgainstMidiKey(currentMidiSegmentAnswerKey, toDirectionTaps(currentAttemptNotes), TAP_MATCH_OPTIONS.timeToleranceMs);
      }
      return null;
    },
    [currentAttemptNotes, currentMidiSegmentAnswerKey]
  );
  const currentMidiContourHeatMap = useMemo<Record<string, ContourNoteHeatStat>>(() => {
    if (!currentSegment) {
      return {};
    }
    const savedScores = tapSessionSummaries
      .filter((summary) => summary.segmentId === currentSegment.id && summary.mode === "practice" && hasCompletedScoreSummary(summary))
      .sort((a, b) => Date.parse(b.completedAt ?? b.startedAt) - Date.parse(a.completedAt ?? a.startedAt))
      .map((summary) => summary.scoreDetails)
      .filter(isTapScoreResult);
    const scores = [
      ...(localMidiScoreAttemptsBySegment[currentSegment.id] ?? []),
      ...savedScores,
    ];
    const midiKey = midiSegmentAnswerKeys[currentSegment.id] ?? null;
    return buildMidiContourTapHeatMap(midiKey, scores, TAP_CONTOUR_HEAT_MAP_ATTEMPT_LIMIT);
  }, [currentSegment, localMidiScoreAttemptsBySegment, midiSegmentAnswerKeys, tapSessionSummaries]);
  const answerDirectionLetters = useMemo(() => {
    if (!currentSegment) {
      return new Map<string, "U" | "D" | "S">();
    }
    const sortedNotes = [...currentCardContourNotes].sort((a, b) => a.timeOffsetMs - b.timeOffsetMs);
    const events = buildContourDirectionEvents(sortedNotes, TAP_MATCH_OPTIONS);
    return new Map(events.map((event, index) => [sortedNotes[index + 1]?.id, toDirectionLetter(event.direction)]).filter((entry): entry is [string, "U" | "D" | "S"] => Boolean(entry[0])));
  }, [currentCardContourNotes, currentSegment]);
  const attemptDirectionLetters = useMemo(() => {
    const sortedNotes = [...currentAttemptNotes].sort((a, b) => a.timeOffsetMs - b.timeOffsetMs);
    const events = buildContourDirectionEvents(sortedNotes, TAP_MATCH_OPTIONS);
    return new Map(events.map((event, index) => [sortedNotes[index + 1]?.id, toDirectionLetter(event.direction)]).filter((entry): entry is [string, "U" | "D" | "S"] => Boolean(entry[0])));
  }, [currentAttemptNotes]);
  const currentSegmentOffsetMs = currentSegment
    ? Math.max(0, Math.min(currentSegment.endMs - currentSegment.startMs, currentMs - currentSegment.startMs))
    : 0;
  const previousTapLane = useMemo(() => {
    if (currentAttemptNotes.length === 0) {
      return null;
    }

    return [...currentAttemptNotes].sort((a, b) => a.timeOffsetMs - b.timeOffsetMs).at(-1)?.lane ?? null;
  }, [currentAttemptNotes]);
  const previousTapGuide = useMemo(() => {
    if (previousTapLane === null) {
      return null;
    }

    const zoneTopLane = Math.min(1, previousTapLane + TAP_MATCH_OPTIONS.sameDeadZone);
    const zoneBottomLane = Math.max(0, previousTapLane - TAP_MATCH_OPTIONS.sameDeadZone);
    const topPercent = (1 - zoneTopLane) * 100;
    const bottomPercent = (1 - zoneBottomLane) * 100;
    const centerPercent = (1 - previousTapLane) * 100;

    return {
      topPercent,
      bottomPercent,
      centerPercent,
      heightPercent: Math.max(4, bottomPercent - topPercent),
    };
  }, [previousTapLane]);
  useEffect(() => {
    setAudioVersion(preferredAudioVersion === "blend" ? "blend" : "straight");
  }, [preferredAudioVersion, song.id]);

  useEffect(() => {
    const pending = pendingAudioVersionSwitchRef.current;
    if (!pending) {
      return;
    }

    pendingAudioVersionSwitchRef.current = null;
    seek(pending.currentMs);
    if (pending.wasPlaying) {
      play(pending.currentMs, pending.endMs);
      return;
    }
    setPlaybackEndMs(pending.endMs);
  }, [directPlaybackAudioUrl, play, seek, setPlaybackEndMs]);

  useEffect(() => {
    if (!hasSegments && isTapPracticeMode) {
      setIsTapPracticeMode(false);
      activeTapCaptureRef.current = null;
    }
  }, [hasSegments, isTapPracticeMode]);
  const navigationGuardRef = React.useRef<{ index: number; releaseAtMs: number; createdAtMs: number } | null>(null);
  const requestPlay = React.useCallback((startMs: number, endMs: number) => {
    play(startMs, endMs);
  }, [play]);

  const enqueueOfflineRatings = React.useCallback((snapshot: string) => {
    if (!accountProgressEnabled) {
      return;
    }
    if (typeof window === "undefined") {
      return;
    }
    try {
      markGuestSongProgress(song.id, userId);
      window.localStorage.setItem(buildOfflineRatingsQueueKey(song.id), snapshot);
    } catch {
      // Ignore queue persistence failures.
    }
  }, [accountProgressEnabled, song.id, userId]);

  const dequeueOfflineRatings = React.useCallback((): string | null => {
    if (typeof window === "undefined") {
      return null;
    }
    try {
      return window.localStorage.getItem(buildOfflineRatingsQueueKey(song.id));
    } catch {
      return null;
    }
  }, [song.id]);

  const clearOfflineRatingsQueue = React.useCallback(() => {
    if (typeof window === "undefined") {
      return;
    }
    try {
      window.localStorage.removeItem(buildOfflineRatingsQueueKey(song.id));
    } catch {
      // Ignore queue cleanup failures.
    }
  }, [song.id]);

  const postRatingsSnapshot = React.useCallback(async (snapshot: string) => {
    if (!accountProgressEnabled) {
      return;
    }
    const sessionRatings = JSON.parse(snapshot) as SessionState["ratings"];
    const ratingsPayload = sessionRatings
      .map((rating) => ({
        segmentId: rating.segmentId,
        rating: rating.rating,
        ratedAt: rating.ratedAt,
      }));

    const response = await request(`/api/songs/${song.id}/ratings`, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ ratings: ratingsPayload }),
    });

    if (!response.ok) {
      throw new Error(`Failed to save ratings (${response.status})`);
    }
    onRatingsSaved?.(sessionRatings);
    if (typeof window !== "undefined") {
      window.dispatchEvent(new Event("ratingsUpdated"));
    }
  }, [accountProgressEnabled, onRatingsSaved, request, song.id]);

  const flushOfflineRatingsIfPossible = React.useCallback(async () => {
    if (!accountProgressEnabled) {
      return;
    }
    if (typeof navigator !== "undefined" && !navigator.onLine) {
      return;
    }

    const queuedSnapshot = dequeueOfflineRatings();
    if (!queuedSnapshot) {
      return;
    }

    try {
      await postRatingsSnapshot(queuedSnapshot);
      lastSavedRatingsRef.current = queuedSnapshot;
      clearOfflineRatingsQueue();
    } catch {
      // Keep queued ratings for a future retry.
    }
  }, [accountProgressEnabled, clearOfflineRatingsQueue, dequeueOfflineRatings, postRatingsSnapshot]);

  const clearTapPersistenceWarning = React.useCallback(() => {
    if (tapWarningTimerRef.current !== null) {
      window.clearTimeout(tapWarningTimerRef.current);
      tapWarningTimerRef.current = null;
    }
    setTapPersistenceWarning(null);
  }, []);

  const showTapPersistenceWarning = React.useCallback((message: string) => {
    if (tapWarningTimerRef.current !== null) {
      window.clearTimeout(tapWarningTimerRef.current);
      tapWarningTimerRef.current = null;
    }

    setTapPersistenceWarning(message);
    tapWarningTimerRef.current = window.setTimeout(() => {
      setTapPersistenceWarning(null);
      tapWarningTimerRef.current = null;
    }, TAP_PERSISTENCE_WARNING_MS);
  }, []);

  const flushPersistedTaps = React.useCallback((sessionIdOverride?: string) => {
    const activeSessionId = sessionIdOverride ?? tapSessionIdRef.current;
    if (!activeSessionId || pendingPersistedTapsRef.current.length === 0) {
      return;
    }

    const payloads = pendingPersistedTapsRef.current.splice(0, pendingPersistedTapsRef.current.length);
    persistTapChainRef.current = persistTapChainRef.current.then(async () => {
      const failedPayloads: PersistedTapPayload[] = [];
      let hadClientFailure = false;

      for (const payload of payloads) {
        try {
          const response = await request(`/api/songs/${song.id}/tap-sessions/${activeSessionId}`, {
            method: "POST",
            headers: { "Content-Type": "application/json" },
            body: JSON.stringify(payload),
          });

          if (!response.ok) {
            if (response.status >= 400 && response.status < 500) {
              console.error(`Tap persistence rejected with ${response.status}; dropping payload.`, payload);
              hadClientFailure = true;
              continue;
            }
            throw new Error(`Failed to persist tap (${response.status})`);
          }
        } catch (error) {
          console.error("Failed to persist tap practice tap:", error);
          failedPayloads.push(payload);
        }
      }

      if (failedPayloads.length > 0) {
        pendingPersistedTapsRef.current.unshift(...failedPayloads);
      }

      if (hadClientFailure) {
        showTapPersistenceWarning("Some taps could not be saved. Toggle Tap practice off and on to start a fresh session.");
      } else if (failedPayloads.length > 0) {
        showTapPersistenceWarning("Tap saving is temporarily unavailable. We will keep retrying in the background.");
      } else {
        clearTapPersistenceWarning();
        setTapHeatMapRefreshToken((previous) => previous + 1);
      }
    });
  }, [clearTapPersistenceWarning, request, showTapPersistenceWarning, song.id]);

  const queuePersistedTap = React.useCallback((payload: PersistedTapPayload) => {
    pendingPersistedTapsRef.current.push(payload);
    flushPersistedTaps();
  }, [flushPersistedTaps]);

  const getSegmentIndexAtMs = React.useCallback((ms: number) => {
    // During overlaps, prefer the later segment so rapid next-clicks keep advancing.
    for (let i = song.segments.length - 1; i >= 0; i -= 1) {
      const segment = song.segments[i];
      if (ms >= segment.startMs && ms < segment.endMs) {
        return i;
      }
    }
    return -1;
  }, [song.segments]);

  const getSegmentStartWithPreroll = React.useCallback((startMs: number) => {
    return Math.max(0, startMs - effectiveSegmentPrerollMs);
  }, [effectiveSegmentPrerollMs]);

  // Keep snapshot up-to-date every render (before effects run).
  playbackStateRef.current = { isPlaying, currentMs, currentSegment, durationMs };

  useEffect(() => {
    // On song change, avoid forcing an initial jump to the first section start.
    lastSyncedSegmentIdRef.current = song.segments[session.currentSegmentIndex]?.id ?? null;
  }, [session.currentSegmentIndex, song.id, song.segments]);

  useEffect(() => {
    segmentIndexRef.current = session.currentSegmentIndex;
  }, [session.currentSegmentIndex]);

  useEffect(() => {
    if (!hasSegments) {
      return;
    }

    if (initialSession.currentSegmentIndex === syncedInitialSegmentIndexRef.current) {
      return;
    }

    syncedInitialSegmentIndexRef.current = initialSession.currentSegmentIndex;
    const targetIndex = Math.max(0, Math.min(song.segments.length - 1, initialSession.currentSegmentIndex));
    if (targetIndex === session.currentSegmentIndex) {
      return;
    }

    segmentIndexRef.current = targetIndex;
    dispatch({ type: "SET_SEGMENT_INDEX", index: targetIndex });

    const targetSegment = song.segments[targetIndex];
    if (targetSegment && !isPlaying) {
      seek(targetSegment.startMs);
    }
  }, [hasSegments, initialSession.currentSegmentIndex, isPlaying, seek, session.currentSegmentIndex, song.segments]);

  const flushPlayedTime = React.useCallback(() => {
    if (playbackStartedAtRef.current === null) {
      return;
    }
    const now = Date.now();
    accumulatedPlaybackMsRef.current += Math.max(0, now - playbackStartedAtRef.current);
    playbackStartedAtRef.current = now;
  }, []);

  const markPracticedIfNeeded = React.useCallback(() => {
    if (progressStorage === "none") {
      return;
    }
    if (practicedRecordedRef.current) {
      return;
    }
    if (accumulatedPlaybackMsRef.current < PRACTICED_PLAYBACK_THRESHOLD_MS) {
      return;
    }

    practicedRecordedRef.current = true;
    markGuestSongProgress(song.id, userId);
    if (!accountProgressEnabled) {
      return;
    }
    void request(`/api/songs/${song.id}/practice`, { method: "POST" }).catch(() => {
      practicedRecordedRef.current = false;
    });
  }, [accountProgressEnabled, progressStorage, request, song.id, userId]);

  useEffect(() => {
    practicedRecordedRef.current = false;
    accumulatedPlaybackMsRef.current = 0;
    playbackStartedAtRef.current = null;
  }, [song.id]);

  useEffect(() => {
    if (!isPlaying) {
      flushPlayedTime();
      playbackStartedAtRef.current = null;
      markPracticedIfNeeded();
      return;
    }

    if (playbackStartedAtRef.current === null) {
      playbackStartedAtRef.current = Date.now();
    }

    const remainingMs = PRACTICED_PLAYBACK_THRESHOLD_MS - accumulatedPlaybackMsRef.current;
    if (remainingMs <= 0) {
      markPracticedIfNeeded();
      return;
    }

    const timer = window.setTimeout(() => {
      flushPlayedTime();
      markPracticedIfNeeded();
    }, remainingMs);

    return () => {
      window.clearTimeout(timer);
    };
  }, [flushPlayedTime, isPlaying, markPracticedIfNeeded]);

  useEffect(() => {
    const measureTitleOverflow = () => {
      const el = songTitleRef.current;
      if (!el) {
        setIsSongTitleTruncated(false);
        return;
      }
      setIsSongTitleTruncated(el.scrollWidth > el.clientWidth + 1);
    };

    measureTitleOverflow();

    if (typeof window === "undefined" || typeof window.ResizeObserver === "undefined") {
      return;
    }

    const observer = new window.ResizeObserver(() => {
      measureTitleOverflow();
    });

    if (songTitleRef.current) {
      observer.observe(songTitleRef.current);
    }

    return () => {
      observer.disconnect();
    };
  }, [song.title, breadcrumbRootLabel]);

  useEffect(() => {
    if (!activeAudioUrl || !currentSegment) {
      return;
    }

    const hasSegmentChanged = lastSyncedSegmentIdRef.current !== currentSegment.id;
    if (!hasSegmentChanged) {
      return;
    }

    lastSyncedSegmentIdRef.current = currentSegment.id;

    // Avoid interrupting in-flight section transitions while actively playing.
    if (isPlaying) {
      return;
    }

    seek(currentSegment.startMs);
  }, [activeAudioUrl, currentSegment, isPlaying, seek]);

  useEffect(() => {
    if (!hasSegments || !isPlaying) {
      return;
    }

    if (playScope === "segment") {
      return;
    }

    const activeGuard = navigationGuardRef.current;
    if (activeGuard) {
      const guardExpired = Date.now() - activeGuard.createdAtMs > 1500;
      if (guardExpired) {
        navigationGuardRef.current = null;
      } else {
        if (session.currentSegmentIndex !== activeGuard.index) {
          segmentIndexRef.current = activeGuard.index;
          dispatch({ type: "SET_SEGMENT_INDEX", index: activeGuard.index });
          return;
        }

        if (currentMs < activeGuard.releaseAtMs) {
          return;
        }

        navigationGuardRef.current = null;
      }
    }

    const targetIndex = getSegmentIndexAtMs(currentMs);

    // When looping, stay on the current segment — don't auto-advance.
    if (targetIndex !== -1 && targetIndex !== session.currentSegmentIndex && !isLooping) {
      segmentIndexRef.current = targetIndex;
      dispatch({ type: "SET_SEGMENT_INDEX", index: targetIndex });
      return;
    }

    // In a gap between two segments: first half → show prior, second half → show next
    if (targetIndex === -1) {
      const firstSegmentStartMs = song.segments[0]?.startMs ?? 0;
      if (currentMs < firstSegmentStartMs) {
        if (session.currentSegmentIndex !== 0) {
          segmentIndexRef.current = 0;
          dispatch({ type: "SET_SEGMENT_INDEX", index: 0 });
        }
        return;
      }

      const gapBeforeIndex = song.segments.findIndex((seg, i) => {
        const next = song.segments[i + 1];
        return next !== undefined && currentMs >= seg.endMs && currentMs < next.startMs;
      });

      if (gapBeforeIndex !== -1) {
        const gapStart = song.segments[gapBeforeIndex].endMs;
        const gapEnd = song.segments[gapBeforeIndex + 1].startMs;
        const gapMidpoint = (gapStart + gapEnd) / 2;
        const gapTargetIndex = currentMs < gapMidpoint ? gapBeforeIndex : gapBeforeIndex + 1;
        if (gapTargetIndex !== session.currentSegmentIndex) {
          segmentIndexRef.current = gapTargetIndex;
          dispatch({ type: "SET_SEGMENT_INDEX", index: gapTargetIndex });
        }
        return;
      }
    }

    if (currentMs >= song.segments[song.segments.length - 1].endMs && session.currentSegmentIndex !== song.segments.length - 1) {
      segmentIndexRef.current = song.segments.length - 1;
      dispatch({ type: "SET_SEGMENT_INDEX", index: song.segments.length - 1 });
    }
  }, [currentMs, getSegmentIndexAtMs, hasSegments, isLooping, isPlaying, playScope, session.currentSegmentIndex, song.segments]);

  useEffect(() => {
    if (localProgressEnabled) {
      const loadedRatings = getGuestSongRatings(song.id);
      dispatch({ type: 'LOAD_RATINGS', ratings: loadedRatings });
      lastSavedRatingsRef.current = JSON.stringify(loadedRatings);
      setRatingsLoading(false);
      setRatingsError(null);
      return;
    }

    if (!accountProgressEnabled) {
      dispatch({ type: 'LOAD_RATINGS', ratings: [] });
      lastSavedRatingsRef.current = JSON.stringify([]);
      setRatingsLoading(false);
      setRatingsError(null);
      return;
    }

    let cancelled = false;

    const loadRatings = async () => {
      setRatingsLoading(true);
      setRatingsError(null);
      try {
        const response = await request(`/api/songs/${song.id}/ratings`);
        if (!response.ok) {
          throw new Error(`Failed to load ratings (${response.status})`);
        }

        const payload = await response.json() as { ratings?: SessionState['ratings'] };
        if (!cancelled) {
          const loadedRatings = Array.isArray(payload.ratings) ? payload.ratings : [];
          if (loadedRatings.length > 0) {
            markGuestSongProgress(song.id, userId);
          }
          dispatch({ type: 'LOAD_RATINGS', ratings: loadedRatings });
          // Mark what's already on the server so the save effect skips the initial load
          lastSavedRatingsRef.current = JSON.stringify(loadedRatings);
        }
      } catch {
        if (!cancelled) {
          const queuedSnapshot = dequeueOfflineRatings();
          if (queuedSnapshot) {
            try {
              const queuedRatings = JSON.parse(queuedSnapshot) as SessionState["ratings"];
              dispatch({ type: "LOAD_RATINGS", ratings: Array.isArray(queuedRatings) ? queuedRatings : [] });
              lastSavedRatingsRef.current = queuedSnapshot;
            } catch {
              lastSavedRatingsRef.current = JSON.stringify(session.ratings);
            }
          } else {
            // Load failed — treat existing state as already saved to avoid erasing server data
            lastSavedRatingsRef.current = JSON.stringify(session.ratings);
          }
          setRatingsError('Could not load previous ratings. Practice is still available.');
        }
      } finally {
        if (!cancelled) {
          setRatingsLoading(false);
        }
      }
    };

    void loadRatings();

    return () => {
      cancelled = true;
    };
  }, [accountProgressEnabled, dequeueOfflineRatings, localProgressEnabled, request, song.id, userId]);

  const currentRating: MemoryRating | undefined = (() => {
    if (!currentSegment) {
      return undefined;
    }
    const segRatings = session.ratings
      .filter((rating) => rating.segmentId === currentSegment.id)
      .sort((a, b) => (a.ratedAt > b.ratedAt ? -1 : 1));
    return segRatings.length > 0 ? segRatings[0].rating : undefined;
  })();

  const knowledgeScore = computeKnowledgeScore(session, song);
  const masteryPercentForSegment = React.useCallback(
    (segmentId: string) => getMasteryPercent(knowledgeScore.bySegment, segmentId),
    [knowledgeScore.bySegment]
  );

  const jumpToSegment = (
    targetIndex: number,
    options?: {
      preventBackwardWhilePlaying?: boolean;
    }
  ) => {
    if (!hasSegments) {
      return;
    }
    const clamped = Math.max(0, Math.min(song.segments.length - 1, targetIndex));
    const targetSegment = song.segments[clamped];
    segmentIndexRef.current = clamped;
    dispatch({ type: "SET_SEGMENT_INDEX", index: clamped });
    if (isPlaying) {
      let targetStartWithPreroll = getSegmentStartWithPreroll(targetSegment.startMs);
      if (options?.preventBackwardWhilePlaying) {
        targetStartWithPreroll = Math.max(currentMs, targetStartWithPreroll);
        navigationGuardRef.current = {
          index: clamped,
          releaseAtMs: targetSegment.startMs,
          createdAtMs: Date.now(),
        };
      }
      if (isLooping) {
        requestPlay(targetStartWithPreroll, targetSegment.endMs);
        return;
      }

      const effectiveDurationMs = durationMs > 0 ? durationMs : Number.POSITIVE_INFINITY;
      requestPlay(targetStartWithPreroll, effectiveDurationMs);
      return;
    }
    seek(targetSegment.startMs);
  };

  const handleTogglePlay = () => {
    setTransportDebug((previous) => ({
      ...previous,
      playToggleClicks: previous.playToggleClicks + 1,
      lastAction: "toggle-play",
      lastActionAt: new Date().toISOString(),
    }));
    if (isPlaying) {
      cancelTapPracticeCountIn();
      pausedByUserRef.current = true;
      pause();
      return;
    }

    if (tapPracticeCountIn !== null) {
      cancelTapPracticeCountIn();
      return;
    }

    if (playScope === "segment" && currentSegment) {
      pausedByUserRef.current = false;
      startTapPracticePlayback(getSegmentStartWithPreroll(currentSegment.startMs), currentSegment.endMs, {
        resetTapRun: isTapPracticeMode,
      });
      return;
    }

    const effectiveDurationMs = isLooping && currentSegment
      ? currentSegment.endMs
      : durationMs > 0
        ? durationMs
        : Number.POSITIVE_INFINITY;
    const fullPieceResumeMs = durationMs > 0 && currentMs >= durationMs ? 0 : currentMs;
    startTapPracticePlayback(fullPieceResumeMs, effectiveDurationMs, {
      resetTapRun: isTapPracticeMode && fullPieceResumeMs === 0,
    });
  };

  const handleSkipBy = (deltaMs: number) => {
    const nextMs = Math.max(0, Math.min(totalDurationMs, currentMs + deltaMs));
    setTransportDebug((previous) => ({
      ...previous,
      skipBackClicks: deltaMs < 0 ? previous.skipBackClicks + 1 : previous.skipBackClicks,
      skipForwardClicks: deltaMs > 0 ? previous.skipForwardClicks + 1 : previous.skipForwardClicks,
      lastAction: deltaMs < 0 ? "skip-back-5" : "skip-forward-5",
      lastActionAt: new Date().toISOString(),
    }));
    handleSeekSong(nextMs);
  };

  const handlePrevSegment = () => {
    if (onPrevSegment) {
      onPrevSegment({ wasPlaying: isPlaying });
      return;
    }

    if (!hasSegments || !currentSegment) {
      return;
    }

    const activeIndex = segmentIndexRef.current;
    const activeSegment = song.segments[activeIndex] ?? currentSegment;
    const elapsedInSegmentMs = currentMs - activeSegment.startMs;
    const shouldGoToPreviousSegment = elapsedInSegmentMs <= PREV_SEGMENT_GO_BACK_THRESHOLD_MS && activeIndex > 0;

    setTransportDebug((previous) => ({
      ...previous,
      prevSegmentClicks: previous.prevSegmentClicks + 1,
      lastAction: shouldGoToPreviousSegment ? "prev-segment" : "restart-segment",
      lastActionAt: new Date().toISOString(),
    }));

    if (shouldGoToPreviousSegment) {
      jumpToSegment(activeIndex - 1);
      return;
    }

    jumpToSegment(activeSegment ? activeIndex : session.currentSegmentIndex);
  };

  const handleNextSegment = () => {
    if (onNextSegment) {
      onNextSegment({ wasPlaying: isPlaying });
      return;
    }

    if (!hasSegments) {
      return;
    }

    const firstSegmentStartMs = song.segments[0]?.startMs ?? 0;
    if (currentMs < firstSegmentStartMs) {
      setTransportDebug((previous) => ({
        ...previous,
        nextSegmentClicks: previous.nextSegmentClicks + 1,
        lastAction: "next-segment-to-first",
        lastActionAt: new Date().toISOString(),
      }));
      jumpToSegment(0);
      return;
    }

    const activeIndex = segmentIndexRef.current;
    if (activeIndex >= song.segments.length - 1) {
      return;
    }

    setTransportDebug((previous) => ({
      ...previous,
      nextSegmentClicks: previous.nextSegmentClicks + 1,
      lastAction: "next-segment",
      lastActionAt: new Date().toISOString(),
    }));
    jumpToSegment(activeIndex + 1, { preventBackwardWhilePlaying: !isLooping });
  };

  const handleSeekSong = (ms: number) => {
    setTransportDebug((previous) => ({
      ...previous,
      seekClicks: previous.seekClicks + 1,
      lastAction: `seek-song-${ms}`,
      lastActionAt: new Date().toISOString(),
    }));
    navigationGuardRef.current = null;
    cancelTapPracticeCountIn();
    const seeksToSegmentStart = currentSegment
      ? ms <= currentSegment.startMs + 50 && currentMs > currentSegment.startMs + 250
      : false;
    if (isTapPracticeMode && ((ms === 0 && currentMs > 0) || seeksToSegmentStart)) {
      resetTapPracticeRun();
    }
    seek(ms);
    const targetIndex = getSegmentIndexAtMs(ms);
    if (targetIndex !== -1 && targetIndex !== session.currentSegmentIndex) {
      segmentIndexRef.current = targetIndex;
      dispatch({ type: "SET_SEGMENT_INDEX", index: targetIndex });
    }
  };

  const handleToggleLoop = React.useCallback(() => {
    if (!isLooping) {
      const targetIndex = getSegmentIndexAtMs(currentMs);
      if (targetIndex !== -1 && targetIndex !== session.currentSegmentIndex) {
        segmentIndexRef.current = targetIndex;
        dispatch({ type: "SET_SEGMENT_INDEX", index: targetIndex });
      }
    }

    setIsLooping((previous) => !previous);
  }, [currentMs, getSegmentIndexAtMs, isLooping, session.currentSegmentIndex]);

  const handleAudioVersionChange = React.useCallback((nextVersion: AudioVersion) => {
    if (nextVersion === activeAudioVersion || !hasBothAudioVersions) {
      return;
    }

    pendingAudioVersionSwitchRef.current = {
      currentMs,
      endMs: isLooping && currentSegment
        ? currentSegment.endMs
        : durationMs > 0
          ? durationMs
          : Number.POSITIVE_INFINITY,
      wasPlaying: isPlaying,
    };

    onPreferredAudioVersionChange?.(nextVersion === "blend" ? "blend" : "part");
    setAudioVersion(nextVersion);
  }, [activeAudioVersion, currentMs, currentSegment, durationMs, hasBothAudioVersions, isLooping, isPlaying, onPreferredAudioVersionChange]);

  const getTapLane = React.useCallback((clientY: number) => {
    const rect = tapBarRef.current?.getBoundingClientRect();
    if (!rect || rect.height <= 0) {
      return 0.5;
    }

    const ratio = Math.min(1, Math.max(0, (clientY - rect.top) / rect.height));
    return 1 - ratio;
  }, []);

  const showAccuracyToast = React.useCallback((text: string) => {
    setAccuracyToast({ text, visible: true });
    if (toastTimerRef.current !== null) {
      window.clearTimeout(toastTimerRef.current);
    }
    toastTimerRef.current = window.setTimeout(() => {
      setAccuracyToast(null);
      toastTimerRef.current = null;
    }, 1600);
  }, []);

  const finalizeTapCapture = React.useCallback((endLane?: number) => {
    const capture = activeTapCaptureRef.current;
    if (!capture || !currentSegment) {
      activeTapCaptureRef.current = null;
      return;
    }

    const segmentDurationMs = Math.max(1, currentSegment.endMs - currentSegment.startMs);
    const latestOffsetMs = Math.min(segmentDurationMs, Math.max(0, Math.round(currentMs - currentSegment.startMs)));
    const minEndOffsetMs = Math.min(segmentDurationMs, capture.startOffsetMs + MIN_TAP_DURATION_MS);
    const endOffsetMs = Math.max(minEndOffsetMs, latestOffsetMs);
    if (endOffsetMs <= capture.startOffsetMs) {
      activeTapCaptureRef.current = null;
      return;
    }

    const note: PitchContourNote = {
      id: capture.id,
      timeOffsetMs: capture.startOffsetMs,
      durationMs: endOffsetMs - capture.startOffsetMs,
      lane: Math.min(1, Math.max(0, typeof endLane === "number" ? endLane : capture.lane)),
    };

    const segmentId = currentSegment.id;
    const latestForSegment = tapAttemptsRef.current[segmentId] ?? [];
    const nextSegmentNotes = [...latestForSegment, note].sort((a, b) => a.timeOffsetMs - b.timeOffsetMs);
    const directionTaps = toDirectionTaps(nextSegmentNotes);
    const noteDirection = directionTaps.find((tap) => tap.id === note.id)?.direction ?? "same";
    const immediateScore = currentMidiSegmentAnswerKey
      ? scoreTapAttemptAgainstMidiKey(currentMidiSegmentAnswerKey, directionTaps, TAP_MATCH_OPTIONS.timeToleranceMs)
      : null;
    const contourFallbackMatch = currentMidiSegmentAnswerKey
      ? null
      : compareContourAttemptDetailed(currentCardContourNotes, nextSegmentNotes, TAP_MATCH_OPTIONS);
    const missedTap = immediateScore
      ? immediateScore.details.some((detail) => detail.actual?.id === note.id && detail.status !== "matched")
      : contourFallbackMatch?.attemptNoteStatuses[note.id] === "mismatched";

    setTapAttemptsBySegment((previous) => ({
      ...previous,
      [segmentId]: nextSegmentNotes,
    }));

    if (missedTap) {
      if (typeof navigator !== "undefined" && "vibrate" in navigator) {
        navigator.vibrate([35, 20, 35]);
      }
      showAccuracyToast("Missed tap");
    }

    queuePersistedTap({
      segmentId,
      noteId: note.id,
      timeOffsetMs: note.timeOffsetMs,
      durationMs: note.durationMs,
      lane: note.lane,
      direction: noteDirection,
    });

    activeTapCaptureRef.current = null;
  }, [currentCardContourNotes, currentMidiSegmentAnswerKey, currentMs, currentSegment, queuePersistedTap, showAccuracyToast]);

  const clearCurrentSegmentTaps = React.useCallback(() => {
    if (!currentSegment) {
      return;
    }
    setTapAttemptsBySegment((previous) => ({
      ...previous,
      [currentSegment.id]: [],
    }));
    activeTapCaptureRef.current = null;
  }, [currentSegment]);

  const recordCurrentMidiContourAttempt = React.useCallback(() => {
    if (!currentSegment || !currentMidiSegmentAnswerKey || currentMidiSegmentAnswerKey.taps.length === 0) {
      return;
    }

    const attemptNotes = tapAttemptsRef.current[currentSegment.id] ?? [];
    const score = scoreTapAttemptAgainstMidiKey(
      currentMidiSegmentAnswerKey,
      toDirectionTaps(attemptNotes),
      TAP_MATCH_OPTIONS.timeToleranceMs
    );
    setLocalMidiScoreAttemptsBySegment((previous) => ({
      ...previous,
      [currentSegment.id]: [
        score,
        ...(previous[currentSegment.id] ?? []),
      ].slice(0, TAP_CONTOUR_HEAT_MAP_ATTEMPT_LIMIT),
    }));
  }, [currentMidiSegmentAnswerKey, currentSegment]);

  const resetTapPracticeRun = React.useCallback(() => {
    activeTapCaptureRef.current = null;
    loopHandledRef.current = null;
    pendingPersistedTapsRef.current = [];
    setTapAttemptsBySegment({});
    setTapSessionResetToken((previous) => previous + 1);
  }, []);

  const cancelTapPracticeCountIn = React.useCallback(() => {
    if (tapCountInIntervalRef.current !== null) {
      window.clearInterval(tapCountInIntervalRef.current);
      tapCountInIntervalRef.current = null;
    }
    if (tapCountInTimeoutRef.current !== null) {
      window.clearTimeout(tapCountInTimeoutRef.current);
      tapCountInTimeoutRef.current = null;
    }
    setTapPracticeCountIn(null);
  }, []);

  const startTapPracticePlayback = React.useCallback((
    startMs: number,
    endMs: number,
    options?: { resetTapRun?: boolean }
  ) => {
    if (!isTapPracticeMode) {
      requestPlay(startMs, endMs);
      return;
    }

    cancelTapPracticeCountIn();

    if (options?.resetTapRun) {
      resetTapPracticeRun();
    }

    const deadline = Date.now() + TAP_PRACTICE_COUNT_IN_MS;
    setTapPracticeCountIn(2);
    tapCountInIntervalRef.current = window.setInterval(() => {
      const remainingMs = Math.max(0, deadline - Date.now());
      const nextCount = remainingMs <= 0 ? null : Math.max(1, Math.ceil(remainingMs / 1000));
      setTapPracticeCountIn(nextCount);
    }, 100);
    tapCountInTimeoutRef.current = window.setTimeout(() => {
      cancelTapPracticeCountIn();
      requestPlay(startMs, endMs);
    }, TAP_PRACTICE_COUNT_IN_MS);
  }, [cancelTapPracticeCountIn, isTapPracticeMode, requestPlay, resetTapPracticeRun]);

  React.useEffect(() => {
    const targetIndex = hasSegments
      ? Math.max(0, Math.min(song.segments.length - 1, initialSession.currentSegmentIndex))
      : session.currentSegmentIndex;

    if (!autoPlayOnMount || playScope !== "segment" || !currentSegment || targetIndex !== session.currentSegmentIndex) {
      return;
    }

    const autoPlayKey = `${activeAudioUrl}:${currentSegment.id}`;
    if (autoPlayHandledKeyRef.current === autoPlayKey) {
      return;
    }

    autoPlayHandledKeyRef.current = autoPlayKey;
    pausedByUserRef.current = false;
    startTapPracticePlayback(getSegmentStartWithPreroll(currentSegment.startMs), currentSegment.endMs, {
      resetTapRun: isTapPracticeMode,
    });
  }, [
    activeAudioUrl,
    autoPlayOnMount,
    currentSegment,
    getSegmentStartWithPreroll,
    hasSegments,
    initialSession.currentSegmentIndex,
    isTapPracticeMode,
    playScope,
    session.currentSegmentIndex,
    song.segments.length,
    startTapPracticePlayback,
  ]);

  React.useEffect(() => {
    const targetIndex = hasSegments
      ? Math.max(0, Math.min(song.segments.length - 1, initialSession.currentSegmentIndex))
      : session.currentSegmentIndex;

    if (
      autoPlayToken <= 0 ||
      autoPlayTokenHandledRef.current === autoPlayToken ||
      playScope !== "segment" ||
      !currentSegment ||
      targetIndex !== session.currentSegmentIndex
    ) {
      return;
    }

    autoPlayTokenHandledRef.current = autoPlayToken;
    playbackCompleteNotifiedRef.current = null;
    pausedByUserRef.current = false;
    startTapPracticePlayback(getSegmentStartWithPreroll(currentSegment.startMs), currentSegment.endMs, {
      resetTapRun: isTapPracticeMode,
    });

    const blockedCheckTimer = window.setTimeout(() => {
      const state = playbackStateRef.current;
      if (!state.isPlaying && state.currentSegment?.id === currentSegment.id) {
        onAutoPlayBlocked?.(playbackError ?? "Your browser blocked automatic audio. Press Play once to continue Auto Drill.");
      }
    }, 1200);

    return () => {
      window.clearTimeout(blockedCheckTimer);
    };
  }, [
    autoPlayToken,
    currentSegment,
    getSegmentStartWithPreroll,
    hasSegments,
    initialSession.currentSegmentIndex,
    isTapPracticeMode,
    onAutoPlayBlocked,
    playbackError,
    playScope,
    session.currentSegmentIndex,
    song.segments.length,
    startTapPracticePlayback,
  ]);

  const getRollX = React.useCallback((noteOffsetMs: number) => {
    return 100 - ((currentSegmentOffsetMs - noteOffsetMs) / ROLL_WINDOW_MS) * 100;
  }, [currentSegmentOffsetMs]);

  const getAttemptStatusColor = React.useCallback((status: AttemptNoteStatus) => {
    if (status === "matched") {
      return "rgb(22 163 74)";
    }
    if (status === "mismatched") {
      return "rgb(220 38 38)";
    }
    return "rgb(245 158 11)";
  }, []);

  const handleRateCurrentSegment = React.useCallback((rating: MemoryRating) => {
    if (!currentSegment) {
      return;
    }
    if (rating === 1 && currentRating === 1) {
      dispatch({ type: "CLEAR_SEGMENT_RATING", segmentId: currentSegment.id });
      onRatingSubmitted?.(rating);
      return;
    }
    dispatch({ type: "RATE_SEGMENT", segmentId: currentSegment.id, rating });
    onRatingSubmitted?.(rating);
  }, [currentSegment, currentRating, onRatingSubmitted]);

  const handleDebugPlayTest = () => {
    setTransportDebug((previous) => ({
      ...previous,
      debugPlayTestClicks: previous.debugPlayTestClicks + 1,
      lastAction: "debug-play-test",
      lastActionAt: new Date().toISOString(),
    }));
    requestPlay(0, 10000);
  };

  useEffect(() => {
    const isTextInputLike = (target: EventTarget | null): boolean => {
      if (!(target instanceof HTMLElement)) {
        return false;
      }
      if (target.isContentEditable) {
        return true;
      }
      const tagName = target.tagName.toLowerCase();
      return tagName === "input" || tagName === "textarea" || tagName === "select";
    };

    const onKeyDown = (event: KeyboardEvent) => {
      if (event.altKey || event.ctrlKey || event.metaKey) {
        return;
      }
      if (isTextInputLike(event.target)) {
        return;
      }

      if (event.key === " ") {
        event.preventDefault();
        handleTogglePlay();
        return;
      }

      if (event.key === "ArrowLeft") {
        event.preventDefault();
        handleSkipBy(-5000);
        return;
      }

      if (event.key === "ArrowRight") {
        event.preventDefault();
        handleSkipBy(5000);
        return;
      }

      if (event.key === "PageUp") {
        event.preventDefault();
        handlePrevSegment();
        return;
      }

      if (event.key === "PageDown") {
        event.preventDefault();
        handleNextSegment();
        return;
      }

      // J/K/L shuttle controls (J=−5s, K=play-pause, L=+5s)
      // Shift+J/L for ±15s jumps; U/O for prev/next segment
      if (event.key === "j" || event.key === "J") {
        event.preventDefault();
        handleSkipBy(event.shiftKey ? -15000 : -5000);
        return;
      }

      if (event.key === "k") {
        event.preventDefault();
        handleTogglePlay();
        return;
      }

      if (event.key === "l" || event.key === "L") {
        event.preventDefault();
        handleSkipBy(event.shiftKey ? 15000 : 5000);
        return;
      }

      if (event.key === "u") {
        event.preventDefault();
        handlePrevSegment();
        return;
      }

      if (event.key === "o") {
        event.preventDefault();
        handleNextSegment();
        return;
      }

      if (event.key === "r") {
        event.preventDefault();
        handleToggleLoop();
        return;
      }

      if (ratingKeysEnabled && /^[1-5]$/.test(event.key)) {
        event.preventDefault();
        handleRateCurrentSegment(Number(event.key) as MemoryRating);
      }
    };

    window.addEventListener("keydown", onKeyDown);
    return () => window.removeEventListener("keydown", onKeyDown);
}, [handleNextSegment, handlePrevSegment, handleRateCurrentSegment, handleSkipBy, handleToggleLoop, handleTogglePlay, ratingKeysEnabled]);

  // Keep playback running in place when loop mode is toggled: only change end boundary.
  useEffect(() => {
    if (!loopEffectMountedRef.current) {
      loopEffectMountedRef.current = true;
      return;
    }
    const state = playbackStateRef.current;
    if (!state.isPlaying) return;
    if (isLooping) {
      if (!state.currentSegment) return;
      setPlaybackEndMs(state.currentSegment.endMs);
    } else {
      setPlaybackEndMs(state.durationMs > 0 ? state.durationMs : Number.POSITIVE_INFINITY);
    }
  }, [isLooping, setPlaybackEndMs]);

  // Restart the segment when playback reaches its natural end while looping.
  // Uses pausedByUserRef to avoid restarting after an explicit user pause.
  useEffect(() => {
    if (!isLooping || !currentSegment) return;
    if (isPlaying) {
      // Reset the user-pause flag whenever playback is active.
      pausedByUserRef.current = false;
      loopHandledRef.current = null;
      return;
    }
    if (pausedByUserRef.current) return;
    if (currentMs >= currentSegment.endMs - 50) {
      const loopKey = `${currentSegment.id}:${Math.floor(currentMs)}`;
      if (loopHandledRef.current === loopKey) {
        return;
      }
      loopHandledRef.current = loopKey;
      const loopMatch = compareContourAttemptDetailed(
        currentCardContourNotes,
        tapAttemptsBySegment[currentSegment.id] ?? [],
        TAP_MATCH_OPTIONS
      );
      showAccuracyToast(`Loop accuracy ${Math.round(loopMatch.score * 100)}%`);
      recordCurrentMidiContourAttempt();
      setTapAttemptsBySegment((previous) => ({
        ...previous,
        [currentSegment.id]: [],
      }));
      activeTapCaptureRef.current = null;
      requestPlay(getSegmentStartWithPreroll(currentSegment.startMs), currentSegment.endMs);
    }
  }, [
    currentCardContourNotes,
    currentMs,
    currentSegment,
    getSegmentStartWithPreroll,
    isLooping,
    isPlaying,
    play,
    recordCurrentMidiContourAttempt,
    showAccuracyToast,
    tapAttemptsBySegment,
  ]);

  React.useEffect(() => {
    if (!onSegmentPlaybackComplete || !currentSegment || isPlaying || playScope === "segment") {
      return;
    }
    if (currentMs < currentSegment.endMs - 50) {
      return;
    }

    const completionKey = `${currentSegment.id}:${autoPlayToken}:${Math.floor(currentMs)}`;
    if (playbackCompleteNotifiedRef.current === completionKey) {
      return;
    }

    playbackCompleteNotifiedRef.current = completionKey;
    onSegmentPlaybackComplete();
  }, [autoPlayToken, currentMs, currentSegment, isPlaying, onSegmentPlaybackComplete, playScope]);

  React.useEffect(() => {
    if (endedCount === lastHandledEndedCountRef.current) {
      return;
    }

    lastHandledEndedCountRef.current = endedCount;
    if (!onSegmentPlaybackComplete || !currentSegment || playScope !== "segment") {
      return;
    }

    const completionKey = `${currentSegment.id}:${autoPlayToken}:ended:${endedCount}`;
    if (playbackCompleteNotifiedRef.current === completionKey) {
      return;
    }

    playbackCompleteNotifiedRef.current = completionKey;
    onSegmentPlaybackComplete();
  }, [autoPlayToken, currentSegment, endedCount, onSegmentPlaybackComplete, playScope]);

  useEffect(() => {
    const previousIndex = previousSegmentIndexRef.current;
    if (session.currentSegmentIndex !== previousIndex) {
      setTransitionDirection(session.currentSegmentIndex > previousIndex ? "forward" : "backward");
      setTransitionToken((previous) => previous + 1);
      previousSegmentIndexRef.current = session.currentSegmentIndex;
    }
  }, [session.currentSegmentIndex]);

  useEffect(() => {
    tapAttemptsRef.current = tapAttemptsBySegment;
  }, [tapAttemptsBySegment]);

  useEffect(() => {
    tapSessionIdRef.current = tapSessionId;
  }, [tapSessionId]);

  useEffect(() => {
    tapSessionGenerationRef.current += 1;
    pendingPersistedTapsRef.current = [];
    setTapSessionId(null);
    tapSessionIdRef.current = null;
    clearTapPersistenceWarning();

    if (!accountProgressEnabled || !isTapPracticeMode) {
      return;
    }

    const generation = tapSessionGenerationRef.current;

    void request(`/api/songs/${song.id}/tap-sessions`, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({
        segmentId: currentSegment?.id,
        audioVersion: activeAudioVersion,
        mode: "practice",
      }),
    })
      .then(async (response) => {
        if (!response.ok) {
          throw new Error(`Failed to create tap session (${response.status})`);
        }

        const payload = await response.json() as { session?: { id?: string } };
        const nextSessionId = payload.session?.id;
        if (typeof nextSessionId !== "string" || nextSessionId.length === 0) {
          throw new Error("Tap session response did not include an id");
        }

        if (tapSessionGenerationRef.current !== generation) {
          return;
        }

        setTapSessionId(nextSessionId);
        tapSessionIdRef.current = nextSessionId;
        markGuestSongProgress(song.id, userId);
        flushPersistedTaps(nextSessionId);
      })
      .catch((error) => {
        console.error("Failed to create tap practice session:", error);
        showTapPersistenceWarning("Could not start tap persistence session. Check your connection and try again.");
      });
  }, [accountProgressEnabled, activeAudioVersion, clearTapPersistenceWarning, currentSegment?.id, flushPersistedTaps, isTapPracticeMode, request, showTapPersistenceWarning, song.id, tapSessionResetToken, userId]);

  useEffect(() => {
    activeTapCaptureRef.current = null;
  }, [currentSegment?.id]);

  useEffect(() => {
    if (isTapPracticeMode) {
      return;
    }
    cancelTapPracticeCountIn();
  }, [cancelTapPracticeCountIn, isTapPracticeMode]);

  useEffect(() => {
    cancelTapPracticeCountIn();
    setTapAttemptsBySegment({});
    setIsTapPracticeMode(false);
    setShowCardContourMap(false);
    setShowTapOverlay(true);
    setTapSessionSummaries([]);
    setMidiSegmentAnswerKeys({});
    setLocalMidiScoreAttemptsBySegment({});
    setAccuracyToast(null);
    activeTapCaptureRef.current = null;
    loopHandledRef.current = null;
    setTapSessionId(null);
    tapSessionIdRef.current = null;
    clearTapPersistenceWarning();
    pendingPersistedTapsRef.current = [];
    if (toastTimerRef.current !== null) {
      window.clearTimeout(toastTimerRef.current);
      toastTimerRef.current = null;
    }
    if (draftRecorderRef.current && draftRecorderRef.current.state !== "inactive") {
      draftRecorderRef.current.stop();
    } else {
      stopDraftRecordingStream();
    }
    draftRecorderRef.current = null;
    draftRecordingChunksRef.current = [];
    setDraftRecordingStatus("idle");
    setDraftRecordingMessage(null);
    setDraftRecordingLevel(0);
    setReviewingDraftId(null);
  }, [cancelTapPracticeCountIn, clearTapPersistenceWarning, song.id, stopDraftRecordingStream]);

  useEffect(() => {
    return () => {
      cancelTapPracticeCountIn();
      if (draftRecorderRef.current && draftRecorderRef.current.state !== "inactive") {
        draftRecorderRef.current.stop();
      } else {
        stopDraftRecordingStream();
      }
    };
  }, [cancelTapPracticeCountIn, stopDraftRecordingStream]);

  useEffect(() => {
    return () => {
      if (toastTimerRef.current !== null) {
        window.clearTimeout(toastTimerRef.current);
      }
      if (tapWarningTimerRef.current !== null) {
        window.clearTimeout(tapWarningTimerRef.current);
      }
    };
  }, []);

  useEffect(() => {
    if (!ratingsEnabled || ratingsLoading || lastSavedRatingsRef.current === "unloaded") {
      return;
    }
    const snapshot = JSON.stringify(session.ratings);
    if (snapshot === lastSavedRatingsRef.current) {
      return;
    }
    if (localProgressEnabled) {
      saveGuestSongRatings(song.id, session.ratings);
      lastSavedRatingsRef.current = snapshot;
      onRatingsSaved?.(session.ratings);
      window.dispatchEvent(new Event("ratingsUpdated"));
      return;
    }
    const timer = setTimeout(() => {
      if (typeof navigator !== "undefined" && !navigator.onLine) {
        enqueueOfflineRatings(snapshot);
        return;
      }
      void postRatingsSnapshot(snapshot)
        .then(() => {
          lastSavedRatingsRef.current = snapshot;
          markGuestSongProgress(song.id, userId);
          clearOfflineRatingsQueue();
        })
        .catch(() => {
          enqueueOfflineRatings(snapshot);
        });
    }, 400);
    return () => clearTimeout(timer);
  }, [clearOfflineRatingsQueue, enqueueOfflineRatings, localProgressEnabled, onRatingsSaved, postRatingsSnapshot, ratingsEnabled, ratingsLoading, session.ratings, song.id, userId]);

  useEffect(() => {
    void flushOfflineRatingsIfPossible();
  }, [flushOfflineRatingsIfPossible]);

  useEffect(() => {
    const handleOnline = () => {
      void flushOfflineRatingsIfPossible();
    };
    window.addEventListener("online", handleOnline);
    return () => {
      window.removeEventListener("online", handleOnline);
    };
  }, [flushOfflineRatingsIfPossible]);

  useEffect(() => {
    onSessionChange?.(session);
  }, [session, onSessionChange]);

  useEffect(() => {
    if (!accountProgressEnabled) {
      setTapSessionSummaries([]);
      setMidiSegmentAnswerKeys({});
      return;
    }

    let cancelled = false;

    const loadEnhancedTapData = async () => {
      try {
        const [response, midiResponse] = await Promise.all([
          request(`/api/songs/${song.id}/tap-sessions`, { cache: "no-store" }),
          request(`/api/songs/${song.id}/midi`, { cache: "no-store" }),
        ]);
        if (!response.ok) {
          throw new Error(`Failed to load tap sessions (${response.status})`);
        }
        const payload = await response.json() as { sessions?: TapSessionSummaryPayload[] };
        const midiPayload = midiResponse.ok
          ? await midiResponse.json() as { segmentAnswerKeys?: Record<string, MidiSegmentAnswerKey> }
          : { segmentAnswerKeys: {} };
        const sessions = payload.sessions ?? [];

        if (cancelled) {
          return;
        }
        if (sessions.length > 0) {
          markGuestSongProgress(song.id, userId);
        }
        setTapSessionSummaries(sessions);
        setMidiSegmentAnswerKeys(midiPayload.segmentAnswerKeys ?? {});
      } catch {
        if (!cancelled) {
          setTapSessionSummaries([]);
          setMidiSegmentAnswerKeys({});
        }
      }
    };

    void loadEnhancedTapData();

    return () => {
      cancelled = true;
    };
  }, [accountProgressEnabled, request, segmentTimingSignature, song.id, tapHeatMapRefreshToken, userId]);

  useEffect(() => {
    let cancelled = false;

    if (!accountProgressEnabled || !hasMidiTapAnswers) {
      setTapHeatMapBySegment({});
      return () => {
        cancelled = true;
      };
    }

    const loadTapHeatMap = async () => {
      try {
        const response = await request(`/api/songs/${song.id}/tap-heatmap`, { cache: "no-store" });
        if (!response.ok) {
          throw new Error(`Failed to load tap heat map (${response.status})`);
        }

        const payload = await response.json() as {
          heatMapBySegment?: Record<string, Record<string, ContourNoteHeatStat>>;
        };

        if (!cancelled) {
          setTapHeatMapBySegment(payload.heatMapBySegment ?? {});
        }
      } catch {
        if (!cancelled) {
          setTapHeatMapBySegment({});
        }
      }
    };

    void loadTapHeatMap();

    return () => {
      cancelled = true;
    };
  }, [accountProgressEnabled, hasMidiTapAnswers, request, song.id, tapHeatMapRefreshToken]);

  return (
    <div
      data-testid="practice-layout"
      className="relative flex h-dvh flex-col overflow-hidden bg-gray-50"
    >
      {accuracyToast?.visible ? (
        <div
          data-testid="practice-accuracy-toast"
          className="pointer-events-none fixed left-1/2 top-16 z-[120] -translate-x-1/2 rounded-full bg-slate-900/90 px-3 py-1.5 text-xs font-semibold text-white shadow-lg"
        >
          {accuracyToast.text}
        </div>
      ) : null}
      <header data-testid="practice-header" className={isTapPracticeMode ? "sr-only" : "px-4 pb-2 pt-4 md:px-8"}>
        <div className="flex items-start justify-between gap-3">
          {breadcrumbRootLabel ? (
            <nav aria-label="Breadcrumb" className="min-w-0" data-testid="practice-breadcrumb">
              {onBreadcrumbRootClick ? (
                <button
                  onClick={onBreadcrumbRootClick}
                  className="inline-flex items-center gap-1 rounded-full border border-gray-300 bg-white px-3 py-1.5 text-sm font-semibold text-gray-700 shadow-sm transition hover:border-indigo-500 hover:text-indigo-700 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-indigo-500"
                >
                  <span aria-hidden="true" className="text-base leading-none">&#x2190;</span>
                  {breadcrumbRootLabel}
                </button>
              ) : (
                <span className="inline-flex items-center rounded-full border border-gray-200 bg-white px-3 py-1.5 text-sm font-semibold text-gray-700">{breadcrumbRootLabel}</span>
              )}
              <span className="px-2 text-gray-400" aria-hidden="true">/</span>
              <span className="group relative inline-flex min-w-0 max-w-[15rem] items-center align-middle sm:max-w-[22rem] md:max-w-[30rem] lg:max-w-[36rem]">
                <span
                  ref={songTitleRef}
                  tabIndex={isSongTitleTruncated ? 0 : -1}
                  title={isSongTitleTruncated ? song.title : undefined}
                  className="block truncate text-xl font-medium tracking-tight text-gray-900 outline-none md:text-3xl md:font-bold"
                  data-testid="song-title"
                >
                  {song.title}
                </span>
                {isSongTitleTruncated ? (
                  <span className="ml-2 shrink-0 rounded-full bg-gray-200 px-2 py-0.5 text-[11px] font-medium uppercase tracking-wide text-gray-600">
                    full
                  </span>
                ) : null}
                {isSongTitleTruncated ? (
                  <span
                    role="tooltip"
                    className="pointer-events-none absolute left-0 top-full z-10 mt-2 hidden max-w-[min(90vw,36rem)] rounded-md bg-gray-900 px-3 py-2 text-sm font-medium text-white shadow-lg group-hover:block group-focus-within:block"
                  >
                    {song.title}
                  </span>
                ) : null}
              </span>
            </nav>
          ) : (
            <h1 className="min-w-0 max-w-[15rem] text-xl font-medium tracking-tight text-gray-900 sm:max-w-[22rem] md:max-w-[30rem] md:text-3xl md:font-bold lg:max-w-[36rem]">
              <span
                ref={songTitleRef}
                tabIndex={isSongTitleTruncated ? 0 : -1}
                title={isSongTitleTruncated ? song.title : undefined}
                className="group relative block truncate outline-none"
                data-testid="song-title"
              >
                {song.title}
              </span>
            </h1>
          )}
          {onEditSongClick ? (
            <button
              onClick={onEditSongClick}
              aria-label="Edit song"
              title="Edit song"
              className="inline-flex h-9 w-9 shrink-0 items-center justify-center rounded-full bg-indigo-600 text-white hover:bg-indigo-700"
            >
              <svg
                aria-hidden="true"
                viewBox="0 0 24 24"
                fill="none"
                className="h-4 w-4"
                stroke="currentColor"
                strokeWidth="2"
                strokeLinecap="round"
                strokeLinejoin="round"
              >
                <path d="M12 20h9" />
                <path d="M16.5 3.5a2.12 2.12 0 1 1 3 3L7 19l-4 1 1-4z" />
              </svg>
            </button>
          ) : null}
        </div>
        <p className="sr-only" data-testid="segment-counter">
          {hasSegments
            ? `Segment ${session.currentSegmentIndex + 1} of ${song.segments.length}`
            : "Full piece playback"}
        </p>
      </header>

      {!reducedControls ? (
      <div className={isTapPracticeMode ? "px-3 pb-1 pt-2 md:px-6" : "px-4 md:px-8"} data-testid="practice-top-bar">
        {!isTapPracticeMode && ratingsLoading ? (
          <div
            data-testid="ratings-loading-skeleton"
            className="h-8 w-full animate-pulse rounded-full bg-gray-200"
          />
        ) : !isTapPracticeMode ? (
          <KnowledgeBar percent={knowledgeScore.overall} />
        ) : null}
        <div className={isTapPracticeMode ? "flex flex-wrap items-center gap-1.5" : "mt-2 flex items-center gap-2"}>
          {hasBothAudioVersions ? (
            <div
              className="inline-flex rounded-full border border-indigo-300 bg-white p-0.5"
              data-testid="practice-audio-version-toggle"
            >
              {(["straight", "blend"] as const).map((version) => (
                <button
                  key={version}
                  type="button"
                  data-testid={`practice-audio-version-${version}`}
                  aria-pressed={activeAudioVersion === version}
                  onClick={() => handleAudioVersionChange(version)}
                  className={`${isTapPracticeMode ? "rounded-full px-2.5 py-1 text-xs" : "rounded-full px-3 py-1 text-sm"} font-semibold transition ${
                    activeAudioVersion === version
                      ? "bg-indigo-600 text-white"
                      : "text-indigo-700 hover:bg-indigo-50"
                  }`}
                >
                  {version === "straight" ? "Part" : "Blend"}
                </button>
              ))}
            </div>
          ) : null}
          {!isTapPracticeMode ? (
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
              {draftRecordingMessage ? (
                <span
                  data-testid="draft-recording-status"
                  role={draftRecordingStatus === "error" ? "alert" : "status"}
                  className={`text-xs ${
                    draftRecordingStatus === "error"
                      ? "text-red-700"
                      : draftRecordingStatus === "saved"
                        ? "text-emerald-700"
                        : "text-slate-600"
                  }`}
                >
                  {draftRecordingMessage}
                </span>
              ) : null}
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
          ) : null}
          {hasSegments && currentSegment && hasCardContourData ? (
            <button
              type="button"
              data-testid="practice-card-contour-toggle"
              onClick={() => {
                setShowCardContourMap((previous) => !previous);
                if (!showCardContourMap) {
                  setTapHeatMapRefreshToken((previous) => previous + 1);
                }
              }}
              aria-pressed={showCardContourMap}
              className={`rounded-full border px-3 py-1.5 text-sm font-semibold transition ${
                showCardContourMap
                  ? "border-indigo-600 bg-indigo-600 text-white hover:bg-indigo-700"
                  : "border-indigo-300 bg-white text-indigo-700 hover:bg-indigo-50"
              }`}
            >
              Contour
            </button>
          ) : null}
          {hasSegments && (hasMidiTapAnswers || isTapPracticeMode) ? (
            <button
              type="button"
              data-testid="practice-tap-mode-toggle"
              aria-label={isTapPracticeMode ? "Exit tap practice mode" : "Enter tap practice mode"}
              aria-pressed={isTapPracticeMode}
              onClick={() => {
                setIsTapPracticeMode((previous) => !previous);
                activeTapCaptureRef.current = null;
              }}
              className={`rounded-full border px-3 py-1.5 text-sm font-semibold transition ${
                isTapPracticeMode
                  ? "border-indigo-600 bg-indigo-600 text-white hover:bg-indigo-700"
                  : "border-indigo-300 bg-white text-indigo-700 hover:bg-indigo-50"
              }`}
            >
              {isTapPracticeMode ? "Exit Tap" : "Tap"}
            </button>
          ) : null}
          {SHOW_AUXILIARY_TAP_DEBUG_CONTROLS && isTapPracticeMode && hasSegments && currentSegment ? (
            <button
              type="button"
              data-testid="practice-overlay-toggle"
              onClick={() => setShowTapOverlay((previous) => !previous)}
              className="rounded-full border border-indigo-300 bg-white px-3 py-1.5 text-sm font-semibold text-indigo-700 hover:bg-indigo-50"
            >
              Overlay: {showTapOverlay ? "On" : "Off"}
            </button>
          ) : null}
          {SHOW_AUXILIARY_TAP_DEBUG_CONTROLS && isTapPracticeMode && hasSegments && currentSegment ? (
            <button
              type="button"
              data-testid="practice-same-lane-guides-toggle"
              onClick={() => setShowSameLaneGuides((previous) => !previous)}
              className="rounded-full border border-sky-300 bg-white px-3 py-1.5 text-sm font-semibold text-sky-700 hover:bg-sky-50"
            >
              Same lanes: {showSameLaneGuides ? "On" : "Off"}
            </button>
          ) : null}
          {SHOW_AUXILIARY_TAP_DEBUG_CONTROLS && isTapPracticeMode && hasSegments && currentSegment ? (
            <button
              type="button"
              data-testid="practice-clear-taps"
              onClick={clearCurrentSegmentTaps}
              className="rounded-full border border-slate-300 bg-white px-3 py-1.5 text-sm font-semibold text-slate-700 hover:bg-slate-100"
            >
              Clear segment taps
            </button>
          ) : null}
          {SHOW_AUXILIARY_TAP_DEBUG_CONTROLS && isTapPracticeMode ? (
            <a
              href={tapDebugHref}
              data-testid="practice-open-tap-debug"
              className="rounded-full border border-amber-300 bg-amber-50 px-3 py-1.5 text-sm font-semibold text-amber-900 hover:bg-amber-100"
            >
              Open Tap Debug
            </a>
          ) : null}
        </div>
        {ratingsError ? (
          <p data-testid="ratings-load-error" className="mt-2 text-sm text-amber-700">
            {ratingsError}
          </p>
        ) : null}
        {tapPersistenceWarning ? (
          <div className="mt-2 flex items-start gap-2">
            <p data-testid="practice-tap-persist-warning" className="text-sm text-amber-700">
              {tapPersistenceWarning}
            </p>
            <button
              type="button"
              data-testid="practice-tap-persist-warning-dismiss"
              onClick={clearTapPersistenceWarning}
              className="rounded-full border border-amber-300 bg-amber-50 px-2 py-0.5 text-xs font-semibold text-amber-900 hover:bg-amber-100"
            >
              Dismiss
            </button>
          </div>
        ) : null}
        {isTapPracticeMode && currentSegment && currentDerivedAnswerKey && enhancedTapScore ? (
          <div
            data-testid="practice-auto-score"
            className="mt-1.5 rounded-xl border border-indigo-100 bg-white px-2.5 py-1.5 text-xs text-slate-700 shadow-sm"
          >
            <div className="flex items-center justify-between gap-2">
              <span className="min-w-0 truncate font-semibold text-slate-900">
                Auto score: {enhancedTapScore.scorePercent}%
              </span>
            </div>
          </div>
        ) : null}
      </div>
      ) : null}

      {!isTapPracticeMode && !reviewingDraft && draftRecordings.length > 0 ? (
        <section
          data-testid="draft-recordings"
          className="mx-4 mb-3 rounded-lg border border-slate-200 bg-white px-3 py-3 shadow-sm md:mx-8"
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
                isPlaying={isPlaying}
                onPause={pause}
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

      {!isTapPracticeMode && reviewingDraft ? (
        <main
          data-testid="draft-review-main"
          className="flex flex-1 justify-center overflow-y-auto px-4 pt-2 md:px-8"
          style={{ paddingBottom: "calc(env(safe-area-inset-bottom) + 16px)" }}
        >
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
        </main>
      ) : null}

      <main
        data-testid="practice-main"
        className={`${reviewingDraft ? "hidden" : "flex"} flex-1 justify-center px-4 pt-2 md:px-8 ${isTapPracticeMode ? "min-h-0 overflow-hidden" : "overflow-y-auto"}`}
        style={{ paddingBottom: "calc(var(--player-height) + env(safe-area-inset-bottom) + 16px)" }}
      >
        <section data-testid="practice-focus" className={`flex h-full min-h-0 w-full items-start justify-center gap-2 md:gap-3 ${isTapPracticeMode ? "max-w-4xl" : "max-w-3xl"}`}>
          {!isTapPracticeMode && showSegmentNavigationControls ? (
            <button
              type="button"
              aria-label="Previous segment"
              data-testid="practice-prev-segment"
              onClick={handlePrevSegment}
              disabled={!canUsePrevSegment}
              className="inline-flex h-24 w-10 shrink-0 self-center items-center justify-center rounded-xl border border-indigo-300 bg-white text-indigo-700 transition hover:bg-indigo-50 disabled:opacity-30"
            >
              <svg aria-hidden="true" viewBox="0 0 24 24" className="h-5 w-5" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
                <path d="M18 12H6" />
                <path d="M10 8l-4 4 4 4" />
              </svg>
            </button>
          ) : null}
          <div className="h-full min-h-0 w-full max-w-md">
            {hasSegments && currentSegment ? (
              <div className="segment-stack-shell relative h-full min-h-0 overflow-visible">
                {isTapPracticeMode ? (
                  <div
                    data-testid="practice-tap-feedback"
                    className="pointer-events-none absolute left-3 top-3 z-20 rounded-full bg-white/85 px-2 py-1 text-[11px] font-semibold text-indigo-900 shadow-sm"
                  >
                    {Math.round((currentSegmentMatch?.score ?? 0) * 100)}% ({currentSegmentMatch?.matchedEvents ?? 0}/
                    {currentSegmentMatch?.totalEvents ?? 0})
                  </div>
                ) : null}
                {isTapPracticeMode && tapPracticeCountIn !== null ? (
                  <div
                    data-testid="practice-count-in"
                    className="pointer-events-none absolute inset-x-0 top-20 z-20 mx-auto flex w-fit flex-col items-center rounded-[28px] border border-amber-200 bg-white/95 px-5 py-3 text-center text-amber-950 shadow-lg"
                  >
                    <span className="text-[11px] font-semibold uppercase tracking-[0.18em] text-amber-700">
                      Count-in
                    </span>
                    <span className="mt-1 text-3xl font-bold leading-none">{tapPracticeCountIn}</span>
                    <span className="mt-1 text-xs font-medium text-amber-800">Get ready to tap</span>
                  </div>
                ) : null}
                {isTapPracticeMode && showTapOverlay && showSameLaneGuides ? (
                  <div
                    data-testid="practice-same-lane-legend"
                    className="pointer-events-none absolute right-3 top-3 z-20 max-w-[11rem] rounded-2xl border border-sky-200/80 bg-white/90 px-3 py-2 text-[11px] font-medium text-sky-950 shadow-sm"
                  >
                    Same lane zone: answer lane +/- {TAP_MATCH_OPTIONS.sameDeadZone.toFixed(2)}
                  </div>
                ) : null}
                <div
                  key={`${currentSegment.id}-${transitionToken}`}
                  className={`relative z-10 h-full min-h-0 ${transitionDirection === "forward" ? "segment-enter-forward" : "segment-enter-backward"}`}
                >
                  <SegmentCard
                    segment={{ ...currentSegment, pitchContourNotes: currentCardContourNotes }}
                    currentRating={currentRating}
                    onRate={handleRateCurrentSegment}
                    playbackMs={currentMs}
                    onSeek={seek}
                    masteryPercent={masteryPercentForSegment(currentSegment.id)}
                    lyricVisibilityMode={lyricVisibilityMode}
                    collapseLyricLineBreaks={collapseLyricLineBreaks}
                    showContourMap={showCardContourMap && hasCardContourData}
                    contourHeatMap={currentMidiContourHeatMap}
                  />
                </div>
                {isTapPracticeMode && hasSegments && currentSegment && showTapOverlay ? (
                  <div className="pointer-events-none absolute inset-0 z-30 overflow-hidden rounded-2xl border border-indigo-200/30 bg-indigo-50/10" data-testid="practice-piano-roll-overlay">
                    <svg viewBox="0 0 100 100" preserveAspectRatio="none" className="h-full w-full">
                      <line x1="0" y1="50" x2="100" y2="50" stroke="rgb(199 210 254)" strokeWidth="0.5" opacity="0.45" />
                      {showSameLaneGuides ? currentCardContourNotes.map((note) => {
                        const x = getRollX(note.timeOffsetMs);
                        if (x < -5 || x > 105) {
                          return null;
                        }
                        const zoneTopLane = Math.min(1, note.lane + TAP_MATCH_OPTIONS.sameDeadZone);
                        const zoneBottomLane = Math.max(0, note.lane - TAP_MATCH_OPTIONS.sameDeadZone);
                        const topY = (1 - zoneTopLane) * 100;
                        const bottomY = (1 - zoneBottomLane) * 100;
                        const centerY = (1 - note.lane) * 100;
                        return (
                          <g key={`same-zone-${note.id}`} data-testid="practice-same-lane-guide">
                            <rect
                              x={0}
                              y={topY}
                              width={100}
                              height={Math.max(0.8, bottomY - topY)}
                              fill="rgb(14 165 233)"
                              opacity="0.07"
                            />
                            <line x1="0" y1={topY} x2="100" y2={topY} stroke="rgb(14 165 233)" strokeWidth="0.35" opacity="0.26" />
                            <line x1="0" y1={bottomY} x2="100" y2={bottomY} stroke="rgb(14 165 233)" strokeWidth="0.35" opacity="0.26" />
                            <line x1={Math.max(0, x - 4)} y1={centerY} x2={Math.min(100, x + 4)} y2={centerY} stroke="rgb(2 132 199)" strokeWidth="0.8" opacity="0.5" />
                          </g>
                        );
                      }) : null}
                      {currentCardContourNotes.map((note) => {
                        const x = getRollX(note.timeOffsetMs);
                        if (x < -5 || x > 105) {
                          return null;
                        }
                        const y = (1 - note.lane) * 100;
                        const directionLetter = answerDirectionLetters.get(note.id);
                        return (
                          <g key={`answer-${note.id}`}>
                            <circle
                              cx={x}
                              cy={y}
                              r={2.2}
                              fill="rgb(99 102 241)"
                              opacity="0.35"
                            />
                            {showSameLaneGuides && directionLetter ? (
                              <text
                                x={x}
                                y={Math.max(4.5, y - 3.3)}
                                textAnchor="middle"
                                fontSize="4.4"
                                fontWeight="700"
                                fill="rgb(49 46 129)"
                                opacity="0.95"
                                data-testid="practice-answer-direction-label"
                              >
                                {directionLetter}
                              </text>
                            ) : null}
                          </g>
                        );
                      })}
                      {currentAttemptNotes.map((note) => {
                        const x = getRollX(note.timeOffsetMs);
                        if (x < -5 || x > 105) {
                          return null;
                        }
                        const y = (1 - note.lane) * 100;
                        const status = currentSegmentMatch?.attemptNoteStatuses[note.id] ?? "pending";
                        const directionLetter = attemptDirectionLetters.get(note.id);
                        return (
                          <g key={`attempt-${note.id}`}>
                            <circle
                              data-testid="practice-attempt-dot"
                              cx={x}
                              cy={y}
                              r={3.3}
                              fill={getAttemptStatusColor(status)}
                              opacity="0.72"
                            />
                            {showSameLaneGuides && directionLetter ? (
                              <text
                                x={x}
                                y={Math.min(97, y + 1.6)}
                                textAnchor="middle"
                                dominantBaseline="middle"
                                fontSize="4.6"
                                fontWeight="800"
                                fill="white"
                                opacity="0.98"
                                data-testid="practice-attempt-direction-label"
                              >
                                {directionLetter}
                              </text>
                            ) : null}
                          </g>
                        );
                      })}
                      <line x1="100" y1="0" x2="100" y2="100" stroke="rgb(79 70 229)" strokeWidth="1" opacity="0.7" />
                    </svg>
                  </div>
                ) : null}
              </div>
            ) : (
              <div
                data-testid="no-segments"
                className="rounded-[28px] border border-dashed border-indigo-200 bg-white/90 px-6 py-10 text-center shadow-sm"
              >
                <p className="text-lg font-semibold text-gray-900">No practice sections yet</p>
                <p className="mt-2 text-sm text-gray-500">
                  You can still play the full recording below, then switch to Edit Song when you are ready to mark sections.
                </p>
              </div>
            )}
          </div>
          {isTapPracticeMode && hasSegments && currentSegment ? (
            <div
              ref={tapBarRef}
              data-testid="practice-tap-bar"
              aria-label="Tap contour bar"
              className="tap-input-surface relative h-full min-h-0 w-28 shrink-0 overflow-hidden rounded-2xl border-2 border-indigo-500 bg-gradient-to-b from-emerald-50 via-white to-amber-50 shadow-sm sm:w-32"
              onContextMenu={(event) => {
                event.preventDefault();
                event.stopPropagation();
              }}
              onDoubleClick={(event) => {
                event.preventDefault();
                event.stopPropagation();
              }}
              onDragStart={(event) => {
                event.preventDefault();
                event.stopPropagation();
              }}
              onMouseDown={(event) => {
                event.preventDefault();
                event.stopPropagation();
              }}
              onSelect={(event) => {
                event.preventDefault();
                event.stopPropagation();
              }}
              onTouchStart={(event) => {
                event.preventDefault();
                event.stopPropagation();
              }}
              onTouchMove={(event) => {
                event.preventDefault();
                event.stopPropagation();
              }}
              onTouchEnd={(event) => {
                event.preventDefault();
                event.stopPropagation();
              }}
              onTouchCancel={(event) => {
                event.preventDefault();
                event.stopPropagation();
              }}
              onPointerDown={(event) => {
                if (!currentSegment) {
                  return;
                }
                event.preventDefault();
                event.stopPropagation();
                if (typeof event.currentTarget.setPointerCapture === "function") {
                  event.currentTarget.setPointerCapture(event.pointerId);
                }
                const segmentDurationMs = Math.max(1, currentSegment.endMs - currentSegment.startMs);
                const startOffsetMs = Math.min(
                  segmentDurationMs,
                  Math.max(0, Math.round(currentMs - currentSegment.startMs))
                );
                activeTapCaptureRef.current = {
                  id: crypto.randomUUID(),
                  startOffsetMs,
                  lane: getTapLane(event.clientY),
                  pointerId: event.pointerId,
                };
              }}
              onPointerMove={(event) => {
                const activeCapture = activeTapCaptureRef.current;
                if (!activeCapture || activeCapture.pointerId !== event.pointerId) {
                  return;
                }
                event.preventDefault();
                event.stopPropagation();
                activeCapture.lane = getTapLane(event.clientY);
              }}
              onPointerUp={(event) => {
                const activeCapture = activeTapCaptureRef.current;
                if (!activeCapture || activeCapture.pointerId !== event.pointerId) {
                  return;
                }
                event.preventDefault();
                event.stopPropagation();
                finalizeTapCapture(getTapLane(event.clientY));
              }}
              onPointerCancel={(event) => {
                const activeCapture = activeTapCaptureRef.current;
                if (!activeCapture || activeCapture.pointerId !== event.pointerId) {
                  return;
                }
                event.preventDefault();
                event.stopPropagation();
                finalizeTapCapture(getTapLane(event.clientY));
              }}
            >
              <div className="pointer-events-none absolute inset-0">
                <div className="absolute inset-x-0 top-0 flex h-16 items-start justify-center bg-gradient-to-b from-emerald-200/45 to-transparent pt-4 text-emerald-700">
                  <svg aria-hidden="true" viewBox="0 0 24 24" className="h-7 w-7" fill="none" stroke="currentColor" strokeWidth="2.5" strokeLinecap="round" strokeLinejoin="round">
                    <path d="M12 19V5" />
                    <path d="M6 11l6-6 6 6" />
                  </svg>
                </div>
                <div className="absolute inset-x-0 bottom-0 flex h-16 items-end justify-center bg-gradient-to-t from-amber-200/55 to-transparent pb-4 text-amber-700">
                  <svg aria-hidden="true" viewBox="0 0 24 24" className="h-7 w-7" fill="none" stroke="currentColor" strokeWidth="2.5" strokeLinecap="round" strokeLinejoin="round">
                    <path d="M12 5v14" />
                    <path d="M18 13l-6 6-6-6" />
                  </svg>
                </div>
                {previousTapGuide ? (
                  <>
                    <div
                      data-testid="practice-tap-same-zone"
                      className="absolute inset-x-1 rounded-xl border border-sky-400/75 bg-sky-200/35 shadow-[0_0_0_1px_rgba(14,165,233,0.12)]"
                      style={{
                        top: `${previousTapGuide.topPercent}%`,
                        height: `${previousTapGuide.heightPercent}%`,
                      }}
                    />
                    <div
                      data-testid="practice-tap-previous-lane"
                      className="absolute inset-x-0 border-t-2 border-sky-500"
                      style={{ top: `${previousTapGuide.centerPercent}%` }}
                    >
                      <span className="absolute -top-2 left-1/2 flex h-4 w-8 -translate-x-1/2 items-center justify-center rounded-full bg-sky-500 text-white shadow-sm">
                        <svg aria-hidden="true" viewBox="0 0 24 24" className="h-4 w-4" fill="none" stroke="currentColor" strokeWidth="2.5" strokeLinecap="round">
                          <path d="M5 9h14" />
                          <path d="M5 15h14" />
                        </svg>
                      </span>
                    </div>
                  </>
                ) : (
                  <div className="absolute inset-x-3 top-1/2 -translate-y-1/2 rounded-xl border border-indigo-200 bg-white/70 py-2 text-center text-indigo-500 shadow-sm">
                    <svg aria-hidden="true" viewBox="0 0 24 24" className="mx-auto h-7 w-7" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
                      <path d="M12 5v14" />
                      <path d="M6 11l6-6 6 6" />
                      <path d="M18 13l-6 6-6-6" />
                    </svg>
                  </div>
                )}
              </div>
            </div>
          ) : !isTapPracticeMode && showSegmentNavigationControls ? (
            <button
              type="button"
              aria-label="Next segment"
              data-testid="practice-next-segment"
              onClick={handleNextSegment}
              disabled={!canUseNextSegment}
              className="inline-flex h-24 w-10 shrink-0 self-center items-center justify-center rounded-xl border border-indigo-300 bg-white text-indigo-700 transition hover:bg-indigo-50 disabled:opacity-30"
            >
              <svg aria-hidden="true" viewBox="0 0 24 24" className="h-5 w-5" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
                <path d="M6 12h12" />
                <path d="M14 8l4 4-4 4" />
              </svg>
            </button>
          ) : null}
        </section>
      </main>

      {!isTapPracticeMode && !reviewingDraft && archivedDraftRecordings.length > 0 ? (
        <details
          data-testid="archived-drafts"
          className="group mx-4 mb-3 rounded-lg border border-slate-200 bg-slate-50/70 text-slate-700 md:mx-8"
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
                isPlaying={isPlaying}
                onPause={pause}
                onReview={setReviewingDraftId}
              />
            ))}
          </ul>
        </details>
      ) : null}

      {!reviewingDraft ? (
        <section
          data-testid="practice-transport"
          className="fixed inset-x-0 bottom-0 z-40 border-t border-gray-200 bg-white/95 px-4 py-2 backdrop-blur md:px-8"
          style={{ paddingBottom: "calc(env(safe-area-inset-bottom) + 0.5rem)" }}
        >
          <AudioPlayer
            audioUrl={activeAudioUrl}
            currentMs={currentMs}
            durationMs={totalDurationMs}
            segmentStartMs={activeStartMs}
            segmentEndMs={activeEndMs}
            isPlaying={isPlaying}
            isReady={isReady}
            playbackError={playbackError}
            debugInfo={debugInfo}
            transportDebug={transportDebug}
            onPlayPause={handleTogglePlay}
            onSkipBack={() => handleSkipBy(-5000)}
            onSkipForward={() => handleSkipBy(5000)}
            onSeekSong={handleSeekSong}
            onDebugPlayTest={handleDebugPlayTest}
            segments={song.segments}
            masteryBySegment={knowledgeScore.bySegment}
            currentSegmentIndex={session.currentSegmentIndex}
            isLooping={isLooping}
            onToggleLoop={handleToggleLoop}
            lyricModeLabel={LYRIC_MODE_LABELS[lyricVisibilityMode]}
            onToggleLyricMode={() => setLyricVisibilityMode((previous) => getNextLyricMode(previous))}
            reducedControls={reducedControls}
          />
        </section>
      ) : null}
    </div>
  );
};

export default PracticeView;
