import { describe, it, expect } from 'vitest';
import {
  createEditorSegment,
  reorderSegments,
  updateSegmentBounds,
  updateSegmentLabel,
  updateSegmentLyrics,
  deleteSegment,
  insertSegmentAt,
  splitSegment,
  mergeSegments,
  editorSegmentsToRows,
  rowsToEditorSegments,
  type EditorSegment,
} from './segmentEditor';

describe('segmentEditor', () => {
  describe('createEditorSegment', () => {
    it('creates a segment with correct structure', () => {
      const segment = createEditorSegment(1000, 2000);

      expect(segment).toEqual({
        id: expect.any(String),
        label: expect.stringMatching(/^Segment \d+$/),
        order: 0,
        startMs: 1000,
        endMs: 2000,
        lyricText: '',
      });
    });
  });

  describe('reorderSegments', () => {
    it('reorders segments by startMs and assigns order', () => {
      const segments: EditorSegment[] = [
        { id: '1', label: 'A', order: 0, startMs: 3000, endMs: 4000, lyricText: '' },
        { id: '2', label: 'B', order: 0, startMs: 1000, endMs: 2000, lyricText: '' },
        { id: '3', label: 'C', order: 0, startMs: 2000, endMs: 3000, lyricText: '' },
      ];

      const reordered = reorderSegments(segments);

      expect(reordered).toEqual([
        { id: '2', label: 'B', order: 0, startMs: 1000, endMs: 2000, lyricText: '' },
        { id: '3', label: 'C', order: 1, startMs: 2000, endMs: 3000, lyricText: '' },
        { id: '1', label: 'A', order: 2, startMs: 3000, endMs: 4000, lyricText: '' },
      ]);
    });
  });

  describe('updateSegmentBounds', () => {
    it('updates startMs and endMs of specified segment', () => {
      const segments: EditorSegment[] = [
        { id: '1', label: 'A', order: 0, startMs: 1000, endMs: 2000, lyricText: '' },
        { id: '2', label: 'B', order: 1, startMs: 2000, endMs: 3000, lyricText: '' },
      ];

      const updated = updateSegmentBounds(segments, '1', 500, 1500);

      expect(updated[0]).toEqual({
        id: '1', label: 'A', order: 0, startMs: 500, endMs: 1500, lyricText: ''
      });
      expect(updated[1]).toBe(segments[1]); // unchanged
    });
  });

  describe('updateSegmentLabel', () => {
    it('updates label of specified segment', () => {
      const segments: EditorSegment[] = [
        { id: '1', label: 'Old', order: 0, startMs: 1000, endMs: 2000, lyricText: '' },
      ];

      const updated = updateSegmentLabel(segments, '1', 'New Label');

      expect(updated[0].label).toBe('New Label');
    });
  });

  describe('updateSegmentLyrics', () => {
    it('updates lyricText of specified segment', () => {
      const segments: EditorSegment[] = [
        { id: '1', label: 'A', order: 0, startMs: 1000, endMs: 2000, lyricText: 'old' },
      ];

      const updated = updateSegmentLyrics(segments, '1', 'new lyrics');

      expect(updated[0].lyricText).toBe('new lyrics');
    });
  });

  describe('deleteSegment', () => {
    it('removes specified segment', () => {
      const segments: EditorSegment[] = [
        { id: '1', label: 'A', order: 0, startMs: 1000, endMs: 2000, lyricText: '' },
        { id: '2', label: 'B', order: 1, startMs: 2000, endMs: 3000, lyricText: '' },
      ];

      const updated = deleteSegment(segments, '1');

      expect(updated).toHaveLength(1);
      expect(updated[0].id).toBe('2');
    });
  });

  describe('insertSegmentAt', () => {
    it('inserts new segment and reorders', () => {
      const segments: EditorSegment[] = [
        { id: '1', label: 'A', order: 0, startMs: 2000, endMs: 3000, lyricText: '' },
      ];

      const updated = insertSegmentAt(segments, 1000);

      expect(updated).toHaveLength(2);
      expect(updated[0].startMs).toBe(1000);
      expect(updated[0].endMs).toBe(2000);
      expect(updated[1].startMs).toBe(2000);
      expect(updated[1].order).toBe(1);
    });
  });

  describe('splitSegment', () => {
    it('splits segment at specified time', () => {
      const segments: EditorSegment[] = [
        { id: '1', label: 'A', order: 0, startMs: 1000, endMs: 3000, lyricText: 'lyrics' },
      ];

      const updated = splitSegment(segments, '1', 2000);

      expect(updated).toHaveLength(2);
      expect(updated[0]).toEqual({
        id: '1', label: 'A', order: 0, startMs: 1000, endMs: 2000, lyricText: 'lyrics'
      });
      expect(updated[1].startMs).toBe(2000);
      expect(updated[1].endMs).toBe(3000);
    });

    it('does nothing if split point is at boundary', () => {
      const segments: EditorSegment[] = [
        { id: '1', label: 'A', order: 0, startMs: 1000, endMs: 3000, lyricText: '' },
      ];

      const updated = splitSegment(segments, '1', 1000);

      expect(updated).toBe(segments);
    });
  });

  describe('mergeSegments', () => {
    it('merges adjacent segments', () => {
      const segments: EditorSegment[] = [
        { id: '1', label: 'A', order: 0, startMs: 1000, endMs: 2000, lyricText: 'hello' },
        { id: '2', label: 'B', order: 1, startMs: 2000, endMs: 3000, lyricText: 'world' },
      ];

      const updated = mergeSegments(segments, '1', '2');

      expect(updated).toHaveLength(1);
      expect(updated[0]).toEqual({
        id: '1', label: 'A', order: 0, startMs: 1000, endMs: 3000, lyricText: 'hello world'
      });
    });

    it('does nothing for non-adjacent segments', () => {
      const segments: EditorSegment[] = [
        { id: '1', label: 'A', order: 0, startMs: 1000, endMs: 2000, lyricText: '' },
        { id: '2', label: 'B', order: 1, startMs: 3000, endMs: 4000, lyricText: '' },
      ];

      const updated = mergeSegments(segments, '1', '2');

      expect(updated).toBe(segments);
    });
  });

  describe('editorSegmentsToRows', () => {
    it('converts EditorSegment to SegmentRow', () => {
      const segments: EditorSegment[] = [
        { id: '1', label: 'A', order: 0, startMs: 1000, endMs: 2000, lyricText: 'test' },
      ];

      const rows = editorSegmentsToRows(segments, 'song-123');

      expect(rows).toEqual([
        {
          id: '1',
          songId: 'song-123',
          label: 'A',
          order: 0,
          startMs: 1000,
          endMs: 2000,
          lyricText: 'test',
          pitchContourNotes: [],
        },
      ]);
    });
  });

  describe('rowsToEditorSegments', () => {
    it('converts SegmentRow to EditorSegment', () => {
      const rows = [
        {
          id: '1',
          songId: 'song-123',
          label: 'A',
          order: 0,
          startMs: 1000,
          endMs: 2000,
          lyricText: 'test',
          pitchContourNotes: [],
        },
      ];

      const segments = rowsToEditorSegments(rows);

      expect(segments).toEqual([
        { id: '1', label: 'A', order: 0, startMs: 1000, endMs: 2000, lyricText: 'test' },
      ]);
    });

    it('converts null lyricText to empty string', () => {
      const rows = [
        {
          id: '1',
          songId: 'song-123',
          label: 'A',
          order: 0,
          startMs: 1000,
          endMs: 2000,
          lyricText: null,
          pitchContourNotes: [],
        },
      ];

      const segments = rowsToEditorSegments(rows);

      expect(segments).toEqual([
        { id: '1', label: 'A', order: 0, startMs: 1000, endMs: 2000, lyricText: '' },
      ]);
    });
  });
});