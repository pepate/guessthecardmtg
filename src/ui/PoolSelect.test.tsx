import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest';
import { render, screen, act } from '@testing-library/react';
import { PoolSelect } from './PoolSelect';

beforeEach(() => vi.useFakeTimers());
afterEach(() => vi.useRealTimers());

describe('PoolSelect', () => {
  it('renders a play icon on each pool button', () => {
    render(<PoolSelect onOpenCustom={() => {}} onOpenSets={() => {}} />);
    expect(screen.getAllByTestId('play-icon')).toHaveLength(4);
  });

  it('does not pulse initially, then pulses after the hint delay', () => {
    render(<PoolSelect onOpenCustom={() => {}} onOpenSets={() => {}} />);
    expect(screen.getAllByTestId('play-icon')[0]).not.toHaveClass('play-hint');
    act(() => {
      vi.advanceTimersByTime(4000);
    });
    for (const icon of screen.getAllByTestId('play-icon')) {
      expect(icon).toHaveClass('play-hint');
    }
  });
});
