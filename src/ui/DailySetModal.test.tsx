import { describe, it, expect, vi } from 'vitest';
import { render, screen, fireEvent } from '@testing-library/react';
import { DailySetModal } from './DailySetModal';
import type { DailyToday } from '../daily/client';

const daily: DailyToday = {
  day: '2026-06-01', modeId: 'm1', reveal: 'blur', setCode: 'fin', setName: 'Final Fantasy', leader: null,
};

describe('DailySetModal', () => {
  it('renders an enabled Play button that calls onPlay', () => {
    const onPlay = vi.fn();
    render(<DailySetModal daily={daily} board={[]} onPlay={onPlay} onClose={() => {}} />);
    const btn = screen.getByTestId('daily-play') as HTMLButtonElement;
    expect(btn.disabled).toBe(false);
    expect(btn.textContent).toBe('Play');
    fireEvent.click(btn);
    expect(onPlay).toHaveBeenCalledOnce();
  });

  it('shows the empty-board message when there are no scores', () => {
    render(<DailySetModal daily={daily} board={[]} onPlay={() => {}} onClose={() => {}} />);
    expect(screen.getByText('No scores yet — be the first!')).toBeTruthy();
  });
});
