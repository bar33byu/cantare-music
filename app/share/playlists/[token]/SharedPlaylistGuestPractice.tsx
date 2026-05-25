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
}

export function SharedPlaylistGuestPractice({ playlist }: SharedPlaylistGuestPracticeProps) {
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

  if (mode === "playlist") {
    return (
      <section className="rounded border border-gray-200 bg-white p-4 shadow-sm">
        <PlaylistPracticeView
          playlist={playlist}
          persistProgress={false}
          progressStorage="local"
          revalidatePlaylist={false}
          preferredAudioVersion={preferredAudioVersion}
          onPreferredAudioVersionChange={setPreferredAudioVersion}
          onExit={() => setMode("preview")}
          onSelectSong={(song) => {
            setSelectedSong(song);
            setMode("song");
          }}
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
          initialSession={selectedSongSession}
          breadcrumbRootLabel={playlist.name}
          onBreadcrumbRootClick={() => setMode("playlist")}
          preferredAudioVersion={preferredAudioVersion}
          onPreferredAudioVersionChange={setPreferredAudioVersion}
        />
      </section>
    );
  }

  return (
    <section className="rounded border border-indigo-100 bg-white p-4 shadow-sm">
      <div className="flex flex-col gap-3 sm:flex-row sm:items-center sm:justify-between">
        <div>
          <h2 className="text-lg font-semibold text-gray-950">Practice from this link</h2>
          <p className="mt-1 text-sm text-gray-600">
            Guests can practice and keep ratings in this browser. Sign in when you want to copy the playlist.
          </p>
        </div>
        <button
          type="button"
          onClick={() => setMode("playlist")}
          className="inline-flex justify-center rounded bg-indigo-600 px-4 py-2 text-sm font-semibold text-white hover:bg-indigo-700"
        >
          Practice as guest
        </button>
      </div>
    </section>
  );
}
