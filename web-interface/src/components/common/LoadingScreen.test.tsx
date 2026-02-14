import { describe, it, expect } from 'vitest';
import { render, screen } from '@/test/utils';
import LoadingScreen from './LoadingScreen';

describe('LoadingScreen', () => {
  it('should render with default message', () => {
    render(<LoadingScreen />);

    expect(screen.getByText('Loading...')).toBeInTheDocument();
    expect(screen.getByRole('progressbar')).toBeInTheDocument();
  });

  it('should render with custom message', () => {
    render(<LoadingScreen message="Please wait..." />);

    expect(screen.getByText('Please wait...')).toBeInTheDocument();
  });
});
