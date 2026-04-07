"use client";

import { DragEvent, useEffect, useState } from 'react';
import type { Playlist, Song } from '../types';

interface PlaylistDetailProps {
  playlistId: string;
  onBack: () => void;
  onPractice: (playlist: Playlist) => void;
  onEditSong?: (songId: string) => void;
}

export function PlaylistDetail({ playlistId, onBack, onPractice, onEditSong }: PlaylistDetailProps) {
  const [playlist, setPlaylist] = useState<Playlist | null>(null);
  const [songs, setSongs] = useState<Song[]>([]);
  const [selectedSongId, setSelectedSongId] = useState('');
  const [searchQuery, setSearchQuery] = useState('');
  const [showSuggestions, setShowSuggestions] = useState(false);
  const [loading, setLoading] = useState(true);
  const [draggedSongId, setDraggedSongId] = useState<string | null>(null);
  const [pickerOpen, setPickerOpen] = useState(false);
  const [inlineCreatePending, setInlineCreatePending] = useState(false);
  const [pickerError, setPickerError] = useState<string | null>(null);

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
    setPickerError(null);
    setPickerOpen(true);
    const response = await fetch('/api/songs');
    if (!response.ok) {
      setPickerError('Unable to load songs right now.');
      return;
    }
    const data = (await response.json()) as Song[];
    setSongs(Array.isArray(data) ? data : []);
    setShowSuggestions(true);
  };

  const closeSongPicker = () => {
    setPickerOpen(false);
    setShowSuggestions(false);
    setSearchQuery('');
    setSelectedSongId('');
    setPickerError(null);
  };

  const handleSearchChange = (query: string) => {
    setSearchQuery(query);
    setSelectedSongId('');
    setShowSuggestions(true);
    setPickerError(null);
  };

  const handleSelectSong = (songId: string) => {
    if (existingIds.has(songId)) {
      return;
    }
    setSelectedSongId(songId);
    setSearchQuery('');
    setShowSuggestions(false);
    setPickerError(null);
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
      setSearchQuery('');
      setShowSuggestions(false);
      setPickerError(null);
      await fetchPlaylist();
      closeSongPicker();
    }
  };

  const handleCreateSongAndAdd = async () => {
    const title = searchQuery.trim();
    if (!title) {
      return;
    }

    setInlineCreatePending(true);
    setPickerError(null);

    try {
      const createResponse = await fetch('/api/songs', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ title }),
      });

      if (!createResponse.ok) {
        throw new Error('Unable to create song right now.');
      }

      const createdSong = (await createResponse.json()) as Song;

      const addResponse = await fetch(`/api/playlists/${playlistId}/songs`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ songId: createdSong.id }),
      });

      if (!addResponse.ok) {
        throw new Error('Song was created, but adding it to the playlist failed.');
      }

      setSongs((previous) => [...previous, { ...createdSong, segments: createdSong.segments ?? [] }]);
      setSearchQuery('');
      setSelectedSongId('');
      setShowSuggestions(false);
      await fetchPlaylist();
      closeSongPicker();
    } catch (error) {
      setPickerError(error instanceof Error ? error.message : 'Unable to create song right now.');
    } finally {
      setInlineCreatePending(false);
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

  // Filter songs based on search query
  const filteredSongs = searchQuery.trim() === ''
    ? songs
    : songs.filter((song) => {
        const query = searchQuery.toLowerCase();
        const title = song.title.toLowerCase();
        const artist = (song.artist || '').toLowerCase();
        return title.includes(query) || artist.includes(query);
      });

  const creatableTitle = searchQuery.trim();
  const exactExistingSong = songs.find((song) => song.title.trim().toLowerCase() === creatableTitle.toLowerCase());
  const canCreateSong = creatableTitle.length > 0 && !exactExistingSong;

  // Get the selected song details for display
  const selectedSong = songs.find((s) => s.id === selectedSongId);

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
        {pickerOpen ? (
          <div className="mt-3 space-y-2">
            <div className="relative">
              <input
                data-testid="playlist-song-search"
                type="text"
                placeholder="Search songs by title or artist..."
                value={searchQuery}
                onChange={(e) => handleSearchChange(e.target.value)}
                onFocus={() => setShowSuggestions(true)}
                onKeyDown={(event) => {
                  if (event.key === 'Escape') {
                    event.preventDefault();
                    closeSongPicker();
                  }
                }}
                className="w-full rounded border border-gray-300 px-3 py-2"
              />
              {showSuggestions && filteredSongs.length > 0 && (
                <ul
                  data-testid="playlist-song-suggestions"
                  className="absolute top-full left-0 right-0 z-10 mt-1 max-h-48 overflow-y-auto rounded border border-gray-300 bg-white shadow-lg"
                >
                  {filteredSongs.map((song) => (
                    <li
                      key={song.id}
                      data-testid={`playlist-song-suggestion-${song.id}`}
                      onClick={() => handleSelectSong(song.id)}
                      className={`cursor-pointer px-3 py-2 hover:bg-indigo-50 ${
                        existingIds.has(song.id) ? 'opacity-50 cursor-not-allowed' : ''
                      } ${selectedSongId === song.id ? 'bg-indigo-100' : ''}`}
                    >
                      <div className="font-medium">{song.title}</div>
                      {song.artist ? <div className="text-sm text-gray-500">{song.artist}</div> : null}
                    </li>
                  ))}
                </ul>
              )}
            </div>
            {canCreateSong ? (
              <button
                data-testid="playlist-song-create-submit"
                className="rounded border border-emerald-300 px-3 py-2 text-emerald-700 hover:bg-emerald-50"
                onClick={() => void handleCreateSongAndAdd()}
                disabled={inlineCreatePending}
              >
                {inlineCreatePending ? 'Creating Song...' : `Create and Add "${creatableTitle}"`}
              </button>
            ) : null}
            {pickerError ? (
              <p data-testid="playlist-song-picker-error" className="text-sm text-red-600">
                {pickerError}
              </p>
            ) : null}
            {selectedSong && (
              <div className="flex items-center justify-between gap-2 rounded bg-indigo-50 px-3 py-2">
                <div>
                  <div className="font-medium">{selectedSong.title}</div>
                  {selectedSong.artist ? <div className="text-sm text-gray-500">{selectedSong.artist}</div> : null}
                </div>
                <button
                  data-testid="playlist-song-add-submit"
                  className="rounded bg-indigo-600 px-3 py-1 text-white hover:bg-indigo-700"
                  onClick={() => void handleAddSong()}
                >
                  Add
                </button>
              </div>
            )}
          </div>
        ) : null}
      </div>

      <ul data-testid="playlist-song-list" className="space-y-2">
        {sortedSongs.map((song, index) => {
          const hasAudio = Boolean(song.audioUrl?.trim());
          const hasSegments = song.segments.length > 0;
          return (
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
              {(!hasAudio || !hasSegments) ? (
                <div className="mt-1 flex flex-wrap gap-1">
                  {!hasAudio ? (
                    <span className="inline-flex items-center rounded-full bg-amber-50 px-2 py-0.5 text-xs font-medium text-amber-800">
                      Missing audio
                    </span>
                  ) : null}
                  {!hasSegments ? (
                    <span className="inline-flex items-center rounded-full bg-amber-50 px-2 py-0.5 text-xs font-medium text-amber-800">
                      Missing segments
                    </span>
                  ) : null}
                </div>
              ) : null}
            </div>
            <button
              data-testid={`playlist-song-remove-${song.id}`}
              className="rounded border border-red-300 px-3 py-1 text-red-700"
              onClick={() => void handleRemoveSong(song.id)}
            >
              Remove
            </button>
          </li>
          );
        })}
      </ul>
    </section>
  );
}
