import { describe, it, expect, vi } from 'vitest';
import { render } from '@testing-library/react';
import { usePullToRefresh } from './usePullToRefresh';

function Harness({ onRefresh }: { onRefresh: () => void }) {
  const { ref, pull } = usePullToRefresh<HTMLDivElement>(onRefresh);
  return (
    <div ref={ref} data-testid="scroll" style={{ height: 100, overflow: 'auto' }}>
      pull {pull}
    </div>
  );
}

function touch(type: string, clientY: number) {
  const e = new Event(type, { bubbles: true, cancelable: true });
  Object.defineProperty(e, 'touches', { value: [{ clientY }] });
  return e;
}

describe('usePullToRefresh', () => {
  it('fires onRefresh after a pull past the threshold from the top', () => {
    const onRefresh = vi.fn();
    const { getByTestId } = render(<Harness onRefresh={onRefresh} />);
    const el = getByTestId('scroll');
    el.dispatchEvent(touch('touchstart', 0));
    el.dispatchEvent(touch('touchmove', 200)); // damped pull caps at 80 (>= 64)
    el.dispatchEvent(touch('touchend', 0));
    expect(onRefresh).toHaveBeenCalledTimes(1);
  });

  it('does not fire on a short pull', () => {
    const onRefresh = vi.fn();
    const { getByTestId } = render(<Harness onRefresh={onRefresh} />);
    const el = getByTestId('scroll');
    el.dispatchEvent(touch('touchstart', 0));
    el.dispatchEvent(touch('touchmove', 20)); // pull = 10, below threshold
    el.dispatchEvent(touch('touchend', 0));
    expect(onRefresh).not.toHaveBeenCalled();
  });
});
