
import { describe, it, expect, vi } from 'vitest';
import { render, screen } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import SegmentCard from './SegmentCard';

const seg = { id: 'seg1', label: 'Verse 1', order: 0 };

describe('SegmentCard', () => {
  it('renders segment label', () => {
    render(<SegmentCard segment={seg} onRate={vi.fn()} isLocked={false} onToggleLock={vi.fn()} />);
    expect(screen.getByText('Verse 1')).toBeInTheDocument();
  });

  it('renders RatingBar and KnowledgeBar', () => {
    render(<SegmentCard segment={seg} onRate={vi.fn()} isLocked={false} onToggleLock={vi.fn()} />);
    expect(screen.getAllByRole('button').length).toBeGreaterThanOrEqual(5);
    expect(screen.getByRole('progressbar')).toBeInTheDocument();
  });

  it('clicking lock toggle calls onToggleLock', async () => {
    const onToggleLock = vi.fn();
    render(<SegmentCard segment={seg} onRate={vi.fn()} isLocked={false} onToggleLock={onToggleLock} />);
    await userEvent.click(screen.getByTestId('lock-toggle'));
    expect(onToggleLock).toHaveBeenCalledOnce();
  });

  it('RatingBar is disabled when isLocked=true', () => {
    render(<SegmentCard segment={seg} onRate={vi.fn()} isLocked={true} onToggleLock={vi.fn()} />);
    const ratingBtns = screen.getAllByTestId(/rating-button/);
    ratingBtns.forEach(btn => expect(btn).toBeDisabled());
  });

  it('KnowledgeBar shows 0 when no currentRating', () => {
    render(<SegmentCard segment={seg} onRate={vi.fn()} isLocked={false} onToggleLock={vi.fn()} />);
    expect(screen.getByRole('progressbar')).toHaveAttribute('aria-valuenow', '0');
  });

  it('KnowledgeBar shows 80 when currentRating=4', () => {
    render(<SegmentCard segment={seg} currentRating={4} onRate={vi.fn()} isLocked={false} onToggleLock={vi.fn()} />);
    expect(screen.getByRole('progressbar')).toHaveAttribute('aria-valuenow', '80');
  });
});
