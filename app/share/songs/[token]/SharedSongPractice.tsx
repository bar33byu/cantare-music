"use client";

import { useMemo, useState } from "react";
import PracticeView from "../../../components/PracticeView";
import { makeSession } from "../../../lib/factories";
import type { PreferredAudioVersion } from "../../../lib/audioUrls";
import type { Song } from "../../../types";

interface SharedSongPracticeProps {
  song: Song;
}

export function SharedSongPractice({ song }: SharedSongPracticeProps) {
  const [preferredAudioVersion, setPreferredAudioVersion] = useState<PreferredAudioVersion>("part");
  const session = useMemo(() => makeSession({
    songId: song.id,
    currentSongId: song.id,
    ratings: [],
  }), [song.id]);

  return (
    <section className="rounded border border-gray-200 bg-white p-4 shadow-sm">
      <PracticeView
        song={song}
        persistProgress={false}
        progressStorage="local"
        initialSession={session}
        breadcrumbRootLabel="Shared song"
        preferredAudioVersion={preferredAudioVersion}
        onPreferredAudioVersionChange={setPreferredAudioVersion}
      />
    </section>
  );
}
