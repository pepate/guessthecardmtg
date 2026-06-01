import { describe, it, expect, vi } from 'vitest';
import { render, screen, fireEvent } from '@testing-library/react';
import { DailySetModal } from './DailySetModal';
import type { DailyToday } from '../daily/client';

const daily = (playsUsed: number): DailyToday => ({
  day: '2026-06-01', modeId: 'm1', reveal: 'blur', setCode: 'fin', setName: 'Final Fantasy', leader: null, playsUsed,
});

describe('DailySetModal', () => {
  it('shows plays left and enables Play when plays remain', () => {
    const onPlay = vi.fn();
    render(<DailySetModal daily={daily(1)} board={[]} onPlay={onPlay} onClose={() => {}} />);
    expect(screen.getByTestId('daily-plays-left').textContent).toBe('2/3 plays left today');
    fireEvent.click(screen.getByTestId('daily-play'));
    expect(onPlay).toHaveBeenCalledOnce();
  });

  it('disables Play at 0 plays left', () => {
    render(<DailySetModal daily={daily(3)} board={[]} onPlay={() => {}} onClose={() => {}} />);
    const btn = screen.getByTestId('daily-play') as HTMLButtonElement;
    expect(btn.disabled).toBe(true);
    expect(screen.getByTestId('daily-plays-left').textContent).toBe('0/3 plays left today');
  });
});
