import type { Song } from "../types/index";

export const SEED_SONGS: Song[] = [
  {
    id: "seed-1",
    title: "Awake and Arise",
    artist: "Public Domain",
    audioUrl: "/audio/placeholder.mp3",
    createdAt: "2026-01-01T00:00:00.000Z",
    updatedAt: "2026-01-01T00:00:00.000Z",
    segments: [
      {
        id: "seed-1-seg-0",
        songId: "seed-1",
        order: 0,
        label: "Section 1",
        lyricText: "Awake and arise, O ye slumbering nations!",
        startMs: 0,
        endMs: 10000,
      },
      {
        id: "seed-1-seg-1",
        songId: "seed-1",
        order: 1,
        label: "Section 2",
        lyricText: "The heavens have opened their portals again.",
        startMs: 10000,
        endMs: 25000,
      },
      {
        id: "seed-1-seg-2",
        songId: "seed-1",
        order: 2,
        label: "Section 3",
        lyricText: "The angels have welcomed their King to his throne.",
        startMs: 25000,
        endMs: 40000,
      },
      {
        id: "seed-1-seg-3",
        songId: "seed-1",
        order: 3,
        label: "Section 4",
        lyricText: "And mortality now is made truly immortal.",
        startMs: 40000,
        endMs: 60000,
      },
    ],
  },
];