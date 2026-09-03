import { describe, it, expect, vi } from 'vitest';
import { render, screen } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import RatingBar from './RatingBar';
import { getMasteryColor } from '../lib/masteryColors';

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

    expect(screen.getByTestId('rating-button-1')).toHaveStyle({ backgroundColor: getMasteryColor(20) });
    expect(screen.getByTestId('rating-button-2')).toHaveStyle({ backgroundColor: getMasteryColor(40) });
    expect(screen.getByTestId('rating-button-3')).toHaveStyle({ backgroundColor: getMasteryColor(60) });
    expect(screen.getByTestId('rating-button-4')).toHaveStyle({ backgroundColor: getMasteryColor(80) });
    expect(screen.getByTestId('rating-button-5').className).toContain('bg-indigo-50');
  });

  it('uses the brand indigo for a five rating', () => {
    render(<RatingBar currentRating={5} onRate={vi.fn()} />);
    expect(screen.getByTestId('rating-button-5')).toHaveStyle({ backgroundColor: getMasteryColor(100) });
  });

  it('disabled prop propagates to all buttons', () => {
    render(<RatingBar onRate={vi.fn()} disabled={true} />);
    const buttons = screen.getAllByRole('button');
    buttons.forEach((btn) => {
      expect(btn).toBeDisabled();
    });
  });

  it('uses compact mobile sizing classes to preserve room on narrow screens', () => {
    render(<RatingBar onRate={vi.fn()} />);
    const button = screen.getByTestId('rating-button-3');
    expect(button.className).toContain('h-9');
    expect(button.className).toContain('w-9');
    expect(button.className).toContain('sm:h-10');
    expect(button.className).toContain('sm:w-10');
  });
});
