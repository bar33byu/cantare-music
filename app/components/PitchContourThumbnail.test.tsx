import { render, screen } from '@testing-library/react';
import { describe, expect, it } from 'vitest';
import { PitchContourThumbnail } from './PitchContourThumbnail';

describe('PitchContourThumbnail', () => {
  it('renders empty state without note bars', () => {
    render(<PitchContourThumbnail segmentDurationMs={10000} />);

    expect(screen.getByTestId('pitch-contour-thumbnail')).toBeInTheDocument();
    expect(screen.queryByTestId('pitch-contour-thumbnail-note')).not.toBeInTheDocument();
  });

  it('renders note bars for contour points', () => {
    render(
      <PitchContourThumbnail
        segmentDurationMs={10000}
        notes={[
          { id: 'n-1', timeOffsetMs: 1000, durationMs: 800, lane: 0.2 },
          { id: 'n-2', timeOffsetMs: 5000, durationMs: 500, lane: 0.8 },
        ]}
      />
    );

    expect(screen.getAllByTestId('pitch-contour-thumbnail-note')).toHaveLength(2);
  });

  it('colors notes with heat-map data and exposes miss-rate metadata', () => {
    render(
      <PitchContourThumbnail
        segmentDurationMs={10000}
        notes={[
          { id: 'n-1', timeOffsetMs: 1000, durationMs: 800, lane: 0.2 },
          { id: 'n-2', timeOffsetMs: 5000, durationMs: 500, lane: 0.8 },
        ]}
        noteHeatMap={{
          'n-1': { sessionCount: 4, missCount: 0, missRate: 0 },
          'n-2': { sessionCount: 6, missCount: 3, missRate: 0.5 },
        }}
      />
    );

    const notes = screen.getAllByTestId('pitch-contour-thumbnail-note');
    expect(notes[0]).toHaveAttribute('data-note-heat-rate', '0.000');
    expect(notes[0]).toHaveAttribute('fill', 'rgb(16 185 129)');
    expect(notes[1]).toHaveAttribute('data-note-heat-rate', '0.500');
    expect(notes[1]).toHaveAttribute('data-note-heat-sessions', '6');
    expect(notes[1]).toHaveAttribute('fill', 'rgb(244 137 24)');
  });

  it('keeps notes neutral until they have at least two attempts of history', () => {
    render(
      <PitchContourThumbnail
        segmentDurationMs={10000}
        notes={[
          { id: 'n-1', timeOffsetMs: 1000, durationMs: 800, lane: 0.2 },
        ]}
        noteHeatMap={{
          'n-1': { sessionCount: 1, missCount: 1, missRate: 1 },
        }}
      />
    );

    expect(screen.getByTestId('pitch-contour-thumbnail-note')).toHaveAttribute('fill', 'rgb(79 70 229)');
  });

  it('uses warmer colors for higher miss rates', () => {
    render(
      <PitchContourThumbnail
        segmentDurationMs={10000}
        notes={[
          { id: 'n-1', timeOffsetMs: 1000, durationMs: 800, lane: 0.2 },
        ]}
        noteHeatMap={{
          'n-1': { sessionCount: 5, missCount: 5, missRate: 1 },
        }}
      />
    );

    expect(screen.getByTestId('pitch-contour-thumbnail-note')).toHaveAttribute('fill', 'rgb(239 68 68)');
  });
});
