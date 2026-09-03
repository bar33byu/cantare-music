import type { Segment } from "../types";

const MASTERY_COLORS = [
  "rgb(226, 232, 240)", // 0: unrated / slate
  "rgb(219, 39, 119)",  // 1: pink
  "rgb(234, 88, 12)",   // 2: orange
  "rgb(202, 138, 4)",   // 3: gold
  "rgb(8, 145, 178)",   // 4: cyan
  "rgb(79, 70, 229)",   // 5: indigo
] as const;

const MASTERY_TEXT_COLORS = [
  "rgb(2, 6, 23)",       // 0: dark text
  "rgb(255, 255, 255)",  // 1: light text
  "rgb(2, 6, 23)",       // 2: dark text
  "rgb(2, 6, 23)",       // 3: dark text
  "rgb(2, 6, 23)",       // 4: dark text
  "rgb(255, 255, 255)",  // 5: light text
] as const;

const EMPTY_GRADIENT_COLOR = { r: 255, g: 255, b: 255 };
const FULL_GRADIENT_COLOR = { r: 79, g: 70, b: 229 };

function clamp01(value: number): number {
  if (Number.isNaN(value)) {
    return 0;
  }
  return Math.min(1, Math.max(0, value));
}

export function getMasteryPercent(bySegment: Record<string, number>, segmentId: string): number {
  return bySegment[segmentId] ?? 0;
}

export function getMasteryLevel(percent: number): number {
  return Math.ceil(clamp01(percent / 100) * 5);
}

export function getMasteryColor(percent: number): string {
  return MASTERY_COLORS[getMasteryLevel(percent)];
}

export function getMasteryTextColor(percent: number): string {
  return MASTERY_TEXT_COLORS[getMasteryLevel(percent)];
}

export function getMasteryGradientColor(percent: number): string {
  const ratio = clamp01(percent / 100);
  const r = Math.round(EMPTY_GRADIENT_COLOR.r + (FULL_GRADIENT_COLOR.r - EMPTY_GRADIENT_COLOR.r) * ratio);
  const g = Math.round(EMPTY_GRADIENT_COLOR.g + (FULL_GRADIENT_COLOR.g - EMPTY_GRADIENT_COLOR.g) * ratio);
  const b = Math.round(EMPTY_GRADIENT_COLOR.b + (FULL_GRADIENT_COLOR.b - EMPTY_GRADIENT_COLOR.b) * ratio);
  return `rgb(${r}, ${g}, ${b})`;
}

export interface MasteryTimelineChunk {
  startMs: number;
  endMs: number;
  percent: number;
  isCovered: boolean;
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
    let isCovered = false;
    for (const segment of segments) {
      const overlaps = segment.startMs < endMs && segment.endMs > startMs;
      if (!overlaps) {
        continue;
      }
      isCovered = true;
      maxPercent = Math.max(maxPercent, getMasteryPercent(bySegment, segment.id));
    }

    chunks.push({ startMs, endMs, percent: maxPercent, isCovered });
  }

  return chunks;
}
