import { describe, it, expect, vi } from 'vitest';
import { render, screen, fireEvent } from '@testing-library/react';
import { GameResultModal } from './GameResultModal';

describe('GameResultModal', () => {
  it('shows the rank and wires Replay/Share/Close', () => {
    const onReplay = vi.fn(), onShare = vi.fn(), onClose = vi.fn();
    render(<GameResultModal score={2144} rank={5} modeName="EDHRec 100" onReplay={onReplay} onShare={onShare} onClose={onClose} />);
    expect(screen.getByTestId('result-rank').textContent).toContain('#5');
    fireEvent.click(screen.getByTestId('result-replay'));
    fireEvent.click(screen.getByTestId('result-share'));
    fireEvent.click(screen.getByTestId('result-close'));
    expect(onReplay).toHaveBeenCalledOnce();
    expect(onShare).toHaveBeenCalledOnce();
    expect(onClose).toHaveBeenCalledOnce();
  });

  it('omits the rank line when rank is null', () => {
    render(<GameResultModal score={0} rank={null} onReplay={() => {}} onShare={() => {}} onClose={() => {}} />);
    expect(screen.queryByTestId('result-rank')).toBeNull();
  });
});
