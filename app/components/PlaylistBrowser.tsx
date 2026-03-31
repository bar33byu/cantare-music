"use client";

import { useEffect, useState } from 'react';
import type { Playlist } from '../types';

type PlaylistListItem = Omit<Playlist, 'songs'> & { songs?: Playlist['songs'] };

interface PlaylistBrowserProps {
  onSelectPlaylist: (playlist: Playlist) => void;
  onManagePlaylist: (playlist: Playlist) => void;
}

export function PlaylistBrowser({ onSelectPlaylist, onManagePlaylist }: PlaylistBrowserProps) {
  const [playlists, setPlaylists] = useState<PlaylistListItem[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [showArchived, setShowArchived] = useState(false);
  const [showCreate, setShowCreate] = useState(false);
  const [createName, setCreateName] = useState('');
  const [createEventDate, setCreateEventDate] = useState('');
  const [deleteConfirmId, setDeleteConfirmId] = useState<string | null>(null);

  const fetchPlaylists = async (includeRetired: boolean) => {
    setLoading(true);
    setError(null);
    try {
      const query = includeRetired ? '?includeRetired=true' : '';
      const response = await fetch(`/api/playlists${query}`);
      if (!response.ok) {
        throw new Error('Failed to load playlists');
      }
      const data = (await response.json()) as { playlists?: PlaylistListItem[] };
      setPlaylists(Array.isArray(data.playlists) ? data.playlists : []);
    } catch {
      setError('Unable to load playlists right now.');
      setPlaylists([]);
    } finally {
      setLoading(false);
    }
  };

  useEffect(() => {
    void fetchPlaylists(showArchived);
  }, [showArchived]);

  const handleCreate = async () => {
    if (!createName.trim()) {
      setError('Playlist name is required.');
      return;
    }

    const response = await fetch('/api/playlists', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({
        name: createName.trim(),
        eventDate: createEventDate || undefined,
      }),
    });

    if (!response.ok) {
      setError('Unable to create playlist right now.');
      return;
    }

    setCreateName('');
    setCreateEventDate('');
    setShowCreate(false);
    await fetchPlaylists(showArchived);
  };

  const handleRetireToggle = async (playlist: PlaylistListItem, isRetired: boolean) => {
    const response = await fetch(`/api/playlists/${playlist.id}`, {
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
    const response = await fetch(`/api/playlists/${playlistId}`, {
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
          <div className="grid gap-3 md:grid-cols-2">
            <input
              data-testid="new-playlist-name"
              value={createName}
              onChange={(event) => setCreateName(event.target.value)}
              placeholder="Playlist name"
              className="rounded border border-gray-300 px-3 py-2"
            />
            <input
              data-testid="new-playlist-date"
              type="date"
              value={createEventDate}
              onChange={(event) => setCreateEventDate(event.target.value)}
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
            return (
              <article key={playlist.id} data-testid={`playlist-row-${playlist.id}`} className={`rounded border border-gray-200 bg-white p-4 ${retiredClass}`}>
                <div className="flex flex-wrap items-center justify-between gap-3">
                  <div>
                    <h3 className="font-semibold" data-testid={`playlist-name-${playlist.id}`}>{playlist.name}</h3>
                    {playlist.eventDate ? <p className="text-sm text-gray-500">{new Date(playlist.eventDate).toLocaleDateString()}</p> : null}
                    <p className="text-xs text-gray-500">Songs: {playlist.songs?.length ?? 0}</p>
                  </div>
                  <div className="flex flex-wrap gap-2">
                    <button data-testid={`playlist-practice-${playlist.id}`} className="rounded bg-indigo-600 px-3 py-1 text-white" onClick={() => onSelectPlaylist({ ...playlist, songs: playlist.songs ?? [] } as Playlist)}>Practice</button>
                    <button data-testid={`playlist-manage-${playlist.id}`} className="rounded border border-indigo-300 px-3 py-1 text-indigo-700" onClick={() => onManagePlaylist({ ...playlist, songs: playlist.songs ?? [] } as Playlist)}>Manage</button>
                    <button
                      data-testid={`playlist-retire-${playlist.id}`}
                      className="rounded border border-amber-300 px-3 py-1 text-amber-700"
                      onClick={() => void handleRetireToggle(playlist, !playlist.isRetired)}
                    >
                      {playlist.isRetired ? 'Un-retire' : 'Retire'}
                    </button>
                    <button
                      data-testid={`playlist-delete-${playlist.id}`}
                      className="rounded border border-red-300 px-3 py-1 text-red-700"
                      onClick={() => setDeleteConfirmId(playlist.id)}
                    >
                      Delete
                    </button>
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
