import { describe, it, expect, vi } from 'vitest';
import { render, screen, fireEvent } from '@testing-library/react';
import { LoadFailed } from './LoadFailed';

describe('LoadFailed', () => {
  it('says what failed, is announced, and retries on "Try again"', () => {
    const onRetry = vi.fn();
    render(<LoadFailed message="We couldn't load your documents." onRetry={onRetry} />);
    expect(screen.getByRole('alert')).toHaveTextContent("We couldn't load your documents.");
    fireEvent.click(screen.getByRole('button', { name: 'Try again' }));
    expect(onRetry).toHaveBeenCalledTimes(1);
  });
});
