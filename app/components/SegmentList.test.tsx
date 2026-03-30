import { render, screen, waitFor, fireEvent } from '@testing-library/react';
import { describe, it, expect, vi, beforeEach } from 'vitest';
import { SegmentList } from './SegmentList';
import { Segment } from '../types/index';

const mockFetch = vi.fn();
global.fetch = mockFetch;

const songId = 'song-abc';

const seg1: Segment = {
  id: 'seg-1',
  songId,
  label: 'Verse 1',
  order: 0,
  startMs: 0,
  endMs: 15000,
  lyricText: 'Amazing grace how sweet the sound',
};

const seg2: Segment = {
  id: 'seg-2',
  songId,
  label: 'Chorus',
  order: 1,
  startMs: 15000,
  endMs: 30000,
  lyricText: '',
};

describe('SegmentList', () => {
  beforeEach(() => {
    vi.clearAllMocks();
  });

  describe('Loading state', () => {
    it('shows loading indicator while fetching', () => {
      // Never resolves during this test
      mockFetch.mockReturnValue(new Promise(() => {}));
      render(<SegmentList songId={songId} />);
      expect(screen.getByTestId('segment-list-loading')).toBeInTheDocument();
    });
  });

  describe('Error state', () => {
    it('shows error message when fetch fails', async () => {
      mockFetch.mockResolvedValue({
        ok: false,
        json: () => Promise.resolve({ error: 'Server error' }),
      });

      render(<SegmentList songId={songId} />);

      await waitFor(() => {
        expect(screen.getByTestId('segment-list-error')).toBeInTheDocument();
      });
      expect(screen.getByRole('alert')).toHaveTextContent('Server error');
    });

    it('shows generic error when fetch rejects', async () => {
      mockFetch.mockRejectedValue(new Error('Network failure'));

      render(<SegmentList songId={songId} />);

      await waitFor(() => {
        expect(screen.getByRole('alert')).toHaveTextContent('Network failure');
      });
    });
  });

  describe('Empty state', () => {
    it('shows empty message when no segments', async () => {
      mockFetch.mockResolvedValue({
        ok: true,
        json: () => Promise.resolve([]),
      });

      render(<SegmentList songId={songId} />);

      await waitFor(() => {
        expect(screen.getByTestId('segment-list-empty')).toBeInTheDocument();
      });
    });

    it('shows add-first button in empty state when onAddNew provided', async () => {
      mockFetch.mockResolvedValue({ ok: true, json: () => Promise.resolve([]) });
      const onAddNew = vi.fn();

      render(<SegmentList songId={songId} onAddNew={onAddNew} />);

      await waitFor(() => {
        expect(screen.getByTestId('segment-list-add-first')).toBeInTheDocument();
      });

      fireEvent.click(screen.getByTestId('segment-list-add-first'));
      expect(onAddNew).toHaveBeenCalledOnce();
    });

    it('does not show add-first button when onAddNew is not provided', async () => {
      mockFetch.mockResolvedValue({ ok: true, json: () => Promise.resolve([]) });

      render(<SegmentList songId={songId} />);

      await waitFor(() => {
        expect(screen.getByTestId('segment-list-empty')).toBeInTheDocument();
      });
      expect(screen.queryByTestId('segment-list-add-first')).not.toBeInTheDocument();
    });
  });

  describe('Populated list', () => {
    beforeEach(() => {
      mockFetch.mockResolvedValue({
        ok: true,
        json: () => Promise.resolve([seg2, seg1]), // deliberately out of order
      });
    });

    it('renders segments sorted by order', async () => {
      render(<SegmentList songId={songId} />);

      await waitFor(() => {
        expect(screen.getByTestId('segment-list')).toBeInTheDocument();
      });

      const items = screen.getAllByRole('listitem');
      expect(items).toHaveLength(2);
      // First item should be seg1 (order 0)
      expect(items[0]).toHaveAttribute('data-testid', 'segment-item-seg-1');
      expect(items[1]).toHaveAttribute('data-testid', 'segment-item-seg-2');
    });

    it('displays segment label, order badge, and time range', async () => {
      render(<SegmentList songId={songId} />);

      await waitFor(() => {
        expect(screen.getByTestId(`segment-label-${seg1.id}`)).toHaveTextContent('Verse 1');
      });

      expect(screen.getByTestId(`segment-order-${seg1.id}`)).toHaveTextContent('0');
      // 0ms–15000ms → 00:00.00 – 00:15.00
      expect(screen.getByTestId(`segment-time-${seg1.id}`)).toHaveTextContent('00:00.00 – 00:15.00');
    });

    it('displays lyric text when present', async () => {
      render(<SegmentList songId={songId} />);

      await waitFor(() => {
        expect(screen.getByTestId(`segment-lyrics-${seg1.id}`)).toHaveTextContent(
          'Amazing grace how sweet the sound'
        );
      });
    });

    it('does not render lyrics element when lyricText is empty', async () => {
      render(<SegmentList songId={songId} />);

      await waitFor(() => {
        expect(screen.getByTestId('segment-list')).toBeInTheDocument();
      });

      // seg2 has empty lyricText
      expect(screen.queryByTestId(`segment-lyrics-${seg2.id}`)).not.toBeInTheDocument();
    });

    it('shows add segment button when onAddNew is provided and list is non-empty', async () => {
      const onAddNew = vi.fn();
      render(<SegmentList songId={songId} onAddNew={onAddNew} />);

      await waitFor(() => {
        expect(screen.getByTestId('segment-list-add')).toBeInTheDocument();
      });

      fireEvent.click(screen.getByTestId('segment-list-add'));
      expect(onAddNew).toHaveBeenCalledOnce();
    });

    it('does not show add segment button when onAddNew is not provided', async () => {
      render(<SegmentList songId={songId} />);

      await waitFor(() => {
        expect(screen.getByTestId('segment-list')).toBeInTheDocument();
      });

      expect(screen.queryByTestId('segment-list-add')).not.toBeInTheDocument();
    });
  });

  describe('Edit callback', () => {
    it('shows edit button and calls onEdit when clicked', async () => {
      mockFetch.mockResolvedValue({ ok: true, json: () => Promise.resolve([seg1]) });
      const onEdit = vi.fn();

      render(<SegmentList songId={songId} onEdit={onEdit} />);

      await waitFor(() => {
        expect(screen.getByTestId(`segment-edit-${seg1.id}`)).toBeInTheDocument();
      });

      fireEvent.click(screen.getByTestId(`segment-edit-${seg1.id}`));
      expect(onEdit).toHaveBeenCalledWith(seg1);
    });

    it('does not render edit button when onEdit is not provided', async () => {
      mockFetch.mockResolvedValue({ ok: true, json: () => Promise.resolve([seg1]) });

      render(<SegmentList songId={songId} />);

      await waitFor(() => {
        expect(screen.getByTestId('segment-list')).toBeInTheDocument();
      });

      expect(screen.queryByTestId(`segment-edit-${seg1.id}`)).not.toBeInTheDocument();
    });
  });

  describe('Delete callback', () => {
    it('shows delete button and calls onDelete when clicked', async () => {
      mockFetch.mockResolvedValue({ ok: true, json: () => Promise.resolve([seg1]) });
      const onDelete = vi.fn();

      render(<SegmentList songId={songId} onDelete={onDelete} />);

      await waitFor(() => {
        expect(screen.getByTestId(`segment-delete-${seg1.id}`)).toBeInTheDocument();
      });

      fireEvent.click(screen.getByTestId(`segment-delete-${seg1.id}`));
      expect(onDelete).toHaveBeenCalledWith(seg1);
    });

    it('does not render delete button when onDelete is not provided', async () => {
      mockFetch.mockResolvedValue({ ok: true, json: () => Promise.resolve([seg1]) });

      render(<SegmentList songId={songId} />);

      await waitFor(() => {
        expect(screen.getByTestId('segment-list')).toBeInTheDocument();
      });

      expect(screen.queryByTestId(`segment-delete-${seg1.id}`)).not.toBeInTheDocument();
    });
  });

  describe('Refresh', () => {
    it('re-fetches when refreshKey changes', async () => {
      mockFetch.mockResolvedValue({ ok: true, json: () => Promise.resolve([seg1]) });

      const { rerender } = render(<SegmentList songId={songId} refreshKey={0} />);

      await waitFor(() => {
        expect(mockFetch).toHaveBeenCalledTimes(1);
      });

      rerender(<SegmentList songId={songId} refreshKey={1} />);

      await waitFor(() => {
        expect(mockFetch).toHaveBeenCalledTimes(2);
      });
    });

    it('fetches the correct API url', async () => {
      mockFetch.mockResolvedValue({ ok: true, json: () => Promise.resolve([]) });

      render(<SegmentList songId={songId} />);

      await waitFor(() => {
        expect(mockFetch).toHaveBeenCalledWith(`/api/songs/${songId}/segments`);
      });
    });
  });
});
