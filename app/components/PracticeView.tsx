"use client";

import React, { useEffect, useMemo, useReducer } from "react";
import { Song, MemoryRating, PitchContourNote } from "../types/index";
import { sessionReducer, SessionState } from "../lib/sessionReducer";
import { computeKnowledgeScore } from "../lib/knowledgeUtils";
import SegmentCard from "./SegmentCard";
import KnowledgeBar from "./KnowledgeBar";
import { AudioPlayer } from "./AudioPlayer";
import { useAudioPlayer } from "../hooks/useAudioPlayer";
import { buildProxyAudioUrl, parseAudioKey, toPlayableAudioUrl } from "../lib/audioUrls";
import { getMasteryPercent } from "../lib/masteryColors";
import { buildContourDirectionEvents, compareContourAttemptDetailed } from "../lib/contourPractice";
import type { AttemptNoteStatus } from "../lib/contourPractice";

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
  initialSession: SessionState;
  onSessionChange?: (session: SessionState) => void;
  breadcrumbRootLabel?: string;
  onBreadcrumbRootClick?: () => void;
  onEditSongClick?: () => void;
  segmentPrerollMs?: number;
  collapseLyricLineBreaks?: boolean;
}

type LyricVisibilityMode = "full" | "hint" | "hidden";

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
const TAP_MATCH_OPTIONS = {
  timeToleranceMs: 400,
  sameDeadZone: 0.08,
  durationToleranceRatio: 0.6,
  answerLookaheadSlots: 2,
} as const;

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

