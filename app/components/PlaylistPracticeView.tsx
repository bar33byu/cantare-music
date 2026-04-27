"use client";

import { useCallback, useEffect, useMemo, useRef, useState } from 'react';
import type { Playlist } from '../types';
import { getMasteryColor } from '../lib/masteryColors';
import { buildProxyAudioUrl, parseAudioKey, toPlayableAudioUrl } from '../lib/audioUrls';
import { SongReadinessIcons } from './SongReadinessIcons';
import { useAudioPlayer } from '../hooks/useAudioPlayer';

type SortKey = 'alphabetical' | 'date-added' | 'date-practiced' | 'memory-score';
interface SortState { key: SortKey; asc: boolean }
const SORT_STORAGE_KEY = 'playlist-practice-sort';
const DEFAULT_SORT: SortState = { key: 'date-practiced', asc: false };

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
  onExit: () => void;
  onManage?: () => void;
  onSelectSong: (song: Playlist["songs"][number]) => void;
}

const PLAYLIST_PRACTICE_CACHE_NAME = 'cantare-playlist-practice-v1';

export function PlaylistPracticeView({ playlist, userId, onExit, onManage, onSelectSong }: PlaylistPracticeViewProps) {
  const [livePlaylist, setLivePlaylist] = useState(playlist);
  const [playlistScore, setPlaylistScore] = useState(0);
  const [sort, setSort] = useState<SortState>(DEFAULT_SORT);
  const [showSortMenu, setShowSortMenu] = useState(false);
  const [refetchTrigger, setRefetchTrigger] = useState(0);
  const [mode, setMode] = useState<'practice' | 'listen'>('practice');
  const [currentSongIndex, setCurrentSongIndex] = useState(0);
  const [useProxyFallback, setUseProxyFallback] = useState(false);
  const autoPlaySongIdRef = useRef<string | null>(null);
  const pendingFallbackPlayRangeRef = useRef<{ startMs: number; endMs: number } | null>(null);

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

  const currentSong = displayedSongs[currentSongIndex];
  const proxyAudioUrl = useMemo(
    () => buildProxyAudioUrl(parseAudioKey(currentSong?.audioUrl ?? '')),
    [currentSong?.audioUrl]
  );
  const directPlaybackAudioUrl = useMemo(
    () => toPlayableAudioUrl(currentSong?.audioUrl ?? ''),
    [currentSong?.audioUrl]
  );
  const canFallbackToProxy = proxyAudioUrl !== null && proxyAudioUrl !== directPlaybackAudioUrl;
  const playbackAudioUrl = useMemo(() => {
    if (useProxyFallback && canFallbackToProxy && proxyAudioUrl) {
      return proxyAudioUrl;
    }
    return directPlaybackAudioUrl;
  }, [canFallbackToProxy, directPlaybackAudioUrl, proxyAudioUrl, useProxyFallback]);
  const audioPlayer = useAudioPlayer(playbackAudioUrl);
  const requestPlay = useCallback((startMs: number, endMs: number) => {
    pendingFallbackPlayRangeRef.current = !useProxyFallback && canFallbackToProxy
      ? { startMs, endMs }
      : null;
    audioPlayer.play(startMs, endMs);
  }, [audioPlayer.play, canFallbackToProxy, useProxyFallback]);

  useEffect(() => {
    setUseProxyFallback(false);
    pendingFallbackPlayRangeRef.current = null;
  }, [currentSong?.id]);

  useEffect(() => {
    if (!audioPlayer.playbackError || useProxyFallback || !canFallbackToProxy) {
      return;
    }
    setUseProxyFallback(true);
  }, [audioPlayer.playbackError, canFallbackToProxy, useProxyFallback]);

  useEffect(() => {
    if (!useProxyFallback) {
      return;
    }

    const pendingRange = pendingFallbackPlayRangeRef.current;
    if (!pendingRange) {
      return;
    }

    pendingFallbackPlayRangeRef.current = null;
    audioPlayer.play(pendingRange.startMs, pendingRange.endMs);
  }, [audioPlayer.play, useProxyFallback]);

  useEffect(() => {
    if (mode !== 'listen' || !currentSong) {
      autoPlaySongIdRef.current = null;
      return;
    }

    if (autoPlaySongIdRef.current === currentSong.id) {
      return;
    }

    autoPlaySongIdRef.current = currentSong.id;
    requestPlay(0, 0);
  }, [mode, currentSong?.id, requestPlay]);

  useEffect(() => {
    if (
      mode !== 'listen' ||
      audioPlayer.durationMs <= 0 ||
      currentSongIndex >= displayedSongs.length - 1
    ) {
      return;
    }

    if (audioPlayer.currentMs >= audioPlayer.durationMs - 1000) {
      setCurrentSongIndex((prev) => Math.min(prev + 1, displayedSongs.length - 1));
    }
  }, [mode, audioPlayer.currentMs, audioPlayer.durationMs, currentSongIndex, displayedSongs.length]);

  const handleNextSong = () => {
    if (currentSongIndex < displayedSongs.length - 1) {
      setCurrentSongIndex(prev => prev + 1);
    }
  };

  const handlePrevSong = () => {
    if (currentSongIndex > 0) {
      setCurrentSongIndex(prev => prev - 1);
    }
  };

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
    } catch { /* ignore */ }
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
        const cache = await window.caches.open(PLAYLIST_PRACTICE_CACHE_NAME);

        await Promise.allSettled(
          livePlaylist.songs.map(async (song) => {
            const origin = typeof window !== 'undefined' ? window.location.origin : 'http://localhost';
            const songRequest = new Request(new URL(`/api/songs/${song.id}`, origin), {
              headers: userScopedHeaders,
            });
            const songResponse = await fetch(songRequest, { cache: 'force-cache' });
            if (songResponse.ok) {
              await cache.put(songRequest, songResponse.clone());
            }

            const proxyAudioUrl = buildProxyAudioUrl(parseAudioKey(song.audioUrl));
            if (!proxyAudioUrl) {
              return;
            }

            const audioRequest = new Request(proxyAudioUrl);
            const audioResponse = await fetch(audioRequest, { cache: 'force-cache' });
            if (audioResponse.ok) {
              await cache.put(audioRequest, audioResponse.clone());
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
          <button
            type="button"
            onClick={() => setMode(mode === 'practice' ? 'listen' : 'practice')}
            className="flex h-10 items-center gap-2 rounded border border-indigo-300 px-3 text-indigo-700 hover:bg-indigo-50"
          >
            {mode === 'practice' ? '🎧 Listen' : '🎼 Practice'}
          </button>
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
              const hasTapKeys = song.segments.some((segment) => (segment.pitchContourNotes?.length ?? 0) > 0);
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

      {mode === 'listen' && currentSong && (
        <div className="space-y-4">
          <div className="text-center">
            <h3 className="text-2xl font-semibold">{currentSong.title}</h3>
            {currentSong.artist && <p className="text-gray-600">{currentSong.artist}</p>}
            <p className="text-sm text-gray-500">{currentSongIndex + 1} of {displayedSongs.length}</p>
          </div>
          <div className="flex justify-center gap-4">
            <button
              onClick={handlePrevSong}
              disabled={currentSongIndex === 0}
              className="flex h-12 w-12 items-center justify-center rounded-full border border-indigo-300 bg-white text-indigo-700 hover:bg-indigo-50 disabled:opacity-30"
            >
              <svg viewBox="0 0 24 24" className="h-6 w-6" fill="none" stroke="currentColor" strokeWidth="2">
                <path d="M15 18l-6-6 6-6" />
              </svg>
            </button>
            <button
              onClick={() => audioPlayer.isPlaying ? audioPlayer.pause() : requestPlay(0, audioPlayer.durationMs)}
              className="flex h-12 w-12 items-center justify-center rounded-full bg-indigo-600 text-white hover:bg-indigo-700"
            >
              {audioPlayer.isPlaying ? (
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
              onClick={handleNextSong}
              disabled={currentSongIndex === displayedSongs.length - 1}
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
    </section>
  );
}
