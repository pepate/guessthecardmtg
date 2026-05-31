import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest';
import { render, screen, fireEvent, act } from '@testing-library/react';
import { WelcomeWizard } from './WelcomeWizard';

beforeEach(() => vi.useFakeTimers());
afterEach(() => vi.useRealTimers());

describe('WelcomeWizard', () => {
  it('renders the wizard, a skip button and an initial caption', () => {
    render(<WelcomeWizard onClose={vi.fn()} />);
    expect(screen.getByTestId('welcome-wizard')).toBeInTheDocument();
    expect(screen.getByTestId('welcome-skip')).toBeInTheDocument();
    expect(screen.getByTestId('welcome-caption')).toHaveTextContent('Name the card');
  });

  it('calls onClose when skip is clicked', () => {
    const onClose = vi.fn();
    render(<WelcomeWizard onClose={onClose} />);
    fireEvent.click(screen.getByTestId('welcome-skip'));
    expect(onClose).toHaveBeenCalledTimes(1);
  });

  it('highlights the correct option after the reveal step', () => {
    render(<WelcomeWizard onClose={vi.fn()} />);
    act(() => { vi.advanceTimersByTime(3500); });
    const correct = screen.getByText('Llanowar Elves').closest('[data-testid="welcome-option"]');
    expect(correct).toHaveAttribute('data-correct', 'true');
  });

  it('auto-closes after the full sequence', () => {
    const onClose = vi.fn();
    render(<WelcomeWizard onClose={onClose} />);
    expect(onClose).not.toHaveBeenCalled();
    act(() => { vi.advanceTimersByTime(6000); });
    expect(onClose).toHaveBeenCalledTimes(1);
  });
});
