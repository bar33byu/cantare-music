"use client";

import { useEffect, useMemo, useState } from 'react';
import type { Playlist } from '../types';
import type { SessionState } from '../lib/sessionReducer';
import { makeSession } from '../lib/factories';
import PracticeView from './PracticeView';

interface PlaylistPracticeViewProps {
  playlist: Playlist;
  initialSongIndex?: number;
  onExit: () => void;
}

export function PlaylistPracticeView({ playlist, initialSongIndex = 0, onExit }: PlaylistPracticeViewProps) {
  const [currentSongIndex, setCurrentSongIndex] = useState(initialSongIndex);
  const [playlistScore, setPlaylistScore] = useState(0);
  const [sessionsBySong, setSessionsBySong] = useState<Record<string, SessionState>>({});

  const songs = useMemo(
    () => [...playlist.songs].sort((a, b) => a.position - b.position),
    [playlist.songs]
  );

  const currentSong = songs[currentSongIndex] ?? null;
  const hasPrev = currentSongIndex > 0;
  const hasNext = currentSongIndex < songs.length - 1;

  const loadPlaylistScore = async () => {
    try {
      const response = await fetch(`/api/playlists/${playlist.id}/knowledge`);
      if (!response?.ok) {
        return;
      }
      const data = (await response.json()) as { score?: number };
      setPlaylistScore(Math.round((data.score ?? 0) * 100));
    } catch {
      return;
    }
  };

  useEffect(() => {
    void loadPlaylistScore();
  }, [playlist.id]);

  const currentSession = useMemo(() => {
    if (!currentSong) {
      return null;
    }
    return sessionsBySong[currentSong.id] ?? makeSession({ songId: currentSong.id, currentSongId: currentSong.id });
  }, [currentSong, sessionsBySong]);

  const persistCurrentSongRatings = async () => {
    if (!currentSong || !currentSession) {
      return;
    }
    await fetch(`/api/songs/${currentSong.id}/ratings`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({
        ratings: currentSession.ratings.map((rating) => ({
          segmentId: rating.segmentId,
          rating: rating.rating,
          ratedAt: rating.ratedAt,
        })),
      }),
    });
  };

  const moveSong = async (offset: number) => {
    const target = currentSongIndex + offset;
    if (target < 0 || target >= songs.length) {
      return;
    }

    await persistCurrentSongRatings();
    setCurrentSongIndex(target);
    await loadPlaylistScore();
  };

  if (!currentSong || !currentSession) {
    return <div data-testid="playlist-practice-empty">No songs in this playlist yet.</div>;
  }

  return (
    <section data-testid="playlist-practice-view" className="space-y-4">
      <header className="flex flex-wrap items-center justify-between gap-3">
        <div>
          <p data-testid="playlist-practice-score" className="text-sm font-medium text-indigo-700">
            Playlist Knowledge: {playlistScore}%
          </p>
          <p data-testid="playlist-practice-breadcrumb" className="text-sm text-gray-600">
            {playlist.name} {'>'} {currentSongIndex + 1} {currentSong.title}
          </p>
        </div>
        <button data-testid="playlist-practice-exit" className="rounded border border-gray-300 px-3 py-2" onClick={onExit}>
          Exit
        </button>
      </header>

      <PracticeView
        song={currentSong}
        initialSession={currentSession}
        onSessionChange={(session) => {
          setSessionsBySong((previous) => ({ ...previous, [currentSong.id]: session }));
          void loadPlaylistScore();
        }}
      />

      <div className="flex justify-between">
        {hasPrev ? (
          <button data-testid="playlist-prev-song" className="rounded border border-indigo-300 px-3 py-2 text-indigo-700" onClick={() => void moveSong(-1)}>
            ← Previous Song
          </button>
        ) : <span />}

        {hasNext ? (
          <button data-testid="playlist-next-song" className="rounded bg-indigo-600 px-3 py-2 text-white" onClick={() => void moveSong(1)}>
            Next Song →
          </button>
        ) : null}
      </div>
    </section>
  );
}
