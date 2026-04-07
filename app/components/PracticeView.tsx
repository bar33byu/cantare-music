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
import { getMasteryColor, getMasteryPercent } from "../lib/masteryColors";

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
const MIN_PITCH_RECALL_NOTE_MS = 120;

interface ActivePitchRecallCapture {
  pointerId: number;
  startedAt: number;
  startedCurrentMs: number;
  lane: number;
}

interface PracticeTapNote extends PitchContourNote {
  createdAt: number;
}

type PitchDirection = "up" | "down" | "same";
type TapDotStatus = "correct" | "wrong" | "neutral";

const MIN_TIMING_TOLERANCE_MS = 180;
const SEGMENT_TIMING_TOLERANCE_RATIO = 0.08;
const NOTE_TIMING_TOLERANCE_RATIO = 0.45;

function clamp(value: number, min: number, max: number): number {
  return Math.min(max, Math.max(min, value));
}

function getTimingToleranceMs(target: PitchContourNote, segmentDurationMs: number): number {
  const segmentBased = segmentDurationMs * SEGMENT_TIMING_TOLERANCE_RATIO;
  const noteBased = Math.max(target.durationMs, MIN_PITCH_RECALL_NOTE_MS) * NOTE_TIMING_TOLERANCE_RATIO;
  return Math.max(MIN_TIMING_TOLERANCE_MS, segmentBased, noteBased);
}

function getNoteCenterMs(note: PitchContourNote): number {
  return note.timeOffsetMs + note.durationMs / 2;
}

function getPitchDirection(previousLane: number, nextLane: number): PitchDirection {
  const delta = nextLane - previousLane;
  if (delta > 0.08) {
    return "up";
  }
  if (delta < -0.08) {
    return "down";
  }
  return "same";
}

function getExpectedDirections(notes: PitchContourNote[]): Map<string, PitchDirection | null> {
  const directions = new Map<string, PitchDirection | null>();
  notes.forEach((note, index) => {
    if (index === 0) {
      directions.set(note.id, null);
      return;
    }
    directions.set(note.id, getPitchDirection(notes[index - 1].lane, note.lane));
  });
  return directions;
}

function getAttemptDotStatuses(
  targetNotes: PitchContourNote[],
  attemptNotes: PitchContourNote[],
  segmentDurationMs: number
): Map<string, TapDotStatus> {
  const statuses = new Map<string, TapDotStatus>();
  const expectedDirections = getExpectedDirections(targetNotes);

  attemptNotes.forEach((attempt, index) => {
    const nearestTarget = findNearestTarget(targetNotes, attempt);
    if (!nearestTarget || !isAttemptTimingAligned(nearestTarget, attempt, segmentDurationMs)) {
      statuses.set(attempt.id, "wrong");
      return;
    }

    if (index === 0) {
      statuses.set(attempt.id, "neutral");
      return;
    }

    const expectedDirection = expectedDirections.get(nearestTarget.id) ?? null;
    const actualDirection = getPitchDirection(attemptNotes[index - 1].lane, attempt.lane);
    if (expectedDirection === null) {
      statuses.set(attempt.id, "neutral");
      return;
    }

    statuses.set(attempt.id, actualDirection === expectedDirection ? "correct" : "wrong");
  });

  return statuses;
}

function getDriftPercent(note: PitchContourNote, currentOffsetMs: number, windowMs: number): number {
  return 100 - ((currentOffsetMs - getNoteCenterMs(note)) / windowMs) * 100;
}

function isAttemptTimingAligned(target: PitchContourNote, attempt: PitchContourNote, segmentDurationMs: number): boolean {
  const targetCenter = getNoteCenterMs(target);
  const attemptCenter = getNoteCenterMs(attempt);
  const toleranceMs = getTimingToleranceMs(target, segmentDurationMs);
  return Math.abs(targetCenter - attemptCenter) <= toleranceMs;
}

function findNearestTarget(targetNotes: PitchContourNote[], attempt: PitchContourNote): PitchContourNote | null {
  if (targetNotes.length === 0) {
    return null;
  }

  const attemptCenter = getNoteCenterMs(attempt);
  let best = targetNotes[0];
  let bestDistance = Math.abs(getNoteCenterMs(best) - attemptCenter);

  for (let index = 1; index < targetNotes.length; index += 1) {
    const candidate = targetNotes[index];
    const distance = Math.abs(getNoteCenterMs(candidate) - attemptCenter);
    if (distance < bestDistance) {
      best = candidate;
      bestDistance = distance;
    }
  }

  return best;
}

