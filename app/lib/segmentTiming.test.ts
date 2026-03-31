import { describe, expect, it } from 'vitest';
import {
  getDefaultNewSegmentPlacement,
  getPlaybackAnchoredNewSegmentPlacement,
  inferTimelineOrder,
} from './segmentTiming';

describe('getDefaultNewSegmentPlacement', () => {
  it('uses playback position when there are no visible segments', () => {
    const placement = getDefaultNewSegmentPlacement([], 12000);
    expect(placement).toEqual({ startMs: 12000, endMs: 32000 });
  });

  it('falls back to zero playback when there are no segments and playback is undefined', () => {
    const placement = getDefaultNewSegmentPlacement([], undefined);
    expect(placement).toEqual({ startMs: 0, endMs: 20000 });
  });

  it('starts 500ms after the last visible segment end', () => {
    const placement = getDefaultNewSegmentPlacement([
      { id: 'seg-1', startMs: 0, endMs: 20_000 },
      { id: 'seg-2', startMs: 30_000, endMs: 45_000 },
    ]);
    expect(placement).toEqual({ startMs: 45_500, endMs: 65_500 });
  });

  it('clamps invalid duration input and enforces minimum segment duration', () => {
    const placement = getDefaultNewSegmentPlacement([], 3000, Number.NaN, -10);
    expect(placement).toEqual({ startMs: 3000, endMs: 23000 });
  });
});

describe('inferTimelineOrder', () => {
  it('keeps already sorted segments in order and assigns sequential order', () => {
    const ordered = inferTimelineOrder([
      { id: 'seg-1', startMs: 0, endMs: 1000 },
      { id: 'seg-2', startMs: 1000, endMs: 2000 },
    ]);

    expect(ordered.map((segment) => segment.id)).toEqual(['seg-1', 'seg-2']);
    expect(ordered.map((segment) => segment.order)).toEqual([0, 1]);
  });

  it('sorts unsorted segments by startMs and assigns order', () => {
    const ordered = inferTimelineOrder([
      { id: 'seg-3', startMs: 3000, endMs: 5000 },
      { id: 'seg-1', startMs: 0, endMs: 2000 },
      { id: 'seg-2', startMs: 2000, endMs: 3000 },
    ]);

    expect(ordered.map((segment) => segment.id)).toEqual(['seg-1', 'seg-2', 'seg-3']);
    expect(ordered.map((segment) => segment.order)).toEqual([0, 1, 2]);
  });

  it('uses endMs as secondary tie-breaker when startMs is the same', () => {
    const ordered = inferTimelineOrder([
      { id: 'seg-long', startMs: 1000, endMs: 4000 },
      { id: 'seg-short', startMs: 1000, endMs: 2000 },
    ]);

    expect(ordered.map((segment) => segment.id)).toEqual(['seg-short', 'seg-long']);
  });

  it('remains deterministic when startMs and endMs are tied', () => {
    const input = [
      { id: 'seg-b', startMs: 1000, endMs: 2000 },
      { id: 'seg-a', startMs: 1000, endMs: 2000 },
    ];

    const first = inferTimelineOrder(input);
    const second = inferTimelineOrder(input);

    expect(first).toEqual(second);
    expect(first.map((segment) => segment.id)).toEqual(['seg-a', 'seg-b']);
  });
});

describe('getPlaybackAnchoredNewSegmentPlacement', () => {
  it('anchors to playback when playback is after last segment offset', () => {
    const placement = getPlaybackAnchoredNewSegmentPlacement(
      [{ id: 'seg-1', startMs: 0, endMs: 30_000 }],
      45_000
    );

    expect(placement).toEqual({ startMs: 45_000, endMs: 65_000 });
  });

  it('keeps last-segment offset when playback is behind it', () => {
    const placement = getPlaybackAnchoredNewSegmentPlacement(
      [{ id: 'seg-1', startMs: 0, endMs: 30_000 }],
      20_000
    );

    expect(placement).toEqual({ startMs: 30_500, endMs: 50_500 });
  });

  it('clamps invalid playback to zero', () => {
    const placement = getPlaybackAnchoredNewSegmentPlacement([], Number.NaN);
    expect(placement).toEqual({ startMs: 0, endMs: 20_000 });
  });
});
