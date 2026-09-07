import type { SessionState } from "./sessionReducer";

export function makeSession(overrides?: Partial<SessionState>): SessionState {
  return {
    id: crypto.randomUUID(),
    songId: "seed-1",
    currentSegmentIndex: 0,
    isLocked: false,
    ratings: [],
    startedAt: new Date().toISOString(),
    currentSongId: null,
    ...overrides,
  };
}
