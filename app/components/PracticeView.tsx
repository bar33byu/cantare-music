"use client";

import React, { useEffect, useMemo, useReducer } from "react";
import { Song, MemoryRating } from "../types/index";
import { sessionReducer, SessionState } from "../lib/sessionReducer";
import { computeKnowledgeScore } from "../lib/knowledgeUtils";
import SegmentCard from "./SegmentCard";
import KnowledgeBar from "./KnowledgeBar";
import { AudioPlayer } from "./AudioPlayer";
import { useAudioPlayer } from "../hooks/useAudioPlayer";
import { buildProxyAudioUrl, parseAudioKey, toPlayableAudioUrl } from "../lib/audioUrls";
import { getMasteryPercent } from "../lib/masteryColors";

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
}) => {
  const [session, dispatch] = useReducer(sessionReducer, initialSession);
  const initialSegmentId = song.segments[initialSession.currentSegmentIndex]?.id ?? null;
  const lastSyncedSegmentIdRef = React.useRef<string | null>(initialSegmentId);
  const previousSegmentIndexRef = React.useRef(initialSession.currentSegmentIndex);
  const lastSavedRatingsRef = React.useRef<string>("unloaded");
  const [transitionDirection, setTransitionDirection] = React.useState<"forward" | "backward">("forward");
  const [transitionToken, setTransitionToken] = React.useState(0);
  const [ratingsLoading, setRatingsLoading] = React.useState(true);
  const [ratingsError, setRatingsError] = React.useState<string | null>(null);
  const [lyricVisibilityMode, setLyricVisibilityMode] = React.useState<LyricVisibilityMode>("full");
  const [isLooping, setIsLooping] = React.useState(false);
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
  const isLast = !hasSegments || session.currentSegmentIndex === song.segments.length - 1;
  const isFirst = !hasSegments || session.currentSegmentIndex === 0;
  const totalDurationMs = Math.max(durationMs, ...song.segments.map((segment) => segment.endMs), 0);
  const activeStartMs = currentSegment?.startMs ?? 0;
  const activeEndMs = currentSegment?.endMs ?? totalDurationMs;
  const hasAutoplayedSongRef = React.useRef<string | null>(null);

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

  // Keep snapshot up-to-date every render (before effects run).
  playbackStateRef.current = { isPlaying, currentMs, currentSegment, durationMs };

  useEffect(() => {
    // On song change, avoid forcing an initial jump to the first section start.
    lastSyncedSegmentIdRef.current = song.segments[session.currentSegmentIndex]?.id ?? null;
  }, [session.currentSegmentIndex, song.id, song.segments]);

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

    const targetIndex = getSegmentIndexAtMs(currentMs);

    // When looping, stay on the current segment — don't auto-advance.
    if (targetIndex !== -1 && targetIndex !== session.currentSegmentIndex && !isLooping) {
      dispatch({ type: "SET_SEGMENT_INDEX", index: targetIndex });
      return;
    }

    // In a gap between two segments: first half → show prior, second half → show next
    if (targetIndex === -1) {
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
          dispatch({ type: "SET_SEGMENT_INDEX", index: gapTargetIndex });
        }
        return;
      }
    }

    if (currentMs >= song.segments[song.segments.length - 1].endMs && session.currentSegmentIndex !== song.segments.length - 1) {
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

  const jumpToSegment = (targetIndex: number) => {
    if (!hasSegments) {
      return;
    }
    const clamped = Math.max(0, Math.min(song.segments.length - 1, targetIndex));
    const targetSegment = song.segments[clamped];
    dispatch({ type: "SET_SEGMENT_INDEX", index: clamped });
    if (isPlaying) {
      if (isLooping) {
        play(targetSegment.startMs, targetSegment.endMs);
        return;
      }

      const effectiveDurationMs = durationMs > 0 ? durationMs : Number.POSITIVE_INFINITY;
      play(targetSegment.startMs, effectiveDurationMs);
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
      const resumeMs = currentMs >= currentSegment.endMs
        ? currentSegment.startMs
        : Math.max(currentMs, currentSegment.startMs);
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

    const elapsedInSegmentMs = currentMs - currentSegment.startMs;
    const shouldGoToPreviousSegment = elapsedInSegmentMs <= PREV_SEGMENT_GO_BACK_THRESHOLD_MS && !isFirst;

    setTransportDebug((previous) => ({
      ...previous,
      prevSegmentClicks: previous.prevSegmentClicks + 1,
      lastAction: shouldGoToPreviousSegment ? "prev-segment" : "restart-segment",
      lastActionAt: new Date().toISOString(),
    }));

    if (shouldGoToPreviousSegment) {
      jumpToSegment(session.currentSegmentIndex - 1);
      return;
    }

    jumpToSegment(session.currentSegmentIndex);
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

    if (isLast) {
      return;
    }

    setTransportDebug((previous) => ({
      ...previous,
      nextSegmentClicks: previous.nextSegmentClicks + 1,
      lastAction: "next-segment",
      lastActionAt: new Date().toISOString(),
    }));
    jumpToSegment(session.currentSegmentIndex + 1);
  };

  const handleSeekSong = (ms: number) => {
    setTransportDebug((previous) => ({
      ...previous,
      seekClicks: previous.seekClicks + 1,
      lastAction: `seek-song-${ms}`,
      lastActionAt: new Date().toISOString(),
    }));
    seek(ms);
    const targetIndex = getSegmentIndexAtMs(ms);
    if (targetIndex !== -1 && targetIndex !== session.currentSegmentIndex) {
      dispatch({ type: "SET_SEGMENT_INDEX", index: targetIndex });
    }
  };

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
      return;
    }
    if (pausedByUserRef.current) return;
    if (currentMs >= currentSegment.endMs - 50) {
      play(currentSegment.startMs, currentSegment.endMs);
    }
  }, [currentMs, currentSegment, isLooping, isPlaying, play]);

  useEffect(() => {
    const previousIndex = previousSegmentIndexRef.current;
    if (session.currentSegmentIndex !== previousIndex) {
      setTransitionDirection(session.currentSegmentIndex > previousIndex ? "forward" : "backward");
      setTransitionToken((previous) => previous + 1);
      previousSegmentIndexRef.current = session.currentSegmentIndex;
    }
  }, [session.currentSegmentIndex]);

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
        {ratingsError ? (
          <p data-testid="ratings-load-error" className="mt-2 text-sm text-amber-700">
            {ratingsError}
          </p>
        ) : null}
      </div>

      <main data-testid="practice-main" className="flex flex-1 justify-center overflow-hidden px-4 pb-44 pt-2 md:px-8 md:pb-48">
        <section data-testid="practice-focus" className="flex h-full min-h-0 w-full max-w-3xl items-center justify-center gap-2 md:gap-3">
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
          <div className="h-full min-h-0 w-full max-w-md">
            {hasSegments && currentSegment ? (
              <div className="segment-stack-shell relative h-full min-h-0 overflow-visible">
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
                  />
                </div>
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
