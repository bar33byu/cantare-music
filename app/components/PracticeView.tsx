"use client";

import React, { useEffect, useMemo, useReducer } from "react";
import { flushSync } from "react-dom";
import { Song, MemoryRating, PitchContourNote, ContourNoteHeatStat } from "../types/index";
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
import { DEFAULT_TAP_TIMING_TOLERANCE_MS } from "../lib/tapPracticeConstants";
import { withUserIdHeader } from "../lib/userContext";
import { usePitchPractice } from "../hooks/usePitchPractice";

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
  breadcrumbRootLabel?: string;
  onBreadcrumbRootClick?: () => void;
  onEditSongClick?: () => void;
  onOpenContourReferenceClick?: () => void;
  segmentPrerollMs?: number;
  preferredAudioVersion?: PreferredAudioVersion;
  onPreferredAudioVersionChange?: (version: PreferredAudioVersion) => void;
  readOnlyDataUserId?: string;
  sharedPlaylistToken?: string;
  collapseLyricLineBreaks?: boolean;
  lyricSize?: "default" | "large";
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
type ExplainedPracticeControl = "part" | "blend" | "contour" | "tap" | "sing";

const PRACTICE_CONTROL_EXPLAINER_STORAGE_KEY_PREFIX = "practice-control-explainer:";
const practiceControlExplainerCopy: Record<
  ExplainedPracticeControl,
  { title: string; description: string; detail?: string }
> = {
  part: {
    title: "Practice with your part",
    description: "Hear your vocal part clearly so you can learn the notes, rhythm, and entrances.",
  },
  blend: {
    title: "Practice with the full blend",
    description: "Hear your part within the complete ensemble and practice fitting your voice into the group.",
  },
  contour: {
    title: "See the melodic contour",
    description: "Show the melody's shape beneath the lyrics. Colors highlight areas from recent Tap attempts that may need more practice.",
    detail: "Contour is available when you add a simple, single-track MIDI file while setting up the song.",
  },
  tap: {
    title: "Practice the melody by tapping",
    description: 'Also called "Primary Chorister Mode." Tap along with the music using the vertical bar. Tap higher or lower as the melody moves, and Cantare will compare your contour with the song.',
    detail: "Tap practice is available when you add a simple, single-track MIDI file while setting up the song.",
  },
  sing: {
    title: "Practice the exact pitches",
    description: "Sing with the recording and Cantare will compare your stable sung pitch with each MIDI note. Silence and skipped notes do not lower your score.",
    detail: "Headphones are strongly recommended. Microphone audio stays on this device and is never recorded or uploaded.",
  },
};

function hasSeenPracticeControlExplainer(control: ExplainedPracticeControl): boolean {
  if (typeof window === "undefined") {
    return false;
  }

  try {
    return window.localStorage.getItem(`${PRACTICE_CONTROL_EXPLAINER_STORAGE_KEY_PREFIX}${control}`) === "seen";
  } catch {
    return false;
  }
}

function markPracticeControlExplainerSeen(control: ExplainedPracticeControl): void {
  if (typeof window === "undefined") {
    return;
  }

  try {
    window.localStorage.setItem(`${PRACTICE_CONTROL_EXPLAINER_STORAGE_KEY_PREFIX}${control}`, "seen");
  } catch {
    // Ignore storage failures; the explainer can show again.
  }
}
export type ProgressStorageMode = "account" | "local" | "none";

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
const TAP_MATCH_OPTIONS = {
  timeToleranceMs: DEFAULT_TAP_TIMING_TOLERANCE_MS,
  sameDeadZone: DEFAULT_CONTOUR_SAME_DEAD_ZONE,
  durationToleranceRatio: 0.6,
} as const;
const TAP_KEYBOARD_KEYS = "zxcvbnm,./asdfghjkl;'qwertyuiop[]\\";

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
  inputMethod?: "tap" | "voice";
  startedAt: string;
  completedAt?: string;
  finalizedAt?: string;
  autoScorePercent?: number;
  scoreDetails?: TapScoreResult;
  tapCount: number;
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