const PracticeView: React.FC<PracticeViewProps> = ({
  song,
  initialSession,
  onSessionChange,
  breadcrumbRootLabel,
  onBreadcrumbRootClick,
  onEditSongClick,
  segmentPrerollMs = 500,
  collapseLyricLineBreaks = false,
}) => {
  const effectiveSegmentPrerollMs = Math.max(0, segmentPrerollMs);
  const [session, dispatch] = useReducer(sessionReducer, initialSession);
  const initialSegmentId = song.segments[initialSession.currentSegmentIndex]?.id ?? null;
  const segmentIndexRef = React.useRef(initialSession.currentSegmentIndex);
  const lastSyncedSegmentIdRef = React.useRef<string | null>(initialSegmentId);
  const previousSegmentIndexRef = React.useRef(initialSession.currentSegmentIndex);
  const lastSavedRatingsRef = React.useRef<string>("unloaded");
  const [transitionDirection, setTransitionDirection] = React.useState<"forward" | "backward">("forward");
  const [transitionToken, setTransitionToken] = React.useState(0);
  const [ratingsLoading, setRatingsLoading] = React.useState(true);
  const [ratingsError, setRatingsError] = React.useState<string | null>(null);
  const [lyricVisibilityMode, setLyricVisibilityMode] = React.useState<LyricVisibilityMode>("full");
  const [isLooping, setIsLooping] = React.useState(false);
  const [isTapPracticeMode, setIsTapPracticeMode] = React.useState(false);
  const [showCardContourMap, setShowCardContourMap] = React.useState(false);
  const [showTapOverlay, setShowTapOverlay] = React.useState(true);
  const [showSameLaneGuides, setShowSameLaneGuides] = React.useState(false);
  const [tapAttemptsBySegment, setTapAttemptsBySegment] = React.useState<Record<string, PitchContourNote[]>>({});
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
  const proxyAudioUrl = useMemo(() => buildProxyAudioUrl(parseAudioKey(song.audioUrl)), [song.audioUrl]);
  const playbackAudioUrl = useMemo(() => proxyAudioUrl ?? toPlayableAudioUrl(song.audioUrl), [proxyAudioUrl, song.audioUrl]);
  const { isPlaying, isReady, currentMs, durationMs, playbackError, debugInfo, play, pause, seek, setPlaybackEndMs } = useAudioPlayer(playbackAudioUrl);
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
  const currentSegment = hasSegments ? song.segments[session.currentSegmentIndex] : null;
  const tapBarRef = React.useRef<HTMLDivElement | null>(null);
  const activeTapCaptureRef = React.useRef<ActiveTapCapture | null>(null);
  const toastTimerRef = React.useRef<number | null>(null);
  const tapWarningTimerRef = React.useRef<number | null>(null);
  const loopHandledRef = React.useRef<string | null>(null);
  const tapAttemptsRef = React.useRef<Record<string, PitchContourNote[]>>({});
  const [tapSessionId, setTapSessionId] = React.useState<string | null>(null);
  const tapSessionIdRef = React.useRef<string | null>(null);
  const tapSessionGenerationRef = React.useRef(0);
  const pendingPersistedTapsRef = React.useRef<PersistedTapPayload[]>([]);
  const persistTapChainRef = React.useRef<Promise<void>>(Promise.resolve());
  const isLast = !hasSegments || session.currentSegmentIndex === song.segments.length - 1;
  const isFirst = !hasSegments || session.currentSegmentIndex === 0;
  const tapDebugHref = React.useMemo(() => {
    const params = new URLSearchParams({ songId: song.id });
    if (tapSessionId) {
      params.set("sessionId", tapSessionId);
    }
    return `/debug-tap-practice?${params.toString()}`;
  }, [song.id, tapSessionId]);
  const totalDurationMs = Math.max(durationMs, ...song.segments.map((segment) => segment.endMs), 0);
  const activeStartMs = currentSegment?.startMs ?? 0;
  const activeEndMs = currentSegment?.endMs ?? totalDurationMs;
  const currentAttemptNotes = currentSegment ? (tapAttemptsBySegment[currentSegment.id] ?? []) : [];
  const currentSegmentMatch = useMemo(() => {
    if (!currentSegment) {
      return null;
    }

    return compareContourAttemptDetailed(
      currentSegment.pitchContourNotes ?? [],
      currentAttemptNotes,
      TAP_MATCH_OPTIONS
    );
  }, [currentAttemptNotes, currentSegment]);
  const answerDirectionLetters = useMemo(() => {
    if (!currentSegment) {
      return new Map<string, "U" | "D" | "S">();
    }
    const sortedNotes = [...(currentSegment.pitchContourNotes ?? [])].sort((a, b) => a.timeOffsetMs - b.timeOffsetMs);
    const events = buildContourDirectionEvents(sortedNotes, TAP_MATCH_OPTIONS);
    return new Map(events.map((event, index) => [sortedNotes[index + 1]?.id, toDirectionLetter(event.direction)]).filter((entry): entry is [string, "U" | "D" | "S"] => Boolean(entry[0])));
  }, [currentSegment]);
  const attemptDirectionLetters = useMemo(() => {
    const sortedNotes = [...currentAttemptNotes].sort((a, b) => a.timeOffsetMs - b.timeOffsetMs);
    const events = buildContourDirectionEvents(sortedNotes, TAP_MATCH_OPTIONS);
    return new Map(events.map((event, index) => [sortedNotes[index + 1]?.id, toDirectionLetter(event.direction)]).filter((entry): entry is [string, "U" | "D" | "S"] => Boolean(entry[0])));
  }, [currentAttemptNotes]);
  const currentSegmentOffsetMs = currentSegment
    ? Math.max(0, Math.min(currentSegment.endMs - currentSegment.startMs, currentMs - currentSegment.startMs))
    : 0;
  const hasAutoplayedSongRef = React.useRef<string | null>(null);
  const navigationGuardRef = React.useRef<{ index: number; releaseAtMs: number; createdAtMs: number } | null>(null);

  const enqueueOfflineRatings = React.useCallback((snapshot: string) => {
    if (typeof window === "undefined") {
      return;
    }
    try {
      window.localStorage.setItem(buildOfflineRatingsQueueKey(song.id), snapshot);
    } catch {
      // Ignore queue persistence failures.
    }
  }, [song.id]);

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
    const ratings = (JSON.parse(snapshot) as SessionState["ratings"])
      .map((r) => ({
        segmentId: r.segmentId,
        rating: r.rating,
        ratedAt: r.ratedAt,
      }));

    const response = await fetch(`/api/songs/${song.id}/ratings`, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ ratings }),
    });

    if (!response.ok) {
      throw new Error(`Failed to save ratings (${response.status})`);
    }
  }, [song.id]);

  const flushOfflineRatingsIfPossible = React.useCallback(async () => {
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
  }, [clearOfflineRatingsQueue, dequeueOfflineRatings, postRatingsSnapshot]);

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
          const response = await fetch(`/api/songs/${song.id}/tap-sessions/${activeSessionId}`, {
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
      }
    });
  }, [clearTapPersistenceWarning, showTapPersistenceWarning, song.id]);

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

  const flushPlayedTime = React.useCallback(() => {
    if (playbackStartedAtRef.current === null) {
      return;
    }
    const now = Date.now();
    accumulatedPlaybackMsRef.current += Math.max(0, now - playbackStartedAtRef.current);
    playbackStartedAtRef.current = now;
  }, []);

  const markPracticedIfNeeded = React.useCallback(() => {
    if (practicedRecordedRef.current) {
      return;
    }
    if (accumulatedPlaybackMsRef.current < PRACTICED_PLAYBACK_THRESHOLD_MS) {
      return;
    }

    practicedRecordedRef.current = true;
    void fetch(`/api/songs/${song.id}/practice`, { method: "POST" }).catch(() => {
      practicedRecordedRef.current = false;
    });
  }, [song.id]);

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
    if (!song.audioUrl || !currentSegment) {
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
  }, [currentSegment, isPlaying, song.audioUrl, seek]);

  useEffect(() => {
    if (!song.audioUrl) {
      return;
    }
    if (hasAutoplayedSongRef.current === song.id) {
      return;
    }
    hasAutoplayedSongRef.current = song.id;
    seek(0);
    const effectiveDurationMs = durationMs > 0 ? durationMs : Number.POSITIVE_INFINITY;
    play(0, effectiveDurationMs);
  }, [durationMs, play, seek, song.audioUrl, song.id]);

  useEffect(() => {
    if (!hasSegments || !isPlaying) {
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
  }, [currentMs, getSegmentIndexAtMs, hasSegments, isLooping, isPlaying, session.currentSegmentIndex, song.segments]);

  useEffect(() => {
    let cancelled = false;

    const loadRatings = async () => {
      setRatingsLoading(true);
      setRatingsError(null);
      try {
        const response = await fetch(`/api/songs/${song.id}/ratings`);
        if (!response.ok) {
          throw new Error(`Failed to load ratings (${response.status})`);
        }

        const payload = await response.json() as { ratings?: SessionState['ratings'] };
        if (!cancelled) {
          const loadedRatings = Array.isArray(payload.ratings) ? payload.ratings : [];
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
  }, [dequeueOfflineRatings, song.id]);

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
        play(targetStartWithPreroll, targetSegment.endMs);
        return;
      }

      const effectiveDurationMs = durationMs > 0 ? durationMs : Number.POSITIVE_INFINITY;
      play(targetStartWithPreroll, effectiveDurationMs);
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
      pausedByUserRef.current = true;
      pause();
      return;
    }

    // When looping, play the current segment from the current position (or start if past the end).
    if (isLooping && currentSegment) {
      pausedByUserRef.current = false;
      const segmentStartWithPreroll = getSegmentStartWithPreroll(currentSegment.startMs);
      const resumeMs = currentMs >= currentSegment.endMs
        ? segmentStartWithPreroll
        : Math.max(currentMs, segmentStartWithPreroll);
      play(resumeMs, currentSegment.endMs);
      return;
    }
    const effectiveDurationMs = durationMs > 0 ? durationMs : Number.POSITIVE_INFINITY;
    const fullPieceResumeMs = durationMs > 0 && currentMs >= durationMs ? 0 : currentMs;
    play(fullPieceResumeMs, effectiveDurationMs);
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
    jumpToSegment(activeIndex + 1, { preventBackwardWhilePlaying: true });
  };

  const handleSeekSong = (ms: number) => {
    setTransportDebug((previous) => ({
      ...previous,
      seekClicks: previous.seekClicks + 1,
      lastAction: `seek-song-${ms}`,
      lastActionAt: new Date().toISOString(),
    }));
    navigationGuardRef.current = null;
    seek(ms);
    const targetIndex = getSegmentIndexAtMs(ms);
    if (targetIndex !== -1 && targetIndex !== session.currentSegmentIndex) {
      segmentIndexRef.current = targetIndex;
      dispatch({ type: "SET_SEGMENT_INDEX", index: targetIndex });
    }
  };

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
    const immediateMatch = compareContourAttemptDetailed(
      currentSegment.pitchContourNotes ?? [],
      nextSegmentNotes,
      TAP_MATCH_OPTIONS
    );
    const missedTap = immediateMatch.attemptNoteStatuses[note.id] === "mismatched";

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
    });

    activeTapCaptureRef.current = null;
  }, [currentMs, currentSegment, queuePersistedTap, showAccuracyToast]);

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
      return;
    }
    dispatch({ type: "RATE_SEGMENT", segmentId: currentSegment.id, rating });
  }, [currentSegment, currentRating]);

  const handleDebugPlayTest = () => {
    setTransportDebug((previous) => ({
      ...previous,
      debugPlayTestClicks: previous.debugPlayTestClicks + 1,
      lastAction: "debug-play-test",
      lastActionAt: new Date().toISOString(),
    }));
    play(0, 10000);
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
        setIsLooping((previous) => !previous);
        return;
      }

      if (/^[1-5]$/.test(event.key)) {
        event.preventDefault();
        handleRateCurrentSegment(Number(event.key) as MemoryRating);
      }
    };

    window.addEventListener("keydown", onKeyDown);
    return () => window.removeEventListener("keydown", onKeyDown);
}, [handleNextSegment, handlePrevSegment, handleRateCurrentSegment, handleSkipBy, handleTogglePlay, setIsLooping]);

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
        currentSegment.pitchContourNotes ?? [],
        tapAttemptsBySegment[currentSegment.id] ?? [],
        TAP_MATCH_OPTIONS
      );
      showAccuracyToast(`Loop accuracy ${Math.round(loopMatch.score * 100)}%`);
      setTapAttemptsBySegment((previous) => ({
        ...previous,
        [currentSegment.id]: [],
      }));
      activeTapCaptureRef.current = null;
      play(getSegmentStartWithPreroll(currentSegment.startMs), currentSegment.endMs);
    }
  }, [
    currentMs,
    currentSegment,
    getSegmentStartWithPreroll,
    isLooping,
    isPlaying,
    play,
    showAccuracyToast,
    tapAttemptsBySegment,
  ]);

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

    if (!isTapPracticeMode) {
      return;
    }

    const generation = tapSessionGenerationRef.current;

    void fetch(`/api/songs/${song.id}/tap-sessions`, { method: "POST" })
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
        flushPersistedTaps(nextSessionId);
      })
      .catch((error) => {
        console.error("Failed to create tap practice session:", error);
        showTapPersistenceWarning("Could not start tap persistence session. Check your connection and try again.");
      });
  }, [clearTapPersistenceWarning, flushPersistedTaps, isTapPracticeMode, showTapPersistenceWarning, song.id]);

  useEffect(() => {
    activeTapCaptureRef.current = null;
  }, [currentSegment?.id]);

  useEffect(() => {
    setTapAttemptsBySegment({});
    setIsTapPracticeMode(false);
    setShowCardContourMap(false);
    setShowTapOverlay(true);
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
  }, [clearTapPersistenceWarning, song.id]);

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
    if (ratingsLoading || lastSavedRatingsRef.current === "unloaded") {
      return;
    }
    const snapshot = JSON.stringify(session.ratings);
    if (snapshot === lastSavedRatingsRef.current) {
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
          clearOfflineRatingsQueue();
        })
        .catch(() => {
          enqueueOfflineRatings(snapshot);
        });
    }, 400);
    return () => clearTimeout(timer);
  }, [clearOfflineRatingsQueue, enqueueOfflineRatings, postRatingsSnapshot, ratingsLoading, session.ratings]);

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
      <header data-testid="practice-header" className="px-4 pb-2 pt-4 md:px-8">
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

      <div className="px-4 md:px-8" data-testid="practice-top-bar">
        {ratingsLoading ? (
          <div
            data-testid="ratings-loading-skeleton"
            className="h-8 w-full animate-pulse rounded-full bg-gray-200"
          />
        ) : (
          <KnowledgeBar percent={knowledgeScore.overall} />
        )}
        <div className="mt-2 flex items-center gap-2">
          {hasSegments && currentSegment ? (
            <button
              type="button"
              data-testid="practice-card-contour-toggle"
              onClick={() => setShowCardContourMap((previous) => !previous)}
              className="rounded-full border border-indigo-300 bg-white px-3 py-1.5 text-sm font-semibold text-indigo-700 hover:bg-indigo-50"
            >
              Card contour: {showCardContourMap ? "On" : "Off"}
            </button>
          ) : null}
          <button
            type="button"
            data-testid="practice-tap-mode-toggle"
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
            Tap practice: {isTapPracticeMode ? "On" : "Off"}
          </button>
          {isTapPracticeMode && hasSegments && currentSegment ? (
            <button
              type="button"
              data-testid="practice-overlay-toggle"
              onClick={() => setShowTapOverlay((previous) => !previous)}
              className="rounded-full border border-indigo-300 bg-white px-3 py-1.5 text-sm font-semibold text-indigo-700 hover:bg-indigo-50"
            >
              Overlay: {showTapOverlay ? "On" : "Off"}
            </button>
          ) : null}
          {isTapPracticeMode && hasSegments && currentSegment ? (
            <button
              type="button"
              data-testid="practice-same-lane-guides-toggle"
              onClick={() => setShowSameLaneGuides((previous) => !previous)}
              className="rounded-full border border-sky-300 bg-white px-3 py-1.5 text-sm font-semibold text-sky-700 hover:bg-sky-50"
            >
              Same lanes: {showSameLaneGuides ? "On" : "Off"}
            </button>
          ) : null}
          {isTapPracticeMode && hasSegments && currentSegment ? (
            <button
              type="button"
              data-testid="practice-clear-taps"
              onClick={clearCurrentSegmentTaps}
              className="rounded-full border border-slate-300 bg-white px-3 py-1.5 text-sm font-semibold text-slate-700 hover:bg-slate-100"
            >
              Clear segment taps
            </button>
          ) : null}
          {isTapPracticeMode ? (
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
      </div>

      <main data-testid="practice-main" className="flex flex-1 justify-center overflow-y-auto px-4 pb-44 pt-2 md:px-8 md:pb-48">
        <section data-testid="practice-focus" className="flex h-full min-h-full w-full max-w-3xl items-start justify-center gap-2 md:gap-3">
          {!isTapPracticeMode ? (
            <button
              type="button"
              aria-label="Previous segment"
              data-testid="practice-prev-segment"
              onClick={handlePrevSegment}
              disabled={!hasSegments || isFirst}
              className="inline-flex h-12 w-10 shrink-0 items-center justify-center rounded-xl border border-indigo-300 bg-white text-indigo-700 transition hover:bg-indigo-50 disabled:opacity-30"
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
                    segment={currentSegment}
                    currentRating={currentRating}
                    onRate={handleRateCurrentSegment}
                    playbackMs={currentMs}
                    onSeek={seek}
                    masteryPercent={masteryPercentForSegment(currentSegment.id)}
                    lyricVisibilityMode={lyricVisibilityMode}
                    collapseLyricLineBreaks={collapseLyricLineBreaks}
                    showContourMap={showCardContourMap}
                  />
                </div>
                {isTapPracticeMode && hasSegments && currentSegment && showTapOverlay ? (
                  <div className="pointer-events-none absolute inset-0 z-30 overflow-hidden rounded-2xl border border-indigo-200/30 bg-indigo-50/10" data-testid="practice-piano-roll-overlay">
                    <svg viewBox="0 0 100 100" preserveAspectRatio="none" className="h-full w-full">
                      <line x1="0" y1="50" x2="100" y2="50" stroke="rgb(199 210 254)" strokeWidth="0.5" opacity="0.45" />
                      {showSameLaneGuides ? (currentSegment.pitchContourNotes ?? []).map((note) => {
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
                      {(currentSegment.pitchContourNotes ?? []).map((note) => {
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
              className="relative h-full min-h-0 w-16 shrink-0 rounded-2xl border-2 border-indigo-400 bg-gradient-to-b from-indigo-100 via-white to-indigo-100"
              onPointerDown={(event) => {
                if (!currentSegment) {
                  return;
                }
                event.preventDefault();
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
                activeCapture.lane = getTapLane(event.clientY);
              }}
              onPointerUp={(event) => {
                const activeCapture = activeTapCaptureRef.current;
                if (!activeCapture || activeCapture.pointerId !== event.pointerId) {
                  return;
                }
                finalizeTapCapture(getTapLane(event.clientY));
              }}
              onPointerCancel={(event) => {
                const activeCapture = activeTapCaptureRef.current;
                if (!activeCapture || activeCapture.pointerId !== event.pointerId) {
                  return;
                }
                finalizeTapCapture(getTapLane(event.clientY));
              }}
            >
              <div className="pointer-events-none absolute inset-x-2 top-2 rounded bg-indigo-200/80 px-1 py-0.5 text-center text-[10px] font-semibold text-indigo-800">
                Tap
              </div>
            </div>
          ) : (
            <button
              type="button"
              aria-label="Next segment"
              data-testid="practice-next-segment"
              onClick={handleNextSegment}
              disabled={!hasSegments || isLast}
              className="inline-flex h-12 w-10 shrink-0 items-center justify-center rounded-xl border border-indigo-300 bg-white text-indigo-700 transition hover:bg-indigo-50 disabled:opacity-30"
            >
              <svg aria-hidden="true" viewBox="0 0 24 24" className="h-5 w-5" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
                <path d="M6 12h12" />
                <path d="M14 8l4 4-4 4" />
              </svg>
            </button>
          )}
        </section>
      </main>

      <section
        data-testid="practice-transport"
        className="fixed inset-x-0 bottom-0 z-40 border-t border-gray-200 bg-white/95 px-4 py-2 backdrop-blur md:px-8"
      >
        <AudioPlayer
          audioUrl={song.audioUrl}
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
          onToggleLoop={() => setIsLooping((prev) => !prev)}
          lyricModeLabel={LYRIC_MODE_LABELS[lyricVisibilityMode]}
          onToggleLyricMode={() => setLyricVisibilityMode((previous) => getNextLyricMode(previous))}
        />
      </section>
    </div>
  );
};

export default PracticeView;
