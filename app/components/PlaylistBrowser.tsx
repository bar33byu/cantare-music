"use client";

import { useCallback, useEffect, useRef, useState } from 'react';
import { buildUserScopedCacheKey, readCachedJson, writeCachedJson } from '../lib/localJsonCache';
import type { Playlist } from '../types';

type PlaylistListItem = {
  id: string;
  name: string;
  eventDate?: string;
  isRetired: boolean;
  isPublic?: boolean;
  publishedAt?: string | null;
  shareToken?: string | null;
  sharedAt?: string | null;
  createdAt: string;
  songCount: number;
  knowledgePercent?: number;
  healthStats?: PlaylistHealthStats;
  songs?: Playlist['songs'];
};

type PlaylistHealthStats = {
  songsWithPartAudio: number;
  songsWithBlendAudio: number;
  songsWithSegments: number;
  songsWithMidiContour: number;
};

type CachedPlaylistListPayload = {
  playlists: PlaylistListItem[];
  knowledgeByPlaylist: Record<string, number>;
  statsByPlaylist: Record<string, PlaylistHealthStats>;
};

const EMPTY_PLAYLIST_STATS: PlaylistHealthStats = {
  songsWithPartAudio: 0,
  songsWithBlendAudio: 0,
  songsWithSegments: 0,
  songsWithMidiContour: 0,
};

function PublicSharedIcon() {
  return (
    <svg
      aria-hidden="true"
      viewBox="0 0 24 24"
      fill="none"
      stroke="currentColor"
      strokeWidth="2"
      strokeLinecap="round"
      strokeLinejoin="round"
      className="h-3.5 w-3.5"
    >
      <circle cx="12" cy="12" r="10" />
      <path d="M2 12h20" />
      <path d="M12 2a15.3 15.3 0 0 1 0 20" />
      <path d="M12 2a15.3 15.3 0 0 0 0 20" />
    </svg>
  );
}

function UrlSharedIcon() {
  return (
    <svg
      aria-hidden="true"
      viewBox="0 0 24 24"
      fill="none"
      stroke="currentColor"
      strokeWidth="2"
      strokeLinecap="round"
      strokeLinejoin="round"
      className="h-3.5 w-3.5"
    >
      <path d="M10 13a5 5 0 0 0 7.54.54l3-3a5 5 0 0 0-7.07-7.07l-1.72 1.71" />
      <path d="M14 11a5 5 0 0 0-7.54-.54l-3 3a5 5 0 0 0 7.07 7.07l1.71-1.71" />
    </svg>
  );
}

interface PlaylistBrowserProps {
  onSelectPlaylist: (playlist: Playlist) => void;
  onManagePlaylist: (playlist: Playlist) => void;
  userId?: string;
  refreshTrigger?: number;
}