function getMatchedTargetIdsByContour(
  targetNotes: PitchContourNote[],
  attemptNotes: PitchContourNote[],
  segmentDurationMs: number
): Set<string> {
  const matchedTargetIds = new Set<string>();
  const expectedDirections = getExpectedDirections(targetNotes);

  attemptNotes.forEach((attempt, index) => {
    const target = findNearestTarget(targetNotes, attempt);
    if (!target) {
      return;
    }
    if (!isAttemptTimingAligned(target, attempt, segmentDurationMs)) {
      return;
    }

    const expectedDirection = expectedDirections.get(target.id) ?? null;
    if (expectedDirection === null || index === 0) {
      matchedTargetIds.add(target.id);
      return;
    }

    const previousAttempt = attemptNotes[index - 1];
    const actualDirection = getPitchDirection(previousAttempt.lane, attempt.lane);
    if (actualDirection === expectedDirection) {
      matchedTargetIds.add(target.id);
    }
  });

  return matchedTargetIds;
}

function scorePitchRecall(targetNotes: PitchContourNote[], attemptNotes: PitchContourNote[], segmentDurationMs: number): number | null {
  if (targetNotes.length === 0 || attemptNotes.length === 0) {
    return null;
  }

  const matchedTargetIds = getMatchedTargetIdsByContour(targetNotes, attemptNotes, segmentDurationMs);

  return Math.round((matchedTargetIds.size / targetNotes.length) * 100);
}

function getWeakTargetIds(targetNotes: PitchContourNote[], attemptNotes: PitchContourNote[], segmentDurationMs: number): Set<string> {
  if (attemptNotes.length === 0) {
    return new Set<string>();
  }

  const matchedTargetIds = getMatchedTargetIdsByContour(targetNotes, attemptNotes, segmentDurationMs);

  return new Set(
    targetNotes
      .filter((target) => !matchedTargetIds.has(target.id))
      .map((target) => target.id)
  );
}

