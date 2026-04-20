import type { Segment } from "../types";

const EMPTY_COLOR = { r: 255, g: 255, b: 255 };
const FULL_COLOR = { r: 22, g: 163, b: 74 };

function clamp01(value: number): number {
  if (Number.isNaN(value)) {
    return 0;
  }
  return Math.min(1, Math.max(0, value));
}

export function getMasteryPercent(bySegment: Record<string, number>, segmentId: string): number {
  return bySegment[segmentId] ?? 0;
}

export function getMasteryColor(percent: number): string {
  const ratio = clamp01(percent / 100);
  const r = Math.round(EMPTY_COLOR.r + (FULL_COLOR.r - EMPTY_COLOR.r) * ratio);
  const g = Math.round(EMPTY_COLOR.g + (FULL_COLOR.g - EMPTY_COLOR.g) * ratio);
  const b = Math.round(EMPTY_COLOR.b + (FULL_COLOR.b - EMPTY_COLOR.b) * ratio);
  return `rgb(${r}, ${g}, ${b})`;
}

export interface MasteryTimelineChunk {
  startMs: number;
  endMs: number;
  percent: number;
}

export function buildMasteryTimelineChunks(
  segments: Segment[],
  bySegment: Record<string, number>,
  durationMs: number
): MasteryTimelineChunk[] {
  if (durationMs <= 0) {
    return [];
  }

  const boundaries = new Set<number>([0, durationMs]);
  for (const segment of segments) {
    boundaries.add(Math.max(0, Math.min(durationMs, segment.startMs)));
    boundaries.add(Math.max(0, Math.min(durationMs, segment.endMs)));
  }

  const sorted = Array.from(boundaries).sort((a, b) => a - b);
  const chunks: MasteryTimelineChunk[] = [];

  for (let i = 0; i < sorted.length - 1; i += 1) {
    const startMs = sorted[i];
    const endMs = sorted[i + 1];
    if (endMs <= startMs) {
      continue;
    }

    let maxPercent = 0;
    for (const segment of segments) {
      const overlaps = segment.startMs < endMs && segment.endMs > startMs;
      if (!overlaps) {
        continue;
      }
      maxPercent = Math.max(maxPercent, getMasteryPercent(bySegment, segment.id));
    }

    chunks.push({ startMs, endMs, percent: maxPercent });
  }

  return chunks;
}
