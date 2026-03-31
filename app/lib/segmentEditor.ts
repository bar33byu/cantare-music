import { SegmentRow } from '../../db/schema';
import { inferTimelineOrder } from './segmentTiming';

export type EditorSegment = {
  id: string;
  label: string;
  order: number;
  startMs: number;
  endMs: number;
  lyricText: string;
};

export function createEditorSegment(startMs: number, endMs: number): EditorSegment {
  return {
    id: crypto.randomUUID(),
    label: `Segment ${Date.now()}`, // Simple label, could be improved
    order: 0, // Will be reassigned by reorderSegments
    startMs,
    endMs,
    lyricText: '',
  };
}

export function reorderSegments(segments: EditorSegment[]): EditorSegment[] {
  return inferTimelineOrder(segments);
}

export function updateSegmentBounds(
  segments: EditorSegment[],
  segmentId: string,
  newStartMs: number,
  newEndMs: number
): EditorSegment[] {
  return segments.map(segment =>
    segment.id === segmentId
      ? { ...segment, startMs: newStartMs, endMs: newEndMs }
      : segment
  );
}

export function updateSegmentLabel(
  segments: EditorSegment[],
  segmentId: string,
  newLabel: string
): EditorSegment[] {
  return segments.map(segment =>
    segment.id === segmentId
      ? { ...segment, label: newLabel }
      : segment
  );
}

export function updateSegmentLyrics(
  segments: EditorSegment[],
  segmentId: string,
  newLyrics: string
): EditorSegment[] {
  return segments.map(segment =>
    segment.id === segmentId
      ? { ...segment, lyricText: newLyrics }
      : segment
  );
}

export function deleteSegment(
  segments: EditorSegment[],
  segmentId: string
): EditorSegment[] {
  return segments.filter(segment => segment.id !== segmentId);
}

export function insertSegmentAt(
  segments: EditorSegment[],
  insertAtMs: number
): EditorSegment[] {
  const newSegment = createEditorSegment(insertAtMs, insertAtMs + 1000); // 1 second default
  const newSegments = [...segments, newSegment];
  return reorderSegments(newSegments);
}

export function splitSegment(
  segments: EditorSegment[],
  segmentId: string,
  splitAtMs: number
): EditorSegment[] {
  const segmentIndex = segments.findIndex(s => s.id === segmentId);
  if (segmentIndex === -1) return segments;

  const segment = segments[segmentIndex];
  if (splitAtMs <= segment.startMs || splitAtMs >= segment.endMs) return segments;

  const firstPart = { ...segment, endMs: splitAtMs };
  const secondPart = createEditorSegment(splitAtMs, segment.endMs);

  const newSegments = [
    ...segments.slice(0, segmentIndex),
    firstPart,
    secondPart,
    ...segments.slice(segmentIndex + 1),
  ];

  return reorderSegments(newSegments);
}

export function mergeSegments(
  segments: EditorSegment[],
  segmentId1: string,
  segmentId2: string
): EditorSegment[] {
  const index1 = segments.findIndex(s => s.id === segmentId1);
  const index2 = segments.findIndex(s => s.id === segmentId2);

  if (index1 === -1 || index2 === -1) return segments;

  const [first, second] = index1 < index2 ? [segments[index1], segments[index2]] : [segments[index2], segments[index1]];

  // Check if segments are adjacent in time
  if (first.endMs !== second.startMs) return segments;

  const merged = {
    ...first,
    endMs: second.endMs,
    lyricText: first.lyricText + (first.lyricText && second.lyricText ? ' ' : '') + second.lyricText,
  };

  const newSegments = segments.filter(s => s.id !== segmentId1 && s.id !== segmentId2);
  newSegments.splice(Math.min(index1, index2), 0, merged);

  return reorderSegments(newSegments);
}

export function editorSegmentsToRows(segments: EditorSegment[], songId: string): SegmentRow[] {
  return segments.map(segment => ({
    id: segment.id,
    songId,
    label: segment.label,
    order: segment.order,
    startMs: segment.startMs,
    endMs: segment.endMs,
    lyricText: segment.lyricText,
  }));
}

export function rowsToEditorSegments(rows: SegmentRow[]): EditorSegment[] {
  return rows.map(row => ({
    id: row.id,
    label: row.label,
    order: row.order,
    startMs: row.startMs,
    endMs: row.endMs,
    lyricText: row.lyricText ?? '',
  }));
}