export function PlaylistBrowser({ onSelectPlaylist, onManagePlaylist, userId, refreshTrigger }: PlaylistBrowserProps) {
  const [playlists, setPlaylists] = useState<PlaylistListItem[]>([]);
  const [knowledgeByPlaylist, setKnowledgeByPlaylist] = useState<Record<string, number>>({});
  const [statsByPlaylist, setStatsByPlaylist] = useState<Record<string, PlaylistHealthStats>>({});
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [showArchived, setShowArchived] = useState(false);
  const [showCreate, setShowCreate] = useState(false);
  const [createName, setCreateName] = useState('');
  const [deleteConfirmId, setDeleteConfirmId] = useState<string | null>(null);
  const [openActionsId, setOpenActionsId] = useState<string | null>(null);
  const [refetchTrigger, setRefetchTrigger] = useState(0);
  const latestFetchIdRef = useRef(0);
  const fetchControllerRef = useRef<AbortController | null>(null);

  const withUserHeader = useCallback((init?: RequestInit): RequestInit | undefined => {
    const scopedInit: RequestInit = {
      ...init,
      cache: 'no-store',
      headers: {
        ...(init?.headers ?? {}),
      },
    };

    if (userId) {
      const headers = new Headers(scopedInit.headers);
      headers.set('X-User-ID', userId);
      scopedInit.headers = headers;
    }

    return scopedInit;
  }, [userId]);

  const request = useCallback((url: string, init?: RequestInit) => {
    const scopedInit = withUserHeader(init);
    return scopedInit ? fetch(url, scopedInit) : fetch(url);
  }, [withUserHeader]);

  const fetchPlaylists = useCallback(async (includeRetired: boolean) => {
    const fetchId = latestFetchIdRef.current + 1;
    latestFetchIdRef.current = fetchId;
    fetchControllerRef.current?.abort();
    const controller = new AbortController();
    fetchControllerRef.current = controller;
    const cacheKey = buildUserScopedCacheKey('playlists', userId, includeRetired ? 'retired' : 'active');
    const cached = readCachedJson<CachedPlaylistListPayload>(cacheKey);
    const hasCachedPlaylists = cached !== null && Array.isArray(cached.value.playlists);
    if (cached && hasCachedPlaylists) {
      setPlaylists(cached.value.playlists);
      setKnowledgeByPlaylist(cached.value.knowledgeByPlaylist ?? {});
      setStatsByPlaylist(cached.value.statsByPlaylist ?? {});
      setLoading(false);
      setError(null);
    }

    setLoading(!hasCachedPlaylists);
    setError(null);
    try {
      const query = includeRetired ? '?includeRetired=true' : '';
      const response = await request(`/api/playlists${query}`, { signal: controller.signal });
      if (!response.ok) {
        throw new Error('Failed to load playlists');
      }
      const data = (await response.json()) as { playlists?: PlaylistListItem[] };
      const list = Array.isArray(data.playlists) ? data.playlists : [];
      if (latestFetchIdRef.current !== fetchId) {
        return;
      }
      setPlaylists(list);
      const knowledge = Object.fromEntries(list.map((playlist) => [playlist.id, Math.min(Math.round(playlist.knowledgePercent ?? 0), 100)]));
      const stats = Object.fromEntries(list.map((playlist) => [playlist.id, playlist.healthStats ?? EMPTY_PLAYLIST_STATS]));
      setKnowledgeByPlaylist(knowledge);
      setStatsByPlaylist(stats);
      writeCachedJson(cacheKey, { playlists: list, knowledgeByPlaylist: knowledge, statsByPlaylist: stats });
    } catch (error) {
      if (error instanceof DOMException && error.name === 'AbortError') {
        return;
      }
      if (latestFetchIdRef.current !== fetchId) {
        return;
      }
      if (!hasCachedPlaylists) {
        setError('Unable to load playlists right now.');
        setPlaylists([]);
        setKnowledgeByPlaylist({});
        setStatsByPlaylist({});
      }
    } finally {
      if (latestFetchIdRef.current === fetchId) {
        setLoading(false);
      }
    }
  }, [request, userId]);

  useEffect(() => {
    void fetchPlaylists(showArchived);
  }, [fetchPlaylists, showArchived, refreshTrigger, userId, refetchTrigger]);

  useEffect(() => {
    return () => {
      fetchControllerRef.current?.abort();
    };
  }, []);

  useEffect(() => {
    const handleRatingsUpdated = () => {
      setRefetchTrigger(prev => prev + 1);
    };
    window.addEventListener('ratingsUpdated', handleRatingsUpdated);
    return () => {
      window.removeEventListener('ratingsUpdated', handleRatingsUpdated);
    };
  }, []);

  const handleCreate = async () => {
    if (!createName.trim()) {
      setError('Playlist name is required.');
      return;
    }

    const response = await request('/api/playlists', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({
        name: createName.trim(),
      }),
    });

    if (!response.ok) {
      setError('Unable to create playlist right now.');
      return;
    }

    const createdPlaylist = (await response.json()) as PlaylistListItem;

    setCreateName('');
    setShowCreate(false);
    onManagePlaylist({ ...createdPlaylist, songs: [] } as Playlist);
  };

  const handleRetireToggle = async (playlist: PlaylistListItem, isRetired: boolean) => {
    const response = await request(`/api/playlists/${playlist.id}`, {
      method: 'PATCH',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ isRetired }),
    });

    if (!response.ok) {
      setError('Unable to update playlist status right now.');
      return;
    }

    await fetchPlaylists(showArchived);
  };

  const handleDelete = async (playlistId: string) => {
    const response = await request(`/api/playlists/${playlistId}`, {
      method: 'DELETE',
    });

    if (!response.ok) {
      setError('Unable to delete playlist right now.');
      return;
    }

    setDeleteConfirmId(null);
    await fetchPlaylists(showArchived);
  };

  return (
    <section data-testid="playlist-browser" className="space-y-4">
      <div className="flex flex-wrap items-center gap-3">
        <button
          data-testid="new-playlist-button"
          className="rounded bg-indigo-600 px-4 py-2 text-white"
          onClick={() => setShowCreate((v) => !v)}
        >
          New Playlist
        </button>
        <button
          data-testid="toggle-archived-button"
          className="rounded border border-indigo-300 px-4 py-2 text-indigo-700"
          onClick={() => setShowArchived((v) => !v)}
        >
          {showArchived ? 'Hide Archived' : 'Show Archived'}
        </button>
      </div>

      {showCreate ? (
        <div data-testid="new-playlist-form" className="rounded border border-gray-200 bg-white p-4">
          <div>
            <input
              data-testid="new-playlist-name"
              value={createName}
              onChange={(event) => setCreateName(event.target.value)}
              placeholder="Playlist name"
              className="rounded border border-gray-300 px-3 py-2"
            />
          </div>
          <div className="mt-3 flex gap-2">
            <button data-testid="create-playlist-submit" className="rounded bg-indigo-600 px-3 py-2 text-white" onClick={() => void handleCreate()}>
              Create
            </button>
            <button data-testid="create-playlist-cancel" className="rounded border border-gray-300 px-3 py-2" onClick={() => setShowCreate(false)}>
              Cancel
            </button>
          </div>
        </div>
      ) : null}

      {error ? (
        <div data-testid="playlist-error" className="rounded border border-red-200 bg-red-50 px-4 py-3 text-red-700">
          <div className="flex items-center justify-between gap-3">
            <span>{error}</span>
            <button data-testid="dismiss-error" onClick={() => setError(null)} className="text-sm underline">Dismiss</button>
          </div>
        </div>
      ) : null}

      {loading ? (
        <div data-testid="playlist-loading" className="space-y-2">
          <div className="h-12 animate-pulse rounded bg-gray-200" />
          <div className="h-12 animate-pulse rounded bg-gray-200" />
          <div className="h-12 animate-pulse rounded bg-gray-200" />
        </div>
      ) : (
        <div data-testid="playlist-list" className="space-y-3">
          {playlists.map((playlist) => {
            const retiredClass = playlist.isRetired ? 'text-gray-500 italic' : '';
            const playlistPayload = { ...playlist, songs: playlist.songs ?? [] } as Playlist;
            const knowledgePercent = Math.min(knowledgeByPlaylist[playlist.id] ?? 0, 100);
            const stats = statsByPlaylist[playlist.id] ?? EMPTY_PLAYLIST_STATS;
            const totalSongs = Math.max(playlist.songCount ?? 0, 0);
            const isPublicShared = Boolean(playlist.isPublic);
            const isUrlShared = Boolean(playlist.shareToken);
            return (
              <article
                key={playlist.id}
                data-testid={`playlist-row-${playlist.id}`}
                className={`rounded border border-gray-200 p-4 transition hover:border-indigo-300 ${retiredClass}`}
                style={{
                  backgroundImage: `linear-gradient(90deg, rgba(79, 70, 229, 0.15) 0%, rgba(79, 70, 229, 0.15) ${knowledgePercent}%, rgba(255, 255, 255, 1) ${knowledgePercent}%, rgba(255, 255, 255, 1) 100%)`,
                }}
              >
                <div className="flex flex-wrap items-center justify-between gap-3">
                  <button
                    type="button"
                    data-testid={`playlist-open-${playlist.id}`}
                    className="min-w-0 flex-1 text-left"
                    onClick={() => onSelectPlaylist(playlistPayload)}
                  >
                    <div className="flex flex-wrap items-center gap-2">
                      <h3 className="font-semibold" data-testid={`playlist-name-${playlist.id}`}>{playlist.name}</h3>
                      {isPublicShared ? (
                        <span
                          data-testid={`playlist-public-shared-${playlist.id}`}
                          title="Published in Shared for logged-in users"
                          aria-label="Published in Shared for logged-in users"
                          className="inline-flex items-center gap-1 rounded-full border border-emerald-200 bg-emerald-50 px-2 py-0.5 text-[11px] font-semibold text-emerald-800"
                        >
                          <PublicSharedIcon />
                          Shared
                        </span>
                      ) : null}
                      {isUrlShared ? (
                        <span
                          data-testid={`playlist-url-shared-${playlist.id}`}
                          title="Shared by URL"
                          aria-label="Shared by URL"
                          className="inline-flex items-center gap-1 rounded-full border border-sky-200 bg-sky-50 px-2 py-0.5 text-[11px] font-semibold text-sky-800"
                        >
                          <UrlSharedIcon />
                          URL
                        </span>
                      ) : null}
                    </div>
                    {playlist.eventDate ? <p className="text-sm text-gray-500">{new Date(playlist.eventDate).toLocaleDateString()}</p> : null}
                    <p className="text-xs text-gray-500">Songs: {totalSongs}</p>
                    <p className="text-sm font-semibold text-indigo-800" data-testid={`playlist-knowledge-${playlist.id}`}>
                      Knowledge: {knowledgePercent}%
                    </p>
                    <div className="mt-2 hidden grid-cols-4 gap-2 text-[11px] text-indigo-900 lg:grid" data-testid={`playlist-health-${playlist.id}`}>
                      <span className="rounded border border-indigo-200/70 bg-white/70 px-2 py-1">
                        Part audio {stats.songsWithPartAudio}/{totalSongs}
                      </span>
                      <span className="rounded border border-indigo-200/70 bg-white/70 px-2 py-1">
                        Blend audio {stats.songsWithBlendAudio}/{totalSongs}
                      </span>
                      <span className="rounded border border-indigo-200/70 bg-white/70 px-2 py-1">
                        Sections {stats.songsWithSegments}/{totalSongs}
                      </span>
                      <span className="rounded border border-indigo-200/70 bg-white/70 px-2 py-1">
                        MIDI contour {stats.songsWithMidiContour}/{totalSongs}
                      </span>
                    </div>
                  </button>

                  <div className="relative">
                    <div className="mb-1 text-right text-2xl font-bold leading-none text-indigo-800" aria-hidden="true">
                      {knowledgePercent}%
                    </div>
                    <button
                      type="button"
                      data-testid={`playlist-actions-${playlist.id}`}
                      className="rounded border border-gray-300 px-3 py-1 text-gray-700 hover:bg-gray-50"
                      aria-label={`Playlist actions for ${playlist.name}`}
                      onClick={(event) => {
                        event.stopPropagation();
                        setOpenActionsId((previous) => (previous === playlist.id ? null : playlist.id));
                      }}
                    >
                      •••
                    </button>

                    {openActionsId === playlist.id ? (
                      <div
                        data-testid={`playlist-actions-menu-${playlist.id}`}
                        className="absolute right-0 z-10 mt-2 min-w-[140px] rounded border border-gray-200 bg-white p-1 shadow-lg"
                      >
                        <button
                          data-testid={`playlist-manage-${playlist.id}`}
                          className="block w-full rounded px-3 py-2 text-left text-sm text-indigo-700 hover:bg-indigo-50"
                          onClick={() => {
                            setOpenActionsId(null);
                            onManagePlaylist(playlistPayload);
                          }}
                        >
                          Edit Playlist
                        </button>
                        <button
                          data-testid={`playlist-retire-${playlist.id}`}
                          className="block w-full rounded px-3 py-2 text-left text-sm text-amber-700 hover:bg-amber-50"
                          onClick={() => {
                            setOpenActionsId(null);
                            void handleRetireToggle(playlist, !playlist.isRetired);
                          }}
                        >
                          {playlist.isRetired ? 'Un-retire' : 'Retire'}
                        </button>
                        <button
                          data-testid={`playlist-delete-${playlist.id}`}
                          className="block w-full rounded px-3 py-2 text-left text-sm text-red-700 hover:bg-red-50"
                          onClick={() => {
                            setOpenActionsId(null);
                            setDeleteConfirmId(playlist.id);
                          }}
                        >
                          Delete
                        </button>
                      </div>
                    ) : null}
                  </div>
                </div>

                {deleteConfirmId === playlist.id ? (
                  <div data-testid={`playlist-delete-confirm-${playlist.id}`} className="mt-3 rounded border border-red-200 bg-red-50 p-3 text-sm">
                    <p>Delete this playlist? Songs will not be deleted.</p>
                    <div className="mt-2 flex gap-2">
                      <button data-testid={`playlist-delete-confirm-yes-${playlist.id}`} className="rounded bg-red-600 px-3 py-1 text-white" onClick={() => void handleDelete(playlist.id)}>Confirm</button>
                      <button data-testid={`playlist-delete-confirm-no-${playlist.id}`} className="rounded border border-gray-300 px-3 py-1" onClick={() => setDeleteConfirmId(null)}>Cancel</button>
                    </div>
                  </div>
                ) : null}
              </article>
            );
          })}
        </div>
      )}
    </section>
  );
}
