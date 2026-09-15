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

export interface PlaylistRefreshCandidate {
  sourceSongId: string;
  currentSongId?: string | null;
  title: string;
  artist?: string;
  position: number;
  status: "new" | "refreshable";
  segmentCount: number;
  hasPartAudio: boolean;
  hasBlendAudio: boolean;
}

export interface PlaylistRefreshPreview {
  sourcePlaylist: {
    id: string;
    name: string;
    owner: {
      id: string;
      displayName: string;
      username: string;
    };
  };
  candidates: PlaylistRefreshCandidate[];
}
