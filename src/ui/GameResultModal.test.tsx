import { describe, it, expect, vi } from 'vitest';
import { render, screen, fireEvent } from '@testing-library/react';
import { GameResultModal } from './GameResultModal';

describe('GameResultModal', () => {
  it('shows the run score, pool total and total rank, and wires actions', () => {
    const onReplay = vi.fn(), onShare = vi.fn(), onClose = vi.fn();
    render(
      <GameResultModal
        score={2144} total={5300} totalRank={3} modeName="EDHRec 100"
        onReplay={onReplay} onShare={onShare} onClose={onClose}
      />,
    );
    expect(screen.getByTestId('result-total').textContent).toContain('5300');
    expect(screen.getByTestId('result-rank').textContent).toContain('#3');
    fireEvent.click(screen.getByTestId('result-replay'));
    fireEvent.click(screen.getByTestId('result-share'));
    fireEvent.click(screen.getByTestId('result-close'));
    expect(onReplay).toHaveBeenCalledOnce();
    expect(onShare).toHaveBeenCalledOnce();
    expect(onClose).toHaveBeenCalledOnce();
  });

  it('shows Next mode only when a next mode is available', () => {
    const onNextMode = vi.fn();
    const { rerender } = render(
      <GameResultModal score={0} total={0} totalRank={null} onReplay={() => {}} onShare={() => {}} onClose={() => {}} />,
    );
    expect(screen.queryByTestId('result-next-mode')).toBeNull();
    rerender(
      <GameResultModal score={0} total={0} totalRank={null} hasNextMode onNextMode={onNextMode}
        onReplay={() => {}} onShare={() => {}} onClose={() => {}} />,
    );
    fireEvent.click(screen.getByTestId('result-next-mode'));
    expect(onNextMode).toHaveBeenCalledOnce();
  });
});
