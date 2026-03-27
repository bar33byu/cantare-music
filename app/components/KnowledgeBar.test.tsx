import { describe, it, expect } from 'vitest';
import { render, screen } from '@testing-library/react';
import KnowledgeBar from './KnowledgeBar';

describe('KnowledgeBar', () => {
  it('renders with 0% width when percent=0', () => {
    render(<KnowledgeBar percent={0} />);
    const fill = screen.getByTestId('knowledge-bar-fill');
    expect(fill).toHaveStyle({ width: '0%' });
  });

  it('renders with 60% width when percent=60', () => {
    render(<KnowledgeBar percent={60} />);
    const fill = screen.getByTestId('knowledge-bar-fill');
    expect(fill).toHaveStyle({ width: '60%' });
  });

  it('renders label text when provided', () => {
    render(<KnowledgeBar percent={50} label="Knowledge" />);
    expect(screen.getByText('Knowledge')).toBeInTheDocument();
  });

  it('does not render label element when label is omitted', () => {
    render(<KnowledgeBar percent={50} />);
    expect(screen.queryByText(/knowledge/i)).not.toBeInTheDocument();
  });

  it('aria-valuenow reflects the percent prop', () => {
    render(<KnowledgeBar percent={75} />);
    const bar = screen.getByRole('progressbar');
    expect(bar).toHaveAttribute('aria-valuenow', '75');
  });
});
