import { describe, it, expect, vi, beforeEach } from 'vitest';

const invoke = vi.fn();
const from = vi.fn();

vi.mock('@supabase/supabase-js', () => ({
  createClient: vi.fn(() => ({ from, functions: { invoke } })),
}));

/** A chainable query stub that resolves (when awaited) to `result`. */
function query(result: unknown) {
  const q: Record<string, unknown> = {};
  for (const m of ['select', 'eq', 'gt', 'order', 'limit']) {
    q[m] = vi.fn(() => q);
  }
  (q as { then: unknown }).then = (onFulfilled: (v: unknown) => unknown) =>
    Promise.resolve(result).then(onFulfilled);
  return q;
}

async function importClient() {
  vi.stubEnv('VITE_SUPABASE_URL', 'https://example.supabase.co');
  vi.stubEnv('VITE_SUPABASE_ANON_KEY', 'anon-key');
  vi.resetModules();
  return import('./client');
}

beforeEach(() => {
  invoke.mockReset();
  from.mockReset();
  vi.unstubAllEnvs();
});

describe('isLeaderboardEnabled', () => {
  it('is false when env vars are missing', async () => {
    vi.stubEnv('VITE_SUPABASE_URL', '');
    vi.stubEnv('VITE_SUPABASE_ANON_KEY', '');
    vi.resetModules();
    const { isLeaderboardEnabled } = await import('./client');
    expect(isLeaderboardEnabled()).toBe(false);
  });
  it('is true when env vars are present', async () => {
    const { isLeaderboardEnabled } = await importClient();
    expect(isLeaderboardEnabled()).toBe(true);
  });
});

describe('fetchTopScores', () => {
  it('maps rows to GlobalEntry with epoch createdAt', async () => {
    from.mockReturnValueOnce(
      query({
        data: [
          { id: '1', name: 'Al', score: 900, correct: 9, pool: 'all', country: 'DE', created_at: '2026-01-01T00:00:00.000Z' },
        ],
        error: null,
      }),
    );
    const { fetchTopScores } = await importClient();
    const rows = await fetchTopScores('all', 5);
    expect(rows[0]).toEqual({
      id: '1', name: 'Al', score: 900, correct: 9, pool: 'all', country: 'DE',
      createdAt: Date.parse('2026-01-01T00:00:00.000Z'),
    });
  });
  it('throws on a query error', async () => {
    from.mockReturnValueOnce(query({ data: null, error: { message: 'boom' } }));
    const { fetchTopScores } = await importClient();
    await expect(fetchTopScores('all', 5)).rejects.toThrow('boom');
  });
});

describe('fetchProjectedRank', () => {
  it('returns count-of-higher + 1 and the total', async () => {
    from
      .mockReturnValueOnce(query({ count: 3, error: null })) // higher
      .mockReturnValueOnce(query({ count: 12, error: null })); // total
    const { fetchProjectedRank } = await importClient();
    expect(await fetchProjectedRank('popular', 500)).toEqual({ rank: 4, total: 12 });
  });
});

describe('submitScore', () => {
  it('returns ok with id and rank on success', async () => {
    invoke.mockResolvedValueOnce({ data: { ok: true, id: 'x', rank: 7 }, error: null });
    const { submitScore } = await importClient();
    expect(await submitScore({ name: 'Al', score: 900, correct: 9, pool: 'all' })).toEqual({ ok: true, id: 'x', rank: 7 });
  });
  it('returns a reason on function error', async () => {
    invoke.mockResolvedValueOnce({ data: null, error: { message: 'rate-limited' } });
    const { submitScore } = await importClient();
    expect(await submitScore({ name: 'Al', score: 900, correct: 9, pool: 'all' })).toEqual({ ok: false, reason: 'rate-limited' });
  });
  it('returns a reason when the function rejects the payload', async () => {
    invoke.mockResolvedValueOnce({ data: { ok: false, reason: 'score' }, error: null });
    const { submitScore } = await importClient();
    expect(await submitScore({ name: 'Al', score: 1, correct: 9, pool: 'all' })).toEqual({ ok: false, reason: 'score' });
  });
});
