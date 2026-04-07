import { describe, it, expect, vi } from 'vitest';
import { render, screen } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import RatingBar from './RatingBar';

describe('RatingBar', () => {
  it('renders 5 rating buttons', () => {
    render(<RatingBar onRate={vi.fn()} />);
    expect(screen.getAllByRole('button')).toHaveLength(5);
  });

  it('clicking a button calls onRate with the correct value', async () => {
    const onRate = vi.fn();
    render(<RatingBar onRate={onRate} />);
    await userEvent.click(screen.getByTestId('rating-button-3'));
    expect(onRate).toHaveBeenCalledWith(3);
  });

  it('button matching currentRating has aria-pressed=true', () => {
    render(<RatingBar currentRating={4} onRate={vi.fn()} />);
    const btn4 = screen.getByTestId('rating-button-4');
    const btn2 = screen.getByTestId('rating-button-2');
    expect(btn4).toHaveAttribute('aria-pressed', 'true');
    expect(btn2).toHaveAttribute('aria-pressed', 'false');
  });

  it('fills all ratings up to currentRating', () => {
    render(<RatingBar currentRating={4} onRate={vi.fn()} />);

    expect(screen.getByTestId('rating-button-1').className).toContain('bg-indigo-200');
    expect(screen.getByTestId('rating-button-1').className).toContain('text-indigo-950');
    expect(screen.getByTestId('rating-button-2').className).toContain('bg-indigo-300');
    expect(screen.getByTestId('rating-button-2').className).toContain('text-indigo-950');
    expect(screen.getByTestId('rating-button-3').className).toContain('bg-indigo-500');
    expect(screen.getByTestId('rating-button-3').className).toContain('text-white');
    expect(screen.getByTestId('rating-button-4').className).toContain('bg-indigo-700');
    expect(screen.getByTestId('rating-button-4').className).toContain('text-white');
    expect(screen.getByTestId('rating-button-5').className).toContain('bg-gray-100');
  });

  it('disabled prop propagates to all buttons', () => {
    render(<RatingBar onRate={vi.fn()} disabled={true} />);
    const buttons = screen.getAllByRole('button');
    buttons.forEach((btn) => {
      expect(btn).toBeDisabled();
    });
  });
});
