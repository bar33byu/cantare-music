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

  it('colors notes as soon as they have one graded attempt', () => {
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

    const note = screen.getByTestId('pitch-contour-thumbnail-note');
    expect(note).toHaveAttribute('fill', 'rgb(239 68 68)');
    expect(note.querySelector('title')).toHaveTextContent('1 miss in 1 graded attempt');
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

  it('uses definitive green and red colors for a single recent attempt', () => {
    render(
      <PitchContourThumbnail
        segmentDurationMs={10000}
        notes={[
          { id: 'n-1', timeOffsetMs: 1000, durationMs: 800, lane: 0.2 },
          { id: 'n-2', timeOffsetMs: 5000, durationMs: 500, lane: 0.8 },
        ]}
        noteResults={{ 'n-1': 'matched', 'n-2': 'missed' }}
      />
    );

    const notes = screen.getAllByTestId('pitch-contour-thumbnail-note');
    expect(notes[0]).toHaveAttribute('data-note-result', 'matched');
    expect(notes[0]).toHaveAttribute('fill', 'rgb(22 163 74)');
    expect(notes[1]).toHaveAttribute('data-note-result', 'missed');
    expect(notes[1]).toHaveAttribute('fill', 'rgb(220 38 38)');
  });

  it('lights the note that contains the active playback time without replacing its heat color', () => {
    render(
      <PitchContourThumbnail
        segmentDurationMs={10000}
        activeTimeMs={5400}
        notes={[
          { id: 'n-1', timeOffsetMs: 1000, durationMs: 800, lane: 0.2 },
          { id: 'n-2', timeOffsetMs: 5000, durationMs: 1000, lane: 0.8 },
        ]}
        noteHeatMap={{
          'n-2': { sessionCount: 5, missCount: 5, missRate: 1 },
        }}
      />
    );

    const notes = screen.getAllByTestId('pitch-contour-thumbnail-note');
    expect(notes[0]).not.toHaveAttribute('data-active');
    expect(notes[1]).toHaveAttribute('data-active', 'true');
    expect(notes[1]).toHaveAttribute('fill', 'rgb(239 68 68)');
    expect(screen.getByTestId('pitch-contour-thumbnail-active-halo')).toHaveAttribute('data-active-note-id', 'n-2');
  });

  it('does not light a note during a gap in the contour', () => {
    render(
      <PitchContourThumbnail
        segmentDurationMs={10000}
        activeTimeMs={3000}
        notes={[
          { id: 'n-1', timeOffsetMs: 1000, durationMs: 800, lane: 0.2 },
          { id: 'n-2', timeOffsetMs: 5000, durationMs: 1000, lane: 0.8 },
        ]}
      />
    );

    expect(screen.queryByTestId('pitch-contour-thumbnail-active-halo')).not.toBeInTheDocument();
  });
});