function getTapKeyboardLane(key: string): number | null {
  const normalizedKey = key.toLowerCase();
  const keyIndex = TAP_KEYBOARD_KEYS.indexOf(normalizedKey);
  if (keyIndex === -1) {
    return null;
  }
  if (TAP_KEYBOARD_KEYS.length === 1) {
    return 0;
  }
  return keyIndex / (TAP_KEYBOARD_KEYS.length - 1);
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
  breadcrumbRootLabel,
  onBreadcrumbRootClick,
  onEditSongClick,
  onOpenContourReferenceClick,
  segmentPrerollMs = 500,
  preferredAudioVersion = "part",
  onPreferredAudioVersionChange,
  readOnlyDataUserId,
  sharedPlaylistToken,
  collapseLyricLineBreaks = false,
  lyricSize = "default",
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
    return withUserIdHeader(init, userId);
  }, [userId]);

  const request = React.useCallback((url: string, init?: RequestInit) => {
    const scopedInit = withUserHeader(init);
    return scopedInit ? fetch(url, scopedInit) : fetch(url);
  }, [withUserHeader]);

  const withReadOnlyDataUserHeader = React.useCallback((init?: RequestInit): RequestInit | undefined => {
    const dataUserId = readOnlyDataUserId ?? userId;
    return withUserIdHeader(init, dataUserId);
  }, [readOnlyDataUserId, userId]);

  const readOnlyDataRequest = React.useCallback((url: string, init?: RequestInit) => {
    const scopedInit = withReadOnlyDataUserHeader(init);
    return scopedInit ? fetch(url, scopedInit) : fetch(url);
  }, [withReadOnlyDataUserHeader]);

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
  const previousSongIdRef = React.useRef(song.id);
  const lastSavedRatingsRef = React.useRef<string>("unloaded");
  const latestRatingsRef = React.useRef(session.ratings);
  const [transitionDirection, setTransitionDirection] = React.useState<"forward" | "backward">("forward");
  const [transitionToken, setTransitionToken] = React.useState(0);
  const [ratingsLoading, setRatingsLoading] = React.useState(true);
  const [ratingsError, setRatingsError] = React.useState<string | null>(null);
  const [lyricVisibilityMode, setLyricVisibilityMode] = React.useState<LyricVisibilityMode>("full");
  const [isLooping, setIsLooping] = React.useState(defaultLooping);
  const [isTapPracticeMode, setIsTapPracticeMode] = React.useState(false);
  const [isSingPracticeMode, setIsSingPracticeMode] = React.useState(false);
  const [showCardContourMap, setShowCardContourMap] = React.useState(false);
  const [practiceControlExplainer, setPracticeControlExplainer] = React.useState<ExplainedPracticeControl | null>(null);
  const [tapSessionSummaries, setTapSessionSummaries] = React.useState<TapSessionSummaryPayload[]>([]);
  const [midiSegmentAnswerKeys, setMidiSegmentAnswerKeys] = React.useState<Record<string, MidiSegmentAnswerKey>>({});
  const [localMidiScoreAttemptsBySegment, setLocalMidiScoreAttemptsBySegment] = React.useState<Record<string, TapScoreResult[]>>({});
  const [voiceRunScoresBySegment, setVoiceRunScoresBySegment] = React.useState<Record<string, TapScoreResult>>({});
  const [tapAttemptsBySegment, setTapAttemptsBySegment] = React.useState<Record<string, PitchContourNote[]>>({});
  const [, setTapHeatMapBySegment] = React.useState<Record<string, Record<string, ContourNoteHeatStat>>>({});
  const [tapHeatMapRefreshToken, setTapHeatMapRefreshToken] = React.useState(0);
  const [tapSessionResetToken, setTapSessionResetToken] = React.useState(0);
  const [tapPracticeCountIn, setTapPracticeCountIn] = React.useState<number | null>(null);
  const [accuracyToast, setAccuracyToast] = React.useState<{ text: string; visible: boolean } | null>(null);
  const [tapPersistenceWarning, setTapPersistenceWarning] = React.useState<string | null>(null);
  const songTitleRef = React.useRef<HTMLSpanElement | null>(null);
  const [isSongTitleTruncated, setIsSongTitleTruncated] = React.useState(false);
  const [viewportSize, setViewportSize] = React.useState({ width: 0, height: 0 });
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
  const { isPlaying, isReady, currentMs, getCurrentMs, durationMs, endedCount = 0, playbackError, debugInfo, play, pause, seek, setPlaybackEndMs } = useAudioPlayer(directPlaybackAudioUrl, undefined, {
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
  const hasMidiTapAnswers = (
    Object.values(midiSegmentAnswerKeys).some((key) => key.taps.length > 0) ||
    (song.pitchContourNotes?.length ?? 0) > 0
  );
  const isGuidedPracticeMode = isTapPracticeMode || isSingPracticeMode;
  const hasContourReferenceData = (
    Object.values(midiSegmentAnswerKeys).some((key) => key.notes.length > 0) ||
    song.segments.some((segment) => (segment.pitchContourNotes?.length ?? 0) > 0) ||
    (song.pitchContourNotes?.length ?? 0) > 0 ||
    Boolean(song.hasMidiContour)
  );
  const currentSegment = hasSegments ? song.segments[session.currentSegmentIndex] : null;
  const tapBarRef = React.useRef<HTMLDivElement | null>(null);
  const activeTapCaptureRef = React.useRef<ActiveTapCapture | null>(null);
  const toastTimerRef = React.useRef<number | null>(null);
  const tapWarningTimerRef = React.useRef<number | null>(null);
  const tapCountInIntervalRef = React.useRef<number | null>(null);
  const tapCountInTimeoutRef = React.useRef<number | null>(null);
  const loopHandledRef = React.useRef<string | null>(null);
  const autoPlayHandledKeyRef = React.useRef<string | null>(null);
  const autoPlayTokenHandledRef = React.useRef<number>(0);
  const playbackErrorRef = React.useRef(playbackError);
  const autoPlayErrorReportedRef = React.useRef<string | null>(null);
  const playbackCompleteNotifiedRef = React.useRef<string | null>(null);
  const lastHandledEndedCountRef = React.useRef(endedCount);
  const tapAttemptsRef = React.useRef<Record<string, PitchContourNote[]>>({});
  const previousTapPracticeSegmentIdRef = React.useRef<string | null>(null);
  const [tapSessionId, setTapSessionId] = React.useState<string | null>(null);
  const tapSessionIdRef = React.useRef<string | null>(null);
  const tapSessionInputMethodRef = React.useRef<"tap" | "voice">("tap");
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
  const isCompactLandscapeLayout = (
    !isGuidedPracticeMode &&
    viewportSize.width > viewportSize.height &&
    viewportSize.height > 0 &&
    viewportSize.height <= 520 &&
    viewportSize.width <= 1100
  );
  React.useEffect(() => {
    onSegmentPlaybackCompleteRef.current = onSegmentPlaybackComplete;
  }, [onSegmentPlaybackComplete]);

  React.useEffect(() => {
    playbackErrorRef.current = playbackError;
  }, [playbackError]);

  React.useEffect(() => {
    if (!playbackError || autoPlayToken <= 0 || playScope !== "segment") {
      return;
    }

    const reportKey = `${autoPlayToken}:${playbackError}`;
    if (autoPlayErrorReportedRef.current === reportKey) {
      return;
    }

    autoPlayErrorReportedRef.current = reportKey;
    onAutoPlayBlocked?.(playbackError);
  }, [autoPlayToken, onAutoPlayBlocked, playbackError, playScope]);

  React.useEffect(() => {
    playScopeRef.current = playScope;
  }, [playScope]);

  React.useEffect(() => {
    latestRatingsRef.current = session.ratings;
  }, [session.ratings]);

  const totalDurationMs = Math.max(durationMs, ...song.segments.map((segment) => segment.endMs), 0);
  const activeStartMs = currentSegment?.startMs ?? 0;
  const activeEndMs = currentSegment?.endMs ?? totalDurationMs;
  const currentAttemptNotes = useMemo(
    () => currentSegment ? (tapAttemptsBySegment[currentSegment.id] ?? []) : [],
    [currentSegment, tapAttemptsBySegment]
  );
  const currentMidiSegmentAnswerKey = useMemo(
    () => currentSegment ? (midiSegmentAnswerKeys[currentSegment.id] ?? null) : null,
    [currentSegment, midiSegmentAnswerKeys]
  );
  const pitchPractice = usePitchPractice({
    enabled: isSingPracticeMode,
    isPlaying,
    currentMs,
    getCurrentMs,
    segmentStartMs: currentSegment?.startMs ?? 0,
    answerKey: currentMidiSegmentAnswerKey,
    resetToken: tapSessionResetToken,
  });
  const voiceAttemptsRef = React.useRef(pitchPractice.attempts);
  voiceAttemptsRef.current = pitchPractice.attempts;
  const voiceSnapshotTimerRef = React.useRef<number | null>(null);
  React.useEffect(() => {
    if (!isSingPracticeMode || !currentSegment || !pitchPractice.score || pitchPractice.score.totalTaps === 0) {
      return;
    }
    setVoiceRunScoresBySegment((previous) => ({
      ...previous,
      [currentSegment.id]: pitchPractice.score!,
    }));
  }, [currentSegment, isSingPracticeMode, pitchPractice.score]);
  const displayedVoiceRunScores = useMemo(() => {
    if (!isSingPracticeMode || !currentSegment || !pitchPractice.score || pitchPractice.score.totalTaps === 0) {
      return voiceRunScoresBySegment;
    }
    return {
      ...voiceRunScoresBySegment,
      [currentSegment.id]: pitchPractice.score,
    };
  }, [currentSegment, isSingPracticeMode, pitchPractice.score, voiceRunScoresBySegment]);
  const voiceRunTotals = useMemo(() => {
    const scores = Object.values(displayedVoiceRunScores);
    const matched = scores.reduce((total, score) => total + score.matchedTaps, 0);
    const attempted = scores.reduce((total, score) => total + score.totalTaps, 0);
    const available = song.segments.reduce((total, segment) => total + (midiSegmentAnswerKeys[segment.id]?.notes.length ?? 0), 0);
    return {
      matched,
      attempted,
      available,
      percent: attempted > 0 ? Math.round(matched / attempted * 100) : 0,
    };
  }, [displayedVoiceRunScores, midiSegmentAnswerKeys, song.segments]);
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
      ...(isSingPracticeMode && pitchPractice.score && pitchPractice.score.totalTaps > 0 ? [pitchPractice.score] : []),
      ...(localMidiScoreAttemptsBySegment[currentSegment.id] ?? []),
      ...savedScores,
    ];
    const midiKey = midiSegmentAnswerKeys[currentSegment.id] ?? null;
    return buildMidiContourTapHeatMap(midiKey, scores, TAP_CONTOUR_HEAT_MAP_ATTEMPT_LIMIT);
  }, [currentSegment, isSingPracticeMode, localMidiScoreAttemptsBySegment, midiSegmentAnswerKeys, pitchPractice.score, tapSessionSummaries]);
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

  React.useLayoutEffect(() => {
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
    if (!hasSegments && isGuidedPracticeMode) {
      setIsTapPracticeMode(false);
      setIsSingPracticeMode(false);
      activeTapCaptureRef.current = null;
    }
  }, [hasSegments, isGuidedPracticeMode]);
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

  const persistVoiceScore = React.useCallback(async (sessionId: string, attempts = voiceAttemptsRef.current, finalize = false) => {
    if (attempts.length === 0) return;
    const response = await request(`/api/songs/${song.id}/tap-sessions/${sessionId}`, {
      method: "PUT",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ attempts }),
    });
    if (!response.ok) throw new Error(`Failed to persist voice score (${response.status})`);
    if (finalize) {
      const finalizeResponse = await request(`/api/songs/${song.id}/tap-sessions/${sessionId}`, {
        method: "PATCH",
        headers: { "Content-Type": "application/json" },
        body: "{}",
      });
      if (!finalizeResponse.ok) throw new Error(`Failed to finalize voice score (${finalizeResponse.status})`);
      setTapHeatMapRefreshToken((previous) => previous + 1);
    }
  }, [request, song.id]);

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
    if (song.id === previousSongIdRef.current) {
      return;
    }

    previousSongIdRef.current = song.id;
    syncedInitialSegmentIndexRef.current = initialSession.currentSegmentIndex;
    segmentIndexRef.current = initialSession.currentSegmentIndex;
    previousSegmentIndexRef.current = initialSession.currentSegmentIndex;
    lastSyncedSegmentIdRef.current = song.segments[initialSession.currentSegmentIndex]?.id ?? null;
    lastSavedRatingsRef.current = "unloaded";
    practicedRecordedRef.current = false;
    accumulatedPlaybackMsRef.current = 0;
    playbackStartedAtRef.current = null;
    pausedByUserRef.current = false;
    autoPlayHandledKeyRef.current = null;
    autoPlayTokenHandledRef.current = 0;
    autoPlayErrorReportedRef.current = null;
    playbackCompleteNotifiedRef.current = null;
    loopHandledRef.current = null;
    setRatingsLoading(true);
    setRatingsError(null);
    dispatch({ type: "REPLACE_SESSION", session: initialSession });
  }, [initialSession, song.id, song.segments]);

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
              lastSavedRatingsRef.current = JSON.stringify(latestRatingsRef.current);
            }
          } else {
            // Load failed — treat existing state as already saved to avoid erasing server data
            lastSavedRatingsRef.current = JSON.stringify(latestRatingsRef.current);
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

  const jumpToSegment = React.useCallback((
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
  }, [currentMs, durationMs, getSegmentStartWithPreroll, hasSegments, isLooping, isPlaying, requestPlay, seek, song.segments]);

  const handlePrevSegment = React.useCallback(() => {
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
  }, [currentMs, currentSegment, hasSegments, isPlaying, jumpToSegment, onPrevSegment, session.currentSegmentIndex, song.segments]);

  const handleNextSegment = React.useCallback(() => {
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
  }, [currentMs, hasSegments, isLooping, isPlaying, jumpToSegment, onNextSegment, song.segments]);

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

    flushSync(() => {
      onPreferredAudioVersionChange?.(nextVersion === "blend" ? "blend" : "part");
      setAudioVersion(nextVersion);
    });
  }, [activeAudioVersion, currentMs, currentSegment, durationMs, hasBothAudioVersions, isLooping, isPlaying, onPreferredAudioVersionChange]);

  const activatePracticeControl = React.useCallback((control: ExplainedPracticeControl) => {
    if (control === "part" || control === "blend") {
      handleAudioVersionChange(control === "blend" ? "blend" : "straight");
      return;
    }

    if (control === "contour") {
      setShowCardContourMap((previous) => !previous);
      if (!showCardContourMap) {
        setTapHeatMapRefreshToken((previous) => previous + 1);
      }
      return;
    }

    if (control === "sing") {
      if (!isSingPracticeMode) {
        setVoiceRunScoresBySegment({});
      }
      setIsSingPracticeMode((previous) => !previous);
      setIsTapPracticeMode(false);
      activeTapCaptureRef.current = null;
      return;
    }

    setIsTapPracticeMode((previous) => !previous);
    setIsSingPracticeMode(false);
    activeTapCaptureRef.current = null;
  }, [handleAudioVersionChange, isSingPracticeMode, showCardContourMap]);

  const requestPracticeControlChange = React.useCallback((control: ExplainedPracticeControl) => {
    if (!hasSeenPracticeControlExplainer(control)) {
      setPracticeControlExplainer(control);
      return;
    }

    activatePracticeControl(control);
  }, [activatePracticeControl]);

  const dismissPracticeControlExplainer = React.useCallback(() => {
    setPracticeControlExplainer(null);
  }, []);

  const confirmPracticeControlExplainer = React.useCallback(() => {
    if (!practiceControlExplainer) {
      return;
    }

    markPracticeControlExplainerSeen(practiceControlExplainer);
    const control = practiceControlExplainer;
    setPracticeControlExplainer(null);
    activatePracticeControl(control);
  }, [activatePracticeControl, practiceControlExplainer]);

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
    tapAttemptsRef.current = {
      ...tapAttemptsRef.current,
      [segmentId]: nextSegmentNotes,
    };
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

  const recordKeyboardTap = React.useCallback((lane: number) => {
    if (!currentSegment) {
      return;
    }

    const segmentDurationMs = Math.max(1, currentSegment.endMs - currentSegment.startMs);
    const startOffsetMs = Math.min(
      segmentDurationMs,
      Math.max(0, Math.round(currentMs - currentSegment.startMs))
    );
    activeTapCaptureRef.current = {
      id: crypto.randomUUID(),
      startOffsetMs,
      lane,
      pointerId: -1,
    };
    finalizeTapCapture(lane);
  }, [currentMs, currentSegment, finalizeTapCapture]);

  const recordCurrentMidiContourAttempt = React.useCallback(() => {
    if (!currentSegment || !currentMidiSegmentAnswerKey || currentMidiSegmentAnswerKey.taps.length === 0) {
      return;
    }

    const attemptNotes = tapAttemptsRef.current[currentSegment.id] ?? [];
    if (attemptNotes.length === 0) {
      return;
    }
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

  const clearTapPracticeAttempts = React.useCallback((segmentId?: string) => {
    activeTapCaptureRef.current = null;
    pendingPersistedTapsRef.current = [];
    if (segmentId) {
      tapAttemptsRef.current = {
        ...tapAttemptsRef.current,
        [segmentId]: [],
      };
      setTapAttemptsBySegment((previous) => ({
        ...previous,
        [segmentId]: [],
      }));
      return;
    }
    tapAttemptsRef.current = {};
    setTapAttemptsBySegment({});
  }, []);

  const resetTapPracticeRun = React.useCallback(() => {
    loopHandledRef.current = null;
    clearTapPracticeAttempts();
    setTapSessionResetToken((previous) => previous + 1);
  }, [clearTapPracticeAttempts]);

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
    if (!isGuidedPracticeMode) {
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
  }, [cancelTapPracticeCountIn, isGuidedPracticeMode, requestPlay, resetTapPracticeRun]);

  const handleTogglePlay = React.useCallback(() => {
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
        resetTapRun: isGuidedPracticeMode,
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
      resetTapRun: isGuidedPracticeMode && fullPieceResumeMs === 0,
    });
  }, [
    cancelTapPracticeCountIn,
    currentMs,
    currentSegment,
    durationMs,
    getSegmentStartWithPreroll,
    isLooping,
    isPlaying,
    isGuidedPracticeMode,
    pause,
    playScope,
    startTapPracticePlayback,
    tapPracticeCountIn,
  ]);

  const handleSeekSong = React.useCallback((ms: number) => {
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
    if (isGuidedPracticeMode && ((ms === 0 && currentMs > 0) || seeksToSegmentStart)) {
      resetTapPracticeRun();
    }
    seek(ms);
    const targetIndex = getSegmentIndexAtMs(ms);
    if (targetIndex !== -1 && targetIndex !== session.currentSegmentIndex) {
      segmentIndexRef.current = targetIndex;
      dispatch({ type: "SET_SEGMENT_INDEX", index: targetIndex });
    }
  }, [
    cancelTapPracticeCountIn,
    currentMs,
    currentSegment,
    getSegmentIndexAtMs,
    isGuidedPracticeMode,
    resetTapPracticeRun,
    seek,
    session.currentSegmentIndex,
  ]);

  const handleSkipBy = React.useCallback((deltaMs: number) => {
    const nextMs = Math.max(0, Math.min(totalDurationMs, currentMs + deltaMs));
    setTransportDebug((previous) => ({
      ...previous,
      skipBackClicks: deltaMs < 0 ? previous.skipBackClicks + 1 : previous.skipBackClicks,
      skipForwardClicks: deltaMs > 0 ? previous.skipForwardClicks + 1 : previous.skipForwardClicks,
      lastAction: deltaMs < 0 ? "skip-back-5" : "skip-forward-5",
      lastActionAt: new Date().toISOString(),
    }));
    handleSeekSong(nextMs);
  }, [currentMs, handleSeekSong, totalDurationMs]);

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
      resetTapRun: isGuidedPracticeMode,
    });
  }, [
    activeAudioUrl,
    autoPlayOnMount,
    currentSegment,
    getSegmentStartWithPreroll,
    hasSegments,
    initialSession.currentSegmentIndex,
    isGuidedPracticeMode,
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
      resetTapRun: isGuidedPracticeMode,
    });

    const blockedCheckTimer = window.setTimeout(() => {
      const state = playbackStateRef.current;
      const reportedCurrentTokenError = autoPlayErrorReportedRef.current?.startsWith(`${autoPlayToken}:`) ?? false;
      if (!state.isPlaying && state.currentSegment?.id === currentSegment.id && !reportedCurrentTokenError) {
        onAutoPlayBlocked?.(playbackErrorRef.current ?? "Your browser blocked automatic audio. Press Play once to continue Hands Free.");
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
    isGuidedPracticeMode,
    onAutoPlayBlocked,
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

      if (isTapPracticeMode && !event.repeat) {
        if (event.key === "9") {
          event.preventDefault();
          handlePrevSegment();
          return;
        }

        if (event.key === "0") {
          event.preventDefault();
          handleNextSegment();
          return;
        }

        const tapLane = getTapKeyboardLane(event.key);
        if (tapLane !== null) {
          event.preventDefault();
          recordKeyboardTap(tapLane);
          return;
        }
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
}, [handleNextSegment, handlePrevSegment, handleRateCurrentSegment, handleSkipBy, handleToggleLoop, handleTogglePlay, isTapPracticeMode, ratingKeysEnabled, recordKeyboardTap]);

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
      const attemptNotes = tapAttemptsBySegment[currentSegment.id] ?? [];
      if (isTapPracticeMode && attemptNotes.length > 0) {
        const loopMatch = compareContourAttemptDetailed(
          currentCardContourNotes,
          attemptNotes,
          TAP_MATCH_OPTIONS
        );
        showAccuracyToast(`Loop accuracy ${Math.round(loopMatch.score * 100)}%`);
        recordCurrentMidiContourAttempt();
      } else if (isSingPracticeMode && pitchPractice.score && pitchPractice.score.totalTaps > 0) {
        showAccuracyToast(`Loop pitch accuracy ${pitchPractice.score.scorePercent}%`);
        setLocalMidiScoreAttemptsBySegment((previous) => ({
          ...previous,
          [currentSegment.id]: [pitchPractice.score!, ...(previous[currentSegment.id] ?? [])].slice(0, TAP_CONTOUR_HEAT_MAP_ATTEMPT_LIMIT),
        }));
      }
      clearTapPracticeAttempts(currentSegment.id);
      setTapSessionResetToken((previous) => previous + 1);
      requestPlay(getSegmentStartWithPreroll(currentSegment.startMs), currentSegment.endMs);
    }
  }, [
    clearTapPracticeAttempts,
    currentCardContourNotes,
    currentMs,
    currentSegment,
    getSegmentStartWithPreroll,
    isTapPracticeMode,
    isSingPracticeMode,
    isLooping,
    isPlaying,
    play,
    pitchPractice.score,
    recordCurrentMidiContourAttempt,
    requestPlay,
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
    if (typeof window === "undefined") {
      return;
    }

    const updateViewportSize = () => {
      setViewportSize({
        width: window.innerWidth,
        height: window.innerHeight,
      });
    };

    updateViewportSize();
    window.addEventListener("resize", updateViewportSize);
    window.addEventListener("orientationchange", updateViewportSize);
    return () => {
      window.removeEventListener("resize", updateViewportSize);
      window.removeEventListener("orientationchange", updateViewportSize);
    };
  }, []);

  useEffect(() => {
    tapSessionIdRef.current = tapSessionId;
  }, [tapSessionId]);

  useEffect(() => {
    tapSessionGenerationRef.current += 1;
    const previousSessionId = tapSessionIdRef.current;
    const previousWasVoice = tapSessionInputMethodRef.current === "voice";
    if (previousSessionId && previousWasVoice && voiceAttemptsRef.current.length > 0) {
      void persistVoiceScore(previousSessionId, voiceAttemptsRef.current, true).catch(() => {
        showTapPersistenceWarning("Voice score saving is temporarily unavailable.");
      });
    }
    pendingPersistedTapsRef.current = [];
    setTapSessionId(null);
    tapSessionIdRef.current = null;
    clearTapPersistenceWarning();

    if (!accountProgressEnabled || !isGuidedPracticeMode) {
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
        inputMethod: isSingPracticeMode ? "voice" : "tap",
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
        tapSessionInputMethodRef.current = isSingPracticeMode ? "voice" : "tap";
        markGuestSongProgress(song.id, userId);
        if (isTapPracticeMode) flushPersistedTaps(nextSessionId);
      })
      .catch((error) => {
        console.error("Failed to create tap practice session:", error);
        showTapPersistenceWarning("Could not start tap persistence session. Check your connection and try again.");
      });
  }, [accountProgressEnabled, activeAudioVersion, clearTapPersistenceWarning, currentSegment?.id, flushPersistedTaps, isGuidedPracticeMode, isSingPracticeMode, isTapPracticeMode, persistVoiceScore, request, showTapPersistenceWarning, song.id, tapSessionResetToken, userId]);

  useEffect(() => {
    if (!accountProgressEnabled || !isSingPracticeMode || !tapSessionId || pitchPractice.attempts.length === 0) return;
    if (voiceSnapshotTimerRef.current !== null) window.clearTimeout(voiceSnapshotTimerRef.current);
    voiceSnapshotTimerRef.current = window.setTimeout(() => {
      void persistVoiceScore(tapSessionId).catch(() => showTapPersistenceWarning("Voice score saving is temporarily unavailable."));
      voiceSnapshotTimerRef.current = null;
    }, 500);
    return () => {
      if (voiceSnapshotTimerRef.current !== null) window.clearTimeout(voiceSnapshotTimerRef.current);
      voiceSnapshotTimerRef.current = null;
    };
  }, [accountProgressEnabled, isSingPracticeMode, persistVoiceScore, pitchPractice.attempts, showTapPersistenceWarning, tapSessionId]);

  useEffect(() => () => {
    const sessionId = tapSessionIdRef.current;
    if (sessionId && tapSessionInputMethodRef.current === "voice" && voiceAttemptsRef.current.length > 0) {
      tapSessionIdRef.current = null;
      void persistVoiceScore(sessionId, voiceAttemptsRef.current, true).catch(() => undefined);
    }
  }, [persistVoiceScore]);

  useEffect(() => {
    const segmentId = currentSegment?.id ?? null;
    const previousSegmentId = previousTapPracticeSegmentIdRef.current;
    previousTapPracticeSegmentIdRef.current = segmentId;

    if (!isTapPracticeMode || !segmentId || previousSegmentId === null || previousSegmentId === segmentId) {
      activeTapCaptureRef.current = null;
      return;
    }

    clearTapPracticeAttempts(segmentId);
  }, [clearTapPracticeAttempts, currentSegment?.id, isTapPracticeMode]);

  useEffect(() => {
    if (isGuidedPracticeMode) {
      return;
    }
    cancelTapPracticeCountIn();
  }, [cancelTapPracticeCountIn, isGuidedPracticeMode]);

  useEffect(() => {
    cancelTapPracticeCountIn();
    setTapAttemptsBySegment({});
    setIsTapPracticeMode(false);
    setIsSingPracticeMode(false);
    setTapSessionSummaries([]);
    setMidiSegmentAnswerKeys({});
    setLocalMidiScoreAttemptsBySegment({});
    setVoiceRunScoresBySegment({});
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
  }, [cancelTapPracticeCountIn, clearTapPersistenceWarning, song.id]);

  useEffect(() => {
    return () => {
      cancelTapPracticeCountIn();
    };
  }, [cancelTapPracticeCountIn]);

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
    const shouldLoadMidiData = accountProgressEnabled || Boolean(song.hasMidiContour) || (song.pitchContourNotes?.length ?? 0) > 0;
    if (!shouldLoadMidiData) {
      setTapSessionSummaries([]);
      setMidiSegmentAnswerKeys({});
      return;
    }

    let cancelled = false;

    const loadEnhancedTapData = async () => {
      try {
        const [response, midiResponse] = await Promise.all([
          accountProgressEnabled ? request(`/api/songs/${song.id}/tap-sessions`, { cache: "no-store" }) : Promise.resolve(null),
          sharedPlaylistToken
            ? fetch(`/api/share/playlists/${encodeURIComponent(sharedPlaylistToken)}/songs/${encodeURIComponent(song.id)}/midi`, { cache: "no-store" })
            : readOnlyDataRequest(`/api/songs/${song.id}/midi`, { cache: "no-store" }),
        ]);
        if (response && !response.ok) {
          throw new Error(`Failed to load tap sessions (${response.status})`);
        }
        const payload = response ? await response.json() as { sessions?: TapSessionSummaryPayload[] } : { sessions: [] };
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
  }, [accountProgressEnabled, readOnlyDataRequest, request, segmentTimingSignature, sharedPlaylistToken, song.hasMidiContour, song.id, song.pitchContourNotes, tapHeatMapRefreshToken, userId]);

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

  const contourMapToggle = hasSegments && currentSegment && hasCardContourData ? (
    <button
      type="button"
      data-testid="practice-card-contour-toggle"
      onClick={() => requestPracticeControlChange("contour")}
      aria-pressed={showCardContourMap}
      className={`rounded-full border px-3 py-1.5 text-sm font-semibold transition ${
        showCardContourMap
          ? "border-indigo-600 bg-indigo-600 text-white hover:bg-indigo-700"
          : "border-indigo-300 bg-white text-indigo-700 hover:bg-indigo-50"
      }`}
    >
      Contour
    </button>
  ) : null;

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
      <header data-testid="practice-header" className={isGuidedPracticeMode ? "sr-only" : "px-4 pb-1 pt-3 md:px-8"}>
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
          {onOpenContourReferenceClick || onEditSongClick ? (
            <div className="flex shrink-0 items-center gap-2">
              {onOpenContourReferenceClick && hasContourReferenceData ? (
                <button
                  type="button"
                  onClick={onOpenContourReferenceClick}
                  aria-label="Open contour reference"
                  title="Open contour reference"
                  className="inline-flex h-9 w-9 items-center justify-center rounded-full border border-indigo-200 bg-white text-indigo-700 shadow-sm hover:border-indigo-500 hover:bg-indigo-50"
                  data-testid="open-contour-reference"
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
                    <path d="M3 16c2.4-6 4.8-6 7.2 0s4.8 6 7.2 0L21 7" />
                    <path d="M3 20h18" />
                  </svg>
                </button>
              ) : null}
              {onEditSongClick ? (
                <button
                  onClick={onEditSongClick}
                  aria-label="Edit song"
                  title="Edit song"
                  className="inline-flex h-9 w-9 items-center justify-center rounded-full bg-indigo-600 text-white hover:bg-indigo-700"
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
          ) : null}
        </div>
        <p className="sr-only" data-testid="segment-counter">
          {hasSegments
            ? `Segment ${session.currentSegmentIndex + 1} of ${song.segments.length}`
            : "Full piece playback"}
        </p>
      </header>

      {practiceControlExplainer ? (
        <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/30 px-4" role="dialog" aria-modal="true" aria-labelledby="practice-control-explainer-title">
          <div className="w-full max-w-md rounded-xl border border-indigo-100 bg-white p-5 shadow-xl">
            <p className="text-sm font-semibold uppercase tracking-wide text-indigo-700">Practice control</p>
            <h3 id="practice-control-explainer-title" className="mt-2 text-xl font-semibold text-gray-950">
              {practiceControlExplainerCopy[practiceControlExplainer].title}
            </h3>
            <p className="mt-3 text-sm leading-6 text-gray-700">
              {practiceControlExplainerCopy[practiceControlExplainer].description}
            </p>
            {practiceControlExplainerCopy[practiceControlExplainer].detail ? (
              <p className="mt-2 text-sm leading-6 text-gray-600">
                {practiceControlExplainerCopy[practiceControlExplainer].detail}
              </p>
            ) : null}
            <div className="mt-5 flex flex-col-reverse gap-2 sm:flex-row sm:justify-end">
              <button
                type="button"
                data-testid="practice-control-explainer-cancel"
                onClick={dismissPracticeControlExplainer}
                className="rounded border border-gray-300 px-4 py-2 text-sm font-semibold text-gray-700 hover:bg-gray-50"
              >
                Cancel
              </button>
              <button
                type="button"
                data-testid="practice-control-explainer-continue"
                onClick={confirmPracticeControlExplainer}
                className="rounded bg-indigo-600 px-4 py-2 text-sm font-semibold text-white hover:bg-indigo-700"
              >
                Continue
              </button>
            </div>
          </div>
        </div>
      ) : null}

      <div
        data-testid="practice-shell"
        data-compact-layout={isCompactLandscapeLayout ? "true" : "false"}
        className={
          isCompactLandscapeLayout
            ? "grid min-h-0 flex-1 grid-cols-[minmax(0,1fr)_minmax(16rem,20rem)] grid-rows-[auto_minmax(0,1fr)] gap-3 px-3 pb-3 pt-2"
            : "flex min-h-0 flex-1 flex-col"
        }
      >

      {reducedControls && contourMapToggle ? (
        <div
          className={
            isCompactLandscapeLayout
              ? "col-start-2 row-start-1 flex justify-end"
              : "flex justify-end px-4 md:px-8"
          }
          data-testid="practice-reduced-contour-controls"
        >
          {contourMapToggle}
        </div>
      ) : null}

      {!reducedControls ? (
      <div
        className={
          isCompactLandscapeLayout
            ? "col-start-2 row-start-1 rounded-2xl border border-slate-200 bg-white/90 p-3 shadow-sm"
              : isGuidedPracticeMode
              ? "px-3 pb-1 pt-2 md:px-6"
              : "px-4 md:px-8"
        }
        data-testid="practice-top-bar"
      >
        {!isGuidedPracticeMode && ratingsLoading ? (
          <div
            data-testid="ratings-loading-skeleton"
            className="h-8 w-full animate-pulse rounded-full bg-gray-200"
          />
        ) : !isGuidedPracticeMode ? (
          <KnowledgeBar percent={knowledgeScore.overall} />
        ) : null}
        <div className={isGuidedPracticeMode ? "flex flex-wrap items-center gap-1.5" : "mt-1.5 flex items-center gap-2"}>
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
                  onClick={() => requestPracticeControlChange(version === "straight" ? "part" : "blend")}
                  className={`${isGuidedPracticeMode ? "rounded-full px-2.5 py-1 text-xs" : "rounded-full px-3 py-1 text-sm"} font-semibold transition ${
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
          {contourMapToggle}
          {hasSegments && (hasMidiTapAnswers || isTapPracticeMode) ? (
            <button
              type="button"
              data-testid="practice-tap-mode-toggle"
              aria-label={isTapPracticeMode ? "Exit tap practice mode" : "Enter tap practice mode"}
              aria-pressed={isTapPracticeMode}
              onClick={() => requestPracticeControlChange("tap")}
              className={`rounded-full border px-3 py-1.5 text-sm font-semibold transition ${
                isTapPracticeMode
                  ? "border-indigo-600 bg-indigo-600 text-white hover:bg-indigo-700"
                  : "border-indigo-300 bg-white text-indigo-700 hover:bg-indigo-50"
              }`}
            >
              {isTapPracticeMode ? "Exit Tap" : "Tap"}
            </button>
          ) : null}
          {hasSegments && (hasMidiTapAnswers || isSingPracticeMode) ? (
            <button
              type="button"
              data-testid="practice-sing-mode-toggle"
              aria-label={isSingPracticeMode ? "Exit pitch practice mode" : "Enter pitch practice mode"}
              aria-pressed={isSingPracticeMode}
              onClick={() => requestPracticeControlChange("sing")}
              className={`rounded-full border px-3 py-1.5 text-sm font-semibold transition ${isSingPracticeMode ? "border-emerald-600 bg-emerald-600 text-white hover:bg-emerald-700" : "border-emerald-300 bg-white text-emerald-700 hover:bg-emerald-50"}`}
            >
              {isSingPracticeMode ? "Exit Sing" : "Sing"}
            </button>
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
        {isSingPracticeMode ? (
          <div data-testid="practice-pitch-status" className="mt-1.5 rounded-xl border border-emerald-100 bg-white px-3 py-2 text-xs text-slate-700 shadow-sm">
            {pitchPractice.error ? <p className="font-medium text-amber-700">{pitchPractice.error}</p> : (
              <div className="flex flex-wrap items-center justify-between gap-2">
                <span className="font-semibold text-slate-900">Pitch score: {pitchPractice.score?.scorePercent ?? 0}% ({pitchPractice.score?.matchedTaps ?? 0}/{pitchPractice.score?.totalTaps ?? 0})</span>
                <span>{pitchPractice.status === "starting" ? "Starting microphone..." : pitchPractice.status === "quiet" ? "Listening: sing a little louder" : pitchPractice.live ? `${pitchPractice.live.detectedName} to ${pitchPractice.live.targetName ?? "-"} ${typeof pitchPractice.live.centsError === "number" ? `${pitchPractice.live.centsError > 0 ? "+" : ""}${pitchPractice.live.centsError} cents` : ""}` : "Listening..."}</span>
                <span className="h-1.5 w-20 overflow-hidden rounded-full bg-slate-200" aria-label="Microphone input level">
                  <span className="block h-full rounded-full bg-emerald-500 transition-[width]" style={{ width: `${Math.min(100, (pitchPractice.live?.level ?? 0) * 500)}%` }} />
                </span>
              </div>
            )}
          </div>
        ) : null}
      </div>
      ) : null}

      <main
        data-testid="practice-main"
        className={`flex flex-1 flex-col items-center ${isCompactLandscapeLayout ? "col-start-1 row-span-2 row-start-1 min-h-0 overflow-y-auto px-1 pt-0" : "px-2 pt-1 sm:px-3 sm:pt-2 md:px-8"} ${isGuidedPracticeMode ? "min-h-0 overflow-y-auto" : isCompactLandscapeLayout ? "" : "overflow-y-auto"}`}
        style={isCompactLandscapeLayout ? undefined : { paddingBottom: "calc(var(--player-height) + env(safe-area-inset-bottom) + 8px)" }}
      >
        <section data-testid="practice-focus" className={`flex min-h-full w-full justify-center gap-1.5 sm:gap-2 md:gap-3 ${isGuidedPracticeMode ? "max-w-4xl items-start" : isCompactLandscapeLayout ? "items-stretch max-w-none" : "items-stretch max-w-3xl"}`}>
          {!isGuidedPracticeMode && showSegmentNavigationControls ? (
            <button
              type="button"
              aria-label="Previous segment"
              data-testid="practice-prev-segment"
              onClick={handlePrevSegment}
              disabled={!canUsePrevSegment}
              className="inline-flex h-20 w-8 shrink-0 self-center items-center justify-center rounded-xl border border-indigo-300 bg-white text-indigo-700 transition hover:bg-indigo-50 disabled:opacity-30 sm:h-24 sm:w-10"
            >
              <svg aria-hidden="true" viewBox="0 0 24 24" className="h-5 w-5" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
                <path d="M18 12H6" />
                <path d="M10 8l-4 4 4 4" />
              </svg>
            </button>
          ) : null}
          <div className={`min-w-0 ${isGuidedPracticeMode ? "h-full w-full max-w-md" : isCompactLandscapeLayout ? "flex min-h-0 flex-1 self-stretch justify-center" : "flex min-h-0 flex-1 self-stretch justify-center"}`}>
            {hasSegments && currentSegment ? (
              <div className={`segment-stack-shell relative min-h-0 overflow-visible ${isGuidedPracticeMode ? "h-full" : isCompactLandscapeLayout ? "flex h-full w-full max-w-none flex-col" : "flex h-full w-full max-w-md flex-col"}`}>
                {isTapPracticeMode ? (
                  <div
                    data-testid="practice-tap-feedback"
                    className="pointer-events-none absolute left-3 top-3 z-20 rounded-full bg-white/85 px-2 py-1 text-[11px] font-semibold text-indigo-900 shadow-sm"
                  >
                    {Math.round((currentSegmentMatch?.score ?? 0) * 100)}% ({currentSegmentMatch?.matchedEvents ?? 0}/
                    {currentSegmentMatch?.totalEvents ?? 0})
                  </div>
                ) : null}
                {isGuidedPracticeMode && tapPracticeCountIn !== null ? (
                  <div
                    data-testid="practice-count-in"
                    className="pointer-events-none absolute inset-x-0 top-20 z-20 mx-auto flex w-fit flex-col items-center rounded-[28px] border border-amber-200 bg-white/95 px-5 py-3 text-center text-amber-950 shadow-lg"
                  >
                    <span className="text-[11px] font-semibold uppercase tracking-[0.18em] text-amber-700">
                      Count-in
                    </span>
                    <span className="mt-1 text-3xl font-bold leading-none">{tapPracticeCountIn}</span>
                    <span className="mt-1 text-xs font-medium text-amber-800">Get ready to {isSingPracticeMode ? "sing" : "tap"}</span>
                  </div>
                ) : null}
                <div
                  key={`${currentSegment.id}-${transitionToken}`}
                  className={`relative z-10 min-h-0 ${isGuidedPracticeMode ? "h-full" : "flex h-full flex-1"} ${transitionDirection === "forward" ? "segment-enter-forward" : "segment-enter-backward"}`}
                >
                  <SegmentCard
                    segment={{ ...currentSegment, pitchContourNotes: currentCardContourNotes }}
                    currentRating={currentRating}
                    onRate={handleRateCurrentSegment}
                    playbackMs={currentMs}
                    onSeek={seek}
                    masteryPercent={masteryPercentForSegment(currentSegment.id)}
                    lyricVisibilityMode={lyricVisibilityMode}
                    lyricSize={lyricSize}
                    collapseLyricLineBreaks={collapseLyricLineBreaks}
                    showContourMap={showCardContourMap && hasCardContourData}
                    contourHeatMap={currentMidiContourHeatMap}
                  />
                </div>
                {isGuidedPracticeMode && hasSegments && currentSegment ? (
                  <div className="pointer-events-none absolute inset-0 z-30 overflow-hidden rounded-2xl border border-indigo-200/30 bg-indigo-50/10" data-testid="practice-piano-roll-overlay">
                    <svg viewBox="0 0 100 100" preserveAspectRatio="none" className="h-full w-full">
                      <line x1="0" y1="50" x2="100" y2="50" stroke="rgb(199 210 254)" strokeWidth="0.5" opacity="0.45" />
                      {currentCardContourNotes.map((note) => {
                        const x = getRollX(note.timeOffsetMs);
                        if (x < -5 || x > 105) {
                          return null;
                        }
                        const y = (1 - note.lane) * 100;
                        return (
                          <g key={`answer-${note.id}`}>
                            <circle
                              cx={x}
                              cy={y}
                              r={2.2}
                              fill="rgb(99 102 241)"
                              opacity="0.35"
                            />
                          </g>
                        );
                      })}
                      {(isTapPracticeMode ? currentAttemptNotes : currentCardContourNotes.filter((_, index) => pitchPractice.score?.details.some((detail) => detail.index === index))).map((note) => {
                        const x = getRollX(note.timeOffsetMs);
                        if (x < -5 || x > 105) {
                          return null;
                        }
                        const y = (1 - note.lane) * 100;
                        const voiceDetail = pitchPractice.score?.details.find((detail) => detail.index === currentCardContourNotes.indexOf(note));
                        const status = isSingPracticeMode ? (voiceDetail?.status === "matched" ? "matched" : "mismatched") : (currentSegmentMatch?.attemptNoteStatuses[note.id] ?? "pending");
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
          ) : !isGuidedPracticeMode && showSegmentNavigationControls ? (
            <button
              type="button"
              aria-label="Next segment"
              data-testid="practice-next-segment"
              onClick={handleNextSegment}
              disabled={!canUseNextSegment}
              className="inline-flex h-20 w-8 shrink-0 self-center items-center justify-center rounded-xl border border-indigo-300 bg-white text-indigo-700 transition hover:bg-indigo-50 disabled:opacity-30 sm:h-24 sm:w-10"
            >
              <svg aria-hidden="true" viewBox="0 0 24 24" className="h-5 w-5" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
                <path d="M6 12h12" />
                <path d="M14 8l4 4-4 4" />
              </svg>
            </button>
          ) : null}
        </section>
        {isSingPracticeMode ? (
          <details
            data-testid="practice-sing-scoreboard"
            className="mt-3 w-full max-w-md shrink-0 overflow-hidden rounded-2xl border border-emerald-100 bg-white shadow-sm"
          >
            <summary className="cursor-pointer list-none bg-emerald-50 px-3 py-2.5 marker:hidden">
              <div className="flex items-center justify-between gap-3">
                <div>
                  <h2 className="text-sm font-bold text-emerald-950">Sing run details</h2>
                  <p className="text-xs text-emerald-900">
                    {voiceRunTotals.matched}/{voiceRunTotals.attempted} matched · {voiceRunTotals.attempted}/{voiceRunTotals.available} attempted
                  </p>
                </div>
                <span data-testid="practice-sing-cumulative-score" className="text-lg font-bold text-emerald-800">
                  {voiceRunTotals.percent}%
                </span>
              </div>
            </summary>
            <ol className="max-h-72 divide-y divide-slate-100 overflow-y-auto border-t border-emerald-100">
              {song.segments.map((segment, index) => {
                const score = displayedVoiceRunScores[segment.id];
                const noteCount = midiSegmentAnswerKeys[segment.id]?.notes.length ?? 0;
                const isCurrent = segment.id === currentSegment?.id;
                return (
                  <li
                    key={segment.id}
                    data-testid={`practice-sing-segment-score-${segment.id}`}
                    className={`px-3 py-2 ${isCurrent ? "bg-indigo-50/70" : "bg-white"}`}
                  >
                    <div className="flex items-center justify-between gap-2">
                      <span className="min-w-0 truncate text-xs font-semibold text-slate-800">
                        {index + 1}. {segment.label || `Segment ${index + 1}`}
                      </span>
                      <span className={`shrink-0 text-sm font-bold ${score ? "text-emerald-700" : "text-slate-400"}`}>
                        {score ? `${score.scorePercent}%` : "--"}
                      </span>
                    </div>
                    <p className="mt-0.5 text-[11px] text-slate-500">
                      {score ? `${score.matchedTaps}/${score.totalTaps} matched; ${score.totalTaps}/${noteCount} attempted` : `${noteCount} MIDI notes`}
                      {isCurrent ? " · current" : ""}
                    </p>
                  </li>
                );
              })}
            </ol>
          </details>
        ) : null}
      </main>

      <section
        data-testid="practice-transport"
        className={
          isCompactLandscapeLayout
            ? "col-start-2 row-start-2 self-stretch overflow-y-auto rounded-2xl border border-slate-200 bg-white/95 p-3 shadow-sm"
            : "fixed inset-x-0 bottom-0 z-40 border-t border-gray-200 bg-white/95 px-4 py-2 backdrop-blur md:px-8"
        }
        style={isCompactLandscapeLayout ? undefined : { paddingBottom: "calc(env(safe-area-inset-bottom) + 0.5rem)" }}
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
      </div>
    </div>
  );
};

export default PracticeView;
