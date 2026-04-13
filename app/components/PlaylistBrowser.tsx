"use client";

import { useEffect, useState } from 'react';
import type { Playlist } from '../types';

type PlaylistListItem = {
  id: string;
  name: string;
  eventDate?: string;
  isRetired: boolean;
  createdAt: string;
  songCount: number;
  songs?: Playlist['songs'];
};

interface PlaylistBrowserProps {
  onSelectPlaylist: (playlist: Playlist) => void;
  onManagePlaylist: (playlist: Playlist) => void;
  userId?: string;
  refreshTrigger?: number;
}

export function PlaylistBrowser({ onSelectPlaylist, onManagePlaylist, userId, refreshTrigger }: PlaylistBrowserProps) {
  const [playlists, setPlaylists] = useState<PlaylistListItem[]>([]);
  const [knowledgeByPlaylist, setKnowledgeByPlaylist] = useState<Record<string, number>>({});
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [showArchived, setShowArchived] = useState(false);
  const [showCreate, setShowCreate] = useState(false);
  const [createName, setCreateName] = useState('');
  const [deleteConfirmId, setDeleteConfirmId] = useState<string | null>(null);
  const [openActionsId, setOpenActionsId] = useState<string | null>(null);

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

  const request = (url: string, init?: RequestInit) => {
    const scopedInit = withUserHeader(init);
    return scopedInit ? fetch(url, scopedInit) : fetch(url);
  };

  const fetchPlaylists = async (includeRetired: boolean) => {
    setLoading(true);
    setError(null);
    try {
      const query = includeRetired ? '?includeRetired=true' : '';
      const response = await request(`/api/playlists${query}`);
      if (!response.ok) {
        throw new Error('Failed to load playlists');
      }
      const data = (await response.json()) as { playlists?: PlaylistListItem[] };
      const list = Array.isArray(data.playlists) ? data.playlists : [];
      setPlaylists(list);

      const knowledgeEntries = await Promise.all(
        list.map(async (playlist) => {
          const knowledgeResponse = await request(`/api/playlists/${playlist.id}/knowledge`);
          if (!knowledgeResponse.ok) {
            return [playlist.id, 0] as const;
          }
          const payload = (await knowledgeResponse.json()) as { score?: number };
          return [playlist.id, Math.min(Math.round(payload.score ?? 0), 100)] as const;
        })
      );
      setKnowledgeByPlaylist(Object.fromEntries(knowledgeEntries));
    } catch {
      setError('Unable to load playlists right now.');
      setPlaylists([]);
      setKnowledgeByPlaylist({});
    } finally {
      setLoading(false);
    }
  };

  useEffect(() => {
    void fetchPlaylists(showArchived);
  }, [showArchived, refreshTrigger, userId]);

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
            return (
              <article
                key={playlist.id}
                data-testid={`playlist-row-${playlist.id}`}
                className={`rounded border border-gray-200 bg-white p-4 transition hover:border-indigo-300 hover:bg-indigo-50/30 ${retiredClass}`}
              >
                <div className="flex flex-wrap items-center justify-between gap-3">
                  <button
                    type="button"
                    data-testid={`playlist-open-${playlist.id}`}
                    className="min-w-0 flex-1 text-left"
                    onClick={() => onSelectPlaylist(playlistPayload)}
                  >
                    <h3 className="font-semibold" data-testid={`playlist-name-${playlist.id}`}>{playlist.name}</h3>
                    {playlist.eventDate ? <p className="text-sm text-gray-500">{new Date(playlist.eventDate).toLocaleDateString()}</p> : null}
                    <p className="text-xs text-gray-500">Songs: {playlist.songCount ?? 0}</p>
                    <p className="text-xs text-indigo-700" data-testid={`playlist-knowledge-${playlist.id}`}>
                      Knowledge: {Math.min(knowledgeByPlaylist[playlist.id] ?? 0, 100)}%
                    </p>
                  </button>

                  <div className="relative">
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
                          Manage
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
