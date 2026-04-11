"use client";

import { useEffect, useMemo, useState } from 'react';
import type { Playlist } from '../types';
import { getMasteryColor } from '../lib/masteryColors';
import { buildProxyAudioUrl, parseAudioKey } from '../lib/audioUrls';

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

interface PlaylistPracticeViewProps {
  playlist: Playlist;
  onExit: () => void;
  onManage?: () => void;
  onSelectSong: (songId: string) => void;
}

export function PlaylistPracticeView({ playlist, onExit, onManage, onSelectSong }: PlaylistPracticeViewProps) {
  const [playlistScore, setPlaylistScore] = useState(0);
  const [sort, setSort] = useState<SortState>(DEFAULT_SORT);
  const [showSortMenu, setShowSortMenu] = useState(false);

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
        const res = await fetch(`/api/playlists/${playlist.id}/knowledge`);
        if (res.ok) {
          const data = (await res.json()) as { score?: number };
          setPlaylistScore(Math.min(Math.round(data.score ?? 0), 100));
        }
      } catch { /* ignore */ }
    };
    void load();
  }, [playlist.id]);

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
        const cache = await window.caches.open('cantare-playlist-practice-v1');

        await Promise.allSettled(
          playlist.songs.map(async (song) => {
            const songRequest = new Request(`/api/songs/${song.id}`);
            const songResponse = await fetch(songRequest, { cache: 'reload' });
            if (songResponse.ok) {
              await cache.put(songRequest, songResponse.clone());
            }

            const proxyAudioUrl = buildProxyAudioUrl(parseAudioKey(song.audioUrl));
            if (!proxyAudioUrl) {
              return;
            }

            const audioRequest = new Request(proxyAudioUrl);
            const audioResponse = await fetch(audioRequest, { cache: 'reload' });
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
  }, [playlist.songs]);

  const displayedSongs = useMemo(() => {
    const dir = sort.asc ? 1 : -1;
    return [...playlist.songs].sort((a, b) => {
      switch (sort.key) {
        case 'alphabetical':
          return dir * a.title.localeCompare(b.title);
        case 'date-added':
          return dir * (a.createdAt ?? '').localeCompare(b.createdAt ?? '');
        case 'date-practiced': {
          const aTime = a.lastPracticedAt ?? '';
          const bTime = b.lastPracticedAt ?? '';
          if (!aTime && !bTime) return 0;
          if (!aTime) return 1;
          if (!bTime) return -1;
          return dir * aTime.localeCompare(bTime);
        }
        case 'memory-score':
          return dir * ((a.masteryPercent ?? 0) - (b.masteryPercent ?? 0));
        default:
          return 0;
      }
    });
  }, [playlist.songs, sort]);

  if (playlist.songs.length === 0) {
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
              <span className="text-gray-900">{playlist.name}</span>
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
            <span className="text-gray-900">{playlist.name}</span>
          </div>
          <h2 className="text-2xl font-bold">{playlist.name}</h2>
          <p data-testid="playlist-practice-score" className="text-sm font-medium text-indigo-700">
            Playlist Knowledge: {playlistScore}%
          </p>
        </div>
        <div className="flex gap-2">
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
          const readinessNotes: string[] = [];
          if (!hasAudio) {
            readinessNotes.push('Missing audio');
          }
          if (!hasSegments) {
            readinessNotes.push('Missing segments');
          }
          return (
            <div
              key={song.id}
              data-testid={`playlist-practice-song-${song.id}`}
              className="relative bg-white p-6 pt-10 rounded-lg shadow hover:shadow-md transition-shadow cursor-pointer border-2 border-transparent"
              onClick={() => onSelectSong(song.id)}
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
              {readinessNotes.length > 0 ? (
                <div data-testid={`playlist-practice-song-status-${song.id}`} className="mb-2 flex flex-wrap gap-1">
                  {readinessNotes.map((note) => (
                    <span
                      key={`${song.id}-${note}`}
                      className="inline-flex items-center rounded-full bg-amber-50 px-2 py-0.5 text-xs font-medium text-amber-800"
                    >
                      {note}
                    </span>
                  ))}
                </div>
              ) : null}
              <p className="text-xs text-gray-500 mt-2">{getLastPracticedLabel(song.lastPracticedAt)}</p>
            </div>
          );
        })}
      </div>
    </section>
  );
}
