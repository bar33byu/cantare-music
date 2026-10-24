export interface MemoryReviewState {
  startedAt: string;
  segments: Array<{ segmentId: string; ratedAt: string }>;
  undone?: boolean;
}

/** Three calendar months, clamped to the last day of the target month. */
export function memoryReviewCutoff(now = new Date()): Date {
  const cutoff = new Date(now);
  const day = cutoff.getUTCDate();
  cutoff.setUTCDate(1);
  cutoff.setUTCMonth(cutoff.getUTCMonth() - 3);
  const lastDay = new Date(Date.UTC(cutoff.getUTCFullYear(), cutoff.getUTCMonth() + 1, 0)).getUTCDate();
  cutoff.setUTCDate(Math.min(day, lastDay));
  return cutoff;
}

export function isMemoryReviewDue(activity: Array<string | Date | null | undefined>, state?: MemoryReviewState | null, now = new Date()): boolean {
  const times = activity.map(value => value ? new Date(value).getTime() : NaN)
    .filter(time => Number.isFinite(time) && time <= now.getTime());
  if (!times.length) return false;
  const cutoff = memoryReviewCutoff(now).getTime();
  return Math.max(...times) < cutoff && (!state || Date.parse(state.startedAt) < cutoff);
}

export function pendingMemoryReviewSegments(state: MemoryReviewState | null | undefined, ratings: Array<{segmentId: string; ratedAt: string}>): string[] {
  if (!state || state.undone) return [];
  return state.segments.filter(segment => ratings.some(rating => rating.segmentId === segment.segmentId
    && Date.parse(rating.ratedAt) === Date.parse(segment.ratedAt))).map(segment => segment.segmentId);
}


/** A recorded rehearsal or performance completes the song-level reminder. */
export function hasRehearsedSinceMemoryReview(
  state: MemoryReviewState | null | undefined,
  activity: Array<string | Date | null | undefined>,
  now = new Date(),
): boolean {
  if (!state) return false;
  const startedAt = Date.parse(state.startedAt);
  return activity.some(value => {
    const time = value ? new Date(value).getTime() : NaN;
    return time >= startedAt && time <= now.getTime();
  });
}
