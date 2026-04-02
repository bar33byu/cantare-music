"use client";

import { useState, useEffect } from 'react';

interface SongListItem {
  id: string;
  title: string;
  artist?: string;
  audioKey?: string;
  createdAt: string;
  lastPracticedAt?: string | null;
}

interface SongBrowserProps {
  onSelectSong: (song: SongListItem) => void;
  onDeleteSong?: (songId: string) => void;
  selectedSongId?: string | null;
  refreshTrigger?: number; // Increment this to trigger refresh
}

export function SongBrowser({ onSelectSong, onDeleteSong, selectedSongId, refreshTrigger }: SongBrowserProps) {
  const [songs, setSongs] = useState<SongListItem[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [deletingSongId, setDeletingSongId] = useState<string | null>(null);
  const [isEditMode, setIsEditMode] = useState(false);

  useEffect(() => {
    fetchSongs();
  }, [refreshTrigger]);

  const fetchSongs = async () => {
    try {
      setLoading(true);
      setError(null);
      const response = await fetch('/api/songs');
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
      const response = await fetch(`/api/songs/${song.id}`, {
        method: 'DELETE',
      });

      if (!response.ok) {
        const data = await response.json().catch(() => ({ error: 'Failed to delete song' }));
        throw new Error(data.error || 'Failed to delete song');
      }

      setSongs((prev) => prev.filter((s) => s.id !== song.id));
      onDeleteSong?.(song.id);
    } catch (err) {
      const message = err instanceof Error ? err.message : 'Failed to delete song';
      setError(message);
    } finally {
      setDeletingSongId(null);
    }
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
      <div className="flex items-center justify-between rounded-lg border border-gray-200 bg-white px-4 py-3">
        <p className="text-sm text-gray-600" data-testid="song-browser-edit-hint">
          {isEditMode ? 'Editing mode is on. Delete controls are enabled.' : 'Delete controls are hidden until editing mode is enabled.'}
        </p>
        <button
          type="button"
          data-testid="song-browser-toggle-edit-mode"
          onClick={() => setIsEditMode((previous) => !previous)}
          className={`rounded px-3 py-1.5 text-sm font-medium ${isEditMode ? 'bg-gray-700 text-white hover:bg-gray-800' : 'border border-red-300 text-red-700 hover:bg-red-50'}`}
        >
          {isEditMode ? 'Done Editing' : 'Edit Library'}
        </button>
      </div>

      <div className="grid gap-4 md:grid-cols-2 lg:grid-cols-3" data-testid="song-browser-grid">
        {songs.map((song) => (
          <div
            key={song.id}
            className={`bg-white p-6 rounded-lg shadow hover:shadow-md transition-shadow cursor-pointer border-2 ${
              selectedSongId === song.id ? 'border-blue-500' : 'border-transparent'
            }`}
            onClick={() => onSelectSong(song)}
            data-testid={`song-item-${song.id}`}
          >
            <h3 className="text-xl font-semibold mb-2" data-testid={`song-title-${song.id}`}>
              {song.title}
            </h3>
            {song.artist && (
              <p className="text-gray-600 mb-2" data-testid={`song-artist-${song.id}`}>
                {song.artist}
              </p>
            )}
            <p className="text-xs text-gray-500 mt-2" data-testid={`song-last-practiced-${song.id}`}>
              {song.lastPracticedAt
                ? `Last practiced ${new Date(song.lastPracticedAt).toLocaleDateString()}`
                : 'Not practiced yet'}
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
        ))}
      </div>
    </div>
  );
}