import { describe, it, expect, beforeEach } from 'vitest';
import { render, screen, fireEvent } from '@testing-library/react';
import { RevealModePicker } from './RevealModePicker';
import { useGameStore } from '../state/gameStore';

beforeEach(() => {
  useGameStore.setState({ enabledModes: ['blur', 'scanner', 'zoom'], pendingRevealChoice: 'random' });
});

describe('RevealModePicker', () => {
  it('renders Random plus each enabled mode and reflects the selection', () => {
    render(<RevealModePicker />);
    expect(screen.getByRole('button', { name: /random/i })).toBeTruthy();
    expect(screen.getByRole('button', { name: /^scanner$/i })).toBeTruthy();
    fireEvent.click(screen.getByRole('button', { name: /^zoom$/i }));
    expect(useGameStore.getState().pendingRevealChoice).toBe('zoom');
  });
});
