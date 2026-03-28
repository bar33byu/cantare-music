"use client";

import PracticeView from "./components/PracticeView";
import { makeSong, makeSegment, makeSession } from "./lib/factories";

const seedSong = makeSong({
  title: "Cantare Practice Song",
  segments: [
    makeSegment({ label: "Verse 1", order: 0 }),
    makeSegment({ label: "Chorus", order: 1 }),
    makeSegment({ label: "Verse 2", order: 2 }),
    makeSegment({ label: "Bridge", order: 3 }),
  ],
});

const seedSession = makeSession({ songId: seedSong.id });

export default function Home() {
  return (
    <div className="min-h-screen flex items-center justify-center bg-gray-50 p-4">
      <PracticeView song={seedSong} initialSession={seedSession} />
    </div>
  );
}
