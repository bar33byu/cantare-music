import { compareNaturalText } from "./naturalSort";

export const SONG_SORT_KEYS = [
  "alphabetical",
  "date-added",
  "date-practiced",
  "memory-score",
] as const;

export type SongSortKey = (typeof SONG_SORT_KEYS)[number];

export interface SongSortState {
  key: SongSortKey;
  asc: boolean;
}

export interface SortableSong {
  title: string;
  createdAt?: string | null;
  lastPracticedAt?: string | null;
  masteryPercent?: number;
}

export const SONG_SORT_KEY_LABELS: Record<SongSortKey, string> = {
  alphabetical: "Alphabetical",
  "date-added": "Date Added",
  "date-practiced": "Last Practiced",
  "memory-score": "Memory Score",
};

export function sortSongs<T extends SortableSong>(songs: T[], sort: SongSortState): T[] {
  const direction = sort.asc ? 1 : -1;

  return [...songs].sort((a, b) => {
    switch (sort.key) {
      case "alphabetical":
        return direction * compareNaturalText(a.title, b.title);
      case "date-added":
        return direction * (a.createdAt ?? "").localeCompare(b.createdAt ?? "");
      case "date-practiced": {
        const aTime = a.lastPracticedAt ?? "";
        const bTime = b.lastPracticedAt ?? "";
        if (!aTime && !bTime) return 0;
        if (!aTime) return direction;
        if (!bTime) return -direction;
        return direction * aTime.localeCompare(bTime);
      }
      case "memory-score":
        return direction * ((a.masteryPercent ?? 0) - (b.masteryPercent ?? 0));
    }
  });
}
