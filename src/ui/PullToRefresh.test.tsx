import { describe, it, expect, vi } from 'vitest';
import { render, screen, fireEvent, waitFor } from '@testing-library/react';
import { PullToRefresh } from './PullToRefresh';

describe('PullToRefresh', () => {
  it('calls onRefresh when pulled past the threshold at the top', async () => {
    const onRefresh = vi.fn().mockResolvedValue(undefined);
    render(<PullToRefresh onRefresh={onRefresh}><div>content</div></PullToRefresh>);
    const root = screen.getByTestId('ptr-root');
    fireEvent.touchStart(root, { touches: [{ clientY: 0 }] });
    fireEvent.touchMove(root, { touches: [{ clientY: 120 }] });
    fireEvent.touchEnd(root, {});
    await waitFor(() => expect(onRefresh).toHaveBeenCalledOnce());
  });

  it('does not refresh on a small pull', () => {
    const onRefresh = vi.fn().mockResolvedValue(undefined);
    render(<PullToRefresh onRefresh={onRefresh}><div>content</div></PullToRefresh>);
    const root = screen.getByTestId('ptr-root');
    fireEvent.touchStart(root, { touches: [{ clientY: 0 }] });
    fireEvent.touchMove(root, { touches: [{ clientY: 20 }] });
    fireEvent.touchEnd(root, {});
    expect(onRefresh).not.toHaveBeenCalled();
  });
});
