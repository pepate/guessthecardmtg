import { describe, it, expect, vi, beforeEach } from 'vitest';

const invoke = vi.fn();
const from = vi.fn();

vi.mock('@supabase/supabase-js', () => ({
  createClient: vi.fn(() => ({ from, functions: { invoke } })),
}));

/** A chainable query stub that resolves (when awaited) to `result`. */
function query(result: unknown) {
  const q: Record<string, unknown> = {};
  for (const m of ['select', 'eq', 'gt', 'gte', 'order', 'limit']) {
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

describe('fetchModeTopScores', () => {
  it('maps rows to GlobalEntry with epoch createdAt', async () => {
    from.mockReturnValueOnce(
      query({
        data: [
          { id: '1', name: 'Al', score: 900, correct: 9, mode_id: 'mode-uuid', game_mode: null, device_id: 'dev-al', country: 'DE', created_at: '2026-01-01T00:00:00.000Z' },
        ],
        error: null,
      }),
    );
    const { fetchModeTopScores } = await importClient();
    const rows = await fetchModeTopScores('mode-uuid', 5);
    expect(rows[0]).toEqual({
      id: '1', name: 'Al', score: 900, correct: 9, gameModes: [], country: 'DE',
      createdAt: Date.parse('2026-01-01T00:00:00.000Z'),
      deviceId: 'dev-al',
    });
  });

  it('collapses a name to one row, badging each reveal mode by points', async () => {
    from.mockReturnValueOnce(
      query({
        data: [
          { id: '1', name: 'Al', score: 900, correct: 9, mode_id: 'm', game_mode: 'zoom', device_id: 'dev-al', country: 'DE', created_at: '2026-01-01T00:00:00.000Z' },
          { id: '2', name: 'Al', score: 500, correct: 5, mode_id: 'm', game_mode: 'blur', device_id: 'dev-al', country: 'DE', created_at: '2026-01-02T00:00:00.000Z' },
        ],
        error: null,
      }),
    );
    const { fetchModeTopScores } = await importClient();
    const rows = await fetchModeTopScores('m', 5);
    expect(rows).toHaveLength(1);
    expect(rows[0].score).toBe(900);
    expect(rows[0].gameModes).toEqual(['zoom', 'blur']);
  });
  it('throws on a query error', async () => {
    from.mockReturnValueOnce(query({ data: null, error: { message: 'boom' } }));
    const { fetchModeTopScores } = await importClient();
    await expect(fetchModeTopScores('mode-uuid', 5)).rejects.toThrow('boom');
  });
  it('adds a created_at filter when since is provided', async () => {
    const q = query({ data: [], error: null });
    from.mockReturnValueOnce(q);
    const { fetchModeTopScores } = await importClient();
    await fetchModeTopScores('mode-uuid', 5, 1_700_000_000_000);
    expect(q.gte).toHaveBeenCalledWith('created_at', new Date(1_700_000_000_000).toISOString());
  });
  it('omits the created_at filter when since is null', async () => {
    const q = query({ data: [], error: null });
    from.mockReturnValueOnce(q);
    const { fetchModeTopScores } = await importClient();
    await fetchModeTopScores('mode-uuid', 5, null);
    expect(q.gte).not.toHaveBeenCalled();
  });
});

describe('fetchModeProjectedRank', () => {
  it('ranks against distinct people (best score each), not raw rows', async () => {
    // Al has two runs; they collapse to one person at their best (900). Three
    // distinct people total; two of them beat a score of 500.
    from.mockReturnValueOnce(
      query({
        data: [
          { id: '1', name: 'Al', score: 900, correct: 9, mode_id: 'm', game_mode: 'zoom', device_id: 'dev-al', country: 'DE', created_at: '2026-01-01T00:00:00.000Z' },
          { id: '2', name: 'Al', score: 200, correct: 2, mode_id: 'm', game_mode: 'blur', device_id: 'dev-al', country: 'DE', created_at: '2026-01-02T00:00:00.000Z' },
          { id: '3', name: 'Bo', score: 700, correct: 7, mode_id: 'm', game_mode: 'blur', device_id: 'dev-bo', country: 'DE', created_at: '2026-01-01T00:00:00.000Z' },
          { id: '4', name: 'Cy', score: 300, correct: 3, mode_id: 'm', game_mode: 'blur', device_id: 'dev-cy', country: 'DE', created_at: '2026-01-01T00:00:00.000Z' },
        ],
        error: null,
      }),
    );
    const { fetchModeProjectedRank } = await importClient();
    expect(await fetchModeProjectedRank('m', 500)).toEqual({ rank: 3, total: 3 });
  });
});

describe('fetchComboBoard', () => {
  it('returns best-per-device entries for the given reveal, sliced to limit', async () => {
    from.mockReturnValueOnce(
      query({
        data: [
          { id: '1', name: 'Al', score: 900, correct: 9, mode_id: 'm', game_mode: 'blur', device_id: 'dev-al', country: 'DE', created_at: '2026-01-01T00:00:00.000Z' },
          { id: '2', name: 'Bo', score: 700, correct: 7, mode_id: 'm', game_mode: 'blur', device_id: 'dev-bo', country: null,  created_at: '2026-01-01T00:00:00.000Z' },
          { id: '3', name: 'Al', score: 500, correct: 5, mode_id: 'm', game_mode: 'zoom', device_id: 'dev-al', country: 'DE', created_at: '2026-01-02T00:00:00.000Z' },
        ],
        error: null,
      }),
    );
    const { fetchComboBoard } = await importClient();
    const board = await fetchComboBoard('m', 'blur', null, 5);
    // Only blur runs; Al and Bo each appear once, Al ranked first
    expect(board).toHaveLength(2);
    expect(board[0].deviceId).toBe('dev-al');
    expect(board[0].score).toBe(900);
    expect(board[1].deviceId).toBe('dev-bo');
    expect(board[0].gameModes).toEqual([]);
  });

  it('respects the limit parameter', async () => {
    from.mockReturnValueOnce(
      query({
        data: [
          { id: '1', name: 'Al', score: 900, correct: 9, mode_id: 'm', game_mode: 'blur', device_id: 'dev-al', country: null, created_at: '2026-01-01T00:00:00.000Z' },
          { id: '2', name: 'Bo', score: 700, correct: 7, mode_id: 'm', game_mode: 'blur', device_id: 'dev-bo', country: null, created_at: '2026-01-01T00:00:00.000Z' },
        ],
        error: null,
      }),
    );
    const { fetchComboBoard } = await importClient();
    const board = await fetchComboBoard('m', 'blur', null, 1);
    expect(board).toHaveLength(1);
    expect(board[0].deviceId).toBe('dev-al');
  });
});

describe('fetchComboProjectedRank', () => {
  it('returns the correct rank and total for the reveal board', async () => {
    // blur board: dev-al(900), dev-bo(700), dev-cy(300). Score 500 -> rank 3 of 3.
    from.mockReturnValueOnce(
      query({
        data: [
          { id: '1', name: 'Al', score: 900, correct: 9, mode_id: 'm', game_mode: 'blur', device_id: 'dev-al', country: null, created_at: '2026-01-01T00:00:00.000Z' },
          { id: '2', name: 'Bo', score: 700, correct: 7, mode_id: 'm', game_mode: 'blur', device_id: 'dev-bo', country: null, created_at: '2026-01-01T00:00:00.000Z' },
          { id: '3', name: 'Cy', score: 300, correct: 3, mode_id: 'm', game_mode: 'blur', device_id: 'dev-cy', country: null, created_at: '2026-01-01T00:00:00.000Z' },
          { id: '4', name: 'Al', score: 800, correct: 8, mode_id: 'm', game_mode: 'zoom', device_id: 'dev-al', country: null, created_at: '2026-01-01T00:00:00.000Z' },
        ],
        error: null,
      }),
    );
    const { fetchComboProjectedRank } = await importClient();
    const result = await fetchComboProjectedRank('m', 'blur', 500);
    // blur board has 3 distinct devices; scores above 500: dev-al(900), dev-bo(700) → rank 3
    expect(result).toEqual({ rank: 3, total: 3 });
  });

  it('returns rank 1 when score beats everyone', async () => {
    from.mockReturnValueOnce(
      query({
        data: [
          { id: '1', name: 'Bo', score: 700, correct: 7, mode_id: 'm', game_mode: 'blur', device_id: 'dev-bo', country: null, created_at: '2026-01-01T00:00:00.000Z' },
        ],
        error: null,
      }),
    );
    const { fetchComboProjectedRank } = await importClient();
    const result = await fetchComboProjectedRank('m', 'blur', 900);
    expect(result).toEqual({ rank: 1, total: 1 });
  });
});

describe('submitScore', () => {
  it('returns ok with id and rank on success', async () => {
    invoke.mockResolvedValueOnce({ data: { ok: true, id: 'x', rank: 7 }, error: null });
    const { submitScore } = await importClient();
    expect(await submitScore({ name: 'Al', score: 900, correct: 9, modeId: 'mode-uuid', gameMode: 'blur', deviceId: 'dev-1' })).toEqual({ ok: true, id: 'x', rank: 7 });
  });
  it('returns a reason on function error', async () => {
    invoke.mockResolvedValueOnce({ data: null, error: { message: 'rate-limited' } });
    const { submitScore } = await importClient();
    expect(await submitScore({ name: 'Al', score: 900, correct: 9, modeId: 'mode-uuid', gameMode: 'blur', deviceId: 'dev-1' })).toEqual({ ok: false, reason: 'rate-limited' });
  });
  it('returns a reason when the function rejects the payload', async () => {
    invoke.mockResolvedValueOnce({ data: { ok: false, reason: 'score' }, error: null });
    const { submitScore } = await importClient();
    expect(await submitScore({ name: 'Al', score: 1, correct: 9, modeId: 'mode-uuid', gameMode: 'blur', deviceId: 'dev-1' })).toEqual({ ok: false, reason: 'score' });
  });
  it('sends mode_id, game_mode and device_id (not pool) in the request body', async () => {
    invoke.mockResolvedValueOnce({ data: { ok: true, id: 'x', rank: 1 }, error: null });
    const { submitScore } = await importClient();
    await submitScore({ name: 'Al', score: 900, correct: 9, modeId: 'mode-uuid', gameMode: 'blur', deviceId: 'dev-1' });
    expect(invoke).toHaveBeenCalledWith('submit-score', {
      body: expect.objectContaining({ mode_id: 'mode-uuid', game_mode: 'blur', device_id: 'dev-1' }),
    });
    expect(invoke).toHaveBeenCalledWith('submit-score', {
      body: expect.not.objectContaining({ pool: expect.anything() }),
    });
  });
});
