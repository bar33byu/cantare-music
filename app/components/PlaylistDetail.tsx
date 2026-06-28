"use client";

import { DragEvent, useCallback, useEffect, useState } from 'react';
import { withUserIdHeader } from '../lib/userContext';
import type { Playlist, PlaylistRefreshPreview, Song } from '../types';

interface PlaylistDetailProps {
  playlistId: string;
  onBack: () => void;
  onPractice: (playlist: Playlist) => void;
  onEditSong?: (songId: string) => void;
  userId?: string;
}

export function PlaylistDetail({ playlistId, onBack, onPractice, onEditSong, userId }: PlaylistDetailProps) {
  const [playlist, setPlaylist] = useState<Playlist | null>(null);
  const [songs, setSongs] = useState<Song[]>([]);
  const [searchQuery, setSearchQuery] = useState('');
  const [showSuggestions, setShowSuggestions] = useState(false);
  const [loading, setLoading] = useState(true);
  const [draggedSongId, setDraggedSongId] = useState<string | null>(null);
  const [pickerOpen, setPickerOpen] = useState(false);
  const [inlineCreatePending, setInlineCreatePending] = useState(false);
  const [pickerError, setPickerError] = useState<string | null>(null);
  const [shareBusy, setShareBusy] = useState(false);
  const [shareError, setShareError] = useState<string | null>(null);
  const [shareMessage, setShareMessage] = useState<string | null>(null);
  const [publicBusy, setPublicBusy] = useState(false);
  const [publicError, setPublicError] = useState<string | null>(null);
  const [publicMessage, setPublicMessage] = useState<string | null>(null);
  const [shareAudioMode, setShareAudioMode] = useState<'part' | 'blend' | 'both'>('both');
  const [publicShareAudioMode, setPublicShareAudioMode] = useState<'part' | 'blend' | 'both'>('both');
  const [playlistNameDraft, setPlaylistNameDraft] = useState('');
  const [playlistNameSaving, setPlaylistNameSaving] = useState(false);
  const [playlistNameError, setPlaylistNameError] = useState<string | null>(null);
  const [playlistEventDateDraft, setPlaylistEventDateDraft] = useState('');
  const [playlistEventDateSaving, setPlaylistEventDateSaving] = useState(false);
  const [playlistEventDateError, setPlaylistEventDateError] = useState<string | null>(null);
  const [addingSongIds, setAddingSongIds] = useState<Set<string>>(new Set());
  const [refreshPreview, setRefreshPreview] = useState<PlaylistRefreshPreview | null>(null);
  const [refreshLoading, setRefreshLoading] = useState(false);
  const [refreshImporting, setRefreshImporting] = useState(false);
  const [refreshError, setRefreshError] = useState<string | null>(null);
  const [refreshMessage, setRefreshMessage] = useState<string | null>(null);
  const [selectedRefreshSongIds, setSelectedRefreshSongIds] = useState<Set<string>>(new Set());

  const withUserHeader = useCallback((init?: RequestInit): RequestInit | undefined => {
    return withUserIdHeader(init, userId);
  }, [userId]);

  const request = useCallback((url: string, init?: RequestInit) => {
    const scopedInit = withUserHeader(init);
    return scopedInit ? fetch(url, scopedInit) : fetch(url);
  }, [withUserHeader]);

  const fetchPlaylist = useCallback(async () => {
    const response = await request(`/api/playlists/${playlistId}`);
    if (!response.ok) {
      setPlaylist(null);
      setLoading(false);
      return;
    }
    const data = (await response.json()) as Playlist;
    setPlaylist(data);
    setPlaylistNameDraft(data.name);
    setPlaylistEventDateDraft(data.eventDate ?? '');
    setShareAudioMode(data.shareAudioMode ?? 'both');
    setPublicShareAudioMode(data.publicShareAudioMode ?? 'both');
    setRefreshPreview(null);
    setSelectedRefreshSongIds(new Set());
    setRefreshError(null);
    setRefreshMessage(null);
    setLoading(false);
  }, [playlistId, request]);

  useEffect(() => {
    void fetchPlaylist();
  }, [fetchPlaylist]);

  const openSongPicker = async () => {
    setPickerError(null);
    setPickerOpen(true);
    const response = await request('/api/songs');
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
    setPickerError(null);
  };

  const handleSearchChange = (query: string) => {
    setSearchQuery(query);
    setShowSuggestions(true);
    setPickerError(null);
  };

  const handleAddSongById = async (songId: string) => {
    if (!songId || existingIds.has(songId) || addingSongIds.has(songId)) {
      return;
    }
    setAddingSongIds((previous) => new Set(previous).add(songId));
    setPickerError(null);

    const response = await request(`/api/playlists/${playlistId}/songs`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ songId }),
    });

    if (response.ok) {
      setSearchQuery('');
      setShowSuggestions(true);
      setPickerError(null);
      await fetchPlaylist();
    } else {
      setPickerError('Unable to add that song right now.');
    }
    setAddingSongIds((previous) => {
      const next = new Set(previous);
      next.delete(songId);
      return next;
    });
  };

  const handleCreateSongAndAdd = async () => {
    const title = searchQuery.trim();
    if (!title) {
      return;
    }

    setInlineCreatePending(true);
    setPickerError(null);

    try {
      const createResponse = await request('/api/songs', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ title }),
      });

      if (!createResponse.ok) {
        throw new Error('Unable to create song right now.');
      }

      const createdSong = (await createResponse.json()) as Song;

      const addResponse = await request(`/api/playlists/${playlistId}/songs`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ songId: createdSong.id }),
      });

      if (!addResponse.ok) {
        throw new Error('Song was created, but adding it to the playlist failed.');
      }

      setSongs((previous) => [...previous, { ...createdSong, segments: createdSong.segments ?? [] }]);
      setSearchQuery('');
      setShowSuggestions(true);
      await fetchPlaylist();
    } catch (error) {
      setPickerError(error instanceof Error ? error.message : 'Unable to create song right now.');
    } finally {
      setInlineCreatePending(false);
    }
  };

  const handleRemoveSong = async (songId: string) => {
    const response = await request(`/api/playlists/${playlistId}/songs/${songId}`, {
      method: 'DELETE',
    });
    if (response.ok) {
      await fetchPlaylist();
    }
  };

  const handleSavePlaylistName = async () => {
    const nextName = playlistNameDraft.trim();
    if (!playlist || nextName.length === 0 || nextName === playlist.name) {
      return;
    }

    setPlaylistNameSaving(true);
    setPlaylistNameError(null);
    try {
      const response = await request(`/api/playlists/${playlistId}`, {
        method: 'PATCH',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ name: nextName }),
      });

      if (!response.ok) {
        throw new Error('Unable to rename playlist right now.');
      }

      setPlaylist((current) => current ? { ...current, name: nextName } : current);
    } catch (error) {
      setPlaylistNameError(error instanceof Error ? error.message : 'Unable to rename playlist right now.');
    } finally {
      setPlaylistNameSaving(false);
    }
  };

  const handleSavePlaylistEventDate = async () => {
    if (!playlist || playlistEventDateDraft === (playlist.eventDate ?? '')) {
      return;
    }

    setPlaylistEventDateSaving(true);
    setPlaylistEventDateError(null);
    try {
      const response = await request(`/api/playlists/${playlistId}`, {
        method: 'PATCH',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ eventDate: playlistEventDateDraft || null }),
      });

      if (!response.ok) {
        throw new Error('Unable to update performance date right now.');
      }

      setPlaylist((current) => current ? { ...current, eventDate: playlistEventDateDraft || undefined } : current);
    } catch (error) {
      setPlaylistEventDateError(error instanceof Error ? error.message : 'Unable to update performance date right now.');
    } finally {
      setPlaylistEventDateSaving(false);
    }
  };

  const shareUrl = playlist?.shareToken && typeof window !== 'undefined'
    ? `${window.location.origin}/share/playlists/${playlist.shareToken}`
    : playlist?.shareUrl ?? null;

  const handleShare = async () => {
    setShareBusy(true);
    setShareError(null);
    setShareMessage(null);
    try {
      const response = await request(`/api/playlists/${playlistId}/share`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ shareAudioMode }),
      });
      if (!response.ok) {
        throw new Error('Unable to enable sharing right now.');
      }
      const sharedPlaylist = (await response.json()) as Playlist;
      setPlaylist((current) => current ? { ...current, ...sharedPlaylist } : sharedPlaylist);
      setShareMessage('Sharing is on.');
    } catch (error) {
      setShareError(error instanceof Error ? error.message : 'Unable to enable sharing right now.');
    } finally {
      setShareBusy(false);
    }
  };

  const handleUnshare = async () => {
    setShareBusy(true);
    setShareError(null);
    setShareMessage(null);
    try {
      const response = await request(`/api/playlists/${playlistId}/share`, { method: 'DELETE' });
      if (!response.ok) {
        throw new Error('Unable to disable sharing right now.');
      }
      setPlaylist((current) => current ? { ...current, shareToken: null, shareUrl: null, sharedAt: null } : current);
      setShareMessage('Sharing is off.');
    } catch (error) {
      setShareError(error instanceof Error ? error.message : 'Unable to disable sharing right now.');
    } finally {
      setShareBusy(false);
    }
  };

  const handleCopyShareLink = async () => {
    if (!shareUrl) {
      return;
    }
    try {
      await navigator.clipboard?.writeText(shareUrl);
      setShareMessage('Share link copied.');
    } catch {
      setShareMessage('Share link is ready.');
    }
  };

  const handlePublish = async () => {
    setPublicBusy(true);
    setPublicError(null);
    setPublicMessage(null);
    try {
      const response = await request(`/api/playlists/${playlistId}/public`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ publicShareAudioMode }),
      });
      if (!response.ok) {
        throw new Error('Unable to publish this playlist right now.');
      }
      const publicPlaylist = (await response.json()) as Playlist;
      setPlaylist((current) => current ? { ...current, ...publicPlaylist } : publicPlaylist);
      setPublicMessage(playlist?.isPublic ? 'Shared settings updated.' : 'Published to Shared.');
    } catch (error) {
      setPublicError(error instanceof Error ? error.message : 'Unable to publish this playlist right now.');
    } finally {
      setPublicBusy(false);
    }
  };

  const handleUnpublish = async () => {
    setPublicBusy(true);
    setPublicError(null);
    setPublicMessage(null);
    try {
      const response = await request(`/api/playlists/${playlistId}/public`, { method: 'DELETE' });
      if (!response.ok) {
        throw new Error('Unable to remove this playlist from Shared right now.');
      }
      setPlaylist((current) => current ? { ...current, isPublic: false, publishedAt: null } : current);
      setPublicMessage('Removed from Shared.');
    } catch (error) {
      setPublicError(error instanceof Error ? error.message : 'Unable to remove this playlist from Shared right now.');
    } finally {
      setPublicBusy(false);
    }
  };

  const handleLoadRefreshPreview = async () => {
    setRefreshLoading(true);
    setRefreshError(null);
    setRefreshMessage(null);
    try {
      const response = await request(`/api/playlists/${playlistId}/refresh`);
      if (!response.ok) {
        const payload = await response.json().catch(() => ({})) as { error?: string };
        throw new Error(payload.error || 'Unable to check the shared source right now.');
      }
      const preview = (await response.json()) as PlaylistRefreshPreview;
      setRefreshPreview(preview);
      setSelectedRefreshSongIds(new Set(preview.candidates.map((candidate) => candidate.sourceSongId)));
      if (preview.candidates.length === 0) {
        setRefreshMessage('This copy is up to date with the shared playlist.');
      }
    } catch (error) {
      setRefreshError(error instanceof Error ? error.message : 'Unable to check the shared source right now.');
    } finally {
      setRefreshLoading(false);
    }
  };

  const toggleRefreshSong = (sourceSongId: string) => {
    setSelectedRefreshSongIds((current) => {
      const next = new Set(current);
      if (next.has(sourceSongId)) {
        next.delete(sourceSongId);
      } else {
        next.add(sourceSongId);
      }
      return next;
    });
  };

  const handleToggleAllRefreshSongs = () => {
    if (!refreshPreview) {
      return;
    }
    setSelectedRefreshSongIds((current) => {
      if (current.size === refreshPreview.candidates.length) {
        return new Set();
      }
      return new Set(refreshPreview.candidates.map((candidate) => candidate.sourceSongId));
    });
  };

  const handleImportRefreshSongs = async () => {
    const sourceSongIds = Array.from(selectedRefreshSongIds);
    if (sourceSongIds.length === 0) {
      return;
    }

    setRefreshImporting(true);
    setRefreshError(null);
    setRefreshMessage(null);
    try {
      const response = await request(`/api/playlists/${playlistId}/refresh`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ sourceSongIds }),
      });
      const payload = await response.json().catch(() => ({})) as { error?: string; importedCount?: number; playlist?: Playlist };
      if (!response.ok) {
        throw new Error(payload.error || 'Unable to import updates right now.');
      }
      if (payload.playlist) {
        setPlaylist(payload.playlist);
        setPlaylistNameDraft(payload.playlist.name);
      } else {
        await fetchPlaylist();
      }
      setRefreshMessage(`Imported ${payload.importedCount ?? sourceSongIds.length} song${(payload.importedCount ?? sourceSongIds.length) === 1 ? '' : 's'}.`);
      setRefreshPreview(null);
      setSelectedRefreshSongIds(new Set());
    } catch (error) {
      setRefreshError(error instanceof Error ? error.message : 'Unable to import updates right now.');
    } finally {
      setRefreshImporting(false);
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

    await request(`/api/playlists/${playlistId}/songs`, {
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
  const importedSourceAvailable = Boolean(playlist.sourcePlaylistId);

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

  return (
    <section data-testid="playlist-detail" className="space-y-4">
      <div className="flex items-center justify-between gap-3">
        <div className="min-w-0 flex-1">
          <div className="flex max-w-2xl flex-wrap items-center gap-2">
            <label htmlFor="playlist-name-input" className="sr-only">Playlist title</label>
            <input
              id="playlist-name-input"
              data-testid="playlist-detail-name-input"
              value={playlistNameDraft}
              onChange={(event) => {
                setPlaylistNameDraft(event.target.value);
                setPlaylistNameError(null);
              }}
              onKeyDown={(event) => {
                if (event.key === 'Enter') {
                  event.preventDefault();
                  void handleSavePlaylistName();
                }
              }}
              className="min-w-0 flex-1 rounded border border-gray-300 px-3 py-2 text-2xl font-bold text-gray-950"
            />
            <button
              type="button"
              data-testid="playlist-detail-name-save"
              className="rounded border border-indigo-300 px-3 py-2 text-sm font-semibold text-indigo-700 hover:bg-indigo-50 disabled:opacity-50"
              disabled={playlistNameSaving || playlistNameDraft.trim().length === 0 || playlistNameDraft.trim() === playlist.name}
              onClick={() => void handleSavePlaylistName()}
            >
              {playlistNameSaving ? 'Saving...' : 'Save'}
            </button>
          </div>
          <h2 data-testid="playlist-detail-name" className="sr-only">{playlist.name}</h2>
          {playlistNameError ? <p data-testid="playlist-detail-name-error" className="mt-1 text-sm text-red-600">{playlistNameError}</p> : null}
          <div className="mt-2 flex flex-wrap items-center gap-2">
            <label htmlFor="playlist-event-date-input" className="text-sm font-medium text-gray-700">Performance date</label>
            <input
              id="playlist-event-date-input"
              data-testid="playlist-detail-event-date-input"
              type="date"
              value={playlistEventDateDraft}
              onChange={(event) => {
                setPlaylistEventDateDraft(event.target.value);
                setPlaylistEventDateError(null);
              }}
              className="rounded border border-gray-300 px-3 py-2 text-sm"
            />
            <button
              type="button"
              data-testid="playlist-detail-event-date-save"
              className="rounded border border-indigo-300 px-3 py-2 text-sm font-semibold text-indigo-700 hover:bg-indigo-50 disabled:opacity-50"
              disabled={playlistEventDateSaving || playlistEventDateDraft === (playlist.eventDate ?? '')}
              onClick={() => void handleSavePlaylistEventDate()}
            >
              {playlistEventDateSaving ? 'Saving...' : 'Save date'}
            </button>
          </div>
          {playlistEventDateError ? <p data-testid="playlist-detail-event-date-error" className="mt-1 text-sm text-red-600">{playlistEventDateError}</p> : null}
        </div>
        <div className="flex gap-2">
          <button data-testid="playlist-detail-back" className="rounded border border-gray-300 px-3 py-2" onClick={onBack}>← Back</button>
          <button data-testid="playlist-detail-practice" className="rounded bg-indigo-600 px-3 py-2 text-white" onClick={() => onPractice(playlist)}>Practice</button>
        </div>
      </div>

      <div className="rounded border border-gray-200 bg-white p-4">
        <div className="flex flex-wrap items-center justify-between gap-3">
          <button data-testid="playlist-add-song" className="rounded border border-indigo-300 px-3 py-1 text-indigo-700" onClick={() => void openSongPicker()}>
            Add Song
          </button>
          <div className="flex flex-wrap items-center gap-2">
            <label className="flex items-center gap-2 text-sm text-gray-700">
              <span className="font-medium">Link audio</span>
              <select
                data-testid="playlist-share-audio-mode"
                value={shareAudioMode}
                onChange={(event) => setShareAudioMode(event.target.value as 'part' | 'blend' | 'both')}
                className="rounded border border-gray-300 bg-white px-2 py-1 text-sm"
              >
                <option value="both">Part and blend</option>
                <option value="blend">Blend only</option>
                <option value="part">Part only</option>
              </select>
            </label>
            {shareUrl ? (
              <>
                <a
                  data-testid="playlist-share-link"
                  href={shareUrl}
                  target="_blank"
                  rel="noreferrer"
                  className="max-w-[18rem] truncate rounded border border-gray-300 px-3 py-1 text-sm text-gray-700 hover:bg-gray-50"
                >
                  {shareUrl}
                </a>
                <button
                  data-testid="playlist-share-copy"
                  className="rounded border border-indigo-300 px-3 py-1 text-sm text-indigo-700 hover:bg-indigo-50"
                  onClick={() => void handleCopyShareLink()}
                >
                  Copy
                </button>
                <button
                  data-testid="playlist-unshare"
                  className="rounded border border-red-300 px-3 py-1 text-sm text-red-700 hover:bg-red-50 disabled:opacity-60"
                  disabled={shareBusy}
                  onClick={() => void handleUnshare()}
                >
                  {shareBusy ? 'Unsharing...' : 'Unshare'}
                </button>
              </>
            ) : (
              <button
                data-testid="playlist-share"
                className="rounded border border-emerald-300 px-3 py-1 text-sm text-emerald-700 hover:bg-emerald-50 disabled:opacity-60"
                disabled={shareBusy}
                onClick={() => void handleShare()}
              >
                {shareBusy ? 'Sharing...' : 'Share'}
              </button>
            )}
          </div>
        </div>
        {shareError ? <p data-testid="playlist-share-error" className="mt-2 text-sm text-red-600">{shareError}</p> : null}
        {shareMessage ? <p data-testid="playlist-share-message" className="mt-2 text-sm text-gray-600">{shareMessage}</p> : null}
        <div className="mt-3 flex flex-wrap items-center justify-between gap-3 border-t border-gray-100 pt-3">
          <div>
            <p className="text-sm font-semibold text-gray-800">Shared tab</p>
            <p className="text-xs text-gray-500">
              {playlist.isPublic ? 'This playlist appears for signed-in users.' : 'Publish this playlist for signed-in users to browse.'}
            </p>
          </div>
          <label className="flex items-center gap-2 text-sm text-gray-700">
            <span className="font-medium">Shared tab audio</span>
            <select
              data-testid="playlist-public-share-audio-mode"
              value={publicShareAudioMode}
              onChange={(event) => setPublicShareAudioMode(event.target.value as 'part' | 'blend' | 'both')}
              className="rounded border border-gray-300 bg-white px-2 py-1 text-sm"
            >
              <option value="both">Part and blend</option>
              <option value="blend">Blend only</option>
              <option value="part">Part only</option>
            </select>
          </label>
          {playlist.isPublic ? (
            <div className="flex flex-wrap gap-2">
              <button
                data-testid="playlist-update-public"
                className="rounded border border-emerald-300 px-3 py-1 text-sm text-emerald-700 hover:bg-emerald-50 disabled:opacity-60"
                disabled={publicBusy}
                onClick={() => void handlePublish()}
              >
                {publicBusy ? 'Updating...' : 'Update Shared'}
              </button>
              <button
                data-testid="playlist-unpublish-public"
                className="rounded border border-amber-300 px-3 py-1 text-sm text-amber-800 hover:bg-amber-50 disabled:opacity-60"
                disabled={publicBusy}
                onClick={() => void handleUnpublish()}
              >
                {publicBusy ? 'Removing...' : 'Remove from Shared'}
              </button>
            </div>
          ) : (
            <button
              data-testid="playlist-publish-public"
              className="rounded border border-emerald-300 px-3 py-1 text-sm text-emerald-700 hover:bg-emerald-50 disabled:opacity-60"
              disabled={publicBusy}
              onClick={() => void handlePublish()}
            >
              {publicBusy ? 'Publishing...' : 'Publish to Shared'}
            </button>
          )}
        </div>
        {publicError ? <p data-testid="playlist-public-error" className="mt-2 text-sm text-red-600">{publicError}</p> : null}
        {publicMessage ? <p data-testid="playlist-public-message" className="mt-2 text-sm text-gray-600">{publicMessage}</p> : null}
        {importedSourceAvailable ? (
          <div className="mt-3 border-t border-gray-100 pt-3" data-testid="playlist-refresh-panel">
            <div className="flex flex-wrap items-center justify-between gap-3">
              <div>
                <p className="text-sm font-semibold text-gray-800">Source updates</p>
                <p className="text-xs text-gray-500">
                  Check the shared playlist and choose which songs to import into this copy.
                </p>
              </div>
              <button
                type="button"
                data-testid="playlist-refresh-check"
                className="rounded border border-indigo-300 px-3 py-1 text-sm text-indigo-700 hover:bg-indigo-50 disabled:opacity-60"
                disabled={refreshLoading || refreshImporting}
                onClick={() => void handleLoadRefreshPreview()}
              >
                {refreshLoading ? 'Checking...' : 'Check source'}
              </button>
            </div>
            {refreshPreview ? (
              <div className="mt-3 space-y-3">
                <div className="flex flex-wrap items-center justify-between gap-2">
                  <p className="text-sm text-gray-600">
                    {refreshPreview.sourcePlaylist.name} by {refreshPreview.sourcePlaylist.owner.displayName}
                  </p>
                  {refreshPreview.candidates.length > 0 ? (
                    <button
                      type="button"
                      data-testid="playlist-refresh-toggle-all"
                      className="rounded border border-gray-300 px-3 py-1 text-sm text-gray-700 hover:bg-gray-50"
                      onClick={handleToggleAllRefreshSongs}
                    >
                      {selectedRefreshSongIds.size === refreshPreview.candidates.length ? 'Clear all' : 'Select all'}
                    </button>
                  ) : null}
                </div>
                {refreshPreview.candidates.length > 0 ? (
                  <>
                    <ul className="max-h-64 space-y-2 overflow-y-auto">
                      {refreshPreview.candidates.map((candidate) => (
                        <li key={candidate.sourceSongId} className="rounded border border-gray-200 p-2">
                          <label className="flex cursor-pointer items-start gap-3">
                            <input
                              data-testid={`playlist-refresh-song-${candidate.sourceSongId}`}
                              type="checkbox"
                              className="mt-1"
                              checked={selectedRefreshSongIds.has(candidate.sourceSongId)}
                              onChange={() => toggleRefreshSong(candidate.sourceSongId)}
                            />
                            <span className="min-w-0 flex-1">
                              <span className="block font-medium text-gray-900">{candidate.title}</span>
                              {candidate.artist ? <span className="block text-sm text-gray-500">{candidate.artist}</span> : null}
                              <span className="mt-1 flex flex-wrap gap-1 text-xs">
                                <span className={`rounded-full px-2 py-0.5 ${candidate.status === 'new' ? 'bg-emerald-50 text-emerald-700' : 'bg-indigo-50 text-indigo-700'}`}>
                                  {candidate.status === 'new' ? 'New to this playlist' : 'Refresh available'}
                                </span>
                                <span className="rounded-full bg-gray-100 px-2 py-0.5 text-gray-700">{candidate.segmentCount} segments</span>
                                {candidate.hasPartAudio ? <span className="rounded-full bg-gray-100 px-2 py-0.5 text-gray-700">Part</span> : null}
                                {candidate.hasBlendAudio ? <span className="rounded-full bg-gray-100 px-2 py-0.5 text-gray-700">Blend</span> : null}
                              </span>
                            </span>
                          </label>
                        </li>
                      ))}
                    </ul>
                    <button
                      type="button"
                      data-testid="playlist-refresh-import"
                      className="rounded bg-indigo-600 px-3 py-2 text-sm font-semibold text-white hover:bg-indigo-700 disabled:opacity-60"
                      disabled={refreshImporting || selectedRefreshSongIds.size === 0}
                      onClick={() => void handleImportRefreshSongs()}
                    >
                      {refreshImporting ? 'Importing...' : `Import selected (${selectedRefreshSongIds.size})`}
                    </button>
                  </>
                ) : null}
              </div>
            ) : null}
            {refreshError ? <p data-testid="playlist-refresh-error" className="mt-2 text-sm text-red-600">{refreshError}</p> : null}
            {refreshMessage ? <p data-testid="playlist-refresh-message" className="mt-2 text-sm text-gray-600">{refreshMessage}</p> : null}
          </div>
        ) : null}
        {pickerOpen ? (
          <div className="mt-3 space-y-2">
            <div className="flex items-center gap-2">
              <div className="relative flex-1">
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
                      onClick={() => void handleAddSongById(song.id)}
                      className={`cursor-pointer px-3 py-2 hover:bg-indigo-50 ${
                        existingIds.has(song.id) || addingSongIds.has(song.id) ? 'opacity-50 cursor-not-allowed' : ''
                      }`}
                    >
                      <div className="font-medium">{song.title}</div>
                      {song.artist ? <div className="text-sm text-gray-500">{song.artist}</div> : null}
                      {addingSongIds.has(song.id) ? <div className="text-xs text-indigo-700">Adding...</div> : null}
                    </li>
                  ))}
                </ul>
              )}
              </div>
              <button
                type="button"
                data-testid="playlist-song-picker-close"
                className="rounded border border-gray-300 px-3 py-2 text-gray-700 hover:bg-gray-50"
                onClick={closeSongPicker}
              >
                Close
              </button>
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
          </div>
        ) : null}
      </div>

      <ul data-testid="playlist-song-list" className="space-y-2">
        {sortedSongs.map((song, index) => {
          const hasAudio = Boolean(song.audioUrl?.trim() || song.alternateAudioUrl?.trim());
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
            <div className="flex shrink-0 gap-2">
              {onEditSong ? (
                <button
                  data-testid={`playlist-song-edit-${song.id}`}
                  className="rounded border border-indigo-300 px-3 py-1 text-indigo-700"
                  onClick={() => onEditSong(song.id)}
                >
                  Edit
                </button>
              ) : null}
              <button
                data-testid={`playlist-song-remove-${song.id}`}
                className="rounded border border-red-300 px-3 py-1 text-red-700"
                onClick={() => void handleRemoveSong(song.id)}
              >
                Remove
              </button>
            </div>
          </li>
          );
        })}
      </ul>
    </section>
  );
}
