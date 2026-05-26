export interface PitchContourNote {
  id: string;
  timeOffsetMs: number;
  lane: number;
  durationMs: number;
}

export interface SongPitchContourNote {
  id: string;
  absoluteMs: number;
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
  sourceSegmentId?: string | null;
  order: number;
  label: string;
  lyricText: string;
  startMs: number;
  endMs: number;
  pitchContourNotes?: PitchContourNote[];
}

export interface DraftRecording {
  id: string;
  songId: string;
  title?: string | null;
  audioKey: string;
  audioUrl?: string;
  status: "draft" | "archived";
  trimStartMs?: number | null;
  trimEndMs?: number | null;
  createdAt: string;
  archivedAt?: string | null;
}

export interface Song {
  id: string;
  sourceSongId?: string | null;
  title: string;
  artist?: string;
  description?: string;
  audioUrl: string;
  alternateAudioUrl?: string;
  audioTrimStartMs?: number | null;
  audioTrimEndMs?: number | null;
  pitchContourNotes?: SongPitchContourNote[];
  hasMidiContour?: boolean;
  draftRecordings?: DraftRecording[];
  archivedDraftRecordings?: DraftRecording[];
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
  isPublic?: boolean;
  publishedAt?: string | null;
  shareToken?: string | null;
  shareUrl?: string | null;
  sharedAt?: string | null;
  sourcePlaylistId?: string | null;
  sourceOwnerId?: string | null;
  sourceShareToken?: string | null;
  importedAt?: string | null;
  createdAt: string;
  songs: Array<Song & { position: number; masteryPercent?: number; ratingCount?: number }>;
}

export interface SharedPlaylistListItem {
  id: string;
  name: string;
  eventDate?: string;
  isRetired: boolean;
  isPublic: boolean;
  publishedAt?: string | null;
  shareToken?: string | null;
  sharedAt?: string | null;
  createdAt: string;
  songCount: number;
  owner: {
    id: string;
    displayName: string;
    username: string;
  };
}
