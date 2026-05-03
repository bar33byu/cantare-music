"use client";

import { useState, useEffect, useMemo } from 'react';
import { getMasteryColor } from '../lib/masteryColors';
import { SongReadinessIcons } from './SongReadinessIcons';

interface SongListItem {
  id: string;
  title: string;
  artist?: string;
  audioKey?: string;
  createdAt: string;
  lastPracticedAt?: string | null;
  masteryPercent?: number;
  hasAudio?: boolean;
  hasSegments?: boolean;
  hasTapKeys?: boolean;
}

interface SongBrowserProps {
  onSelectSong: (song: SongListItem) => void;
  onDeleteSong?: (songId: string) => void;
  selectedSongId?: string | null;
  refreshTrigger?: number; // Increment this to trigger refresh
  userId?: string;
}

export function SongBrowser({ onSelectSong, onDeleteSong, selectedSongId, refreshTrigger, userId }: SongBrowserProps) {
  const [songs, setSongs] = useState<SongListItem[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [warning, setWarning] = useState<string | null>(null);
  const [deletingSongId, setDeletingSongId] = useState<string | null>(null);
  const [isEditMode, setIsEditMode] = useState(false);
  const [filterText, setFilterText] = useState('');
  const [showFilter, setShowFilter] = useState(false);

  type SortKey = 'alphabetical' | 'date-added' | 'date-practiced' | 'memory-score';
  interface SortState { key: SortKey; asc: boolean }
  const SORT_STORAGE_KEY = 'song-browser-sort';
  const DEFAULT_SORT: SortState = { key: 'date-practiced', asc: false };

  const [sort, setSort] = useState<SortState>(DEFAULT_SORT);
  const [showSortMenu, setShowSortMenu] = useState(false);

  const withUserHeader = (init?: RequestInit): RequestInit | undefined => {
    if (!userId) {
      return init;
    }

    return {
      ...init,
      headers: {
        ...(init?.headers ?? {}),
        'X-User-ID': userId,
      },
    };
  };

  // Load persisted sort from localStorage on mount
  useEffect(() => {
    try {
      const raw = localStorage.getItem(SORT_STORAGE_KEY);
      if (raw) {
        const parsed = JSON.parse(raw) as unknown;
        if (
          parsed !== null &&
          typeof parsed === 'object' &&
          'key' in parsed &&
          'asc' in parsed &&
          ['alphabetical', 'date-added', 'date-practiced'].includes((parsed as SortState).key) &&
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

  // Per-key labels for the compact button and menu items
  const sortKeyLabel: Record<SortKey, string> = {
    alphabetical: 'Alphabetical',
    'date-added': 'Date Added',
    'date-practiced': 'Last Practiced',
    'memory-score': 'Memory Score',
  };

  // Directional labels: index 0 = descending, index 1 = ascending
  const sortDirLabel: Record<SortKey, [string, string]> = {
    alphabetical: ['Z–A', 'A–Z'],
    'date-added':   ['Newest', 'Oldest'],
    'date-practiced': ['Recent', 'Longest ago'],
    'memory-score': ['Highest', 'Lowest'],
  };

  // Default direction when switching to a new key: asc for alpha, desc for everything else
  const defaultAscForKey = (key: SortKey) => key === 'alphabetical';

  const displayedSongs = useMemo(() => {
    let result = songs;
    if (filterText.trim()) {
      const lower = filterText.toLowerCase();
      result = result.filter((s) => s.title.toLowerCase().includes(lower));
    }
    const dir = sort.asc ? 1 : -1;
    return [...result].sort((a, b) => {
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
        case 'memory-score': {
          const aScore = a.masteryPercent ?? 0;
          const bScore = b.masteryPercent ?? 0;
          return dir * (aScore - bScore);
        }
        default:
          return 0;
      }
    });
  }, [songs, filterText, sort]);

  useEffect(() => {
    fetchSongs();
  }, [refreshTrigger, userId]);

  const fetchSongs = async () => {
    try {
      setLoading(true);
      setError(null);
      const cacheVersion = refreshTrigger ?? 0;
      const response = await fetch(`/api/songs?v=${cacheVersion}`, withUserHeader());
      if (!response.ok) {
        const serverError = await response
          .json()
          .catch(() => ({ error: response.statusText || 'Unknown error' }));
        console.error('Song fetch failed', response.status, serverError);
        setSongs([]);
        setError('Unable to load song list right now.');
        return;
      }
      const data = await response.json();
      setSongs(data);
    } catch (err) {
      console.error('Song fetch error', err);
      setSongs([]);
      setError('Unable to load song list right now.');
    } finally {
      setLoading(false);
    }
  };

  const handleDeleteSong = async (song: SongListItem) => {
    const shouldDelete = window.confirm(`Delete \"${song.title}\"? This cannot be undone.`);
    if (!shouldDelete) {
      return;
    }

    setDeletingSongId(song.id);
    try {
      const response = await fetch(`/api/songs/${song.id}`, withUserHeader({
        method: 'DELETE',
      }));

      if (!response.ok) {
        const data = await response.json().catch(() => ({ error: 'Failed to delete song' }));
        throw new Error(data.error || 'Failed to delete song');
      }

      const hasAudioCleanupWarning = response.headers?.get?.('x-audio-cleanup-warning') === 'true';
      setWarning(
        hasAudioCleanupWarning
          ? 'Song deleted. Audio file cleanup could not be confirmed.'
          : null
      );

      setSongs((prev) => prev.filter((s) => s.id !== song.id));
      onDeleteSong?.(song.id);
    } catch (err) {
      const message = err instanceof Error ? err.message : 'Failed to delete song';
      setError(message);
    } finally {
      setDeletingSongId(null);
    }
  };

  const getLastPracticedLabel = (value?: string | null): string => {
    if (!value) {
      return 'Not practiced yet';
    }

    const practicedAtMs = Date.parse(value);
    if (Number.isNaN(practicedAtMs)) {
      return 'Not practiced yet';
    }

    const elapsedSeconds = Math.max(0, Math.floor((Date.now() - practicedAtMs) / 1000));

    const units: Array<{ unit: Intl.RelativeTimeFormatUnit; seconds: number }> = [
      { unit: 'year', seconds: 60 * 60 * 24 * 365 },
      { unit: 'month', seconds: 60 * 60 * 24 * 30 },
      { unit: 'week', seconds: 60 * 60 * 24 * 7 },
      { unit: 'day', seconds: 60 * 60 * 24 },
      { unit: 'hour', seconds: 60 * 60 },
      { unit: 'minute', seconds: 60 },
    ];

    const rtf = new Intl.RelativeTimeFormat('en', { numeric: 'always' });
    for (const { unit, seconds } of units) {
      if (elapsedSeconds >= seconds) {
        const amount = Math.floor(elapsedSeconds / seconds);
        return `Last practiced ${rtf.format(-amount, unit)}`;
      }
    }

    return 'Last practiced just now';
  };

  const clampPercent = (value?: number): number => {
    if (typeof value !== 'number' || Number.isNaN(value)) {
      return 0;
    }
    return Math.max(0, Math.min(100, Math.round(value)));
  };

  if (loading) {
    return (
      <div className="text-center py-8" data-testid="song-browser-loading">
        Loading songs...
      </div>
    );
  }

  if (error) {
    return (
      <div className="bg-yellow-100 border border-yellow-400 text-yellow-800 px-4 py-3 rounded mb-4" data-testid="song-browser-error">
        {error}
      </div>
    );
  }

  if (songs.length === 0) {
    return (
      <div className="text-center py-8 text-gray-500" data-testid="song-browser-empty">
        No songs found. Add your first song to get started!
      </div>
    );
  }

  return (
    <div className="space-y-4">
      {warning ? (
        <div
          className="bg-amber-50 border border-amber-300 text-amber-900 px-4 py-3 rounded"
          data-testid="song-browser-warning"
        >
          {warning}
        </div>
      ) : null}

      <div className="flex items-center gap-2">
        <button
          type="button"
          data-testid="song-browser-filter-toggle"
          onClick={() => {
            setShowFilter((prev) => !prev);
            if (showFilter) setFilterText('');
          }}
          title="Filter by title"
          className={`flex items-center gap-1.5 rounded px-2.5 py-1.5 text-sm transition-colors ${
            showFilter ? 'bg-blue-100 text-blue-700' : 'text-gray-500 hover:bg-gray-100'
          }`}
        >
          <svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" className="h-4 w-4">
            <polygon points="22 3 2 3 10 12.46 10 19 14 21 14 12.46 22 3" />
          </svg>
          Filter
        </button>
        {showFilter && (
          <input
            type="text"
            data-testid="song-browser-filter-input"
            value={filterText}
            onChange={(e) => setFilterText(e.target.value)}
            placeholder="Search titles…"
            autoFocus
            className="flex-1 rounded border border-gray-300 px-3 py-1.5 text-sm focus:border-blue-400 focus:outline-none"
          />
        )}
        <div className="relative ml-auto">
          <button
            type="button"
            data-testid="song-browser-sort-toggle"
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
                    data-testid={`song-browser-sort-${key}`}
                    onClick={() => {
                      const newAsc = isActive ? !sort.asc : defaultAscForKey(key);
                      updateSort({ key, asc: newAsc });
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

      <div className="grid gap-4 md:grid-cols-2 lg:grid-cols-3" data-testid="song-browser-grid">
        {displayedSongs.length === 0 && (
          <p className="col-span-full text-center py-8 text-gray-500" data-testid="song-browser-filter-empty">
            No songs match &ldquo;{filterText}&rdquo;.
          </p>
        )}
        {displayedSongs.map((song) => {
          const masteryPercent = clampPercent(song.masteryPercent);
          const masteryColor = getMasteryColor(masteryPercent);
          const hasAudio = song.hasAudio ?? Boolean(song.audioKey?.trim());
          const hasSegments = song.hasSegments ?? false;
          const hasTapKeys = song.hasTapKeys ?? false;

          return (
          <div
            key={song.id}
            className={`relative bg-white p-6 pt-10 rounded-lg shadow hover:shadow-md transition-shadow cursor-pointer border-2 ${
              selectedSongId === song.id ? 'border-blue-500' : 'border-transparent'
            }`}
            onClick={() => onSelectSong(song)}
            data-testid={`song-item-${song.id}`}
          >
            <div className="absolute inset-x-0 top-0 h-6 rounded-t-lg border-b border-black/5 bg-gray-100" data-testid={`song-mastery-track-${song.id}`}>
              <div
                className="h-full rounded-tl-lg"
                data-testid={`song-mastery-fill-${song.id}`}
                style={{ width: `${masteryPercent}%`, backgroundColor: masteryColor }}
              />
            </div>
            <p className="absolute right-2 top-1 text-[11px] font-semibold text-gray-700" data-testid={`song-mastery-percent-${song.id}`}>
              {masteryPercent}%
            </p>
            <h3 className="text-xl font-semibold mb-2" data-testid={`song-title-${song.id}`}>
              {song.title}
            </h3>
            {song.artist && (
              <p className="text-gray-600 mb-2" data-testid={`song-artist-${song.id}`}>
                {song.artist}
              </p>
            )}
            <div className="absolute bottom-3 right-3">
              <SongReadinessIcons
                hasAudio={hasAudio}
                hasSegments={hasSegments}
                hasTapKeys={hasTapKeys}
                testIdPrefix={`song-item-${song.id}`}
              />
            </div>
            <p className="text-xs text-gray-500 mt-2" data-testid={`song-last-practiced-${song.id}`}>
              {getLastPracticedLabel(song.lastPracticedAt)}
            </p>
            {selectedSongId === song.id && (
              <div className="mt-2 text-sm text-blue-600 font-medium" data-testid={`song-selected-${song.id}`}>
                Currently Selected
              </div>
            )}
            {isEditMode ? (
              <div className="mt-4">
                <button
                  type="button"
                  data-testid={`song-delete-${song.id}`}
                  disabled={deletingSongId === song.id}
                  onClick={(event) => {
                    event.stopPropagation();
                    void handleDeleteSong(song);
                  }}
                  className="text-sm text-red-600 hover:text-red-700 disabled:opacity-50"
                >
                  {deletingSongId === song.id ? 'Deleting...' : 'Delete Song'}
                </button>
              </div>
            ) : null}
          </div>
          );
        })}
      </div>

      <button
        type="button"
        data-testid="song-browser-toggle-edit-mode"
        onClick={() => setIsEditMode((previous) => !previous)}
        title={isEditMode ? 'Done Editing' : 'Edit Library'}
        className={`fixed bottom-6 right-6 flex h-12 w-12 items-center justify-center rounded-full shadow-lg transition-colors ${
          isEditMode ? 'bg-gray-700 text-white hover:bg-gray-800' : 'bg-white text-red-600 hover:bg-red-50 border border-red-200'
        }`}
      >
        <svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" className="h-5 w-5">
          <polyline points="3 6 5 6 21 6" />
          <path d="M19 6l-1 14a2 2 0 0 1-2 2H8a2 2 0 0 1-2-2L5 6" />
          <path d="M10 11v6" />
          <path d="M14 11v6" />
          <path d="M9 6V4a1 1 0 0 1 1-1h4a1 1 0 0 1 1 1v2" />
        </svg>
      </button>
    </div>
  );
}