"use client";

import { useCallback, useEffect, useLayoutEffect, useMemo, useRef, useState } from 'react';
import type { Playlist } from '../types';
import { getMasteryColor } from '../lib/masteryColors';
import { toPlayableAudioUrl } from '../lib/audioUrls';
import { SongReadinessIcons } from './SongReadinessIcons';
import { useAudioPlayer } from '../hooks/useAudioPlayer';
import PracticeView from './PracticeView';
import type { Segment, SegmentRating } from '../types';
import type { SessionState } from '../lib/sessionReducer';
import {
  DEFAULT_MAX_AUTO_REPEATS,
  getNextAutoDrillStateAfterRating,
  type AutoDrillState,
  type PracticeMode,
} from '../lib/autoDrill';
import type { MemoryRating } from '../types';

type SortKey = 'alphabetical' | 'date-added' | 'date-practiced' | 'memory-score';
type FocusSortKey = 'mastery' | 'due-date' | 'song-order';
interface SortState { key: SortKey; asc: boolean }
const SORT_STORAGE_KEY = 'playlist-practice-sort';
const DEFAULT_SORT: SortState = { key: 'date-practiced', asc: false };
const DEFAULT_FOCUS_PREROLL_MS = 5000;
const FOCUS_MASTERED_RATING = 5;
const AUTO_DRILL_PREROLL_MS = 500;

const sortKeyLabel: Record<SortKey, string> = {
  alphabetical: 'Alphabetical',
  'date-added': 'Date Added',
  'date-practiced': 'Last Practiced',
  'memory-score': 'Memory Score',
};

const sortDirLabel: Record<SortKey, [string, string]> = {
  alphabetical: ['Z–A', 'A–Z'],
  'date-added': ['Newest', 'Oldest'],
  'date-practiced': ['Recent', 'Oldest'],
  'memory-score': ['Highest', 'Lowest'],
};

const defaultAscForKey = (key: SortKey) => key === 'alphabetical';

interface FocusQueueItem {
  id: string;
  song: Playlist["songs"][number];
  segment: Segment;
  songIndex: number;
  segmentIndex: number;
  latestRating?: SegmentRating;
  masteryPercent: number;
}

interface AutoDrillQueueItem {
  id: string;
  song: Playlist["songs"][number];
  segment: Segment;
  songIndex: number;
  segmentIndex: number;
}

function speakPrompt(text: string, enabled = true): Promise<void> {
  if (!enabled || typeof window === 'undefined' || !('speechSynthesis' in window)) {
    return Promise.resolve();
  }

  return new Promise((resolve) => {
    const utterance = new SpeechSynthesisUtterance(text);
    utterance.onend = () => resolve();
    utterance.onerror = () => resolve();
    window.speechSynthesis.cancel();
    window.speechSynthesis.speak(utterance);
  });
}

function getLastPracticedLabel(value?: string | null): string {
  if (!value) return 'Not practiced yet';
  const ms = Date.parse(value);
  if (Number.isNaN(ms)) return 'Not practiced yet';
  const elapsed = Math.max(0, Math.floor((Date.now() - ms) / 1000));
  const units: Array<{ unit: Intl.RelativeTimeFormatUnit; seconds: number }> = [
    { unit: 'year', seconds: 31536000 },
    { unit: 'month', seconds: 2592000 },
    { unit: 'week', seconds: 604800 },
    { unit: 'day', seconds: 86400 },
    { unit: 'hour', seconds: 3600 },
    { unit: 'minute', seconds: 60 },
  ];
  const rtf = new Intl.RelativeTimeFormat('en', { numeric: 'always' });
  for (const { unit, seconds } of units) {
    if (elapsed >= seconds) return `Last practiced ${rtf.format(-Math.floor(elapsed / seconds), unit)}`;
  }
  return 'Last practiced just now';
}

function formatMs(ms: number): string {
  const totalSeconds = Math.max(0, Math.floor(ms / 1000));
  const minutes = Math.floor(totalSeconds / 60);
  const seconds = totalSeconds % 60;
  return `${String(minutes).padStart(2, "0")}:${String(seconds).padStart(2, "0")}`;
}

interface PlaylistPracticeViewProps {
  playlist: Playlist;
  userId?: string;
  segmentPrerollMs?: number;
  collapseLyricLineBreaks?: boolean;
  onExit: () => void;
  onManage?: () => void;
  onSelectSong: (song: Playlist["songs"][number]) => void;
}

const PLAYLIST_PRACTICE_CACHE_NAME = 'cantare-playlist-practice-v1';