function getSuggestedRatingFromPitchRecallScore(score: number | null): MemoryRating | null {
  if (score === null) {
    return null;
  }
  if (score >= 90) {
    return 5;
  }
  if (score >= 75) {
    return 4;
  }
  if (score >= 55) {
    return 3;
  }
  if (score >= 35) {
    return 2;
  }
  return 1;
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

const PracticeView: React.FC<PracticeViewProps> = ({
  song,
  initialSession,
  onSessionChange,
  breadcrumbRootLabel,
  onBreadcrumbRootClick,
  onEditSongClick,
}) => {
  const [session, dispatch] = useReducer(sessionReducer, initialSession);
  const lastSyncedSegmentIdRef = React.useRef<string | null>(null);
  const previousSegmentIndexRef = React.useRef(initialSession.currentSegmentIndex);
  const lastSavedRatingsRef = React.useRef<string>("unloaded");
  const [transitionDirection, setTransitionDirection] = React.useState<"forward" | "backward">("forward");
  const [transitionToken, setTransitionToken] = React.useState(0);
  const [ratingsLoading, setRatingsLoading] = React.useState(true);
  const [ratingsError, setRatingsError] = React.useState<string | null>(null);
  const [lyricVisibilityMode, setLyricVisibilityMode] = React.useState<LyricVisibilityMode>("full");
  const [isLooping, setIsLooping] = React.useState(false);
  const [isTapPracticeMode, setIsTapPracticeMode] = React.useState(false);
  const [showContourReminder, setShowContourReminder] = React.useState(false);
  const [showDetailedTapOverlay, setShowDetailedTapOverlay] = React.useState(false);
  const [isTapSettingsOpen, setIsTapSettingsOpen] = React.useState(false);
  const [useProxyFallback, setUseProxyFallback] = React.useState(false);
  const songTitleRef = React.useRef<HTMLSpanElement | null>(null);
  const [isSongTitleTruncated, setIsSongTitleTruncated] = React.useState(false);
  const pitchRecallZoneRef = React.useRef<HTMLDivElement | null>(null);
  const tapSettingsMenuRef = React.useRef<HTMLDivElement | null>(null);
  const [pitchRecallBySegment, setPitchRecallBySegment] = React.useState<Record<string, PracticeTapNote[]>>({});
  const [activePitchRecallCapture, setActivePitchRecallCapture] = React.useState<ActivePitchRecallCapture | null>(null);
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
  const playbackAudioUrl = useMemo(() => {
    if (useProxyFallback) {
      // Proxy already failed — use the direct/CDN URL as fallback.
      return toPlayableAudioUrl(song.audioUrl);
    }
    // Prefer the same-origin proxy URL when the audio key can be resolved.
    return proxyAudioUrl ?? toPlayableAudioUrl(song.audioUrl);
  }, [proxyAudioUrl, song.audioUrl, useProxyFallback]);
  const { isPlaying, isReady, currentMs, durationMs, playbackError, debugInfo, play, pause, seek } = useAudioPlayer(playbackAudioUrl);
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
  const currentSegmentDurationMs = currentSegment ? Math.max(1, currentSegment.endMs - currentSegment.startMs) : 1;
  const currentSegmentOffsetMs = currentSegment ? clamp(currentMs - currentSegment.startMs, 0, currentSegmentDurationMs) : 0;
  const currentSegmentTargetNotes = currentSegment?.pitchContourNotes ?? [];
  const currentSegmentAttemptNotes = currentSegment ? (pitchRecallBySegment[currentSegment.id] ?? []) : [];
  const hasTapLaneControls = Boolean(currentSegment && currentSegmentTargetNotes.length > 0);
  const pitchOverlayWindowMs = Math.min(6000, Math.max(2400, Math.round(currentSegmentDurationMs * 0.75)));
  const shouldShowContourInCard = isTapPracticeMode || showContourReminder || currentSegmentAttemptNotes.length > 0;
  const pitchRecallScore = useMemo(
    () => scorePitchRecall(currentSegmentTargetNotes, currentSegmentAttemptNotes, currentSegmentDurationMs),
    [currentSegmentAttemptNotes, currentSegmentDurationMs, currentSegmentTargetNotes]
  );
  const weakTargetIds = useMemo(
    () => getWeakTargetIds(currentSegmentTargetNotes, currentSegmentAttemptNotes, currentSegmentDurationMs),
    [currentSegmentAttemptNotes, currentSegmentDurationMs, currentSegmentTargetNotes]
  );
  const contourHintStatuses = useMemo(
    () => Object.fromEntries(currentSegmentTargetNotes.map((note) => [note.id, weakTargetIds.has(note.id) ? "weak" : "correct"])) as Record<string, "correct" | "weak">,
    [currentSegmentTargetNotes, weakTargetIds]
  );
  const attemptDotStatuses = useMemo(
    () => getAttemptDotStatuses(currentSegmentTargetNotes, currentSegmentAttemptNotes, currentSegmentDurationMs),
    [currentSegmentAttemptNotes, currentSegmentDurationMs, currentSegmentTargetNotes]
  );
  const suggestedPitchRecallRating = useMemo(
    () => getSuggestedRatingFromPitchRecallScore(pitchRecallScore),
    [pitchRecallScore]
  );
  const pastGhostCount = hasSegments ? Math.min(session.currentSegmentIndex, 7) : 0;
  const futureGhostCount = hasSegments
    ? Math.min(song.segments.length - session.currentSegmentIndex - 1, 7)
    : 0;
  // Keep snapshot up-to-date every render (before effects run).
  playbackStateRef.current = { isPlaying, currentMs, currentSegment, durationMs };

  useEffect(() => {
    // Reset per-song fallback state when switching songs.
    setUseProxyFallback(false);
  }, [song.id]);

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
    if (!playbackError || useProxyFallback) {
      return;
    }
    // If the proxy URL fails, transparently retry with the direct/CDN URL.
    setUseProxyFallback(true);
  }, [playbackError, useProxyFallback]);

  useEffect(() => {
    if (!isTapSettingsOpen) {
      return;
    }

    const handlePointerDown = (event: PointerEvent) => {
      const menu = tapSettingsMenuRef.current;
      if (!menu) {
        return;
      }
      if (menu.contains(event.target as Node)) {
        return;
      }
      setIsTapSettingsOpen(false);
    };

    const handleEscape = (event: KeyboardEvent) => {
      if (event.key === "Escape") {
        setIsTapSettingsOpen(false);
      }
    };

    window.addEventListener("pointerdown", handlePointerDown);
    window.addEventListener("keydown", handleEscape);
    return () => {
      window.removeEventListener("pointerdown", handlePointerDown);
      window.removeEventListener("keydown", handleEscape);
    };
  }, [isTapSettingsOpen]);

  useEffect(() => {
    if (!hasTapLaneControls) {
      setIsTapSettingsOpen(false);
    }
  }, [hasTapLaneControls]);

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
    if (!hasSegments || !isPlaying) {
      return;
    }

    const targetIndex = song.segments.findIndex(
      (segment) => currentMs >= segment.startMs && currentMs < segment.endMs
    );

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
  }, [currentMs, hasSegments, isLooping, isPlaying, session.currentSegmentIndex, song.segments]);

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
          // Load failed — treat existing state as already saved to avoid erasing server data
          lastSavedRatingsRef.current = JSON.stringify(session.ratings);
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
  }, [song.id]);

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
      play(targetSegment.startMs, totalDurationMs);
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

  const PREV_RESTART_THRESHOLD_MS = 3_000;

  const handlePrevSegment = () => {
    if (!hasSegments || isFirst) {
      return;
    }
    setTransportDebug((previous) => ({
      ...previous,
      prevSegmentClicks: previous.prevSegmentClicks + 1,
      lastAction: "prev-segment",
      lastActionAt: new Date().toISOString(),
    }));
    // If we are more than PREV_RESTART_THRESHOLD_MS past the current segment's start,
    // restart the current segment rather than jumping to the previous one.
    if (currentSegment && currentMs - currentSegment.startMs > PREV_RESTART_THRESHOLD_MS) {
      seek(currentSegment.startMs);
      return;
    }
    jumpToSegment(session.currentSegmentIndex - 1);
  };

  const handleNextSegment = () => {
    if (!hasSegments || isLast) {
      return;
    }
    setTransportDebug((previous) => ({
      ...previous,
      nextSegmentClicks: previous.nextSegmentClicks + 1,
      lastAction: "next-segment",
      lastActionAt: new Date().toISOString(),
    }));
    // If playing, find the first segment whose start is strictly after the current
    // playback position, so overlapping or already-started segments are skipped.
    if (isPlaying) {
      const futureSegment = song.segments.find((seg) => seg.startMs > currentMs);
      if (futureSegment) {
        const futureIndex = song.segments.indexOf(futureSegment);
        dispatch({ type: "SET_SEGMENT_INDEX", index: futureIndex });
        play(futureSegment.startMs, totalDurationMs);
        return;
      }
    }
    // When not playing and still before the current segment's start, jump to that start
    // (avoids skipping a section the user hasn't heard yet).
    if (!isPlaying && currentSegment && currentMs < currentSegment.startMs) {
      seek(currentSegment.startMs);
      return;
    }
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
    const targetIndex = song.segments.findIndex(
      (segment) => ms >= segment.startMs && ms < segment.endMs
    );
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

  // When isLooping is toggled while audio is already playing, immediately constrain
  // playback to the current segment (loop on) or release it to full-piece (loop off).
  useEffect(() => {
    if (!loopEffectMountedRef.current) {
      loopEffectMountedRef.current = true;
      return;
    }
    const state = playbackStateRef.current;
    if (!state.isPlaying) return;
    if (isLooping) {
      if (!state.currentSegment) return;
      const resumeMs = Math.max(state.currentMs, state.currentSegment.startMs);
      play(resumeMs, state.currentSegment.endMs);
    } else {
      const effectiveDurationMs = state.durationMs > 0 ? state.durationMs : Number.POSITIVE_INFINITY;
      play(state.currentMs, effectiveDurationMs);
    }
  }, [isLooping, play]);

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
      lastSavedRatingsRef.current = snapshot;
      void fetch(`/api/songs/${song.id}/ratings`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          ratings: session.ratings.map((r) => ({
            segmentId: r.segmentId,
            rating: r.rating,
            ratedAt: r.ratedAt,
          })),
        }),
      });
    }, 400);
    return () => clearTimeout(timer);
  }, [session.ratings, song.id, ratingsLoading]);

  useEffect(() => {
    onSessionChange?.(session);
  }, [session, onSessionChange]);

  const commitPitchRecallCapture = React.useCallback((capture: ActivePitchRecallCapture, endedCurrentMs: number) => {
    if (!currentSegment) {
      return;
    }

    const segmentDuration = Math.max(1, currentSegment.endMs - currentSegment.startMs);
    const startedCurrentMs = clamp(capture.startedCurrentMs, currentSegment.startMs, currentSegment.endMs);
    const endedMs = clamp(endedCurrentMs, currentSegment.startMs, currentSegment.endMs);
    const startedOffsetMs = clamp(startedCurrentMs - currentSegment.startMs, 0, segmentDuration);
    const heldFromTimeline = Math.max(0, endedMs - startedCurrentMs);
    const heldFromWallClock = Math.max(0, Date.now() - capture.startedAt);
    const durationMs = Math.max(MIN_PITCH_RECALL_NOTE_MS, heldFromTimeline > 0 ? heldFromTimeline : heldFromWallClock);
    const nextNote: PracticeTapNote = {
      id: crypto.randomUUID(),
      timeOffsetMs: startedOffsetMs,
      durationMs,
      lane: capture.lane,
      createdAt: Date.now(),
    };

    setPitchRecallBySegment((previous) => {
      const existing = previous[currentSegment.id] ?? [];
      const next = [...existing, nextNote].sort((left, right) => left.timeOffsetMs - right.timeOffsetMs || left.id.localeCompare(right.id));
      const statuses = getAttemptDotStatuses(currentSegment.pitchContourNotes ?? [], next, segmentDuration);
      const nextStatus = statuses.get(nextNote.id);
      if (nextStatus === "wrong" && typeof navigator !== "undefined" && typeof navigator.vibrate === "function") {
        navigator.vibrate(35);
      }
      return {
        ...previous,
        [currentSegment.id]: next,
      };
    });
  }, [currentSegment]);

  const handlePitchRecallPointerDown = (event: React.PointerEvent<HTMLDivElement>) => {
    if (!currentSegment || currentSegmentTargetNotes.length === 0 || !isTapPracticeMode) {
      return;
    }

    const rect = pitchRecallZoneRef.current?.getBoundingClientRect();
    if (!rect || rect.height <= 0) {
      return;
    }

    const lane = Number((1 - clamp((event.clientY - rect.top) / rect.height, 0, 1)).toFixed(3));
    setActivePitchRecallCapture({
      pointerId: event.pointerId,
      startedAt: Date.now(),
      startedCurrentMs: currentMs,
      lane,
    });

    if (typeof event.currentTarget.setPointerCapture === "function") {
      event.currentTarget.setPointerCapture(event.pointerId);
    }
  };

  const handlePitchRecallPointerUp = (event: React.PointerEvent<HTMLDivElement>) => {
    if (!activePitchRecallCapture || activePitchRecallCapture.pointerId !== event.pointerId) {
      return;
    }

    if (typeof event.currentTarget.releasePointerCapture === "function") {
      event.currentTarget.releasePointerCapture(event.pointerId);
    }

    const capture = activePitchRecallCapture;
    setActivePitchRecallCapture(null);
    commitPitchRecallCapture(capture, currentMs);
  };

  const handleClearPitchRecall = () => {
    if (!currentSegment) {
      return;
    }

    setPitchRecallBySegment((previous) => ({
      ...previous,
      [currentSegment.id]: [],
    }));
  };

  const handleApplyPitchRecallRating = () => {
    if (!currentSegment || suggestedPitchRecallRating === null) {
      return;
    }

    handleRateCurrentSegment(suggestedPitchRecallRating);
  };

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
                  className="inline-flex items-center gap-1 rounded-full border border-gray-300 bg-white px-3 py-1.5 text-sm font-semibold text-gray-700 shadow-sm transition hover:border-emerald-500 hover:text-emerald-700 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-emerald-500"
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
                  className="block truncate text-2xl font-bold tracking-tight text-gray-900 outline-none md:text-3xl"
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
            <h1 className="min-w-0 max-w-[15rem] text-2xl font-bold tracking-tight text-gray-900 sm:max-w-[22rem] md:max-w-[30rem] md:text-3xl lg:max-w-[36rem]">
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
          <div className="relative flex shrink-0 items-center gap-2" ref={tapSettingsMenuRef}>
            {onEditSongClick ? (
              <button
                onClick={onEditSongClick}
                aria-label="Edit song"
                title="Edit song"
                className="inline-flex h-9 w-9 items-center justify-center rounded-full bg-emerald-600 text-white hover:bg-emerald-700"
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

            <button
              type="button"
              data-testid="practice-tap-settings-toggle"
              aria-label="Tap lane settings"
              aria-expanded={isTapSettingsOpen}
              onClick={() => setIsTapSettingsOpen((previous) => !previous)}
              className="inline-flex h-9 w-9 items-center justify-center rounded-full border border-indigo-200 bg-white text-indigo-700 shadow-sm hover:bg-indigo-50"
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
                <circle cx="12" cy="12" r="3" />
                <path d="M19.4 15a1.65 1.65 0 0 0 .33 1.82l.06.06a2 2 0 1 1-2.83 2.83l-.06-.06A1.65 1.65 0 0 0 15 19.4a1.65 1.65 0 0 0-1 .6 1.65 1.65 0 0 0-.33 1V21a2 2 0 1 1-4 0v-.09a1.65 1.65 0 0 0-.33-1 1.65 1.65 0 0 0-1-.6 1.65 1.65 0 0 0-1.82.33l-.06.06a2 2 0 1 1-2.83-2.83l.06-.06A1.65 1.65 0 0 0 4.6 15a1.65 1.65 0 0 0-.6-1 1.65 1.65 0 0 0-1-.33H3a2 2 0 1 1 0-4h.09a1.65 1.65 0 0 0 1-.33 1.65 1.65 0 0 0 .6-1 1.65 1.65 0 0 0-.33-1.82l-.06-.06A2 2 0 1 1 7.13 3.6l.06.06A1.65 1.65 0 0 0 9 4.6h.01a1.65 1.65 0 0 0 1-.6 1.65 1.65 0 0 0 .33-1V3a2 2 0 1 1 4 0v.09a1.65 1.65 0 0 0 .33 1 1.65 1.65 0 0 0 1 .6h.01a1.65 1.65 0 0 0 1.82-.33l.06-.06A2 2 0 1 1 20.4 7.13l-.06.06A1.65 1.65 0 0 0 19.4 9v.01a1.65 1.65 0 0 0 .6 1 1.65 1.65 0 0 0 1 .33H21a2 2 0 1 1 0 4h-.09a1.65 1.65 0 0 0-1 .33 1.65 1.65 0 0 0-.6 1z" />
              </svg>
            </button>

            {isTapSettingsOpen ? (
              <div
                data-testid="practice-tap-settings-panel"
                className="absolute right-0 top-11 z-50 w-[18rem] rounded-xl border border-gray-200 bg-white p-3 shadow-lg"
              >
                <p className="mb-2 text-xs font-semibold uppercase tracking-wide text-gray-500">Tap Lane Settings</p>
                <div className="space-y-2">
                  <button
                    type="button"
                    data-testid="practice-toggle-tap-mode"
                    disabled={!hasTapLaneControls}
                    onClick={() => setIsTapPracticeMode((previous) => !previous)}
                    className={`w-full rounded-lg border px-3 py-2 text-left text-xs font-semibold ${isTapPracticeMode ? "border-emerald-600 bg-emerald-600 text-white" : "border-gray-300 bg-white text-gray-700"} disabled:cursor-not-allowed disabled:opacity-50`}
                  >
                    Tap Practice: {isTapPracticeMode ? "On" : "Off"}
                  </button>
                  <button
                    type="button"
                    data-testid="practice-toggle-contour-reminder"
                    disabled={!hasTapLaneControls}
                    onClick={() => setShowContourReminder((previous) => !previous)}
                    className={`w-full rounded-lg border px-3 py-2 text-left text-xs font-semibold ${showContourReminder ? "border-sky-600 bg-sky-600 text-white" : "border-gray-300 bg-white text-gray-700"} disabled:cursor-not-allowed disabled:opacity-50`}
                  >
                    Contour Hint: {showContourReminder ? "On" : "Off"}
                  </button>
                  <button
                    type="button"
                    data-testid="practice-toggle-detailed-overlay"
                    disabled={!hasTapLaneControls}
                    onClick={() => setShowDetailedTapOverlay((previous) => !previous)}
                    className={`w-full rounded-lg border px-3 py-2 text-left text-xs font-semibold ${showDetailedTapOverlay ? "border-amber-600 bg-amber-600 text-white" : "border-gray-300 bg-white text-gray-700"} disabled:cursor-not-allowed disabled:opacity-50`}
                  >
                    Detailed: {showDetailedTapOverlay ? "On" : "Off"}
                  </button>
                  {suggestedPitchRecallRating !== null ? (
                    <button
                      type="button"
                      data-testid="practice-pitch-recall-apply-rating"
                      onClick={handleApplyPitchRecallRating}
                      className="w-full rounded-lg border border-emerald-300 bg-white px-3 py-2 text-left text-xs font-semibold text-emerald-800 hover:bg-emerald-100"
                    >
                      Apply {suggestedPitchRecallRating}/5
                    </button>
                  ) : null}
                  <button
                    type="button"
                    data-testid="practice-pitch-recall-clear"
                    disabled={!hasTapLaneControls || currentSegmentAttemptNotes.length === 0}
                    onClick={handleClearPitchRecall}
                    className="w-full rounded-lg border border-emerald-300 bg-white px-3 py-2 text-left text-xs font-semibold text-emerald-800 hover:bg-emerald-100 disabled:cursor-not-allowed disabled:opacity-50"
                  >
                    Clear Tap Attempts
                  </button>
                </div>
              </div>
            ) : null}
          </div>
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
          <KnowledgeBar percent={knowledgeScore.overall} label="Piece Knowledge" />
        )}
        {ratingsError ? (
          <p data-testid="ratings-load-error" className="mt-2 text-sm text-amber-700">
            {ratingsError}
          </p>
        ) : null}
      </div>

      <main data-testid="practice-main" className="flex flex-1 justify-center overflow-hidden px-4 pb-44 pt-2 md:px-8 md:pb-48">
        <section data-testid="practice-focus" className="relative flex h-full min-h-0 w-full max-w-5xl items-center justify-center gap-4 md:gap-8">
          {(showDetailedTapOverlay || currentSegmentAttemptNotes.length > 0) && currentSegment ? (
            <div data-testid="practice-pitch-recall" className="pointer-events-none absolute inset-0 z-20 overflow-hidden">
              {showDetailedTapOverlay
                ? currentSegmentTargetNotes.map((note) => {
                    const leftPercent = getDriftPercent(note, currentSegmentOffsetMs, pitchOverlayWindowMs);
                    if (leftPercent < -8 || leftPercent > 108) {
                      return null;
                    }
                    return (
                      <div
                        key={`target-dot-${note.id}`}
                        data-testid="practice-pitch-target-note"
                        data-status={weakTargetIds.has(note.id) ? "weak" : "strong"}
                        className={`absolute h-3 w-3 rounded-full border ${weakTargetIds.has(note.id) ? "border-rose-300 bg-rose-300/75" : "border-sky-400 bg-sky-300/70"}`}
                        style={{
                          left: `${leftPercent}%`,
                          top: `${10 + (1 - note.lane) * 74}%`,
                          transform: "translate(-50%, -50%)",
                        }}
                      />
                    );
                  })
                : null}
              {currentSegmentAttemptNotes.map((note) => {
                const leftPercent = getDriftPercent(note, currentSegmentOffsetMs, pitchOverlayWindowMs);
                if (leftPercent < -8 || leftPercent > 108) {
                  return null;
                }
                const dotStatus = attemptDotStatuses.get(note.id) ?? "neutral";
                return (
                  <div
                    key={`attempt-dot-${note.id}`}
                    data-testid="practice-pitch-attempt-note"
                    data-status={dotStatus}
                    className={`absolute h-4 w-4 rounded-full border-2 ${
                      dotStatus === "correct"
                        ? "border-emerald-500 bg-emerald-400/85"
                        : dotStatus === "wrong"
                          ? "border-rose-500 bg-rose-400/85"
                          : "border-amber-500 bg-amber-300/80"
                    }`}
                    style={{
                      left: `${leftPercent}%`,
                      top: `${10 + (1 - note.lane) * 74}%`,
                      transform: "translate(-50%, -50%)",
                    }}
                  />
                );
              })}
            </div>
          ) : null}
          <button
            type="button"
            aria-label="Previous segment"
            data-testid="practice-prev-segment"
            onClick={handlePrevSegment}
            disabled={!hasSegments || isFirst}
            className={`${isTapPracticeMode ? "hidden md:inline-flex" : "inline-flex"} h-[70%] min-h-[220px] max-h-[560px] w-14 shrink-0 items-center justify-center rounded-[28px] border border-indigo-300/80 bg-gradient-to-b from-white via-indigo-50 to-indigo-100 text-indigo-700 shadow-lg shadow-indigo-300/30 transition hover:-translate-y-0.5 hover:from-white hover:to-indigo-200 hover:shadow-xl disabled:opacity-30`}
          >
            <span aria-hidden="true" className="text-3xl leading-none">&#x2039;</span>
          </button>
          <div className="relative z-10 flex h-full min-h-0 w-full max-w-3xl items-start gap-4">
            <div className="flex h-full min-h-0 flex-1 flex-col gap-4">
              <div className="h-full min-h-0 w-full max-w-md">
            {hasSegments && currentSegment ? (
              <div className="segment-stack-shell relative h-full min-h-0 overflow-visible">
                {Array.from({ length: pastGhostCount }).map((_, ghostIndex) => {
                  const depth = ghostIndex + 1;
                  const segmentIndex = session.currentSegmentIndex - depth;
                  const ghostSegment = song.segments[segmentIndex];
                  const ghostMasteryColor = ghostSegment
                    ? getMasteryColor(masteryPercentForSegment(ghostSegment.id))
                    : getMasteryColor(0);
                  const scale = 1 - depth * 0.04;
                  const translateX = -(depth * 12);
                  const opacity = Math.max(0.06, 0.75 - depth * 0.09);
                  const zIndex = 10 - depth;
                  return (
                    <div
                      key={`past-ghost-${depth}`}
                      className="segment-stack-ghost pointer-events-none absolute inset-0 rounded-2xl border border-slate-300/70 bg-slate-100/65"
                      style={{
                        transform: `translateX(${translateX}px) scale(${scale.toFixed(3)})`,
                        transformOrigin: "center center",
                        opacity,
                        zIndex,
                      }}
                      aria-hidden="true"
                    >
                      <div
                        className="absolute inset-x-0 top-0 h-4 rounded-t-2xl border-b border-black/5"
                        style={{ backgroundColor: ghostMasteryColor }}
                      />
                    </div>
                  );
                })}
                {Array.from({ length: futureGhostCount }).map((_, ghostIndex) => {
                  const depth = ghostIndex + 1;
                  const segmentIndex = session.currentSegmentIndex + depth;
                  const ghostSegment = song.segments[segmentIndex];
                  const ghostMasteryColor = ghostSegment
                    ? getMasteryColor(masteryPercentForSegment(ghostSegment.id))
                    : getMasteryColor(0);
                  const scale = 1 - depth * 0.04;
                  const translateX = depth * 12;
                  const opacity = Math.max(0.06, 0.75 - depth * 0.09);
                  const zIndex = 10 - depth;
                  return (
                    <div
                      key={`future-ghost-${depth}`}
                      className="segment-stack-ghost pointer-events-none absolute inset-0 rounded-2xl border border-indigo-300/70 bg-indigo-50/55"
                      style={{
                        transform: `translateX(${translateX}px) scale(${scale.toFixed(3)})`,
                        transformOrigin: "center center",
                        opacity,
                        zIndex,
                      }}
                      aria-hidden="true"
                    >
                      <div
                        className="absolute inset-x-0 top-0 h-4 rounded-t-2xl border-b border-black/5"
                        style={{ backgroundColor: ghostMasteryColor }}
                      />
                    </div>
                  );
                })}
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
                    pitchContourNotes={shouldShowContourInCard ? currentSegment.pitchContourNotes : undefined}
                    pitchContourStatuses={shouldShowContourInCard ? contourHintStatuses : undefined}
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
          {currentSegment && currentSegmentTargetNotes.length > 0 ? (
            <div
              data-testid="practice-tap-lane-panel"
              className="flex w-full flex-wrap items-center gap-2 rounded-[22px] border border-emerald-200 bg-white/95 p-3 shadow-sm"
            >
              <div className="mr-2 text-sm font-semibold uppercase tracking-wide text-emerald-800">Tap Lane</div>
              <div className="flex flex-wrap items-center gap-2">
                <span data-testid="practice-pitch-recall-attempt-count" className="rounded-full border border-emerald-300 bg-white px-2.5 py-1 text-xs font-semibold text-emerald-900">
                  Attempts: {currentSegmentAttemptNotes.length}
                </span>
                {pitchRecallScore !== null ? (
                  <span data-testid="practice-pitch-recall-score" className="rounded-full bg-emerald-700 px-2.5 py-1 text-xs font-semibold text-white">
                    Match {pitchRecallScore}%
                  </span>
                ) : null}
              </div>
            </div>
          ) : null}
            </div>
          </div>
          <button
            type="button"
            aria-label="Next segment"
            data-testid="practice-next-segment"
            onClick={handleNextSegment}
            disabled={!hasSegments || isLast}
            className={`${isTapPracticeMode ? "hidden md:inline-flex" : "inline-flex"} h-[70%] min-h-[220px] max-h-[560px] w-14 shrink-0 items-center justify-center rounded-[28px] border border-indigo-300/80 bg-gradient-to-b from-white via-indigo-50 to-indigo-100 text-indigo-700 shadow-lg shadow-indigo-300/30 transition hover:-translate-y-0.5 hover:from-white hover:to-indigo-200 hover:shadow-xl disabled:opacity-30`}
          >
            <span aria-hidden="true" className="text-3xl leading-none">&#x203A;</span>
          </button>
          {currentSegment && currentSegmentTargetNotes.length > 0 ? (
            <aside
              ref={pitchRecallZoneRef}
              data-testid="practice-tap-zone"
              className={`relative z-10 hidden min-h-[520px] w-24 shrink-0 overflow-hidden rounded-[28px] border-4 border-dashed bg-white/90 shadow-sm md:block ${isTapPracticeMode ? "border-gray-400" : "border-gray-300 opacity-75"}`}
              onPointerDown={handlePitchRecallPointerDown}
              onPointerUp={handlePitchRecallPointerUp}
              onPointerCancel={() => setActivePitchRecallCapture(null)}
            >
              <div className="pointer-events-none flex h-full flex-col items-center justify-between px-3 py-5 text-center text-[11px] font-semibold uppercase tracking-[0.18em] text-gray-500">
                <span>High</span>
                <span>Tap Zone</span>
                <span>{isTapPracticeMode ? "Listening" : "Off"}</span>
                <span>Low</span>
              </div>
            </aside>
          ) : null}
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
