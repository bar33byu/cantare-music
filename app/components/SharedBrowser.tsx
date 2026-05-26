"use client";

import { useCallback, useEffect, useState } from "react";
import { buildUserScopedCacheKey, readCachedJson, writeCachedJson } from "../lib/localJsonCache";
import type { Playlist, SharedPlaylistListItem } from "../types";

interface SharedBrowserProps {
  onPracticeAsGuest: (playlist: Playlist) => void;
  onOpenCopiedPlaylist: (playlistId: string) => void;
  userId?: string;
}

export function SharedBrowser({ onPracticeAsGuest, onOpenCopiedPlaylist, userId }: SharedBrowserProps) {
  const [playlists, setPlaylists] = useState<SharedPlaylistListItem[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [busyId, setBusyId] = useState<string | null>(null);
  const [copiedPlaylistId, setCopiedPlaylistId] = useState<string | null>(null);

  const fetchShared = useCallback(async () => {
    const cacheKey = buildUserScopedCacheKey("shared-playlists", userId);
    const cached = readCachedJson<SharedPlaylistListItem[]>(cacheKey);
    const hasCachedPlaylists = cached !== null && Array.isArray(cached.value);
    if (cached && hasCachedPlaylists) {
      setPlaylists(cached.value);
      setLoading(false);
      setError(null);
    }

    setLoading(!hasCachedPlaylists);
    setError(null);
    try {
      const response = await fetch("/api/shared/playlists", { cache: "no-store" });
      if (response.status === 401) {
        setError("Sign in to browse shared playlists.");
        setPlaylists([]);
        return;
      }
      if (!response.ok) {
        throw new Error("Failed to load shared playlists");
      }
      const payload = (await response.json()) as { playlists?: SharedPlaylistListItem[] };
      const list = Array.isArray(payload.playlists) ? payload.playlists : [];
      setPlaylists(list);
      writeCachedJson(cacheKey, list);
    } catch {
      if (!hasCachedPlaylists) {
        setError("Unable to load shared playlists right now.");
        setPlaylists([]);
      }
    } finally {
      setLoading(false);
    }
  }, [userId]);

  useEffect(() => {
    void fetchShared();
  }, [fetchShared]);

  const handlePracticeAsGuest = async (playlistId: string) => {
    setBusyId(playlistId);
    setError(null);
    try {
      const response = await fetch(`/api/shared/playlists/${playlistId}`, { cache: "no-store" });
      if (!response.ok) {
        throw new Error("Failed to open shared playlist");
      }
      const playlist = (await response.json()) as Playlist;
      onPracticeAsGuest(playlist);
    } catch {
      setError("Unable to open that shared playlist right now.");
    } finally {
      setBusyId(null);
    }
  };

  const handleCopy = async (playlistId: string) => {
    setBusyId(playlistId);
    setError(null);
    setCopiedPlaylistId(null);
    try {
      const response = await fetch(`/api/shared/playlists/${playlistId}/import`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({}),
      });
      if (!response.ok) {
        throw new Error("Failed to copy shared playlist");
      }
      const payload = (await response.json()) as { playlist?: { id?: string } };
      const importedId = payload.playlist?.id;
      if (importedId) {
        setCopiedPlaylistId(importedId);
      }
    } catch {
      setError("Unable to copy that shared playlist right now.");
    } finally {
      setBusyId(null);
    }
  };

  if (loading) {
    return (
      <section data-testid="shared-browser-loading" className="space-y-2">
        <div className="h-16 animate-pulse rounded bg-gray-200" />
        <div className="h-16 animate-pulse rounded bg-gray-200" />
      </section>
    );
  }

  return (
    <section data-testid="shared-browser" className="space-y-4">
      {error ? (
        <div data-testid="shared-browser-error" className="rounded border border-amber-200 bg-amber-50 px-4 py-3 text-amber-900">
          {error}
        </div>
      ) : null}

      {copiedPlaylistId ? (
        <div data-testid="shared-copy-message" className="flex flex-wrap items-center justify-between gap-3 rounded border border-emerald-200 bg-emerald-50 px-4 py-3 text-emerald-900">
          <span>Copied to your playlists.</span>
          <button
            type="button"
            className="rounded border border-emerald-300 bg-white px-3 py-1 text-sm font-semibold text-emerald-800 hover:bg-emerald-100"
            onClick={() => onOpenCopiedPlaylist(copiedPlaylistId)}
          >
            Open copy
          </button>
        </div>
      ) : null}

      {playlists.length === 0 && !error ? (
        <div data-testid="shared-browser-empty" className="rounded border border-gray-200 bg-white p-6 text-gray-600">
          No public shared playlists yet.
        </div>
      ) : null}

      <div className="space-y-3" data-testid="shared-playlist-list">
        {playlists.map((playlist) => (
          <article key={playlist.id} data-testid={`shared-playlist-${playlist.id}`} className="rounded border border-gray-200 bg-white p-4 shadow-sm">
            <div className="flex flex-wrap items-start justify-between gap-3">
              <div className="min-w-0">
                <h3 className="text-lg font-semibold text-gray-950">{playlist.name}</h3>
                <p className="text-sm text-gray-600">
                  By <span className="font-semibold">{playlist.owner.displayName}</span> @{playlist.owner.username}
                </p>
                <p className="mt-1 text-xs text-gray-500">
                  {playlist.songCount} {playlist.songCount === 1 ? "song" : "songs"}
                  {playlist.eventDate ? ` - ${new Date(playlist.eventDate).toLocaleDateString()}` : ""}
                </p>
              </div>
              <div className="flex shrink-0 flex-wrap gap-2">
                <button
                  type="button"
                  data-testid={`shared-practice-${playlist.id}`}
                  className="rounded border border-indigo-300 px-3 py-1.5 text-sm font-semibold text-indigo-700 hover:bg-indigo-50 disabled:opacity-60"
                  disabled={busyId === playlist.id}
                  onClick={() => void handlePracticeAsGuest(playlist.id)}
                >
                  {busyId === playlist.id ? "Opening..." : "Practice as guest"}
                </button>
                <button
                  type="button"
                  data-testid={`shared-copy-${playlist.id}`}
                  className="rounded bg-indigo-600 px-3 py-1.5 text-sm font-semibold text-white hover:bg-indigo-700 disabled:opacity-60"
                  disabled={busyId === playlist.id}
                  onClick={() => void handleCopy(playlist.id)}
                >
                  {busyId === playlist.id ? "Copying..." : "Copy to my library"}
                </button>
              </div>
            </div>
          </article>
        ))}
      </div>
    </section>
  );
}