export function PlaylistPracticeView({
  playlist,
  userId,
  segmentPrerollMs = DEFAULT_FOCUS_PREROLL_MS,
  collapseLyricLineBreaks = false,
  onExit,
  onManage,
  onSelectSong,
}: PlaylistPracticeViewProps) {
  const [livePlaylist, setLivePlaylist] = useState(playlist);
  const [playlistScore, setPlaylistScore] = useState(0);
  const [sort, setSort] = useState<SortState>(DEFAULT_SORT);
  const [showSortMenu, setShowSortMenu] = useState(false);
  const [refetchTrigger, setRefetchTrigger] = useState(0);
  const [mode, setMode] = useState<'practice' | 'focus' | 'listen' | 'auto'>('practice');
  const [practiceMode, setPracticeMode] = useState<PracticeMode>('manual');
  const [autoDrillState, setAutoDrillState] = useState<AutoDrillState>('idle');
  const [autoDrillIndex, setAutoDrillIndex] = useState(0);
  const [autoDrillPlayToken, setAutoDrillPlayToken] = useState(0);
  const [autoDrillMessage, setAutoDrillMessage] = useState('Auto Drill idle');
  const [autoDrillPlaybackWarning, setAutoDrillPlaybackWarning] = useState<string | null>(null);
  const [autoDrillVoiceEnabled, setAutoDrillVoiceEnabled] = useState(true);
  const [autoDrillRepeatCounts, setAutoDrillRepeatCounts] = useState<Record<string, number>>({});
  const [currentSongIndex, setCurrentSongIndex] = useState(0);
  const [currentFocusIndex, setCurrentFocusIndex] = useState(0);
  const [focusAutoPlayItemId, setFocusAutoPlayItemId] = useState<string | null>(null);
  const [isListenPlaying, setIsListenPlaying] = useState(false);
  const [focusSortKey, setFocusSortKey] = useState<FocusSortKey>('mastery');
  const [focusPrerollMs, setFocusPrerollMs] = useState(segmentPrerollMs);
  const [ratingsBySongId, setRatingsBySongId] = useState<Record<string, SegmentRating[]>>({});
  const [focusRatingsLoading, setFocusRatingsLoading] = useState(false);
  const [focusRatingsError, setFocusRatingsError] = useState<string | null>(null);
  const lastObservedFocusItemIdRef = useRef<string | null>(null);
  const lastObservedFocusRatingRef = useRef<string | null>(null);
  const listenStartedSongIdRef = useRef<string | null>(null);
  const autoDrillRunIdRef = useRef(0);

  const userScopedHeaders = useMemo(() => {
    return userId ? { 'X-User-ID': userId } : undefined;
  }, [userId]);

  const playlistDetailRequest = useMemo(() => {
    const origin = typeof window !== 'undefined' ? window.location.origin : 'http://localhost';
    return new Request(new URL(`/api/playlists/${playlist.id}`, origin), {
      headers: userScopedHeaders,
    });
  }, [playlist.id, userScopedHeaders]);

  useEffect(() => {
    setLivePlaylist(playlist);
  }, [playlist]);

  useEffect(() => {
    let cancelled = false;

    const loadFromCacheThenRevalidate = async () => {
      const canUseCacheStorage = typeof window !== 'undefined' && 'caches' in window;
      let cache: Cache | null = null;

      if (canUseCacheStorage) {
        try {
          cache = await window.caches.open(PLAYLIST_PRACTICE_CACHE_NAME);
          const cachedResponse = await cache.match(playlistDetailRequest);
          if (cachedResponse?.ok) {
            const cachedPlaylist = (await cachedResponse.clone().json()) as Playlist;
            if (!cancelled && cachedPlaylist.id === playlist.id) {
              setLivePlaylist(cachedPlaylist);
            }
          }
        } catch {
          cache = null;
        }
      }

      if (typeof navigator !== 'undefined' && !navigator.onLine) {
        return;
      }

      try {
        const response = await fetch(playlistDetailRequest, { cache: 'no-store' });
        if (!response.ok) {
          return;
        }

        const freshPlaylist = (await response.clone().json()) as Playlist;
        if (!cancelled && freshPlaylist.id === playlist.id) {
          setLivePlaylist(freshPlaylist);
        }

        if (cache) {
          await cache.put(playlistDetailRequest, response);
        }
      } catch {
        // Cached playlist data is enough to keep practice usable offline.
      }
    };

    void loadFromCacheThenRevalidate();

    return () => {
      cancelled = true;
    };
  }, [playlist.id, playlistDetailRequest]);

  const displayedSongs = useMemo(() => {
    const dir = sort.asc ? 1 : -1;
    return [...livePlaylist.songs].sort((a, b) => {
      switch (sort.key) {
        case 'alphabetical':
          return dir * a.title.localeCompare(b.title);
        case 'date-added':
          return dir * (a.createdAt ?? '').localeCompare(b.createdAt ?? '');
        case 'date-practiced': {
          const aTime = a.lastPracticedAt ?? '';
          const bTime = b.lastPracticedAt ?? '';
          if (!aTime && !bTime) return 0;
          if (!aTime) return dir;
          if (!bTime) return -dir;
          return dir * aTime.localeCompare(bTime);
        }
        case 'memory-score':
          return dir * ((a.masteryPercent ?? 0) - (b.masteryPercent ?? 0));
        default:
          return 0;
      }
    });
  }, [livePlaylist.songs, sort]);

  useEffect(() => {
    setFocusPrerollMs(segmentPrerollMs);
  }, [segmentPrerollMs]);

  useEffect(() => {
    if (mode !== 'focus' && mode !== 'auto') {
      return;
    }

    let cancelled = false;
    const songsWithSegments = livePlaylist.songs.filter((song) => song.segments.length > 0);

    if (songsWithSegments.length === 0) {
      setRatingsBySongId({});
      setFocusRatingsLoading(false);
      setFocusRatingsError(null);
      return;
    }

    const loadRatings = async () => {
      setFocusRatingsLoading(true);
      setFocusRatingsError(null);
      try {
        const entries = await Promise.all(
          songsWithSegments.map(async (song) => {
            const response = await fetch(`/api/songs/${song.id}/ratings`, {
              headers: userScopedHeaders,
              cache: 'no-store',
            });
            if (!response.ok) {
              throw new Error(`Failed to load ratings for ${song.title}`);
            }
            const payload = (await response.json()) as { ratings?: SegmentRating[] };
            return [song.id, Array.isArray(payload.ratings) ? payload.ratings : []] as const;
          })
        );

        if (!cancelled) {
          setRatingsBySongId(Object.fromEntries(entries));
        }
      } catch {
        if (!cancelled) {
          setFocusRatingsError('Could not load segment ratings. Focus Queue is still available.');
        }
      } finally {
        if (!cancelled) {
          setFocusRatingsLoading(false);
        }
      }
    };

    void loadRatings();

    return () => {
      cancelled = true;
    };
  }, [livePlaylist.songs, mode, refetchTrigger, userScopedHeaders]);

  const focusQueue = useMemo<FocusQueueItem[]>(() => {
    const items = livePlaylist.songs.flatMap((song, songIndex) => {
      const ratings = ratingsBySongId[song.id] ?? [];
      return [...song.segments]
        .sort((a, b) => a.order - b.order || a.startMs - b.startMs)
        .map((segment, segmentIndex) => {
          const latestRating = ratings
            .filter((rating) => rating.segmentId === segment.id)
            .sort((a, b) => Date.parse(b.ratedAt) - Date.parse(a.ratedAt))[0];
          return {
            id: `${song.id}:${segment.id}`,
            song,
            segment,
            songIndex,
            segmentIndex,
            latestRating,
            masteryPercent: latestRating ? latestRating.rating * 20 : 0,
          };
        })
        .filter((item) => (item.latestRating?.rating ?? 0) < FOCUS_MASTERED_RATING);
    });

    if (focusSortKey === 'song-order') {
      return items.sort((a, b) => a.songIndex - b.songIndex || a.segmentIndex - b.segmentIndex);
    }

    const groupedBySong = new Map<number, FocusQueueItem[]>();
    for (const item of items) {
      const group = groupedBySong.get(item.songIndex) ?? [];
      group.push(item);
      groupedBySong.set(item.songIndex, group);
    }

    return [...groupedBySong.values()]
      .map((group) => [...group].sort((a, b) => a.segmentIndex - b.segmentIndex))
      .sort((aGroup, bGroup) => {
        const aFirst = aGroup[0];
        const bFirst = bGroup[0];
        if (!aFirst || !bFirst) {
          return 0;
        }

        if (focusSortKey === 'due-date') {
          const aOldest = Math.min(...aGroup.map((item) => item.latestRating ? Date.parse(item.latestRating.ratedAt) : 0));
          const bOldest = Math.min(...bGroup.map((item) => item.latestRating ? Date.parse(item.latestRating.ratedAt) : 0));
          const aWeakest = Math.min(...aGroup.map((item) => item.masteryPercent));
          const bWeakest = Math.min(...bGroup.map((item) => item.masteryPercent));
          return aOldest - bOldest || aWeakest - bWeakest || aFirst.songIndex - bFirst.songIndex;
        }

        const aWeakest = Math.min(...aGroup.map((item) => item.masteryPercent));
        const bWeakest = Math.min(...bGroup.map((item) => item.masteryPercent));
        return aWeakest - bWeakest || aFirst.songIndex - bFirst.songIndex;
      })
      .flat();
  }, [focusSortKey, livePlaylist.songs, ratingsBySongId]);

  const autoDrillQueue = useMemo<AutoDrillQueueItem[]>(() => {
    return livePlaylist.songs.flatMap((song, songIndex) => {
      if (!song.audioUrl.trim()) {
        return [];
      }

      return [...song.segments]
        .sort((a, b) => a.order - b.order || a.startMs - b.startMs)
        .map((segment, segmentIndex) => ({
          id: `${song.id}:${segment.id}`,
          song,
          segment,
          songIndex,
          segmentIndex,
        }));
    });
  }, [livePlaylist.songs]);

  const currentAutoDrillItem = autoDrillQueue[autoDrillIndex];

  useEffect(() => {
    setAutoDrillIndex((prev) => Math.min(prev, Math.max(autoDrillQueue.length - 1, 0)));
  }, [autoDrillQueue.length]);

  useEffect(() => {
    setCurrentFocusIndex((prev) => Math.min(prev, Math.max(focusQueue.length - 1, 0)));
  }, [focusQueue.length]);

  const currentFocusItem = focusQueue[currentFocusIndex];
  const handlePrevFocusSegment = useCallback((options?: { wasPlaying: boolean }) => {
    setCurrentFocusIndex((prev) => {
      const nextIndex = Math.max(prev - 1, 0);
      setFocusAutoPlayItemId(options?.wasPlaying ? focusQueue[nextIndex]?.id ?? null : null);
      return nextIndex;
    });
  }, [focusQueue]);
  const handleNextFocusSegment = useCallback((options?: { wasPlaying: boolean }) => {
    setCurrentFocusIndex((prev) => {
      const nextIndex = Math.min(prev + 1, Math.max(focusQueue.length - 1, 0));
      setFocusAutoPlayItemId(options?.wasPlaying ? focusQueue[nextIndex]?.id ?? null : null);
      return nextIndex;
    });
  }, [focusQueue]);

  useEffect(() => {
    if (!focusAutoPlayItemId || currentFocusItem?.id !== focusAutoPlayItemId) {
      return;
    }

    const timer = window.setTimeout(() => setFocusAutoPlayItemId(null), 0);
    return () => window.clearTimeout(timer);
  }, [currentFocusItem?.id, focusAutoPlayItemId]);

  const focusPracticeSession = useMemo<SessionState | null>(() => {
    if (!currentFocusItem) {
      return null;
    }

    return {
      id: `playlist-focus-${playlist.id}-${currentFocusItem.segment.id}`,
      songId: currentFocusItem.song.id,
      currentSongId: currentFocusItem.song.id,
      currentSegmentIndex: currentFocusItem.segmentIndex,
      isLocked: false,
      ratings: ratingsBySongId[currentFocusItem.song.id] ?? [],
      startedAt: new Date().toISOString(),
    };
  }, [currentFocusItem, playlist.id, ratingsBySongId]);

  const autoDrillPracticeSession = useMemo<SessionState | null>(() => {
    if (!currentAutoDrillItem) {
      return null;
    }

    return {
      id: `playlist-auto-${playlist.id}-${currentAutoDrillItem.segment.id}`,
      songId: currentAutoDrillItem.song.id,
      currentSongId: currentAutoDrillItem.song.id,
      currentSegmentIndex: currentAutoDrillItem.segmentIndex,
      isLocked: false,
      ratings: ratingsBySongId[currentAutoDrillItem.song.id] ?? [],
      startedAt: new Date().toISOString(),
    };
  }, [currentAutoDrillItem, playlist.id, ratingsBySongId]);

  useEffect(() => {
    if (!currentFocusItem) {
      lastObservedFocusItemIdRef.current = null;
      lastObservedFocusRatingRef.current = null;
      return;
    }

    if (lastObservedFocusItemIdRef.current === currentFocusItem.id) {
      return;
    }

    lastObservedFocusItemIdRef.current = currentFocusItem.id;
    lastObservedFocusRatingRef.current = currentFocusItem.latestRating
      ? `${currentFocusItem.segment.id}:${currentFocusItem.latestRating.rating}:${currentFocusItem.latestRating.ratedAt}`
      : null;
  }, [currentFocusItem]);

  const listenQueue = displayedSongs;
  const currentSong = listenQueue[currentSongIndex];
  const playbackSong = mode === 'focus' || mode === 'auto' ? undefined : currentSong;
  const currentSongId = playbackSong?.id;
  const hasCurrentSongAudio = Boolean(playbackSong?.audioUrl.trim());
  const findNextPlayableIndex = useCallback((startIndex: number) => {
    for (let index = Math.max(0, startIndex); index < listenQueue.length; index += 1) {
      if (listenQueue[index]?.audioUrl.trim()) {
        return index;
      }
    }
    return -1;
  }, [listenQueue]);
  const playbackAudioUrl = useMemo(
    () => toPlayableAudioUrl(playbackSong?.audioUrl ?? ''),
    [playbackSong?.audioUrl]
  );
  const audioPlayer = useAudioPlayer(playbackAudioUrl);
  const {
    endedCount: playbackEndedCount = 0,
    pause: pauseAudio,
    play: playAudio,
  } = audioPlayer;
  const requestPlay = useCallback((startMs: number, endMs: number) => {
    playAudio(startMs, endMs);
  }, [playAudio]);

  useEffect(() => {
    if (mode !== 'listen') {
      setIsListenPlaying(false);
      listenStartedSongIdRef.current = null;
      return;
    }

    setCurrentSongIndex((prev) => Math.min(prev, Math.max(listenQueue.length - 1, 0)));
  }, [listenQueue.length, mode]);

  useLayoutEffect(() => {
    if (mode !== 'listen' || !isListenPlaying || !currentSongId) {
      return;
    }

    if (!hasCurrentSongAudio) {
      listenStartedSongIdRef.current = currentSongId;
      const nextPlayableIndex = findNextPlayableIndex(currentSongIndex + 1);
      if (nextPlayableIndex === -1) {
        setIsListenPlaying(false);
        listenStartedSongIdRef.current = null;
      } else {
        setCurrentSongIndex(nextPlayableIndex);
      }
      return;
    }

    if (listenStartedSongIdRef.current === currentSongId) {
      return;
    }

    listenStartedSongIdRef.current = currentSongId;
    requestPlay(0, 0);
  }, [
    currentSongId,
    currentSongIndex,
    findNextPlayableIndex,
    hasCurrentSongAudio,
    isListenPlaying,
    mode,
    requestPlay,
  ]);

  useEffect(() => {
    if (mode !== 'listen' || !isListenPlaying || playbackEndedCount <= 0) {
      return;
    }

    const nextPlayableIndex = findNextPlayableIndex(currentSongIndex + 1);
    if (nextPlayableIndex === -1) {
      setIsListenPlaying(false);
      listenStartedSongIdRef.current = null;
      pauseAudio();
      return;
    }

    setCurrentSongIndex(nextPlayableIndex);
  }, [currentSongIndex, findNextPlayableIndex, isListenPlaying, mode, pauseAudio, playbackEndedCount]);

  const handleListenPlayPause = () => {
    if (audioPlayer.isPlaying || isListenPlaying) {
      setIsListenPlaying(false);
      listenStartedSongIdRef.current = null;
      pauseAudio();
      return;
    }

    const startIndex = hasCurrentSongAudio ? currentSongIndex : findNextPlayableIndex(currentSongIndex);
    if (startIndex === -1) {
      return;
    }

    if (startIndex !== currentSongIndex) {
      setCurrentSongIndex(startIndex);
    }
    listenStartedSongIdRef.current = null;
    setIsListenPlaying(true);
  };

  const handleNextSong = () => {
    if (currentSongIndex < listenQueue.length - 1) {
      setCurrentSongIndex(prev => prev + 1);
    }
  };

  const handlePrevSong = () => {
    if (currentSongIndex > 0) {
      setCurrentSongIndex(prev => prev - 1);
    }
  };

  const handleFocusSessionChange = useCallback((session: SessionState) => {
    if (!currentFocusItem) {
      return;
    }

    const activeSegment = currentFocusItem.song.segments[session.currentSegmentIndex];
    if (activeSegment) {
      const nextFocusIndex = focusQueue.findIndex(
        (item) => item.song.id === currentFocusItem.song.id && item.segment.id === activeSegment.id
      );
      if (nextFocusIndex !== -1 && nextFocusIndex !== currentFocusIndex) {
        setCurrentFocusIndex(nextFocusIndex);
      }
    }
  }, [currentFocusIndex, currentFocusItem, focusQueue]);

  const handleFocusRatingsSaved = useCallback((ratings: SessionState["ratings"]) => {
    if (!currentFocusItem) {
      return;
    }

    setRatingsBySongId((prev) => ({ ...prev, [currentFocusItem.song.id]: ratings }));

    const latestForQueuedSegment = ratings
      .filter((rating) => rating.segmentId === currentFocusItem.segment.id)
      .sort((a, b) => Date.parse(b.ratedAt) - Date.parse(a.ratedAt))[0];

    const nextObservedKey = latestForQueuedSegment
      ? `${currentFocusItem.segment.id}:${latestForQueuedSegment.rating}:${latestForQueuedSegment.ratedAt}`
      : null;

    if (!nextObservedKey || nextObservedKey === lastObservedFocusRatingRef.current) {
      return;
    }

    lastObservedFocusRatingRef.current = nextObservedKey;
    setRefetchTrigger((prev) => prev + 1);
    setCurrentFocusIndex((prev) => {
      const lastIndex = Math.max(focusQueue.length - 1, 0);
      return focusSortKey === 'song-order' ? Math.min(prev + 1, lastIndex) : Math.min(prev, lastIndex);
    });
  }, [currentFocusItem, focusQueue.length, focusSortKey]);

  const stopAutoDrill = useCallback(() => {
    autoDrillRunIdRef.current += 1;
    if (typeof window !== 'undefined' && 'speechSynthesis' in window) {
      window.speechSynthesis.cancel();
    }
    setPracticeMode('manual');
    setAutoDrillState('idle');
    setAutoDrillMessage('Auto Drill idle');
    setMode('practice');
  }, []);

  const startAutoDrill = useCallback(() => {
    autoDrillRunIdRef.current += 1;
    setMode('auto');
    setPracticeMode('auto-drill');
    setAutoDrillIndex(0);
    setAutoDrillRepeatCounts({});
    setAutoDrillPlaybackWarning(null);
    setAutoDrillMessage('Auto Drill starting');
    setAutoDrillState(autoDrillQueue.length > 0 ? 'announcing' : 'complete');
  }, [autoDrillQueue.length]);

  const handleAutoDrillRatingsSaved = useCallback((ratings: SessionState["ratings"]) => {
    if (!currentAutoDrillItem) {
      return;
    }

    setRatingsBySongId((prev) => ({ ...prev, [currentAutoDrillItem.song.id]: ratings }));
    setRefetchTrigger((prev) => prev + 1);
  }, [currentAutoDrillItem]);

  const handleAutoDrillPlaybackComplete = useCallback(() => {
    if (practiceMode !== 'auto-drill' || autoDrillState !== 'playing') {
      return;
    }

    setAutoDrillState('awaiting-rating');
    setAutoDrillPlaybackWarning(null);
    setAutoDrillMessage('Rate your recall from 1 to 5.');
    void speakPrompt('Rate your recall from 1 to 5.', autoDrillVoiceEnabled);
  }, [autoDrillState, autoDrillVoiceEnabled, practiceMode]);

  const handleAutoDrillRatingSubmitted = useCallback((rating: MemoryRating) => {
    if (!currentAutoDrillItem || practiceMode !== 'auto-drill' || autoDrillState !== 'awaiting-rating') {
      return;
    }

    const repeatCount = autoDrillRepeatCounts[currentAutoDrillItem.id] ?? 0;
    const nextState = getNextAutoDrillStateAfterRating({
      rating,
      repeatCount,
      currentIndex: autoDrillIndex,
      queueLength: autoDrillQueue.length,
      maxRepeats: DEFAULT_MAX_AUTO_REPEATS,
    });

    if (nextState === 'repeating') {
      setAutoDrillRepeatCounts((prev) => ({
        ...prev,
        [currentAutoDrillItem.id]: repeatCount + 1,
      }));
      setAutoDrillState('repeating');
      setAutoDrillMessage('Again.');
      setAutoDrillPlaybackWarning(null);
      return;
    }

    if (nextState === 'complete') {
      setAutoDrillState('complete');
      setAutoDrillMessage('Playlist complete.');
      setAutoDrillPlaybackWarning(null);
      return;
    }

    setAutoDrillIndex((prev) => Math.min(prev + 1, Math.max(autoDrillQueue.length - 1, 0)));
    setAutoDrillState('announcing');
    setAutoDrillPlaybackWarning(null);
    setAutoDrillMessage('Next segment.');
  }, [
    autoDrillIndex,
    autoDrillQueue.length,
    autoDrillRepeatCounts,
    autoDrillState,
    currentAutoDrillItem,
    practiceMode,
  ]);

  useEffect(() => {
    if (practiceMode !== 'auto-drill') {
      return;
    }

    const onKeyDown = (event: KeyboardEvent) => {
      if (event.key === 'Escape') {
        event.preventDefault();
        stopAutoDrill();
      }
    };

    window.addEventListener('keydown', onKeyDown);
    return () => window.removeEventListener('keydown', onKeyDown);
  }, [practiceMode, stopAutoDrill]);

  useEffect(() => {
    if (practiceMode !== 'auto-drill') {
      return;
    }

    if (autoDrillState === 'complete') {
      autoDrillRunIdRef.current += 1;
      setAutoDrillMessage('Playlist complete.');
      void speakPrompt('Playlist complete.', autoDrillVoiceEnabled);
      return;
    }

    if (!currentAutoDrillItem) {
      setAutoDrillState('complete');
      return;
    }

    if (autoDrillState !== 'announcing' && autoDrillState !== 'repeating') {
      return;
    }

    const runId = autoDrillRunIdRef.current + 1;
    autoDrillRunIdRef.current = runId;
    let cancelled = false;

    const runPromptSequence = async () => {
      if (autoDrillState === 'repeating') {
        setAutoDrillMessage('Again.');
        await speakPrompt('Again.', autoDrillVoiceEnabled);
      } else {
        const segmentMessage = `${autoDrillIndex > 0 ? 'Next segment. ' : ''}${currentAutoDrillItem.song.title}. ${currentAutoDrillItem.segment.label}.`;
        setAutoDrillMessage(segmentMessage);
        await speakPrompt(segmentMessage, autoDrillVoiceEnabled);
      }

      if (cancelled || autoDrillRunIdRef.current !== runId) {
        return;
      }

      setAutoDrillState('counting-down');
      setAutoDrillMessage('Starting in 3... 2... 1...');
      await speakPrompt('Starting in 3. 2. 1.', autoDrillVoiceEnabled);

      if (cancelled || autoDrillRunIdRef.current !== runId) {
        return;
      }

      setAutoDrillState('playing');
      setAutoDrillMessage('Playing.');
      setAutoDrillPlaybackWarning(null);
      setAutoDrillPlayToken((prev) => prev + 1);
    };

    void runPromptSequence();

    return () => {
      cancelled = true;
    };
  }, [autoDrillIndex, autoDrillState, autoDrillVoiceEnabled, currentAutoDrillItem, practiceMode]);

  useEffect(() => {
    try {
      const raw = localStorage.getItem(SORT_STORAGE_KEY);
      if (raw) {
        const parsed = JSON.parse(raw) as unknown;
        if (
          parsed !== null &&
          typeof parsed === 'object' &&
          'key' in parsed && 'asc' in parsed &&
          ['alphabetical', 'date-added', 'date-practiced', 'memory-score'].includes((parsed as SortState).key) &&
          typeof (parsed as SortState).asc === 'boolean'
        ) {
          setSort(parsed as SortState);
        }
      }
    } catch {
      // Ignore malformed persisted sorting preferences.
    }
  }, []);

  const updateSort = (next: SortState) => {
    setSort(next);
    try { localStorage.setItem(SORT_STORAGE_KEY, JSON.stringify(next)); } catch { /* ignore */ }
  };

  useEffect(() => {
    const load = async () => {
      try {
        const res = await fetch(`/api/playlists/${playlist.id}/knowledge`, {
          headers: userScopedHeaders,
        });
        if (res.ok) {
          const data = (await res.json()) as { score?: number };
          setPlaylistScore(Math.min(Math.round(data.score ?? 0), 100));
        }
      } catch { /* ignore */ }
    };
    void load();
  }, [playlist.id, refetchTrigger, userScopedHeaders]);

  useEffect(() => {
    const handleRatingsUpdated = () => {
      setRefetchTrigger(prev => prev + 1);
    };
    window.addEventListener('ratingsUpdated', handleRatingsUpdated);
    return () => {
      window.removeEventListener('ratingsUpdated', handleRatingsUpdated);
    };
  }, []);

  useEffect(() => {
    const maybePrecachePlaylist = async () => {
      if (typeof window === 'undefined' || !('caches' in window)) {
        return;
      }
      if (typeof navigator !== 'undefined' && !navigator.onLine) {
        return;
      }

      const connection = (navigator as Navigator & {
        connection?: { effectiveType?: string; saveData?: boolean };
      }).connection;

      if (connection?.saveData) {
        return;
      }

      const effectiveType = connection?.effectiveType ?? '';
      if (effectiveType.includes('2g')) {
        return;
      }

      try {
        const playlistCache = await window.caches.open(PLAYLIST_PRACTICE_CACHE_NAME);

        await Promise.allSettled(
          livePlaylist.songs.map(async (song) => {
            const origin = typeof window !== 'undefined' ? window.location.origin : 'http://localhost';
            const songRequest = new Request(new URL(`/api/songs/${song.id}`, origin), {
              headers: userScopedHeaders,
            });
            const songResponse = await fetch(songRequest, { cache: 'force-cache' });
            if (songResponse.ok) {
              await playlistCache.put(songRequest, songResponse.clone());
            }
          })
        );
      } catch {
        // Pre-cache failures should never block practice.
      }
    };

    void maybePrecachePlaylist();
  }, [livePlaylist.songs, userScopedHeaders]);

  if (livePlaylist.songs.length === 0) {
    return (
      <section data-testid="playlist-practice-empty" className="space-y-4">
        <header className="space-y-3">
          <div className="flex items-center justify-between">
            <div className="flex items-center gap-1 text-sm text-gray-600">
              <button
                data-testid="playlist-practice-exit"
                className="hover:text-indigo-700 hover:underline"
                onClick={onExit}
              >
                Playlists
              </button>
              <span>/</span>
              <span className="text-gray-900">{livePlaylist.name}</span>
            </div>
            {onManage ? (
              <button
                data-testid="playlist-practice-manage"
                aria-label="Edit Playlist"
                title="Edit Playlist"
                className="flex h-10 w-10 items-center justify-center rounded bg-indigo-600 text-white hover:bg-indigo-700"
                onClick={onManage}
              >
                <svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" className="h-4 w-4">
                  <path d="M12 20h9" />
                  <path d="M16.5 3.5a2.12 2.12 0 1 1 3 3L7 19l-4 1 1-4Z" />
                </svg>
              </button>
            ) : null}
          </div>
          <p className="text-gray-600">No songs in this playlist yet.</p>
          <div className="flex gap-2">
            <button className="rounded border border-gray-300 px-3 py-2" onClick={onExit}>
              Back to Playlists
            </button>
          </div>
        </header>
      </section>
    );
  }

  return (
    <section data-testid="playlist-practice-view" className="space-y-4">
      <header className="flex flex-wrap items-center justify-between gap-3">
        <div>
          <div className="mb-1 flex items-center gap-1 text-sm text-gray-600">
            <button
              data-testid="playlist-practice-exit"
              className="hover:text-indigo-700 hover:underline"
              onClick={onExit}
            >
              Playlists
            </button>
            <span>/</span>
            <span className="text-gray-900">{livePlaylist.name}</span>
          </div>
          <h2 className="text-2xl font-bold">{livePlaylist.name}</h2>
          <p data-testid="playlist-practice-score" className="text-sm font-medium text-indigo-700">
            Playlist Knowledge: {playlistScore}%
          </p>
        </div>
        <div className="flex gap-2">
          <div className="inline-flex h-10 rounded border border-indigo-300 bg-white p-0.5">
            {([
              ['practice', 'Songs'],
              ['focus', 'Focus'],
              ['auto', 'Auto Drill'],
              ['listen', 'Listen'],
            ] as const).map(([nextMode, label]) => (
              <button
                key={nextMode}
                type="button"
                data-testid={`playlist-mode-${nextMode}`}
                aria-pressed={mode === nextMode}
                onClick={() => {
                  if (nextMode === 'auto') {
                    startAutoDrill();
                    return;
                  }
                  if (practiceMode === 'auto-drill') {
                    autoDrillRunIdRef.current += 1;
                    if (typeof window !== 'undefined' && 'speechSynthesis' in window) {
                      window.speechSynthesis.cancel();
                    }
                    setPracticeMode('manual');
                    setAutoDrillState('idle');
                  }
                  setMode(nextMode);
                }}
                className={`rounded px-3 text-sm font-semibold ${
                  mode === nextMode
                    ? 'bg-indigo-600 text-white'
                    : 'text-indigo-700 hover:bg-indigo-50'
                }`}
              >
                {label}
              </button>
            ))}
          </div>
          {onManage ? (
            <button
              data-testid="playlist-practice-manage"
              aria-label="Edit Playlist"
              title="Edit Playlist"
              className="flex h-10 w-10 items-center justify-center rounded border border-indigo-300 text-indigo-700 hover:bg-indigo-50"
              onClick={onManage}
            >
              <svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" className="h-4 w-4">
                <path d="M12 20h9" />
                <path d="M16.5 3.5a2.12 2.12 0 1 1 3 3L7 19l-4 1 1-4Z" />
              </svg>
            </button>
          ) : null}
        </div>
      </header>

      {mode === 'practice' && (
        <>
          {/* Sort toolbar */}
          <div className="flex items-center gap-2">
            <div className="relative ml-auto">
              <button
                type="button"
                data-testid="playlist-sort-toggle"
                onClick={() => setShowSortMenu((prev) => !prev)}
                className="flex items-center gap-1.5 rounded px-2.5 py-1.5 text-sm text-gray-500 hover:bg-gray-100"
              >
                <svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" className="h-4 w-4">
                  <line x1="8" y1="6" x2="21" y2="6" />
                  <line x1="8" y1="12" x2="21" y2="12" />
                  <line x1="8" y1="18" x2="21" y2="18" />
                  <polyline points="3 6 4 7 6 5" />
                  <polyline points="3 12 4 13 6 11" />
                  <polyline points="3 18 4 19 6 17" />
                </svg>
                {sortDirLabel[sort.key][sort.asc ? 1 : 0]}
                <svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" className="h-3 w-3">
                  <polyline points="6 9 12 15 18 9" />
                </svg>
              </button>
              {showSortMenu && (
                <div className="absolute right-0 top-full z-10 mt-1 w-48 rounded-lg border border-gray-200 bg-white shadow-lg">
                  {(['alphabetical', 'date-added', 'date-practiced', 'memory-score'] as const).map((key) => {
                    const isActive = sort.key === key;
                    return (
                      <button
                        key={key}
                        type="button"
                        data-testid={`playlist-sort-${key}`}
                        onClick={() => {
                          updateSort({ key, asc: isActive ? !sort.asc : defaultAscForKey(key) });
                          setShowSortMenu(false);
                        }}
                        className={`flex w-full items-center justify-between px-4 py-2 text-left text-sm first:rounded-t-lg last:rounded-b-lg hover:bg-gray-50 ${
                          isActive ? 'font-semibold text-blue-600' : 'text-gray-700'
                        }`}
                      >
                        {sortKeyLabel[key]}
                        {isActive && (
                          <svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.5" strokeLinecap="round" strokeLinejoin="round" className="h-3.5 w-3.5">
                            {sort.asc
                              ? <polyline points="18 15 12 9 6 15" />
                              : <polyline points="6 9 12 15 18 9" />}
                          </svg>
                        )}
                      </button>
                    );
                  })}
                </div>
              )}
            </div>
          </div>

          <div className="grid gap-4 md:grid-cols-2 lg:grid-cols-3" data-testid="playlist-song-grid">
            {displayedSongs.map((song) => {
              const mastery = Math.max(0, Math.min(100, Math.round(song.masteryPercent ?? 0)));
              const masteryColor = getMasteryColor(mastery);
              const shouldRenderLabelInsideBar = mastery >= 10;
              const hasAudio = Boolean(song.audioUrl?.trim());
              const hasSegments = song.segments.length > 0;
              const hasTapKeys = (song.pitchContourNotes?.length ?? 0) > 0;
              return (
                <div
                  key={song.id}
                  data-testid={`playlist-practice-song-${song.id}`}
                  className="relative bg-white p-6 pt-10 rounded-lg shadow hover:shadow-md transition-shadow cursor-pointer border-2 border-transparent"
                  onClick={() => onSelectSong(song)}
                >
                  <div className="absolute inset-x-0 top-0 h-6 rounded-t-lg border-b border-black/5 bg-gray-100">
                    <div
                      className="relative h-full rounded-tl-lg"
                      style={{ width: `${mastery}%`, backgroundColor: masteryColor }}
                    >
                      {shouldRenderLabelInsideBar ? (
                        <span
                          data-testid={`playlist-practice-mastery-label-${song.id}`}
                          className="absolute right-1 top-1/2 -translate-y-1/2 text-[11px] font-semibold text-white"
                        >
                          {mastery}%
                        </span>
                      ) : null}
                    </div>
                    {!shouldRenderLabelInsideBar ? (
                      <span
                        data-testid={`playlist-practice-mastery-label-${song.id}`}
                        className="absolute top-1/2 -translate-y-1/2 text-[11px] font-semibold text-gray-700"
                        style={{ left: `calc(${mastery}% + 4px)` }}
                      >
                        {mastery}%
                      </span>
                    ) : null}
                  </div>

                  <h3 className="text-xl font-semibold mb-2">{song.title}</h3>
                  {song.artist ? <p className="text-gray-600 mb-2">{song.artist}</p> : null}
                  <div className="absolute bottom-3 right-3">
                    <SongReadinessIcons
                      hasAudio={hasAudio}
                      hasSegments={hasSegments}
                      hasTapKeys={hasTapKeys}
                      testIdPrefix={`playlist-practice-song-${song.id}`}
                    />
                  </div>
                  <p className="text-xs text-gray-500 mt-2">{getLastPracticedLabel(song.lastPracticedAt)}</p>
                </div>
              );
            })}
          </div>
        </>
      )}

      {mode === 'focus' && (
        <div
          className="space-y-4"
          data-testid="playlist-focus-queue"
          style={{ paddingBottom: "calc(var(--player-height) + env(safe-area-inset-bottom) + 16px)" }}
        >
          <div className="flex flex-wrap items-center gap-3">
            <div className="inline-flex rounded border border-gray-300 bg-white p-0.5">
              {([
                ['mastery', 'Weakest'],
                ['due-date', 'Oldest'],
                ['song-order', 'Song Order'],
              ] as const).map(([key, label]) => (
                <button
                  key={key}
                  type="button"
                  data-testid={`focus-sort-${key}`}
                  aria-pressed={focusSortKey === key}
                  onClick={() => {
                    setFocusSortKey(key);
                    setCurrentFocusIndex(0);
                  }}
                  className={`rounded px-3 py-1.5 text-sm font-semibold ${
                    focusSortKey === key
                      ? 'bg-slate-900 text-white'
                      : 'text-slate-700 hover:bg-slate-100'
                  }`}
                >
                  {label}
                </button>
              ))}
            </div>
            <label className="flex items-center gap-2 text-sm text-gray-700">
              Pre-roll
              <select
                data-testid="focus-preroll-select"
                value={focusPrerollMs}
                onChange={(event) => setFocusPrerollMs(Number(event.target.value))}
                className="rounded border border-gray-300 bg-white px-2 py-1 text-sm"
              >
                <option value={0}>0s</option>
                <option value={1000}>1s</option>
                <option value={2000}>2s</option>
                <option value={5000}>5s</option>
                <option value={10000}>10s</option>
              </select>
            </label>
          </div>

          {focusRatingsLoading ? (
            <div className="rounded border border-gray-200 bg-white px-4 py-3 text-sm text-gray-600">
              Loading segment ratings...
            </div>
          ) : null}

          {focusRatingsError ? (
            <div className="rounded border border-amber-200 bg-amber-50 px-4 py-3 text-sm text-amber-800">
              {focusRatingsError}
            </div>
          ) : null}

          {!currentFocusItem ? (
            <div className="rounded border border-amber-200 bg-amber-50 px-4 py-3 text-sm text-amber-800">
              No segments currently need focused practice.
            </div>
          ) : (
            <>
              <div className="rounded-lg border border-indigo-100 bg-indigo-50 px-4 py-3" data-testid="focus-current-segment">
                <div className="flex flex-wrap items-center justify-between gap-3">
                  <div>
                    <p className="text-sm font-semibold text-indigo-800">
                      Focus: {currentFocusItem.song.title}
                      {currentFocusItem.song.artist ? ` - ${currentFocusItem.song.artist}` : ''}
                    </p>
                    <p className="text-sm text-indigo-950">
                      {currentFocusItem.segment.label} - Song {currentFocusItem.songIndex + 1} of {livePlaylist.songs.length} - Segment {currentFocusItem.segmentIndex + 1} of {currentFocusItem.song.segments.length} - {formatMs(currentFocusItem.segment.startMs)} to {formatMs(currentFocusItem.segment.endMs)}
                    </p>
                  </div>
                  <span className="text-sm font-medium text-indigo-900">
                    {currentFocusIndex + 1} of {focusQueue.length}
                  </span>
                </div>
              </div>

              {focusPracticeSession ? (
                <div className="min-h-[720px] rounded-lg border border-gray-200 bg-gray-50 p-3" data-testid="focus-practice-surface">
                  <PracticeView
                    key={`${currentFocusItem.song.id}:${currentFocusItem.segment.id}`}
                    song={currentFocusItem.song}
                    initialSession={focusPracticeSession}
                    onSessionChange={handleFocusSessionChange}
                    onRatingsSaved={handleFocusRatingsSaved}
                    breadcrumbRootLabel="Focus Queue"
                    segmentPrerollMs={focusPrerollMs}
                    collapseLyricLineBreaks={collapseLyricLineBreaks}
                    defaultLooping
                    playScope="segment"
                    autoPlayOnMount={focusAutoPlayItemId === currentFocusItem.id}
                    onPrevSegment={handlePrevFocusSegment}
                    onNextSegment={handleNextFocusSegment}
                    canUsePrevSegment={currentFocusIndex > 0}
                    canUseNextSegment={currentFocusIndex < focusQueue.length - 1}
                  />
                </div>
              ) : null}

              <div className="grid gap-3 md:grid-cols-2" data-testid="focus-queue-list">
                {focusQueue.slice(0, 8).map((item, index) => {
                  const isActive = index === currentFocusIndex;
                  return (
                    <button
                      key={item.id}
                      type="button"
                      data-testid={`focus-queue-item-${item.segment.id}`}
                      onClick={() => setCurrentFocusIndex(index)}
                      className={`rounded-lg border p-3 text-left transition ${
                        isActive
                          ? 'border-indigo-500 bg-indigo-50'
                          : 'border-gray-200 bg-white hover:border-indigo-200 hover:bg-gray-50'
                      }`}
                    >
                      <div className="flex items-center justify-between gap-3">
                        <span className="text-sm font-semibold text-gray-950">Segment {item.segmentIndex + 1}</span>
                        <span className="text-xs font-semibold text-gray-500">{item.masteryPercent}% memorized</span>
                      </div>
                      <p className="mt-1 text-xs text-gray-500">
                        {item.song.title} - {formatMs(item.segment.startMs)}
                      </p>
                    </button>
                  );
                })}
              </div>
            </>
          )}
        </div>
      )}

      {mode === 'auto' && (
        <div className="space-y-4" data-testid="playlist-auto-drill">
          <div
            aria-live="polite"
            data-testid="auto-drill-live"
            className="rounded-lg border border-indigo-100 bg-indigo-50 px-4 py-3"
          >
            <div className="flex flex-wrap items-center justify-between gap-3">
              <div>
                <p className="text-sm font-semibold text-indigo-800">Auto Drill</p>
                <p className="text-sm text-indigo-950">{autoDrillMessage}</p>
                {autoDrillPlaybackWarning ? (
                  <p data-testid="auto-drill-playback-warning" className="mt-1 text-sm font-medium text-amber-800">
                    {autoDrillPlaybackWarning}
                  </p>
                ) : null}
              </div>
              <span className="text-sm font-medium text-indigo-900">
                {currentAutoDrillItem ? `${autoDrillIndex + 1} of ${autoDrillQueue.length}` : '0 of 0'}
              </span>
            </div>
          </div>

          <div className="flex flex-wrap items-center gap-2">
            {practiceMode === 'auto-drill' && autoDrillState !== 'idle' ? (
              <button
                type="button"
                data-testid="auto-drill-exit"
                aria-label="Exit Auto Drill"
                onClick={stopAutoDrill}
                className="rounded border border-slate-300 bg-white px-3 py-2 text-sm font-semibold text-slate-700 hover:bg-slate-100"
              >
                Exit Auto Drill
              </button>
            ) : (
              <button
                type="button"
                data-testid="auto-drill-start"
                aria-label="Start Auto Drill"
                onClick={startAutoDrill}
                disabled={autoDrillQueue.length === 0}
                className="rounded bg-indigo-600 px-3 py-2 text-sm font-semibold text-white hover:bg-indigo-700 disabled:opacity-40"
              >
                Start Auto Drill
              </button>
            )}
            <label className="flex items-center gap-2 rounded border border-gray-200 bg-white px-3 py-2 text-sm font-medium text-gray-700">
              <input
                type="checkbox"
                data-testid="auto-drill-voice-toggle"
                checked={autoDrillVoiceEnabled}
                onChange={(event) => setAutoDrillVoiceEnabled(event.target.checked)}
              />
              Voice prompts
            </label>
          </div>

          {!currentAutoDrillItem ? (
            <div className="rounded border border-amber-200 bg-amber-50 px-4 py-3 text-sm text-amber-800">
              This playlist needs songs with audio and segments before Auto Drill can start.
            </div>
          ) : (
            <>
              <div className="rounded-lg border border-indigo-100 bg-white px-4 py-3" data-testid="auto-drill-current-segment">
                <div className="flex flex-wrap items-center justify-between gap-3">
                  <div>
                    <p className="text-sm font-semibold text-gray-950">
                      {currentAutoDrillItem.song.title}
                      {currentAutoDrillItem.song.artist ? ` - ${currentAutoDrillItem.song.artist}` : ''}
                    </p>
                    <p className="text-sm text-gray-600">
                      {currentAutoDrillItem.segment.label} - Song {currentAutoDrillItem.songIndex + 1} of {livePlaylist.songs.length} - Segment {currentAutoDrillItem.segmentIndex + 1} of {currentAutoDrillItem.song.segments.length}
                    </p>
                  </div>
                  {autoDrillState === 'awaiting-rating' ? (
                    <span className="rounded-full bg-amber-100 px-3 py-1 text-xs font-semibold text-amber-900">
                      Press 1-5
                    </span>
                  ) : autoDrillState === 'playing' ? (
                    <span className="rounded-full bg-emerald-100 px-3 py-1 text-xs font-semibold text-emerald-900">
                      Listening
                    </span>
                  ) : null}
                </div>
              </div>

              {autoDrillPracticeSession ? (
                <div className="min-h-[720px] rounded-lg border border-gray-200 bg-gray-50 p-3" data-testid="auto-drill-practice-surface">
                  <PracticeView
                    key={`${currentAutoDrillItem.song.id}:${currentAutoDrillItem.segment.id}`}
                    song={currentAutoDrillItem.song}
                    initialSession={autoDrillPracticeSession}
                    onRatingsSaved={handleAutoDrillRatingsSaved}
                    breadcrumbRootLabel="Auto Drill"
                    segmentPrerollMs={AUTO_DRILL_PREROLL_MS}
                    collapseLyricLineBreaks={collapseLyricLineBreaks}
                    playScope="segment"
                    autoPlayToken={autoDrillPlayToken}
                    reducedControls={practiceMode === 'auto-drill'}
                    ratingKeysEnabled={autoDrillState === 'awaiting-rating'}
                    onSegmentPlaybackComplete={handleAutoDrillPlaybackComplete}
                    onRatingSubmitted={handleAutoDrillRatingSubmitted}
                    onAutoPlayBlocked={setAutoDrillPlaybackWarning}
                    canUsePrevSegment={false}
                    canUseNextSegment={false}
                  />
                </div>
              ) : null}
            </>
          )}
        </div>
      )}

      {mode === 'listen' && currentSong && (
        <div className="space-y-4">
          <div className="text-center">
            <h3 className="text-2xl font-semibold">{currentSong.title}</h3>
            {currentSong.artist && <p className="text-gray-600">{currentSong.artist}</p>}
            <p className="text-sm text-gray-500">{currentSongIndex + 1} of {listenQueue.length}</p>
          </div>
          <div className="flex justify-center gap-4">
            <button
              type="button"
              aria-label="Previous song"
              onClick={handlePrevSong}
              disabled={currentSongIndex === 0}
              className="flex h-12 w-12 items-center justify-center rounded-full border border-indigo-300 bg-white text-indigo-700 hover:bg-indigo-50 disabled:opacity-30"
            >
              <svg viewBox="0 0 24 24" className="h-6 w-6" fill="none" stroke="currentColor" strokeWidth="2">
                <path d="M15 18l-6-6 6-6" />
              </svg>
            </button>
            <button
              type="button"
              aria-label={audioPlayer.isPlaying || isListenPlaying ? "Pause playlist" : "Play playlist"}
              onClick={handleListenPlayPause}
              className="flex h-12 w-12 items-center justify-center rounded-full bg-indigo-600 text-white hover:bg-indigo-700"
            >
              {audioPlayer.isPlaying || isListenPlaying ? (
                <svg viewBox="0 0 24 24" className="h-6 w-6" fill="none" stroke="currentColor" strokeWidth="2">
                  <path d="M6 4h4v16H6zM14 4h4v16h-4z" />
                </svg>
              ) : (
                <svg viewBox="0 0 24 24" className="h-6 w-6" fill="none" stroke="currentColor" strokeWidth="2">
                  <path d="M5 3l14 9-14 9V3z" />
                </svg>
              )}
            </button>
            <button
              type="button"
              aria-label="Next song"
              onClick={handleNextSong}
              disabled={currentSongIndex === listenQueue.length - 1}
              className="flex h-12 w-12 items-center justify-center rounded-full border border-indigo-300 bg-white text-indigo-700 hover:bg-indigo-50 disabled:opacity-30"
            >
              <svg viewBox="0 0 24 24" className="h-6 w-6" fill="none" stroke="currentColor" strokeWidth="2">
                <path d="M9 18l6-6-6-6" />
              </svg>
            </button>
          </div>
          <div className="mx-auto max-w-md">
            <div className="relative">
              <input
                type="range"
                min="0"
                max={audioPlayer.durationMs}
                value={audioPlayer.currentMs}
                onChange={(e) => audioPlayer.seek(Number(e.target.value))}
                className="w-full"
              />
              <div className="flex justify-between text-sm text-gray-500 mt-1">
                <span>{formatMs(audioPlayer.currentMs)}</span>
                <span>{formatMs(audioPlayer.durationMs)}</span>
              </div>
            </div>
          </div>
        </div>
      )}

      {mode === 'listen' && !currentSong && (
        <div className="rounded border border-amber-200 bg-amber-50 px-4 py-3 text-sm text-amber-800">
          This playlist does not have any songs yet.
        </div>
      )}
    </section>
  );
}
