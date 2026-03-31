export interface TimelineSegment {
  id: string;
  startMs: number;
  endMs: number;
}

export interface NewSegmentPlacement {
  startMs: number;
  endMs: number;
}

const DEFAULT_DURATION_MS = 20_000;
const DEFAULT_MIN_GAP_MS = 1_000;
const DEFAULT_OFFSET_AFTER_LAST_MS = 500;

function asFiniteNumber(value: unknown, fallback: number): number {
  if (typeof value !== 'number' || !Number.isFinite(value)) {
    return fallback;
  }
  return value;
}

export function inferTimelineOrder<T extends TimelineSegment>(segments: T[]): T[] {
  return [...segments]
    .sort((a, b) => a.startMs - b.startMs || a.endMs - b.endMs || a.id.localeCompare(b.id))
    .map((segment, index) => ({
      ...segment,
      order: index,
    }));
}

export function getDefaultNewSegmentPlacement(
  segments: TimelineSegment[],
  playbackMs?: number,
  durationMs = DEFAULT_DURATION_MS,
  minimumDurationMs = DEFAULT_MIN_GAP_MS,
  offsetAfterLastMs = DEFAULT_OFFSET_AFTER_LAST_MS
): NewSegmentPlacement {
  const safeDuration = Math.max(0, asFiniteNumber(durationMs, DEFAULT_DURATION_MS));
  const safeMinimumDuration = Math.max(1, asFiniteNumber(minimumDurationMs, DEFAULT_MIN_GAP_MS));
  const safeOffset = Math.max(0, asFiniteNumber(offsetAfterLastMs, DEFAULT_OFFSET_AFTER_LAST_MS));

  const lastVisibleEnd = segments.reduce((maxEnd, segment) => {
    const segmentEnd = Math.max(0, asFiniteNumber(segment.endMs, 0));
    return Math.max(maxEnd, segmentEnd);
  }, -1);

  const fallbackStart = Math.max(0, asFiniteNumber(playbackMs, 0));
  const startMs = lastVisibleEnd >= 0 ? lastVisibleEnd + safeOffset : fallbackStart;
  const intendedEnd = startMs + safeDuration;
  const endMs = Math.max(intendedEnd, startMs + safeMinimumDuration);

  return { startMs, endMs };
}
