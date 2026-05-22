import { render, screen } from '@testing-library/react';
import { describe, expect, it } from 'vitest';
import { AppBuildBadge } from './AppBuildBadge';

describe('AppBuildBadge', () => {
  it('hides the floating badge on main branch builds', () => {
    render(<AppBuildBadge version="2.3.10" branch="main" commitSha="abcdef123456" />);

    expect(screen.queryByTestId('app-build-badge')).not.toBeInTheDocument();
  });

  it('shows the floating badge on non-main branch builds', () => {
    render(<AppBuildBadge version="2.3.10" branch="develop" commitSha="abcdef123456" />);

    expect(screen.getByTestId('app-build-badge')).toHaveTextContent('v2.3.10');
    expect(screen.getByTestId('app-build-badge')).toHaveTextContent('develop');
    expect(screen.getByTestId('app-build-badge')).toHaveTextContent('abcdef1');
  });
});
