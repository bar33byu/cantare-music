"use client";

import { useMemo, useState } from "react";
import { PlaylistPracticeView } from "../../../components/PlaylistPracticeView";
import PracticeView from "../../../components/PracticeView";
import { makeSession } from "../../../lib/factories";
import type { PreferredAudioVersion } from "../../../lib/audioUrls";
import type { Playlist, Song } from "../../../types";

type PracticeMode = "preview" | "playlist" | "song";

interface SharedPlaylistGuestPracticeProps {
  playlist: Playlist;
  shareToken: string;
}

export function SharedPlaylistGuestPractice({ playlist, shareToken }: SharedPlaylistGuestPracticeProps) {
  const [mode, setMode] = useState<PracticeMode>("preview");
  const [selectedSong, setSelectedSong] = useState<Song | null>(null);
  const [preferredAudioVersion, setPreferredAudioVersion] = useState<PreferredAudioVersion>("part");

  const selectedSongSession = useMemo(() => {
    if (!selectedSong) {
      return null;
    }
    return makeSession({
      songId: selectedSong.id,
      currentSongId: selectedSong.id,
      ratings: [],
    });
  }, [selectedSong]);

  const openSongPractice = (song: Song) => {
    setSelectedSong(song);
    setMode("song");
  };

  if (mode === "playlist") {
    return (
      <section className="rounded border border-gray-200 bg-white p-4 shadow-sm">
        <PlaylistPracticeView
          playlist={playlist}
          persistProgress={false}
          progressStorage="local"
          revalidatePlaylist={false}
          sharedPlaylistToken={shareToken}
          preferredAudioVersion={preferredAudioVersion}
          onPreferredAudioVersionChange={setPreferredAudioVersion}
          onExit={() => setMode("preview")}
          onSelectSong={openSongPractice}
        />
      </section>
    );
  }

  if (mode === "song" && selectedSong && selectedSongSession) {
    return (
      <section className="rounded border border-gray-200 bg-white p-4 shadow-sm">
        <PracticeView
          song={selectedSong}
          persistProgress={false}
          progressStorage="local"
          sharedPlaylistToken={shareToken}
          initialSession={selectedSongSession}
          breadcrumbRootLabel={playlist.name}
          onBreadcrumbRootClick={() => setMode("preview")}
          preferredAudioVersion={preferredAudioVersion}
          onPreferredAudioVersionChange={setPreferredAudioVersion}
        />
      </section>
    );
  }

  return (
    <div className="space-y-5">
      <section className="rounded border border-indigo-100 bg-white p-4 shadow-sm">
        <div className="flex flex-col gap-3 sm:flex-row sm:items-center sm:justify-between">
          <div>
            <h2 className="text-lg font-semibold text-gray-950">Practice from this link</h2>
            <p className="mt-1 text-sm text-gray-600">
              Click any song title below to jump straight into practice, or start the whole playlist at once.
            </p>
          </div>
          <button
            type="button"
            onClick={() => setMode("playlist")}
            className="inline-flex justify-center rounded bg-indigo-600 px-4 py-2 text-sm font-semibold text-white hover:bg-indigo-700"
          >
            Practice whole playlist
          </button>
        </div>
      </section>

      <ul className="space-y-3" data-testid="shared-playlist-song-list">
        {playlist.songs.length > 0 ? (
          playlist.songs.map((song, index) => (
            <li key={song.id}>
              <button
                type="button"
                onClick={() => openSongPractice(song)}
                className="flex w-full items-start gap-3 rounded border border-gray-200 bg-white p-4 text-left shadow-sm transition hover:border-indigo-300 hover:bg-indigo-50/30"
              >
                <span className="flex h-7 w-7 shrink-0 items-center justify-center rounded-full bg-indigo-50 text-sm font-semibold text-indigo-700">
                  {index + 1}
                </span>
                <span className="min-w-0">
                  <span className="block font-semibold text-gray-950">{song.title}</span>
                  {song.artist ? <span className="mt-1 block text-sm text-gray-600">{song.artist}</span> : null}
                  {song.segments.length > 0 ? (
                    <span className="mt-2 block text-xs text-gray-500">
                      {song.segments.length} {song.segments.length === 1 ? "section" : "sections"}
                    </span>
                  ) : null}
                </span>
              </button>
            </li>
          ))
        ) : (
          <li className="rounded border border-gray-200 bg-white p-4 text-gray-600 shadow-sm">
            This playlist does not have songs yet.
          </li>
        )}
      </ul>
    </div>
  );
}
