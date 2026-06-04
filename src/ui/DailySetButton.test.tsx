import { describe, it, expect, vi } from 'vitest';
import { render, screen, fireEvent } from '@testing-library/react';
import { DailySetButton } from './DailySetButton';
import type { DailyToday } from '../daily/client';

const base: DailyToday = { day: '2026-06-01', modeId: 'm1', reveal: 'blur', setCode: 'fin', setName: 'Final Fantasy', leader: null, playsUsed: 0 };

describe('DailySetButton', () => {
  it('shows just the title before a set exists, and calls onOpen', () => {
    const onOpen = vi.fn();
    render(<DailySetButton daily={null} onOpen={onOpen} />);
    expect(screen.getByText('Daily Set')).toBeTruthy();
    fireEvent.click(screen.getByTestId('daily-set-btn'));
    expect(onOpen).toHaveBeenCalledOnce();
  });

  it('shows set name and leader when present', () => {
    render(<DailySetButton daily={{ ...base, leader: { name: 'Pete', score: 4200, country: 'DE' } }} onOpen={() => {}} />);
    expect(screen.getByText('Final Fantasy')).toBeTruthy();
    expect(screen.getByText('Pete')).toBeTruthy();
  });

  it('shows the set artwork strip while the board is empty (no leader)', () => {
    render(<DailySetButton daily={base} onOpen={() => {}} topArts={['a.jpg', 'b.jpg', 'c.jpg', 'd.jpg']} />);
    const strip = screen.getByTestId('daily-arts');
    expect(strip.children).toHaveLength(4);
  });

  it('hides the artwork strip once a leader exists', () => {
    render(
      <DailySetButton
        daily={{ ...base, leader: { name: 'Pete', score: 4200, country: 'DE' } }}
        onOpen={() => {}}
        topArts={['a.jpg', 'b.jpg', 'c.jpg', 'd.jpg']}
      />,
    );
    expect(screen.queryByTestId('daily-arts')).toBeNull();
  });
});
