import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest';
import { renderHook, act } from '@testing-library/react';
import { useWideLayout } from './useWideLayout';

type Listener = () => void;

function mockMatchMedia(initial: boolean) {
  let matches = initial;
  const listeners = new Set<Listener>();
  const mql = {
    get matches() {
      return matches;
    },
    media: '',
    addEventListener: (_: string, cb: Listener) => listeners.add(cb),
    removeEventListener: (_: string, cb: Listener) => listeners.delete(cb),
  };
  const fn = vi.fn().mockReturnValue(mql);
  window.matchMedia = fn as unknown as typeof window.matchMedia;
  return {
    fn,
    set(next: boolean) {
      matches = next;
      listeners.forEach((cb) => cb());
    },
    listenerCount: () => listeners.size,
  };
}

describe('useWideLayout', () => {
  beforeEach(() => vi.restoreAllMocks());
  afterEach(() => vi.restoreAllMocks());

  it('returns the initial matchMedia value', () => {
    mockMatchMedia(true);
    const { result } = renderHook(() => useWideLayout());
    expect(result.current).toBe(true);
  });

  it('updates when the media query changes', () => {
    const mm = mockMatchMedia(false);
    const { result } = renderHook(() => useWideLayout());
    expect(result.current).toBe(false);
    act(() => mm.set(true));
    expect(result.current).toBe(true);
  });

  it('removes its listener on unmount', () => {
    const mm = mockMatchMedia(false);
    const { unmount } = renderHook(() => useWideLayout());
    expect(mm.listenerCount()).toBe(1);
    unmount();
    expect(mm.listenerCount()).toBe(0);
  });
});
