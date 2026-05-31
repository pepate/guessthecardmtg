import { describe, it, expect } from 'vitest';
import { render, screen } from '@testing-library/react';
import { ProfileStats } from './ProfileStats';
import type { Profile } from '../profile/client';
import type { PlayerBest } from '../profile/stats';

const profile: Profile = { displayName: 'Al', gamesPlayed: 4, totalCorrect: 12, totalCards: 24, country: 'DE' };

describe('ProfileStats', () => {
  it('renders nothing without a profile', () => {
    const { container } = render(<ProfileStats profile={null} bests={[]} />);
    expect(container).toBeEmptyDOMElement();
  });

  it('shows lifetime stats with computed hit rate and average', () => {
    render(<ProfileStats profile={profile} bests={[]} />);
    const block = screen.getByTestId('profile-stats');
    expect(block).toHaveTextContent('Games played');
    expect(block).toHaveTextContent('Hit rate');
    expect(block).toHaveTextContent('50%'); // 12/24
    expect(block).toHaveTextContent('Avg correct / game');
    expect(block).toHaveTextContent('3.0'); // 12/4
    expect(screen.queryByTestId('profile-best')).toBeNull();
  });

  it('lists personal bests with reveal label and rank', () => {
    const bests: PlayerBest[] = [
      { modeId: 'm1', modeName: 'Simic', bestScore: 900, reveal: 'zoom', rank: 1 },
      { modeId: 'm2', modeName: 'Top 100', bestScore: 700, reveal: null, rank: null },
    ];
    render(<ProfileStats profile={profile} bests={bests} />);
    const rows = screen.getAllByTestId('profile-best');
    expect(rows).toHaveLength(2);
    expect(rows[0]).toHaveTextContent('Simic');
    expect(rows[0]).toHaveTextContent('#1');
    expect(rows[1]).toHaveTextContent('Top 100');
    expect(rows[1]).toHaveTextContent('—'); // no rank
  });
});
