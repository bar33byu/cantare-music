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
});
