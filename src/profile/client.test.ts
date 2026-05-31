import { describe, it, expect, vi, beforeEach } from 'vitest';

const from = vi.fn();
vi.mock('../supabase/client', () => ({ getSupabase: () => ({ from }) }));

function query(result: unknown) {
  const q: Record<string, unknown> = {};
  for (const m of ['select', 'eq', 'upsert', 'maybeSingle']) q[m] = vi.fn(() => q);
  (q as { then: unknown }).then = (f: (v: unknown) => unknown) => Promise.resolve(result).then(f);
  return q;
}

async function importClient() {
  vi.resetModules();
  return import('./client');
}

beforeEach(() => {
  from.mockReset();
});

describe('getProfile', () => {
  it('maps a row to a Profile', async () => {
    from.mockReturnValueOnce(
      query({ data: { display_name: 'Al', games_played: 3, total_correct: 12, total_cards: 20, country: 'DE' }, error: null }),
    );
    const { getProfile } = await importClient();
    expect(await getProfile('uid')).toEqual({ displayName: 'Al', gamesPlayed: 3, totalCorrect: 12, totalCards: 20, country: 'DE' });
  });

  it('returns null when there is no row', async () => {
    from.mockReturnValueOnce(query({ data: null, error: null }));
    const { getProfile } = await importClient();
    expect(await getProfile('uid')).toBeNull();
  });
});

describe('upsertDisplayName', () => {
  it('upserts on user_id and returns ok', async () => {
    const q = query({ error: null });
    from.mockReturnValueOnce(q);
    const { upsertDisplayName } = await importClient();
    expect(await upsertDisplayName('uid', 'Newname')).toEqual({ ok: true });
    expect(q.upsert).toHaveBeenCalledWith({ user_id: 'uid', display_name: 'Newname' }, { onConflict: 'user_id' });
  });

  it('returns the error message on failure', async () => {
    from.mockReturnValueOnce(query({ error: { message: 'nope' } }));
    const { upsertDisplayName } = await importClient();
    expect(await upsertDisplayName('uid', 'Newname')).toEqual({ ok: false, error: 'nope' });
  });
});
