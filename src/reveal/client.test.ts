import { describe, it, expect, vi, beforeEach } from 'vitest';

const order = vi.fn();
const eq = vi.fn(() => ({ order }));
const select = vi.fn(() => ({ eq }));
const from = vi.fn(() => ({ select }));
let client: { from: typeof from } | null = { from };

vi.mock('../supabase/client', () => ({ getSupabase: () => client }));

import { fetchEnabledRevealModes } from './client';

beforeEach(() => {
  client = { from };
  from.mockClear();
  select.mockClear();
  eq.mockClear();
  order.mockReset();
});

describe('fetchEnabledRevealModes', () => {
  it('returns enabled known modes in order, ignoring unknown keys', async () => {
    order.mockResolvedValue({ data: [{ key: 'scanner' }, { key: 'zoom' }, { key: 'bogus' }], error: null });
    expect(await fetchEnabledRevealModes()).toEqual(['scanner', 'zoom']);
    expect(from).toHaveBeenCalledWith('reveal_mode');
    expect(eq).toHaveBeenCalledWith('enabled', true);
  });

  it('falls back to the built-in three on empty result', async () => {
    order.mockResolvedValue({ data: [], error: null });
    expect(await fetchEnabledRevealModes()).toEqual(['blur', 'scanner', 'mosaic']);
  });

  it('falls back on a query error', async () => {
    order.mockResolvedValue({ data: null, error: { message: 'boom' } });
    expect(await fetchEnabledRevealModes()).toEqual(['blur', 'scanner', 'mosaic']);
  });

  it('falls back on a thrown error', async () => {
    order.mockRejectedValue(new Error('network'));
    expect(await fetchEnabledRevealModes()).toEqual(['blur', 'scanner', 'mosaic']);
  });

  it('falls back when there is no Supabase client', async () => {
    client = null;
    expect(await fetchEnabledRevealModes()).toEqual(['blur', 'scanner', 'mosaic']);
  });
});
