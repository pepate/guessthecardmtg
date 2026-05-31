import { describe, it, expect, vi, beforeEach } from 'vitest';
import { render, screen, fireEvent } from '@testing-library/react';
import { GlobalScoreList } from './GlobalScoreList';
import { useGameStore } from '../state/gameStore';
import type { GlobalEntry } from '../leaderboard/types';

const NOW = 1_000_000_000_000;
function e(id: string, score: number): GlobalEntry {
  return { id, name: `P${id}`, score, correct: 9, gameModes: [], country: 'DE', createdAt: NOW, deviceId: `dev-${id}` };
}

const zoomEntry: GlobalEntry = {
  id: '1', name: 'Al', score: 900, correct: 9, gameModes: ['zoom'], country: 'DE', createdAt: 0, deviceId: 'dev-al',
};

const multiModeEntry: GlobalEntry = {
  id: '2', name: 'Bo', score: 1200, correct: 11, gameModes: ['spotlight', 'blur'], country: 'DE', createdAt: 0, deviceId: 'dev-bo',
};

beforeEach(() => {
  useGameStore.setState({ pendingRevealChoice: 'random' });
  vi.restoreAllMocks();
});

describe('GlobalScoreList', () => {
  it('shows a mode badge and replays that mode on click', () => {
    const onPlay = vi.fn();
    render(<GlobalScoreList entries={[zoomEntry]} onPlayMode={onPlay} now={NOW} />);
    expect(screen.getByText(/zoom/i)).toBeTruthy();
    fireEvent.click(screen.getByTestId('global-entry'));
    expect(onPlay).toHaveBeenCalledWith('zoom');
  });

  it('shows only the winning (first) reveal mode badge on a person row', () => {
    render(<GlobalScoreList entries={[multiModeEntry]} now={NOW} />);
    expect(screen.getAllByTestId('global-entry')).toHaveLength(1);
    expect(screen.getByText(/spotlight/i)).toBeTruthy();
    expect(screen.queryByText(/blur/i)).toBeNull();
  });

  it('renders one row per entry with rank, name and score', () => {
    render(<GlobalScoreList entries={[e('1', 900), e('2', 800)]} now={NOW} />);
    expect(screen.getAllByTestId('global-entry')).toHaveLength(2);
    expect(screen.getByText('P1')).toBeInTheDocument();
    expect(screen.getByText('900')).toBeInTheDocument();
  });

  it('shows an empty state when there are no entries', () => {
    render(<GlobalScoreList entries={[]} now={NOW} />);
    expect(screen.getByTestId('global-empty')).toBeInTheDocument();
  });

  it('renders a pinned own row separated from the list', () => {
    render(
      <GlobalScoreList
        entries={[e('1', 900)]}
        pinned={{ rank: 347, entry: e('me', 120) }}
        now={NOW}
      />,
    );
    expect(screen.getByTestId('global-pinned')).toHaveTextContent('#347');
  });
});
