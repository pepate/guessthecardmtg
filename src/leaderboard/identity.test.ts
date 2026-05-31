import { describe, it, expect, beforeEach } from 'vitest';
import { getDeviceId, DEVICE_ID_KEY } from './identity';

beforeEach(() => localStorage.clear());

describe('getDeviceId', () => {
  it('generates a uuid and persists it', () => {
    const id = getDeviceId();
    expect(id).toMatch(/^[0-9a-f-]{36}$/);
    expect(localStorage.getItem(DEVICE_ID_KEY)).toBe(id);
  });

  it('returns the same id on repeat calls', () => {
    const first = getDeviceId();
    const second = getDeviceId();
    expect(second).toBe(first);
  });

  it('reuses an already-stored id', () => {
    localStorage.setItem(DEVICE_ID_KEY, '11111111-1111-4111-8111-111111111111');
    expect(getDeviceId()).toBe('11111111-1111-4111-8111-111111111111');
  });
});
