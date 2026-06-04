import { describe, it, expect, vi } from 'vitest';
import { bumpProfile, subscribeProfile, getProfileVersion } from './refresh';

describe('profile refresh signal', () => {
  it('increments the version and notifies subscribers on bump', () => {
    const before = getProfileVersion();
    const cb = vi.fn();
    const unsub = subscribeProfile(cb);

    bumpProfile();
    expect(cb).toHaveBeenCalledTimes(1);
    expect(getProfileVersion()).toBe(before + 1);

    bumpProfile();
    expect(cb).toHaveBeenCalledTimes(2);
    expect(getProfileVersion()).toBe(before + 2);

    unsub();
    bumpProfile();
    expect(cb).toHaveBeenCalledTimes(2); // no longer notified after unsubscribe
  });
});
