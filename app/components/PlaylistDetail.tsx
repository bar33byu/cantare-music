"use client";

import { DragEvent, useEffect, useRef, useState } from 'react';
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
  const searchInputRef = useRef<HTMLInputElement | null>(null);

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
    setSearchQuery('');
    setSelectedSongId('');
    setShowSuggestions(false);
    setPickerError(null);
  };

  useEffect(() => {
    if (pickerOpen) {
      searchInputRef.current?.focus();
    }
  }, [pickerOpen]);

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
      const songId = selectedSongId;
      setSelectedSongId('');
      setSearchQuery('');
      setShowSuggestions(false);
      setPickerError(null);
      await fetchPlaylist();
      onEditSong?.(songId);
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
      onEditSong?.(createdSong.id);
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
          <div className="mb-1 flex items-center gap-1 text-sm text-gray-600">
            <button
              data-testid="playlist-detail-breadcrumb-back"
              className="hover:text-indigo-700 hover:underline"
              onClick={onBack}
            >
              Playlists
            </button>
            <span>/</span>
            <span className="text-gray-900">{playlist.name}</span>
          </div>
          <h2 data-testid="playlist-detail-name" className="text-2xl font-bold">{playlist.name}</h2>
          {playlist.eventDate ? <p className="text-sm text-gray-500">{new Date(playlist.eventDate).toLocaleDateString()}</p> : null}
        </div>
        <div className="flex gap-2">
          <button
            data-testid="playlist-add-song"
            aria-label="Add Song"
            title="Add Song"
            className="flex h-10 w-10 items-center justify-center rounded-full bg-indigo-600 text-white hover:bg-indigo-700"
            onClick={() => void openSongPicker()}
          >
            <svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" className="h-5 w-5">
              <line x1="12" y1="5" x2="12" y2="19" />
              <line x1="5" y1="12" x2="19" y2="12" />
            </svg>
          </button>
          <button data-testid="playlist-detail-practice" className="rounded bg-indigo-600 px-3 py-2 text-white" onClick={() => onPractice(playlist)}>Practice</button>
        </div>
      </div>

      <div className="rounded border border-gray-200 bg-white p-4">
        {pickerOpen ? (
          <div className="mt-3 space-y-2">
            <div className="relative">
              <input
                ref={searchInputRef}
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
            <div className="rounded border border-emerald-200 bg-emerald-50/40 p-3">
              <p className="text-xs font-medium text-emerald-800">Not in the library yet?</p>
              <button
                data-testid="playlist-song-create-submit"
                className="mt-2 rounded border border-emerald-300 px-3 py-2 text-emerald-700 hover:bg-emerald-50 disabled:cursor-not-allowed disabled:opacity-60"
                onClick={() => void handleCreateSongAndAdd()}
                disabled={inlineCreatePending || !canCreateSong}
              >
                {inlineCreatePending
                  ? 'Creating Song...'
                  : creatableTitle
                    ? `Create and Add "${creatableTitle}"`
                    : 'Create and Add New Song'}
              </button>
              {creatableTitle && exactExistingSong ? (
                <p className="mt-2 text-xs text-emerald-900">
                  A song with this exact title already exists. Pick it from suggestions or type a new title.
                </p>
              ) : (
                <p className="mt-2 text-xs text-emerald-900">
                  Type a title above, then create it instantly and add it to this playlist.
                </p>
              )}
            </div>
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
