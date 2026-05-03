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

export function inferTimelineOrder<T extends TimelineSegment>(segments: T[]): (T & { order: number })[] {
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

export function getPlaybackAnchoredNewSegmentPlacement(
  segments: TimelineSegment[],
  playbackMs: number,
  durationMs = DEFAULT_DURATION_MS,
  minimumDurationMs = DEFAULT_MIN_GAP_MS,
  offsetAfterLastMs = DEFAULT_OFFSET_AFTER_LAST_MS,
  minimumSpaceBeforeNextMs = 15_000
): NewSegmentPlacement {
  const basePlacement = getDefaultNewSegmentPlacement(
    segments,
    undefined,
    durationMs,
    minimumDurationMs,
    offsetAfterLastMs
  );
  const safePlaybackMs = Math.max(0, asFiniteNumber(playbackMs, 0));
  const safeDuration = Math.max(0, asFiniteNumber(durationMs, DEFAULT_DURATION_MS));
  const safeMinimumDuration = Math.max(1, asFiniteNumber(minimumDurationMs, DEFAULT_MIN_GAP_MS));
  const safeMinimumSpace = Math.max(0, asFiniteNumber(minimumSpaceBeforeNextMs, 15_000));

  // Find the next segment that would be after the playhead position
  const sortedSegments = [...segments].sort((a, b) => a.startMs - b.startMs);
  const nextSegmentAfterPlayhead = sortedSegments.find((seg) => seg.startMs > safePlaybackMs);

  // Check if we can fit at least 15 seconds before the next segment
  const nextStartMs = Math.max(basePlacement.startMs, safePlaybackMs);
  const nextEndMs = Math.max(nextStartMs + safeDuration, nextStartMs + safeMinimumDuration);

  // If there's a next segment and we don't have enough space, use the default placement instead
  if (nextSegmentAfterPlayhead && nextSegmentAfterPlayhead.startMs - nextEndMs < safeMinimumSpace) {
    return basePlacement;
  }

  return {
    startMs: nextStartMs,
    endMs: nextEndMs,
  };
}
