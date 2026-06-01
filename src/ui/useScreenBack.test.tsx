import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest';
import { render } from '@testing-library/react';
import { useScreenBack } from './useScreenBack';

function Harness({ active, onBack }: { active: boolean; onBack: () => void }) {
  useScreenBack(active, onBack);
  return null;
}

describe('useScreenBack', () => {
  beforeEach(() => vi.restoreAllMocks());
  afterEach(() => vi.restoreAllMocks());

  it('pushes a history entry and calls onBack on popstate when active', () => {
    const push = vi.spyOn(window.history, 'pushState');
    const onBack = vi.fn();
    render(<Harness active onBack={onBack} />);
    expect(push).toHaveBeenCalledOnce();
    window.dispatchEvent(new PopStateEvent('popstate'));
    expect(onBack).toHaveBeenCalledOnce();
  });

  it('does nothing while inactive', () => {
    const push = vi.spyOn(window.history, 'pushState');
    const onBack = vi.fn();
    render(<Harness active={false} onBack={onBack} />);
    expect(push).not.toHaveBeenCalled();
    window.dispatchEvent(new PopStateEvent('popstate'));
    expect(onBack).not.toHaveBeenCalled();
  });
});
