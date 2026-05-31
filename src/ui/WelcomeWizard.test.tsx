import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest';
import { render, screen, fireEvent, act } from '@testing-library/react';
import { WelcomeWizard } from './WelcomeWizard';

beforeEach(() => vi.useFakeTimers());
afterEach(() => vi.useRealTimers());

describe('WelcomeWizard', () => {
  it('renders the wizard, start + close buttons and an initial caption', () => {
    render(<WelcomeWizard onClose={vi.fn()} onStart={vi.fn()} />);
    expect(screen.getByTestId('welcome-wizard')).toBeInTheDocument();
    expect(screen.getByTestId('welcome-start')).toBeInTheDocument();
    expect(screen.getByTestId('welcome-close')).toBeInTheDocument();
    expect(screen.getByTestId('welcome-caption')).toHaveTextContent('Name the card');
  });

  it('calls onClose when close is clicked', () => {
    const onClose = vi.fn();
    render(<WelcomeWizard onClose={onClose} onStart={vi.fn()} />);
    fireEvent.click(screen.getByTestId('welcome-close'));
    expect(onClose).toHaveBeenCalledTimes(1);
  });

  it('calls onStart when start is clicked', () => {
    const onStart = vi.fn();
    render(<WelcomeWizard onClose={vi.fn()} onStart={onStart} />);
    fireEvent.click(screen.getByTestId('welcome-start'));
    expect(onStart).toHaveBeenCalledTimes(1);
  });

  it('highlights the correct option after the reveal step', () => {
    render(<WelcomeWizard onClose={vi.fn()} onStart={vi.fn()} />);
    act(() => { vi.advanceTimersByTime(3500); });
    const correct = screen.getByText('Llanowar Elves').closest('[data-testid="welcome-option"]');
    expect(correct).toHaveAttribute('data-correct', 'true');
  });

  it('does NOT auto-close after the animation finishes', () => {
    const onClose = vi.fn();
    render(<WelcomeWizard onClose={onClose} onStart={vi.fn()} />);
    act(() => { vi.advanceTimersByTime(10000); });
    expect(onClose).not.toHaveBeenCalled();
  });
});
