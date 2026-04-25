export interface PitchContourNote {
  id: string;
  timeOffsetMs: number;
  lane: number;
  durationMs: number;
}

export interface ContourNoteHeatStat {
  sessionCount: number;
  missCount: number;
  missRate: number;
}

export interface Segment {
  id: string;
  songId: string;
  order: number;
  label: string;
  lyricText: string;
  startMs: number;
  endMs: number;
  pitchContourNotes?: PitchContourNote[];
}

export interface Song {
  id: string;
  title: string;
  artist?: string;
  description?: string;
  audioUrl: string;
  segments: Segment[];
  createdAt: string;
  lastPracticedAt?: string | null;
  updatedAt?: string;
}

export type MemoryRating = 1 | 2 | 3 | 4 | 5;

export interface SegmentRating {
  id: string;
  segmentId: string;
  rating: MemoryRating;
  ratedAt: string;
}

export interface PracticeSession {
  id: string;
  songId: string;
  currentSegmentIndex: number;
  isLocked: boolean;
  ratings: SegmentRating[];
  startedAt: string;
  completedAt?: string;
}

export interface KnowledgeScore {
  overall: number;
  bySegment: Record<string, number>;
}

export interface Playlist {
  id: string;
  name: string;
  eventDate?: string;
  isRetired: boolean;
  createdAt: string;
  songs: Array<Song & { position: number; masteryPercent?: number; ratingCount?: number }>;
}
