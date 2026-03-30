import { render, screen, fireEvent } from '@testing-library/react';
import { describe, it, expect, vi } from 'vitest';
import { DraggableSegmentCard } from './DraggableSegmentCard';
import { Segment } from '../types/index';

const segment: Segment = {
  id: 'seg-1',
  songId: 'song-1',
  label: 'Verse 1',
  order: 0,
  startMs: 0,
  endMs: 15000,
  lyricText: 'Amazing grace how sweet the sound',
};

const segmentNoLyrics: Segment = {
  ...segment,
  id: 'seg-2',
  label: 'Chorus',
  lyricText: '',
};

describe('DraggableSegmentCard', () => {
  describe('Rendering', () => {
    it('renders the segment label, order badge, and time range', () => {
      render(<ul><DraggableSegmentCard segment={segment} /></ul>);

      expect(screen.getByTestId(`card-label-${segment.id}`)).toHaveTextContent('Verse 1');
      expect(screen.getByTestId(`card-order-${segment.id}`)).toHaveTextContent('0');
      expect(screen.getByTestId(`card-time-${segment.id}`)).toHaveTextContent('00:00.00 – 00:15.00');
    });

    it('renders lyric text when present', () => {
      render(<ul><DraggableSegmentCard segment={segment} /></ul>);
      expect(screen.getByTestId(`card-lyrics-${segment.id}`)).toHaveTextContent(
        'Amazing grace how sweet the sound'
      );
    });

    it('does not render lyrics element when lyricText is empty', () => {
      render(<ul><DraggableSegmentCard segment={segmentNoLyrics} /></ul>);
      expect(screen.queryByTestId(`card-lyrics-${segmentNoLyrics.id}`)).not.toBeInTheDocument();
    });

    it('renders the drag handle', () => {
      render(<ul><DraggableSegmentCard segment={segment} /></ul>);
      expect(screen.getByTestId(`drag-handle-${segment.id}`)).toBeInTheDocument();
    });

    it('the list item has draggable attribute', () => {
      render(<ul><DraggableSegmentCard segment={segment} /></ul>);
      const li = screen.getByTestId(`draggable-card-${segment.id}`);
      expect(li).toHaveAttribute('draggable', 'true');
    });

    it('has an accessible aria-label with the segment name', () => {
      render(<ul><DraggableSegmentCard segment={segment} /></ul>);
      expect(screen.getByLabelText('Segment: Verse 1')).toBeInTheDocument();
    });
  });

  describe('isDragging / isDragOver visual states', () => {
    it('applies opacity-40 class when isDragging is true', () => {
      render(<ul><DraggableSegmentCard segment={segment} isDragging /></ul>);
      const li = screen.getByTestId(`draggable-card-${segment.id}`);
      expect(li.className).toContain('opacity-40');
    });

    it('applies opacity-100 class when isDragging is false', () => {
      render(<ul><DraggableSegmentCard segment={segment} isDragging={false} /></ul>);
      const li = screen.getByTestId(`draggable-card-${segment.id}`);
      expect(li.className).toContain('opacity-100');
    });

    it('applies ring/border highlight when isDragOver is true', () => {
      render(<ul><DraggableSegmentCard segment={segment} isDragOver /></ul>);
      const li = screen.getByTestId(`draggable-card-${segment.id}`);
      expect(li.className).toContain('border-blue-400');
    });

    it('uses default border when isDragOver is false', () => {
      render(<ul><DraggableSegmentCard segment={segment} isDragOver={false} /></ul>);
      const li = screen.getByTestId(`draggable-card-${segment.id}`);
      expect(li.className).toContain('border-gray-200');
    });
  });

  describe('Edit / Delete callbacks', () => {
    it('renders edit button and calls onEdit when clicked', () => {
      const onEdit = vi.fn();
      render(<ul><DraggableSegmentCard segment={segment} onEdit={onEdit} /></ul>);

      fireEvent.click(screen.getByTestId(`card-edit-${segment.id}`));
      expect(onEdit).toHaveBeenCalledWith(segment);
    });

    it('does not render edit button when onEdit is not provided', () => {
      render(<ul><DraggableSegmentCard segment={segment} /></ul>);
      expect(screen.queryByTestId(`card-edit-${segment.id}`)).not.toBeInTheDocument();
    });

    it('renders delete button and calls onDelete when clicked', () => {
      const onDelete = vi.fn();
      render(<ul><DraggableSegmentCard segment={segment} onDelete={onDelete} /></ul>);

      fireEvent.click(screen.getByTestId(`card-delete-${segment.id}`));
      expect(onDelete).toHaveBeenCalledWith(segment);
    });

    it('does not render delete button when onDelete is not provided', () => {
      render(<ul><DraggableSegmentCard segment={segment} /></ul>);
      expect(screen.queryByTestId(`card-delete-${segment.id}`)).not.toBeInTheDocument();
    });
  });

  describe('Drag event handlers', () => {
    it('calls onDragStart with the segment when drag starts', () => {
      const onDragStart = vi.fn();
      render(<ul><DraggableSegmentCard segment={segment} onDragStart={onDragStart} /></ul>);

      const li = screen.getByTestId(`draggable-card-${segment.id}`);
      fireEvent.dragStart(li);
      expect(onDragStart).toHaveBeenCalledWith(expect.anything(), segment);
    });

    it('calls onDragOver with the segment when dragging over', () => {
      const onDragOver = vi.fn();
      render(<ul><DraggableSegmentCard segment={segment} onDragOver={onDragOver} /></ul>);

      const li = screen.getByTestId(`draggable-card-${segment.id}`);
      fireEvent.dragOver(li);
      expect(onDragOver).toHaveBeenCalledWith(expect.anything(), segment);
    });

    it('calls onDrop with the segment when dropped', () => {
      const onDrop = vi.fn();
      render(<ul><DraggableSegmentCard segment={segment} onDrop={onDrop} /></ul>);

      const li = screen.getByTestId(`draggable-card-${segment.id}`);
      fireEvent.drop(li);
      expect(onDrop).toHaveBeenCalledWith(expect.anything(), segment);
    });

    it('calls onDragEnd when drag ends', () => {
      const onDragEnd = vi.fn();
      render(<ul><DraggableSegmentCard segment={segment} onDragEnd={onDragEnd} /></ul>);

      const li = screen.getByTestId(`draggable-card-${segment.id}`);
      fireEvent.dragEnd(li);
      expect(onDragEnd).toHaveBeenCalledWith(expect.anything());
    });

    it('does not throw when drag handlers are not provided', () => {
      render(<ul><DraggableSegmentCard segment={segment} /></ul>);
      const li = screen.getByTestId(`draggable-card-${segment.id}`);

      expect(() => {
        fireEvent.dragStart(li);
        fireEvent.dragOver(li);
        fireEvent.drop(li);
        fireEvent.dragEnd(li);
      }).not.toThrow();
    });
  });
});
