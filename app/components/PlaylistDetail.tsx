"use client";

import { DragEvent, useEffect, useState } from 'react';
import type { Playlist, Song } from '../types';

interface PlaylistDetailProps {
  playlistId: string;
  onBack: () => void;
  onPractice: (playlist: Playlist) => void;
}

export function PlaylistDetail({ playlistId, onBack, onPractice }: PlaylistDetailProps) {
  const [playlist, setPlaylist] = useState<Playlist | null>(null);
  const [songs, setSongs] = useState<Song[]>([]);
  const [selectedSongId, setSelectedSongId] = useState('');
  const [loading, setLoading] = useState(true);
  const [draggedSongId, setDraggedSongId] = useState<string | null>(null);

  const fetchPlaylist = async () => {
    const response = await fetch(`/api/playlists/${playlistId}`);
    if (!response.ok) {
      setPlaylist(null);
      setLoading(false);
      return;
    }
    const data = (await response.json()) as Playlist;
    setPlaylist(data);
    setLoading(false);
  };

  useEffect(() => {
    void fetchPlaylist();
  }, [playlistId]);

  const openSongPicker = async () => {
    const response = await fetch('/api/songs');
    if (!response.ok) {
      return;
    }
    const data = (await response.json()) as Song[];
    setSongs(Array.isArray(data) ? data : []);
  };

  const handleAddSong = async () => {
    if (!selectedSongId) {
      return;
    }
    const response = await fetch(`/api/playlists/${playlistId}/songs`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ songId: selectedSongId }),
    });

    if (response.ok) {
      setSelectedSongId('');
      await fetchPlaylist();
    }
  };

  const handleRemoveSong = async (songId: string) => {
    const response = await fetch(`/api/playlists/${playlistId}/songs/${songId}`, {
      method: 'DELETE',
    });
    if (response.ok) {
      await fetchPlaylist();
    }
  };

  const handleDrop = async (targetSongId: string) => {
    if (!playlist || !draggedSongId || draggedSongId === targetSongId) {
      setDraggedSongId(null);
      return;
    }

    const current = [...playlist.songs].sort((a, b) => a.position - b.position);
    const fromIndex = current.findIndex((song) => song.id === draggedSongId);
    const toIndex = current.findIndex((song) => song.id === targetSongId);
    if (fromIndex === -1 || toIndex === -1) {
      setDraggedSongId(null);
      return;
    }

    const reordered = [...current];
    const [moved] = reordered.splice(fromIndex, 1);
    reordered.splice(toIndex, 0, moved);

    setPlaylist({
      ...playlist,
      songs: reordered.map((song, index) => ({ ...song, position: index })),
    });

    await fetch(`/api/playlists/${playlistId}/songs`, {
      method: 'PATCH',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ orderedSongIds: reordered.map((song) => song.id) }),
    });

    setDraggedSongId(null);
  };

  if (loading) {
    return <div data-testid="playlist-detail-loading" className="py-6">Loading playlist...</div>;
  }

  if (!playlist) {
    return <div data-testid="playlist-detail-missing" className="py-6">Playlist not found.</div>;
  }

  const sortedSongs = [...playlist.songs].sort((a, b) => a.position - b.position);
  const existingIds = new Set(sortedSongs.map((song) => song.id));

  return (
    <section data-testid="playlist-detail" className="space-y-4">
      <div className="flex items-center justify-between gap-3">
        <div>
          <h2 data-testid="playlist-detail-name" className="text-2xl font-bold">{playlist.name}</h2>
          {playlist.eventDate ? <p className="text-sm text-gray-500">{new Date(playlist.eventDate).toLocaleDateString()}</p> : null}
        </div>
        <div className="flex gap-2">
          <button data-testid="playlist-detail-back" className="rounded border border-gray-300 px-3 py-2" onClick={onBack}>← Back</button>
          <button data-testid="playlist-detail-practice" className="rounded bg-indigo-600 px-3 py-2 text-white" onClick={() => onPractice(playlist)}>Practice</button>
        </div>
      </div>

      <div className="rounded border border-gray-200 bg-white p-4">
        <button data-testid="playlist-add-song" className="rounded border border-indigo-300 px-3 py-1 text-indigo-700" onClick={() => void openSongPicker()}>
          Add Song
        </button>
        {songs.length > 0 ? (
          <div className="mt-3 flex gap-2">
            <select
              data-testid="playlist-song-picker"
              value={selectedSongId}
              onChange={(event) => setSelectedSongId(event.target.value)}
              className="rounded border border-gray-300 px-2 py-1"
            >
              <option value="">Select song</option>
              {songs.map((song) => (
                <option key={song.id} value={song.id} disabled={existingIds.has(song.id)}>
                  {song.title}
                </option>
              ))}
            </select>
            <button data-testid="playlist-song-add-submit" className="rounded bg-indigo-600 px-3 py-1 text-white" onClick={() => void handleAddSong()}>
              Add
            </button>
          </div>
        ) : null}
      </div>

      <ul data-testid="playlist-song-list" className="space-y-2">
        {sortedSongs.map((song, index) => (
          <li
            key={song.id}
            data-testid={`playlist-song-row-${song.id}`}
            draggable
            onDragStart={() => setDraggedSongId(song.id)}
            onDragOver={(event: DragEvent<HTMLLIElement>) => event.preventDefault()}
            onDrop={() => void handleDrop(song.id)}
            className="flex items-center justify-between rounded border border-gray-200 bg-white p-3"
          >
            <div>
              <p className="font-medium">{index + 1}. {song.title}</p>
              {song.artist ? <p className="text-sm text-gray-500">{song.artist}</p> : null}
            </div>
            <button
              data-testid={`playlist-song-remove-${song.id}`}
              className="rounded border border-red-300 px-3 py-1 text-red-700"
              onClick={() => void handleRemoveSong(song.id)}
            >
              Remove
            </button>
          </li>
        ))}
      </ul>
    </section>
  );
}
